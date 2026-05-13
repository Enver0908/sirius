const express = require('express');
const crypto = require('crypto');
const db = require('../db/client');
const { deleteFilesForRows } = require('../services/attachments');

const router = express.Router();

function safeLogValue(value, fallback = 'unknown') {
  if (process.env.NODE_ENV === 'production') {
    return '[redacted]';
  }

  return value || fallback;
}

function verifyWebhookHMAC(req, res, next) {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const hmacValue = Array.isArray(hmacHeader) ? hmacHeader[0] : hmacHeader;
  if (!hmacValue || typeof hmacValue !== 'string') {
    console.warn('Webhook HMAC header missing');
    return res.status(401).send('Unauthorized');
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    console.warn('Webhook raw body missing');
    return res.status(400).send('Bad Request');
  }

  try {
    const generatedHmac = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
      .update(rawBody, 'utf8')
      .digest('base64');

    const provided = Buffer.from(hmacValue, 'utf8');
    const expected = Buffer.from(generatedHmac, 'utf8');

    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      console.warn('Webhook HMAC verification failed');
      return res.status(401).send('Unauthorized');
    }
  } catch (err) {
    console.warn('Webhook HMAC could not be processed:', err.message);
    return res.status(401).send('Unauthorized');
  }

  next();
}

async function handleCustomerDataRequest(shopDomain, payload) {
  console.log(`Customer data request webhook: ${shopDomain}`);
  console.log(`   Customer ID: ${safeLogValue(payload.customer?.id, 'unknown')}`);
  console.log(`Customer data request processed (no direct customer record storage): ${shopDomain}`);
}

async function handleCustomerRedact(shopDomain, payload) {
  console.log(`Customer redact webhook: ${shopDomain}`);
  console.log(`   Customer ID: ${safeLogValue(payload.customer?.id, 'unknown')}`);

  const shopResult = await db.query(
    'SELECT id FROM shops WHERE shopify_domain = $1',
    [shopDomain]
  );

  if (shopResult.rows.length > 0) {
    await db.query(
      `UPDATE shop_data_cache
       SET raw_data = NULL,
           normalized_data = NULL,
           expires_at = NOW()
       WHERE shop_id = $1
         AND data_type IN ('orders_7d', 'orders_30d', 'customers', 'customer_exports')`,
      [shopResult.rows[0].id]
    );
  }

  console.log(`Customer redact processed: ${shopDomain}`);
}

async function handleShopRedact(shopDomain) {
  console.log(`Shop redact webhook: ${shopDomain}`);

  const attachmentResult = await db.query(
    `SELECT ca.storage_path
     FROM conversation_attachments ca
     JOIN shops s ON s.id = ca.shop_id
     WHERE s.shopify_domain = $1`,
    [shopDomain]
  );

  const result = await db.query(
    'DELETE FROM shops WHERE shopify_domain = $1 RETURNING id',
    [shopDomain]
  );

  deleteFilesForRows(attachmentResult.rows);

  if (result.rows.length > 0) {
    console.log(`Shop and related data deleted: ${shopDomain} (${result.rows[0].id})`);
  } else {
    console.log(`No shop found to redact: ${shopDomain}`);
  }
}

async function handleAppSubscriptionUpdate(shopDomain, payload) {
  const subscription = payload?.app_subscription || payload || {};
  const subscriptionId = subscription.admin_graphql_api_id || subscription.id || null;
  const status = String(subscription.status || '').toUpperCase();

  if (!shopDomain || !subscriptionId || !status) {
    console.warn(`App subscription webhook missing fields: ${shopDomain || 'missing-shop'}`);
    return;
  }

  if (status === 'ACTIVE') {
    await db.query(
      `UPDATE shops
       SET billing_status = 'active',
           plan = 'sirius',
           shopify_billing_id = $1,
           pending_plan = NULL,
           pending_charge_id = NULL,
           pending_billing_nonce = NULL,
           updated_at = NOW()
       WHERE shopify_domain = $2`,
      [subscriptionId, shopDomain]
    );
    console.log(`App subscription active: ${shopDomain}`);
    return;
  }

  if (['CANCELLED', 'DECLINED', 'EXPIRED', 'FROZEN'].includes(status)) {
    const nextStatus = status === 'FROZEN' ? 'frozen' : 'cancelled';
    const result = await db.query(
      `UPDATE shops
       SET billing_status = $1,
           pending_plan = NULL,
           pending_charge_id = NULL,
           pending_billing_nonce = NULL,
           updated_at = NOW()
       WHERE shopify_domain = $2
         AND (
           shopify_billing_id = $3
           OR pending_charge_id = $3
           OR shopify_billing_id IS NULL
         )`,
      [nextStatus, shopDomain, subscriptionId]
    );

    if (result.rowCount > 0) {
      console.log(`App subscription ${nextStatus}: ${shopDomain}`);
    } else {
      console.log(`Ignored stale app subscription update: ${shopDomain} (${status})`);
    }
    return;
  }

  if (status === 'PENDING') {
    await db.query(
      `UPDATE shops
       SET billing_status = CASE
             WHEN billing_status = 'active' THEN billing_status
             ELSE 'pending'
           END,
           pending_charge_id = COALESCE(pending_charge_id, $1),
           updated_at = NOW()
       WHERE shopify_domain = $2`,
      [subscriptionId, shopDomain]
    );
    return;
  }

  console.log(`Unhandled app subscription status: ${shopDomain} (${status})`);
}

