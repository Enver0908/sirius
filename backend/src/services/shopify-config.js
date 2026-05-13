const API_VERSION = '2026-04';

const SCOPES = [
  'read_orders',
  'read_products',
  'read_inventory',
];

const SCOPE_STRING = SCOPES.join(',');

const WEBHOOK_TOPICS = [
  { graphqlTopic: 'APP_UNINSTALLED', callbackSlug: 'app-uninstalled', required: true },
  { graphqlTopic: 'APP_SUBSCRIPTIONS_UPDATE', callbackSlug: 'app-subscriptions-update', required: true },
  { graphqlTopic: 'ORDERS_CREATE', callbackSlug: 'orders-create', required: false },
  { graphqlTopic: 'ORDERS_UPDATED', callbackSlug: 'orders-updated', required: false },
  { graphqlTopic: 'PRODUCTS_CREATE', callbackSlug: 'products-create', required: false },
  { graphqlTopic: 'PRODUCTS_UPDATE', callbackSlug: 'products-update', required: false },
  { graphqlTopic: 'PRODUCTS_DELETE', callbackSlug: 'products-delete', required: false },
];

const PLANS = {
  sirius: {
    name: 'Sirius Pro',
    price: 6.99,
    currency: 'USD',
    interval: 'EVERY_30_DAYS',
    trialDays: 7,
  },
};

const SHOP_DOMAIN_REGEX = /^[a-zA-Z0-9-]+\.myshopify\.com$/;

function graphqlUrl(shop) {
  return `https://${shop}/admin/api/${API_VERSION}/graphql.json`;
}

function oauthAuthorizeUrl(shop, state) {
  const redirectUri = `${process.env.APP_URL}/api/auth/shopify/callback`;
  return (
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${process.env.SHOPIFY_API_KEY}` +
    `&scope=${SCOPE_STRING}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`
  );
}

function oauthTokenUrl(shop) {
  return `https://${shop}/admin/oauth/access_token`;
}

function webhookCallbackUrl(slug) {
  return `${process.env.APP_URL}/api/webhooks/shopify/${slug}`;
}

function embeddedAppUrl(shop) {
  const shopName = shop.split('.')[0];
  const appHandle = process.env.SHOPIFY_APP_HANDLE || process.env.SHOPIFY_API_KEY;
  return `https://admin.shopify.com/store/${shopName}/apps/${appHandle}`;
}

module.exports = {
  API_VERSION,
  SCOPES,
  SCOPE_STRING,
  WEBHOOK_TOPICS,
  PLANS,
  SHOP_DOMAIN_REGEX,
  graphqlUrl,
  oauthAuthorizeUrl,
  oauthTokenUrl,
  webhookCallbackUrl,
  embeddedAppUrl,
};
