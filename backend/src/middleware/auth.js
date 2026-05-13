const db = require('../db/client');

async function authMiddleware(req, res, next) {
  const shopDomain = req.shopDomainFromSession;

  if (!shopDomain) {
    return res.status(401).json({
      error: 'missing_shop_domain',
      message: 'Guvenli oturumdan magaza kimligi okunamadi',
    });
  }

  try {
    const result = await db.query(
      `SELECT id, shopify_domain, plan, billing_status, trial_ends_at,
              ai_provider, ai_model, created_at, updated_at
       FROM shops
       WHERE shopify_domain = $1`,
      [shopDomain]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'shop_not_found',
        message: 'Bu domain ile kayitli magaza bulunamadi',
      });
    }

    const shop = result.rows[0];

    if (shop.billing_status === 'active') {
      req.shop = shop;
      return next();
    }

    if (shop.billing_status === 'trial' || shop.billing_status === 'pending') {
      const trialEnd = new Date(shop.trial_ends_at);
      if (shop.billing_status === 'trial' && trialEnd < new Date()) {
        return res.status(402).json({
          error: 'trial_expired',
          message: 'Deneme sureniz doldu. Devam etmek icin bir plan secin.',
          trial_ended_at: shop.trial_ends_at,
        });
      }

      req.shop = shop;
      return next();
    }

    return res.status(402).json({
      error: 'subscription_inactive',
      message: 'Aboneliginiz aktif degil. Devam etmek icin bir plan secin.',
      billing_status: shop.billing_status,
    });
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(500).json({
      error: 'auth_error',
      message: 'Kimlik dogrulama sirasinda hata olustu',
    });
  }
}

module.exports = authMiddleware;
