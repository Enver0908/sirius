const db = require('../src/db/client');
const { decrypt } = require('../src/services/crypto');
const billing = require('../src/services/billing');

async function main() {
  const shopDomain = process.argv[2];
  const planKey = process.argv[3] || 'sirius';

  if (!shopDomain) {
    throw new Error('shopDomain is required');
  }

  const shopRes = await db.query(
    'SELECT id, shopify_domain, shopify_access_token FROM shops WHERE shopify_domain = $1',
    [shopDomain]
  );

  if (!shopRes.rows.length) {
    throw new Error(`Shop not found: ${shopDomain}`);
  }

  const row = shopRes.rows[0];
  const token = decrypt(row.shopify_access_token);
  const returnUrl = `${process.env.APP_URL}/api/billing/callback?shop_id=${row.id}`;

  try {
    const result = await billing.createRecurringCharge(
      row.shopify_domain,
      token,
      planKey,
      returnUrl,
      { replacementBehavior: 'STANDARD' }
    );

    console.log(JSON.stringify({ ok: true, result }, null, 2));
  } catch (err) {
    console.error('ERR_MESSAGE:', err.message);
    if (err.response) {
      console.error('ERR_STATUS:', err.response.status);
      console.error('ERR_DATA:', JSON.stringify(err.response.data, null, 2));
    }
    process.exitCode = 1;
  }
}

main().finally(() => db.close());
