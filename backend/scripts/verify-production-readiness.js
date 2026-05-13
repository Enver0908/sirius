require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../src/db/client');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

const checks = [];

function addCheck(name, fn) {
  checks.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectNoRows(name, sql) {
  const result = await db.query(sql);
  assert(result.rows.length === 0, `${name}: found ${result.rows.length} row(s): ${JSON.stringify(result.rows)}`);
}

addCheck('environment is production-safe', async () => {
  assert(process.env.NODE_ENV === 'production', 'NODE_ENV must be production');
  assert((process.env.APP_URL || '').startsWith('https://'), 'APP_URL must use https');
  assert(!process.env.APP_URL.includes('localhost'), 'APP_URL must not use localhost');
  assert(!process.env.APP_URL.includes('127.0.0.1'), 'APP_URL must not use 127.0.0.1');
  assert(!process.env.APP_URL.includes('ngrok-free'), 'APP_URL must not use a dev tunnel');
  assert(process.env.AI_DEVELOPMENT_FALLBACK !== 'true', 'AI_DEVELOPMENT_FALLBACK must not be true');
});

addCheck('all migrations are applied', async () => {
  const expected = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const result = await db.query('SELECT version FROM schema_migrations');
  const applied = new Set(result.rows.map((row) => row.version));
  const missing = expected.filter((file) => !applied.has(file));
  assert(missing.length === 0, `missing migrations: ${missing.join(', ')}`);
});

addCheck('no manual billing bypass', async () => {
  await expectNoRows(
    'manual billing bypass',
    `SELECT shopify_domain
     FROM shops
     WHERE billing_status = 'active'
       AND shopify_billing_id IS NULL
     LIMIT 20`
  );
});

addCheck('installed shops have Shopify tokens', async () => {
  await expectNoRows(
    'installed shops without Shopify token',
    `SELECT shopify_domain
     FROM shops
     WHERE billing_status IN ('trial', 'pending', 'active')
       AND shopify_access_token IS NULL
     LIMIT 20`
  );
});

addCheck('no development seeded cache', async () => {
  await expectNoRows(
    'development seeded cache',
    `SELECT s.shopify_domain, c.data_type
     FROM shop_data_cache c
     JOIN shops s ON s.id = c.shop_id
     WHERE c.normalized_data ? 'generated_by'
        OR c.normalized_data ? 'last_sync_source'
     LIMIT 20`
  );
});

addCheck('no development fallback conversations', async () => {
  await expectNoRows(
    'development fallback conversations',
    `SELECT s.shopify_domain, c.id
     FROM conversations c
     JOIN shops s ON s.id = c.shop_id
     WHERE c.messages::text ILIKE '%development fallback%'
        OR c.messages::text ILIKE '%simule edilmis analiz modunda%'
     LIMIT 20`
  );
});

addCheck('required webhook routes are configured', async () => {
  const config = require('../src/services/shopify-config');
  const requiredTopics = config.WEBHOOK_TOPICS.filter((topic) => topic.required).map((topic) => topic.graphqlTopic);
  assert(requiredTopics.includes('APP_UNINSTALLED'), 'APP_UNINSTALLED webhook must be required');
  assert(requiredTopics.includes('APP_SUBSCRIPTIONS_UPDATE'), 'APP_SUBSCRIPTIONS_UPDATE webhook must be required');
});

(async () => {
  let failed = 0;

  for (const check of checks) {
    try {
      await check.fn();
      console.log(`[ok] ${check.name}`);
    } catch (err) {
      failed += 1;
      console.error(`[fail] ${check.name}: ${err.message}`);
    }
  }

  await db.close();

  if (failed > 0) {
    console.error(`Production readiness failed: ${failed} check(s) failed.`);
    process.exit(1);
  }

  console.log('Production readiness checks passed.');
})();