async function invalidateShopDataCache(shopDomain, dataTypes) {
  const shopResult = await db.query(
    'SELECT id FROM shops WHERE shopify_domain = $1',
    [shopDomain]
  );

  if (shopResult.rows.length === 0) {
    console.warn(`Webhook shop not found: ${shopDomain}`);
    return false;
  }

  await db.query(
    `UPDATE shop_data_cache
     SET expires_at = NOW()
     WHERE shop_id = $1 AND data_type = ANY($2::text[])`,
    [shopResult.rows[0].id, dataTypes]
  );

  return true;
}

router.post('/orders-create', verifyWebhookHMAC, async (req, res) => {
  res.status(200).send('OK');

  try {
    const order = req.body;
    const shopDomain = req.headers['x-shopify-shop-domain'];

    console.log(`New order webhook: ${safeLogValue(order.name)} - ${shopDomain}`);

    const shopResult = await db.query(
      'SELECT id FROM shops WHERE shopify_domain = $1',
      [shopDomain]
    );

    if (shopResult.rows.length === 0) {
      console.warn(`Webhook shop not found: ${shopDomain}`);
      return;
    }

    const shopId = shopResult.rows[0].id;

    await db.query(
      `UPDATE shop_data_cache
       SET expires_at = NOW()
       WHERE shop_id = $1 AND data_type IN ('orders_7d', 'orders_30d')`,
      [shopId]
    );

    console.log(`Order cache invalidated: ${shopDomain}`);
  } catch (err) {
    console.error('orders/create webhook error:', err.message);
  }
});

router.post('/orders-updated', verifyWebhookHMAC, async (req, res) => {
  res.status(200).send('OK');

  try {
    const order = req.body;
    const shopDomain = req.headers['x-shopify-shop-domain'];

    console.log(
      `Order updated webhook: ${safeLogValue(order.name)} - ${shopDomain} - ${safeLogValue(order.financial_status)}`
    );

    const shopResult = await db.query(
      'SELECT id FROM shops WHERE shopify_domain = $1',
      [shopDomain]
    );

    if (shopResult.rows.length === 0) {
      return;
    }

    await db.query(
      `UPDATE shop_data_cache
       SET expires_at = NOW()
       WHERE shop_id = $1 AND data_type IN ('orders_7d', 'orders_30d')`,
      [shopResult.rows[0].id]
    );
  } catch (err) {
    console.error('orders/updated webhook error:', err.message);
  }
});

router.post('/products-create', verifyWebhookHMAC, async (req, res) => {
  res.status(200).send('OK');

  try {
    const product = req.body;
    const shopDomain = req.headers['x-shopify-shop-domain'];

    console.log(`Product created webhook: ${safeLogValue(product.title)} - ${shopDomain}`);
    const invalidated = await invalidateShopDataCache(shopDomain, ['products', 'stock_alerts']);
    if (invalidated) {
      console.log(`Product cache invalidated: ${shopDomain}`);
    }
  } catch (err) {
    console.error('products/create webhook error:', err.message);
  }
});

