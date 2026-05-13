const express = require('express');
const crypto = require('crypto');
const db = require('../db/client');
const { seedSkillsForShop } = require('../services/skill-seeder');
const billingService = require('../services/billing');
const config = require('../services/shopify-config');
const authMiddleware = require('../middleware/auth');
const shopifySessionMiddleware = require('../middleware/shopify-session');
const { getValidAccessTokenForShopId, getValidAccessTokenForShopRow } = require('../services/shopify-tokens');

const router = express.Router();

// ═══════════════════════════════════════════════════════════════
// POST /api/billing/subscribe — GraphQL ile recurring charge oluştur
// ═══════════════════════════════════════════════════════════════
router.post('/subscribe', [shopifySessionMiddleware, authMiddleware], async (req, res) => {
  const { plan } = req.body;

  if (!plan || !config.PLANS[plan]) {
    return res.status(400).json({
      error: 'invalid_plan',
      message: `Geçersiz plan. Seçenekler: ${Object.keys(config.PLANS).join(', ')}`,
    });
  }

  try {
    if (req.shop.billing_status === 'active' && req.shop.plan === plan) {
      return res.json({
        success: true,
        already_active: true,
        plan,
        message: 'Bu plan zaten aktif.',
      });
    }

    const accessToken = await getValidAccessTokenForShopId(req.shop.id, db);
    const billingNonce = buildBillingCallbackNonce();

    // ⚠️  returnUrl'de plan bilgisi TAŞINMAZ — güvenlik açığı önlenir
    const returnUrl = `${process.env.APP_URL}/api/billing/callback?shop_id=${req.shop.id}&nonce=${billingNonce}`;

    const result = await billingService.createRecurringCharge(
      req.shop.shopify_domain,
      accessToken,
      plan,
      returnUrl,
      {
        replacementBehavior: 'STANDARD',
      }
    );

    // Pending state'i DB'ye güvenli kaydet (URL yerine DB source-of-truth)
    await db.query(
      `UPDATE shops
       SET shopify_billing_id = $1,
           pending_plan       = $2,
           pending_charge_id  = $3,
           pending_billing_nonce = $4,
           billing_status     = 'pending',
           updated_at         = NOW()
       WHERE id = $5`,
      [result.charge_id, plan, result.charge_id, billingNonce, req.shop.id]
    );

    res.json({
      success: true,
      confirmation_url: result.confirmation_url,
      charge_id: result.charge_id,
    });
  } catch (err) {
    console.error('❌ POST /billing/subscribe hatası:', err.message);
    res.status(500).json({ error: 'billing_failed', message: 'Abonelik oluşturulamadı' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/billing/callback — Shopify onay dönüşü
// GraphQL subscription otomatik aktifleşir — ayrı activate adımı gerekmez
// ═══════════════════════════════════════════════════════════════
router.get('/callback', async (req, res) => {
  const { charge_id, shop_id, nonce } = req.query;
  let callbackShopDomain = null;

  if (!charge_id || !shop_id || !nonce) {
    return res.redirect(billingResultRedirectUrl(null, 'error'));
  }

  try {
    // Shop bilgilerini al — pending_plan ve pending_charge_id dahil
    const shopResult = await db.query(
      `SELECT shopify_domain, shopify_access_token, shopify_refresh_token,
              shopify_access_token_expires_at, shopify_refresh_token_expires_at,
              plan, shopify_billing_id, pending_plan, pending_charge_id, pending_billing_nonce
       FROM shops WHERE id = $1`,
      [shop_id]
    );

    if (shopResult.rows.length === 0) {
      return res.redirect(billingResultRedirectUrl(null, 'error'));
    }

    const shop = shopResult.rows[0];
    callbackShopDomain = shop.shopify_domain;

    // ⚠️  Güvenlik: callback'teki charge_id, DB'deki pending_charge_id ile eşleşmeli
    const expectedChargeId = shop.pending_charge_id || shop.shopify_billing_id;
    if (expectedChargeId && !billingService.shopifyBillingIdsMatch(expectedChargeId, charge_id)) {
      console.warn(`⚠️  Charge ID uyuşmazlığı — beklenen: ${shop.pending_charge_id}, gelen: ${charge_id}`);
      return res.redirect(billingResultRedirectUrl(callbackShopDomain, 'error'));
    }

    if (!billingCallbackNonceMatches(shop.pending_billing_nonce, nonce)) {
      console.warn(`⚠️  Billing nonce uyusmazligi — shop: ${shop.shopify_domain}`);
      return res.redirect(billingResultRedirectUrl(callbackShopDomain, 'error'));
    }

    const accessToken = await getValidAccessTokenForShopRow(
      {
        id: shop_id,
        shopify_domain: shop.shopify_domain,
        shopify_access_token: shop.shopify_access_token,
        shopify_refresh_token: shop.shopify_refresh_token,
        shopify_access_token_expires_at: shop.shopify_access_token_expires_at,
        shopify_refresh_token_expires_at: shop.shopify_refresh_token_expires_at,
      },
      db
    );

    // GraphQL ile aktif subscription durumunu kontrol et
    const { active, subscription } = await billingService.checkSubscriptionStatus(
      shop.shopify_domain,
      accessToken,
      charge_id
    );

    if (active) {
      // ✅ Plan bilgisi DB'den okunuyor — URL manipülasyonu imkansız
      const selectedPlan = shop.pending_plan || shop.plan || 'sirius';
      await db.query(
        `UPDATE shops
         SET plan               = $1,
             billing_status     = 'active',
             shopify_billing_id = $2,
             pending_plan       = NULL,
             pending_charge_id  = NULL,
             pending_billing_nonce = NULL,
             updated_at         = NOW()
         WHERE id = $3`,
        [selectedPlan, subscription.id, shop_id]
      );

      // Plan'a göre skill'leri ata
      await seedSkillsForShop(shop_id, selectedPlan, db);

      console.log(`✅ Billing aktif: ${shop.shopify_domain} → ${selectedPlan}`);
      return res.redirect(billingResultRedirectUrl(callbackShopDomain, 'success'));
    }

    // Reddedildi — pending state'i temizle, eski duruma geri dön
    console.log(`⚠️  Subscription aktif değil — ${shop.shopify_domain}`);
    await db.query(
      `UPDATE shops
       SET billing_status    = CASE
             WHEN billing_status = 'pending' THEN 'trial'
             ELSE billing_status
           END,
           pending_plan      = NULL,
           pending_charge_id = NULL,
           pending_billing_nonce = NULL,
           updated_at        = NOW()
       WHERE id = $1`,
      [shop_id]
    );
    return res.redirect(billingResultRedirectUrl(callbackShopDomain, 'declined'));
  } catch (err) {
    console.error('❌ GET /billing/callback hatası:', err.message);
    return res.redirect(billingResultRedirectUrl(callbackShopDomain, 'error'));
  }
});

function buildBillingCallbackNonce() {
  return crypto.randomBytes(24).toString('hex');
}

function billingCallbackNonceMatches(expected, provided) {
  if (!expected || !provided) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(String(expected), 'utf8'),
      Buffer.from(String(provided), 'utf8')
    );
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// GET /api/billing/status — Mevcut abonelik durumu
// ═══════════════════════════════════════════════════════════════
function billingResultRedirectUrl(shopDomain, status) {
  const path = `/dashboard?billing=${encodeURIComponent(status)}`;

  if (shopDomain) {
    return `${config.embeddedAppUrl(shopDomain)}${path}`;
  }

  return `${process.env.APP_URL}${path}`;
}

router.get('/status', [shopifySessionMiddleware, authMiddleware], async (req, res) => {
  try {
    const shop = req.shop;

    // Plan fiyatı
    const planConfig = config.PLANS[shop.plan] || config.PLANS.sirius;

    // Trial kalan gün
    let trialDaysLeft = null;
    if (shop.billing_status === 'trial' && shop.trial_ends_at) {
      const diff = new Date(shop.trial_ends_at) - new Date();
      trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    // Token kullanım istatistikleri (bu ay)
    const usageResult = await db.query(
      `SELECT
         COUNT(*) as request_count,
         COALESCE(SUM(input_tokens), 0) as total_input,
         COALESCE(SUM(output_tokens), 0) as total_output,
         COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens
       FROM token_usage
       WHERE shop_id = $1
         AND created_at >= date_trunc('month', NOW())`,
      [shop.id]
    );

    res.json({
      plan: shop.plan,
      plan_name: planConfig.name,
      plan_price: planConfig.price,
      billing_status: shop.billing_status,
      available_plans: Object.entries(config.PLANS).map(([key, value]) => ({
        key,
        name: value.name,
        price: value.price,
        currency: value.currency,
        trial_days: value.trialDays,
      })),
      trial_days_left: trialDaysLeft,
      shopify_billing_id: shop.shopify_billing_id,
      token_usage: {
        requests: parseInt(usageResult.rows[0].request_count),
        input_tokens: parseInt(usageResult.rows[0].total_input),
        output_tokens: parseInt(usageResult.rows[0].total_output),
        total_tokens: parseInt(usageResult.rows[0].total_tokens),
      },
    });
  } catch (err) {
    console.error('❌ GET /billing/status hatası:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Billing durumu alınamadı' });
  }
});

module.exports = router;
