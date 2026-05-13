require('dotenv').config();

const db = require('../src/db/client');

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

addCheck('shop domains are unique', async () => {
  await expectNoRows(
    'duplicate shopify_domain',
    `SELECT shopify_domain, COUNT(*)::int AS count
     FROM shops
     GROUP BY shopify_domain
     HAVING COUNT(*) > 1`
  );
});

addCheck('AI credentials are unique per shop and provider', async () => {
  await expectNoRows(
    'duplicate provider credentials',
    `SELECT shop_id, provider, COUNT(*)::int AS count
     FROM shop_ai_credentials
     GROUP BY shop_id, provider
     HAVING COUNT(*) > 1`
  );
});

addCheck('AI credentials are encrypted-looking, not raw keys', async () => {
  await expectNoRows(
    'raw-looking AI credentials',
    `SELECT s.shopify_domain, c.provider
     FROM shop_ai_credentials c
     JOIN shops s ON s.id = c.shop_id
     WHERE c.encrypted_api_key NOT LIKE '%:%:%'
        OR c.encrypted_api_key ILIKE 'sk-%'
        OR c.encrypted_api_key ILIKE 'sk-ant-%'
        OR c.encrypted_api_key ILIKE 'AIza%'`
  );
});

addCheck('conversation attachments belong to the same shop as their conversation', async () => {
  await expectNoRows(
    'cross-shop conversation attachments',
    `SELECT ca.id, ca.shop_id AS attachment_shop_id, c.shop_id AS conversation_shop_id
     FROM conversation_attachments ca
     JOIN conversations c ON c.id = ca.conversation_id
     WHERE ca.shop_id <> c.shop_id`
  );
});

addCheck('attached files have a valid storage namespace', async () => {
  await expectNoRows(
    'attachment storage path outside shop namespace',
    `SELECT id, shop_id, storage_path
     FROM conversation_attachments
     WHERE storage_path IS NULL
        OR storage_path = ''
        OR storage_path LIKE '/%'
        OR storage_path LIKE '%..%'
        OR split_part(storage_path, '/', 1) <> shop_id::text`
  );
});

addCheck('shop-scoped cache has no duplicate data types', async () => {
  await expectNoRows(
    'duplicate shop cache entries',
    `SELECT shop_id, data_type, COUNT(*)::int AS count
     FROM shop_data_cache
     GROUP BY shop_id, data_type
     HAVING COUNT(*) > 1`
  );
});

addCheck('task rows are shop scoped', async () => {
  await expectNoRows(
    'tasks without valid shop',
    `SELECT t.id
     FROM tasks t
     LEFT JOIN shops s ON s.id = t.shop_id
     WHERE s.id IS NULL`
  );
});

addCheck('token usage rows are shop scoped', async () => {
  await expectNoRows(
    'token usage without valid shop',
    `SELECT tu.id
     FROM token_usage tu
     LEFT JOIN shops s ON s.id = tu.shop_id
     WHERE s.id IS NULL`
  );
});

addCheck('conversation rows are shop scoped', async () => {
  await expectNoRows(
    'conversations without valid shop',
    `SELECT c.id
     FROM conversations c
     LEFT JOIN shops s ON s.id = c.shop_id
     WHERE s.id IS NULL`
  );
});

addCheck('summary counts', async () => {
  const result = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM shops) AS shops,
       (SELECT COUNT(*)::int FROM shop_ai_credentials) AS ai_credentials,
       (SELECT COUNT(*)::int FROM conversations) AS conversations,
       (SELECT COUNT(*)::int FROM conversation_attachments) AS attachments,
       (SELECT COUNT(*)::int FROM shop_data_cache) AS cache_entries`
  );

  console.log(`[info] counts ${JSON.stringify(result.rows[0])}`);
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
    console.error(`Multi-tenant integrity failed: ${failed} check(s) failed.`);
    process.exit(1);
  }

  console.log('Multi-tenant integrity checks passed.');
})();
