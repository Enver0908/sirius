const express = require('express');
const crypto = require('crypto');
const db = require('../db/client');
const config = require('../services/shopify-config');
const { registerWebhooks } = require('../services/shopify');
const { exchangeAuthorizationCode } = require('../services/shopify-tokens');

const router = express.Router();

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET /api/auth/shopify/install
// Shopify OAuth akÄ±ÅŸÄ±nÄ± baÅŸlatÄ±r â€” maÄŸazayÄ± Shopify izin sayfasÄ±na yÃ¶nlendirir
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.get('/shopify/install', (req, res) => {
  const { shop } = req.query;

  // â”€â”€ Shop domain doÄŸrulamasÄ± â”€â”€
  if (!shop || !config.SHOP_DOMAIN_REGEX.test(shop)) {
    return res.status(400).json({
      error: 'invalid_shop',
      message: 'Geçerli bir Shopify domain giriniz (örn: mystore.myshopify.com)',
    });
  }

  // â”€â”€ State token (CSRF korumasÄ±) â”€â”€
  const state = crypto.randomBytes(16).toString('hex');

  // State'i doÄŸrulama iÃ§in cookie'ye yaz (5 dk geÃ§erli)
  res.cookie('shopify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 5 * 60 * 1000, // 5 dakika
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  res.redirect(config.oauthAuthorizeUrl(shop, state));
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// GET /api/auth/shopify/callback
// Shopify'dan dÃ¶nen OAuth callback'i iÅŸler
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
router.get('/shopify/callback', async (req, res) => {
  const { shop, code, hmac, state } = req.query;

  // â”€â”€ Temel parametre kontrolÃ¼ â”€â”€
  if (!shop || !code || !hmac) {
    return res.status(400).json({
      error: 'missing_params',
      message: 'shop, code ve hmac parametreleri zorunludur',
    });
  }

  // â”€â”€ Shop domain doÄŸrulamasÄ± â”€â”€
  if (!config.SHOP_DOMAIN_REGEX.test(shop)) {
    return res.status(400).json({
      error: 'invalid_shop',
      message: 'GeÃ§ersiz shop domain',
    });
  }

  // â”€â”€ State (CSRF) doÄŸrulamasÄ± â”€â”€
  const savedState = req.cookies?.shopify_oauth_state;
  if (!state || !savedState || state !== savedState) {
    return res.status(403).json({
      error: 'invalid_state',
      message: 'OAuth state doÄŸrulamasÄ± baÅŸarÄ±sÄ±z veya eksik â€” CSRF ÅŸÃ¼phesi',
    });
  }

  // â”€â”€ HMAC doÄŸrulamasÄ± â”€â”€
  if (!_verifyHMAC(req.query)) {
    return res.status(401).json({
      error: 'invalid_hmac',
      message: 'HMAC doÄŸrulamasÄ± baÅŸarÄ±sÄ±z â€” istek gÃ¼venilir deÄŸil',
    });
  }

  try {
    // â”€â”€ Access token al â”€â”€
    const tokenBundle = await exchangeAuthorizationCode(shop, code);
    const accessToken = tokenBundle.accessToken;
    if (!accessToken) {
      return res.status(502).json({
        error: 'token_failed',
        message: 'Shopify access token alÄ±namadÄ±',
      });
    }

    // â”€â”€ DB'ye kaydet (upsert) â”€â”€
    await db.query(
      `INSERT INTO shops (
         shopify_domain,
         shopify_access_token,
         shopify_refresh_token,
         shopify_access_token_expires_at,
         shopify_refresh_token_expires_at,
         plan,
         billing_status,
       trial_ends_at
       )
       VALUES ($1, $2, $3, $4, $5, 'sirius', 'trial', NOW() + INTERVAL '7 days')
       ON CONFLICT (shopify_domain)
       DO UPDATE SET
         shopify_access_token = $2,
         shopify_refresh_token = $3,
         shopify_access_token_expires_at = $4,
         shopify_refresh_token_expires_at = $5,
         billing_status = CASE
           WHEN shops.billing_status = 'active' THEN shops.billing_status
           ELSE 'trial'
         END,
         trial_ends_at = CASE
           WHEN shops.billing_status = 'active' THEN shops.trial_ends_at
           ELSE NOW() + INTERVAL '7 days'
         END,
         updated_at = NOW()`,
      [
        shop,
        tokenBundle.encryptedAccessToken,
        tokenBundle.encryptedRefreshToken,
        tokenBundle.accessTokenExpiresAt,
        tokenBundle.refreshTokenExpiresAt,
      ]
    );

    // â”€â”€ Webhook'larÄ± GraphQL ile kaydet â”€â”€
    await registerWebhooks(shop, accessToken);

    // â”€â”€ State cookie'yi temizle â”€â”€
    res.clearCookie('shopify_oauth_state');

    // â”€â”€ Embedded App YÃ¶nlendirmesi â”€â”€
    res.redirect(config.embeddedAppUrl(shop));
  } catch (err) {
    console.error('âŒ Shopify OAuth callback hatasÄ±:', err.message);

    if (err.response) {
      console.error('   Shopify yanÄ±tÄ±:', err.response.status, err.response.data);
    }

    res.status(500).json({
      error: 'oauth_failed',
      message: 'Shopify bağlantısı sırasında hata oluştu',
    });
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HMAC DoÄŸrulamasÄ±
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
/**
 * Shopify callback query string'indeki HMAC'Ä± doÄŸrular.
 * - hmac parametresini Ã§Ä±kar
 * - Kalan parametreleri alfabetik sÄ±rala
 * - SHOPIFY_API_SECRET ile SHA-256 hash'le
 * - Gelen hmac ile karÅŸÄ±laÅŸtÄ±r (timing-safe)
 *
 * @param {object} query - Express req.query
 * @returns {boolean}
 */
function _verifyHMAC(query) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;

  // Parametreleri alfabetik sÄ±rala ve query string yap
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join('&');

  const generatedHmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  // Timing-safe karÅŸÄ±laÅŸtÄ±rma (timing attack korumasÄ±)
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, 'hex'),
      Buffer.from(generatedHmac, 'hex')
    );
  } catch {
    return false;
  }
}

module.exports = router;