router.post('/products-update', verifyWebhookHMAC, async (req, res) => {
  res.status(200).send('OK');

  try {
    const product = req.body;
    const shopDomain = req.headers['x-shopify-shop-domain'];

    console.log(`Product updated webhook: ${safeLogValue(product.title)} - ${shopDomain}`);
    const invalidated = await invalidateShopDataCache(shopDomain, ['products', 'stock_alerts']);
    if (invalidated) {
      console.log(`Product cache invalidated: ${shopDomain}`);
    }
  } catch (err) {
    console.error('products/update webhook error:', err.message);
  }
});

router.post('/products-delete', verifyWebhookHMAC, async (req, res) => {
  res.status(200).send('OK');

  try {
    const product = req.body;
    const shopDomain = req.headers['x-shopify-shop-domain'];

    console.log(`Product deleted webhook: ${safeLogValue(product.id)} - ${shopDomain}`);
    const invalidated = await invalidateShopDataCache(shopDomain, ['products', 'stock_alerts']);
    if (invalidated) {
      console.log(`Product cache invalidated: ${shopDomain}`);
    }
  } catch (err) {
    console.error('products/delete webhook error:', err.message);
  }
});

router.post('/app-uninstalled', verifyWebhookHMAC, async (req, res) => {
  res.status(200).send('OK');

  try {
    const shopDomain = req.headers['x-shopify-shop-domain'];
    console.log(`App uninstalled webhook: ${shopDomain}`);

    await db.transaction(async (client) => {
      const shopResult = await client.query(
        `SELECT id
         FROM shops
         WHERE shopify_domain = $1`,
        [shopDomain]
      );

      if (shopResult.rows.length === 0) {
        return;
      }

      const shopId = shopResult.rows[0].id;

      await client.query(
        `DELETE FROM shop_ai_credentials
         WHERE shop_id = $1`,
        [shopId]
      );

      await client.query(
        `UPDATE shops
         SET billing_status = 'cancelled',
             plan = 'sirius',
             shopify_access_token = NULL,
             shopify_refresh_token = NULL,
             shopify_access_token_expires_at = NULL,
             shopify_refresh_token_expires_at = NULL,
             shopify_billing_id = NULL,
             pending_plan = NULL,
             pending_charge_id = NULL,
             pending_billing_nonce = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [shopId]
      );
    });

    console.log(`Shop deactivated and credentials cleared: ${shopDomain}`);
  } catch (err) {
    console.error('app/uninstalled webhook error:', err.message);
  }
});

router.post('/app-subscriptions-update', verifyWebhookHMAC, async (req, res) => {
  res.status(200).send('OK');

  try {
    await handleAppSubscriptionUpdate(req.headers['x-shopify-shop-domain'], req.body);
  } catch (err) {
    console.error('app_subscriptions/update webhook error:', err.message);
  }
});

router.post('/customers-data-request', verifyWebhookHMAC, async (req, res) => {
  res.status(200).send('OK');

  try {
    await handleCustomerDataRequest(req.headers['x-shopify-shop-domain'], req.body);
  } catch (err) {
    console.error('customers/data_request webhook error:', err.message);
  }
});

router.post('/customers-redact', verifyWebhookHMAC, async (req, res) => {
  res.status(200).send('OK');

  try {
    await handleCustomerRedact(req.headers['x-shopify-shop-domain'], req.body);
  } catch (err) {
    console.error('customers/redact webhook error:', err.message);
  }
});

router.post('/shop-redact', verifyWebhookHMAC, async (req, res) => {
  res.status(200).send('OK');

  try {
    await handleShopRedact(req.headers['x-shopify-shop-domain']);
  } catch (err) {
    console.error('shop/redact webhook error:', err.message);
  }
});

router.post('/compliance', verifyWebhookHMAC, async (req, res) => {
  res.status(200).send('OK');

  try {
    const topic = req.headers['x-shopify-topic'];
    const shopDomain = req.headers['x-shopify-shop-domain'];
    const payload = req.body;

    if (topic === 'customers/data_request') {
      await handleCustomerDataRequest(shopDomain, payload);
      return;
    }

    if (topic === 'customers/redact') {
      await handleCustomerRedact(shopDomain, payload);
      return;
    }

    if (topic === 'shop/redact') {
      await handleShopRedact(shopDomain);
      return;
    }

    console.warn(`Unknown compliance webhook topic: ${topic || 'missing-topic'}`);
  } catch (err) {
    console.error('Compliance webhook handler error:', err.message);
  }
});

module.exports = router;
