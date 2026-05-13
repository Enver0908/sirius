const jwt = require('jsonwebtoken');
const config = require('../services/shopify-config');

function parseShopifyUrl(value, { requireAdminPath = false } = {}) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, '');

    if (parsed.protocol !== 'https:' || !config.SHOP_DOMAIN_REGEX.test(hostname)) {
      return null;
    }

    if (requireAdminPath && pathname !== '/admin') {
      return null;
    }

    return hostname;
  } catch {
    return null;
  }
}

/**
 * Verifies Shopify App Bridge session tokens.
 *
 * The frontend can only get this token when Sirius is opened inside Shopify
 * Admin as an embedded app. Direct dev tunnel or localhost visits do not have a
 * Shopify session, so authenticated API calls should return a clear message.
 */
function shopifySessionMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'missing_token',
      message: 'Shopify Admin oturumu bulunamadi. Sirius uygulamasini Shopify Admin icinden acin.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.SHOPIFY_API_SECRET, {
      algorithms: ['HS256'],
      audience: process.env.SHOPIFY_API_KEY,
    });

    const { iss, dest } = decoded;
    const issuerShop = parseShopifyUrl(iss, { requireAdminPath: true });
    const destinationShop = parseShopifyUrl(dest);

    if (!issuerShop) {
      return res.status(401).json({ error: 'invalid_token', message: 'Gecersiz issuer (iss).' });
    }

    if (!destinationShop) {
      return res.status(401).json({ error: 'invalid_token', message: 'Gecersiz destination (dest).' });
    }

    if (issuerShop !== destinationShop) {
      return res.status(401).json({ error: 'invalid_token', message: 'Oturum domainleri eslesmiyor.' });
    }

    req.shopDomainFromSession = destinationShop;
    req.shopifySessionToken = token;
    return next();
  } catch (err) {
    console.error('Shopify session token verification error:', err.message);
    return res.status(401).json({
      error: 'invalid_token',
      message: 'Shopify oturumu gecersiz veya suresi dolmus. Uygulamayi Shopify Admin icinden yeniden acin.',
    });
  }
}

module.exports = shopifySessionMiddleware;
