function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function validateAppUrl() {
  const appUrl = process.env.APP_URL || '';

  if (!appUrl.startsWith('https://')) {
    throw new Error('Production APP_URL must use HTTPS.');
  }

  if (
    appUrl.includes('localhost') ||
    appUrl.includes('127.0.0.1') ||
    appUrl.includes('ngrok-free')
  ) {
    throw new Error('Production APP_URL must be a stable production domain, not localhost or a dev tunnel.');
  }
}

async function assertNoManualBillingBypass(db) {
  const result = await db.query(
    `SELECT shopify_domain
     FROM shops
     WHERE billing_status = 'active'
       AND shopify_billing_id IS NULL
     LIMIT 5`
  );

  if (result.rows.length > 0) {
    const shops = result.rows.map((row) => row.shopify_domain).join(', ');
    throw new Error(`Production billing guard failed: active shops without Shopify billing id: ${shops}`);
  }
}

async function assertInstalledShopsHaveShopifyToken(db) {
  const result = await db.query(
    `SELECT shopify_domain
     FROM shops
     WHERE billing_status IN ('trial', 'pending', 'active')
       AND shopify_access_token IS NULL
     LIMIT 5`
  );

  if (result.rows.length > 0) {
    const shops = result.rows.map((row) => row.shopify_domain).join(', ');
    throw new Error(`Production auth guard failed: installed shops without Shopify token: ${shops}`);
  }
}

async function assertNoDevelopmentSeedCache(db) {
  const result = await db.query(
    `SELECT s.shopify_domain, c.data_type
     FROM shop_data_cache c
     JOIN shops s ON s.id = c.shop_id
     WHERE c.normalized_data ? 'generated_by'
        OR c.normalized_data ? 'last_sync_source'
     LIMIT 5`
  );

  if (result.rows.length > 0) {
    const entries = result.rows.map((row) => `${row.shopify_domain}:${row.data_type}`).join(', ');
    throw new Error(`Production data guard failed: development seeded cache detected: ${entries}`);
  }
}

async function assertNoDevelopmentFallbackConversations(db) {
  const result = await db.query(
    `SELECT s.shopify_domain, c.id
     FROM conversations c
     JOIN shops s ON s.id = c.shop_id
     WHERE c.messages::text ILIKE '%development fallback%'
        OR c.messages::text ILIKE '%simule edilmis analiz modunda%'
     LIMIT 5`
  );

  if (result.rows.length > 0) {
    const entries = result.rows.map((row) => `${row.shopify_domain}:${row.id}`).join(', ');
    throw new Error(`Production data guard failed: development fallback conversations detected: ${entries}`);
  }
}

async function assertProductionCompliance(db) {
  if (!isProduction()) {
    return;
  }

  validateAppUrl();

  if (process.env.AI_DEVELOPMENT_FALLBACK === 'true') {
    throw new Error('AI_DEVELOPMENT_FALLBACK must be false in production.');
  }

  await assertNoManualBillingBypass(db);
  await assertInstalledShopsHaveShopifyToken(db);
  await assertNoDevelopmentSeedCache(db);
  await assertNoDevelopmentFallbackConversations(db);
}

module.exports = {
  assertProductionCompliance,
};
