const db = require('../db/client');
const { shopifyGraphQL } = require('./shopify');
const config = require('./shopify-config');
const { getValidAccessTokenForShopRow } = require('./shopify-tokens');

// ═══════════════════════════════════════════════════════════════
// 1. Recurring Charge Oluştur (GraphQL)
// ═══════════════════════════════════════════════════════════════

/**
 * Shopify recurring application charge oluşturur.
 * Kullanıcı onay sayfasına yönlendirilmek üzere confirmation_url döner.
 *
 * @param {string} shopDomain
 * @param {string} accessToken  - Düz metin
 * @param {string} planKey      - 'sirius'
 * @param {string} returnUrl    - Onay sonrası dönüş URL'i
 * @returns {Promise<{ confirmation_url: string, charge_id: string }>}
 */
async function createRecurringCharge(shopDomain, accessToken, planKey, returnUrl, options = {}) {
  const plan = config.PLANS[planKey];
  if (!plan) throw new Error(`Bilinmeyen plan: ${planKey}`);
  const replacementBehavior = options.replacementBehavior || 'STANDARD';
  const isTestCharge = resolveBillingTestMode();

  const mutation = `
    mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $trialDays: Int, $test: Boolean, $replacementBehavior: AppSubscriptionReplacementBehavior) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        trialDays: $trialDays
        test: $test
        replacementBehavior: $replacementBehavior
        lineItems: $lineItems
      ) {
        appSubscription {
          id
        }
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    name: plan.name,
    returnUrl,
    trialDays: plan.trialDays,
    test: isTestCharge,
    replacementBehavior,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: plan.price, currencyCode: plan.currency },
            interval: plan.interval,
          },
        },
      },
    ],
  };

  const data = await shopifyGraphQL(shopDomain, accessToken, mutation, variables);
  const result = data.appSubscriptionCreate;

  if (result.userErrors && result.userErrors.length > 0) {
    const errMsg = result.userErrors.map((e) => e.message).join('; ');
    throw new Error(`Shopify billing hatası: ${errMsg}`);
  }

  return {
    confirmation_url: result.confirmationUrl,
    charge_id: result.appSubscription.id,
  };
}

function resolveBillingTestMode() {
  const value = process.env.SHOPIFY_BILLING_TEST_MODE;
  if (value !== undefined) {
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
  }

  return process.env.NODE_ENV !== 'production';
}

// ═══════════════════════════════════════════════════════════════
// 2. Subscription Durumunu Kontrol Et (GraphQL)
// ═══════════════════════════════════════════════════════════════

/**
 * Aktif subscription olup olmadığını kontrol eder.
 *
 * @param {string} shopDomain
 * @param {string} accessToken
 * @returns {Promise<{ active: boolean, subscription: object|null }>}
 */
async function checkSubscriptionStatus(shopDomain, accessToken, subscriptionId = null) {
  const query = `
    {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          createdAt
          currentPeriodEnd
          trialDays
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price { amount currencyCode }
                  interval
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(shopDomain, accessToken, query);
  const subs = data.currentAppInstallation.activeSubscriptions || [];
  const activeSubs = subs.filter((s) => s.status === 'ACTIVE');
  const activeSub = subscriptionId
    ? activeSubs.find((s) => shopifyBillingIdsMatch(s.id, subscriptionId)) || null
    : activeSubs[0] || null;

  return {
    active: !!activeSub,
    subscription: activeSub || null,
  };
}

// ═══════════════════════════════════════════════════════════════
// 3. Billing Durumunu DB'ye Yansıt
// ═══════════════════════════════════════════════════════════════

/**
 * Shopify subscription durumunu DB'deki shop kaydına yansıtır.
 *
 * @param {string} shopId
 * @param {object} dbClient
 */
async function syncBillingStatus(shopId, dbClient) {
  const shopResult = await dbClient.query(
    `SELECT shopify_domain, shopify_access_token, shopify_refresh_token,
            shopify_access_token_expires_at, shopify_refresh_token_expires_at,
            plan
     FROM shops
     WHERE id = $1`,
    [shopId]
  );

  if (shopResult.rows.length === 0) return;

  const shop = shopResult.rows[0];
  const accessToken = await getValidAccessTokenForShopRow(
    {
      id: shopId,
      shopify_domain: shop.shopify_domain,
      shopify_access_token: shop.shopify_access_token,
      shopify_refresh_token: shop.shopify_refresh_token,
      shopify_access_token_expires_at: shop.shopify_access_token_expires_at,
      shopify_refresh_token_expires_at: shop.shopify_refresh_token_expires_at,
    },
    dbClient
  );
  const { active, subscription } = await checkSubscriptionStatus(shop.shopify_domain, accessToken);

  if (active) {
    // Plan bilgisi mevcut plan'dan korunur — hardcoded değil
    await dbClient.query(
      `UPDATE shops
       SET billing_status     = 'active',
           shopify_billing_id = $1,
           pending_plan       = NULL,
           pending_charge_id  = NULL,
           pending_billing_nonce = NULL,
           updated_at         = NOW()
       WHERE id = $2`,
      [subscription.id, shopId]
    );
    console.log(`✅ Billing active: ${shop.shopify_domain} (${shop.plan})`);
  } else {
    // Aktif subscription yoksa → pending veya active ise durumu düşür
    await dbClient.query(
      `UPDATE shops
       SET billing_status = CASE
             WHEN billing_status = 'active'  THEN 'cancelled'
             WHEN billing_status = 'pending' THEN 'trial'
             ELSE billing_status
           END,
           plan = CASE
             WHEN billing_status = 'active' THEN 'sirius'
             ELSE plan
           END,
           pending_plan      = NULL,
           pending_charge_id = NULL,
           pending_billing_nonce = NULL,
           updated_at        = NOW()
       WHERE id = $1`,
      [shopId]
    );
  }
}

function normalizeShopifyBillingId(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const raw = String(value).trim();
  if (!raw) {
    return '';
  }

  return raw.split('/').pop();
}

function shopifyBillingIdsMatch(expected, actual) {
  const normalizedExpected = normalizeShopifyBillingId(expected);
  const normalizedActual = normalizeShopifyBillingId(actual);

  return !!normalizedExpected && normalizedExpected === normalizedActual;
}

module.exports = {
  createRecurringCharge,
  checkSubscriptionStatus,
  syncBillingStatus,
  resolveBillingTestMode,
  normalizeShopifyBillingId,
  shopifyBillingIdsMatch,
};
