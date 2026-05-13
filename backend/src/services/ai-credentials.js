const { encrypt } = require('./crypto');

const PROVIDERS = ['claude', 'chatgpt', 'gemini'];

function buildProviderStatusMap(rows = []) {
  const statuses = {
    claude: { has_api_key: false },
    chatgpt: { has_api_key: false },
    gemini: { has_api_key: false },
  };

  for (const row of rows) {
    if (statuses[row.provider]) {
      statuses[row.provider] = { has_api_key: true };
    }
  }

  return statuses;
}

async function getProviderCredentialRows(shopId, db) {
  const result = await db.query(
    `SELECT provider, encrypted_api_key
     FROM shop_ai_credentials
     WHERE shop_id = $1`,
    [shopId]
  );

  return result.rows;
}

async function getProviderStatusMap(shopId, db) {
  const rows = await getProviderCredentialRows(shopId, db);
  return buildProviderStatusMap(rows);
}

async function hasAnyProviderKey(shopId, db) {
  const rows = await getProviderCredentialRows(shopId, db);
  return rows.length > 0;
}

async function getEncryptedProviderKey(shopId, provider, db) {
  const result = await db.query(
    `SELECT encrypted_api_key
     FROM shop_ai_credentials
     WHERE shop_id = $1 AND provider = $2`,
    [shopId, provider]
  );

  return result.rows[0]?.encrypted_api_key || null;
}

async function upsertProviderCredential(shopId, provider, apiKey, db) {
  const encryptedApiKey = encrypt(apiKey.trim());

  await db.query(
    `INSERT INTO shop_ai_credentials (shop_id, provider, encrypted_api_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (shop_id, provider)
     DO UPDATE SET
       encrypted_api_key = EXCLUDED.encrypted_api_key,
       updated_at = NOW()`,
    [shopId, provider, encryptedApiKey]
  );
}

module.exports = {
  PROVIDERS,
  buildProviderStatusMap,
  getProviderCredentialRows,
  getProviderStatusMap,
  hasAnyProviderKey,
  getEncryptedProviderKey,
  upsertProviderCredential,
};
