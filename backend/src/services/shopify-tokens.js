const axios = require('axios');
const db = require('../db/client');
const config = require('./shopify-config');
const { encrypt, decrypt } = require('./crypto');

const REFRESH_BUFFER_SECONDS = 5 * 60;

function buildExpiryDate(expiresInSeconds) {
  if (!expiresInSeconds) return null;
  return new Date(Date.now() + (expiresInSeconds * 1000));
}

function normalizeTokenPayload(payload) {
  return {
    accessToken: payload.access_token,
    encryptedAccessToken: encrypt(payload.access_token),
    refreshToken: payload.refresh_token || null,
    encryptedRefreshToken: payload.refresh_token ? encrypt(payload.refresh_token) : null,
    accessTokenExpiresAt: buildExpiryDate(payload.expires_in),
    refreshTokenExpiresAt: buildExpiryDate(payload.refresh_token_expires_in),
  };
}

function expiresSoon(timestamp, bufferSeconds = REFRESH_BUFFER_SECONDS) {
  if (!timestamp) return false;
  return new Date(timestamp).getTime() <= (Date.now() + (bufferSeconds * 1000));
}

async function exchangeAuthorizationCode(shop, code) {
  const response = await axios.post(
    config.oauthTokenUrl(shop),
    {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
      expiring: 1,
    },
    { timeout: 30000 }
  );

  return normalizeTokenPayload(response.data);
}

async function exchangeSessionTokenForOfflineToken(shop, sessionToken) {
  const response = await axios.post(
    config.oauthTokenUrl(shop),
    new URLSearchParams({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: sessionToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
      expiring: '1',
    }).toString(),
    {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    }
  );

  return normalizeTokenPayload(response.data);
}

async function refreshOfflineAccessToken(shop, refreshToken) {
  const response = await axios.post(
    config.oauthTokenUrl(shop),
    {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
    { timeout: 30000 }
  );

  return normalizeTokenPayload(response.data);
}

async function persistRefreshedTokens(shopId, tokenBundle, dbClient = db) {
  await dbClient.query(
    `UPDATE shops
     SET shopify_access_token = $1,
         shopify_refresh_token = COALESCE($2, shopify_refresh_token),
         shopify_access_token_expires_at = $3,
         shopify_refresh_token_expires_at = COALESCE($4, shopify_refresh_token_expires_at),
         updated_at = NOW()
     WHERE id = $5`,
    [
      tokenBundle.encryptedAccessToken,
      tokenBundle.encryptedRefreshToken,
      tokenBundle.accessTokenExpiresAt,
      tokenBundle.refreshTokenExpiresAt,
      shopId,
    ]
  );
}

async function getValidAccessTokenForShopRow(shopRow, dbClient = db) {
  if (!shopRow?.shopify_access_token) {
    throw new Error('Shop access token bulunamadı');
  }

  if (!shopRow.shopify_access_token_expires_at) {
    return decrypt(shopRow.shopify_access_token);
  }

  if (!expiresSoon(shopRow.shopify_access_token_expires_at)) {
    return decrypt(shopRow.shopify_access_token);
  }

  if (!shopRow.shopify_refresh_token) {
    throw new Error('Refresh token bulunamadı; uygulamayı yeniden bağlayın');
  }

  if (shopRow.shopify_refresh_token_expires_at && expiresSoon(shopRow.shopify_refresh_token_expires_at, 0)) {
    throw new Error('Refresh token süresi dolmuş; uygulamayı yeniden bağlayın');
  }

  const refreshedTokens = await refreshOfflineAccessToken(
    shopRow.shopify_domain,
    decrypt(shopRow.shopify_refresh_token)
  );

  await persistRefreshedTokens(shopRow.id, refreshedTokens, dbClient);
  return refreshedTokens.accessToken;
}

async function getValidAccessTokenForShopId(shopId, dbClient = db) {
  const result = await dbClient.query(
    `SELECT id, shopify_domain, shopify_access_token, shopify_refresh_token,
            shopify_access_token_expires_at, shopify_refresh_token_expires_at
     FROM shops
     WHERE id = $1`,
    [shopId]
  );

  if (!result.rows.length) {
    throw new Error(`Shop bulunamadı: ${shopId}`);
  }

  return getValidAccessTokenForShopRow(result.rows[0], dbClient);
}

module.exports = {
  exchangeAuthorizationCode,
  exchangeSessionTokenForOfflineToken,
  getValidAccessTokenForShopId,
  getValidAccessTokenForShopRow,
  persistRefreshedTokens,
};
