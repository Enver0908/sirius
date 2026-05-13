const axios = require('axios');
const db = require('../db/client');
const config = require('./shopify-config');
const { getValidAccessTokenForShopRow } = require('./shopify-tokens');

const CACHE_TTL_HOURS = 4;
const DEFAULT_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_MAX_GLOBAL_SYNC_CONCURRENCY = 3;
const SHOPIFY_GRAPHQL_MAX_ATTEMPTS = 3;
const SHOPIFY_GRAPHQL_BASE_BACKOFF_MS = 750;
const SYNC_COOLDOWN_MS = getPositiveIntegerEnv('SHOPIFY_SYNC_COOLDOWN_MS', DEFAULT_SYNC_COOLDOWN_MS);
const MAX_GLOBAL_SYNC_CONCURRENCY = getPositiveIntegerEnv(
  'SHOPIFY_SYNC_MAX_CONCURRENCY',
  DEFAULT_MAX_GLOBAL_SYNC_CONCURRENCY
);
const activeShopSyncs = new Map();
let activeGlobalSyncs = 0;
const globalSyncQueue = [];

function getPositiveIntegerEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithGlobalSyncSlot(task) {
  if (activeGlobalSyncs < MAX_GLOBAL_SYNC_CONCURRENCY) {
    activeGlobalSyncs += 1;
  } else {
    await new Promise((resolve) => {
      globalSyncQueue.push(resolve);
    });
  }

  try {
    return await task();
  } finally {
    const next = globalSyncQueue.shift();
    if (next) {
      next();
    } else {
      activeGlobalSyncs -= 1;
    }
  }
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function roundRate(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function percent(part, total) {
  if (!total) {
    return 0;
  }

  return roundRate((part / total) * 100);
}

function parseMoneyBag(moneyBag) {
  return parseFloat(moneyBag?.shopMoney?.amount || 0) || 0;
}

function normalizeSourceName(sourceName) {
  if (!sourceName || typeof sourceName !== 'string') {
    return 'unknown';
  }

  return sourceName.trim().toLowerCase().replace(/\s+/g, '_') || 'unknown';
}

function buildDateBuckets(orders, dayRange) {
  const buckets = new Map();

  for (let daysAgo = dayRange - 1; daysAgo >= 0; daysAgo -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysAgo);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, { date: key, revenue: 0, orders: 0, units: 0 });
  }

  for (const order of orders) {
    const key = order.createdAt?.slice(0, 10);
    if (!buckets.has(key)) {
      continue;
    }

    const bucket = buckets.get(key);
    bucket.revenue += order.totalPrice || 0;
    bucket.orders += 1;
    bucket.units += order.lineItems?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
  }

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    revenue: roundMoney(bucket.revenue),
  }));
}

function buildWeekdayPerformance(orders) {
  const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const buckets = weekdays.map((day) => ({ day, revenue: 0, orders: 0 }));

  for (const order of orders) {
    const date = new Date(order.createdAt);
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const bucket = buckets[date.getUTCDay()];
    bucket.revenue += order.totalPrice || 0;
    bucket.orders += 1;
  }

  return buckets
    .map((bucket) => ({
      ...bucket,
      revenue: roundMoney(bucket.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function buildPeriodComparison(orders, dayRange) {
  const midpoint = Math.floor(dayRange / 2);
  const now = new Date();
  const firstHalf = { revenue: 0, orders: 0 };
  const secondHalf = { revenue: 0, orders: 0 };

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    const daysAgo = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));
    const target = daysAgo >= midpoint ? firstHalf : secondHalf;
    target.revenue += order.totalPrice || 0;
    target.orders += 1;
  }

  const revenueChangePercent = firstHalf.revenue
    ? percent(secondHalf.revenue - firstHalf.revenue, firstHalf.revenue)
    : 0;
  const orderChangePercent = firstHalf.orders
    ? percent(secondHalf.orders - firstHalf.orders, firstHalf.orders)
    : 0;

  return {
    first_half_revenue: roundMoney(firstHalf.revenue),
    second_half_revenue: roundMoney(secondHalf.revenue),
    first_half_orders: firstHalf.orders,
    second_half_orders: secondHalf.orders,
    revenue_change_percent: revenueChangePercent,
    order_change_percent: orderChangePercent,
    trend: revenueChangePercent > 10 ? 'up' : revenueChangePercent < -10 ? 'down' : 'stable',
  };
}

function buildRecentVsPrevious(orders, recentDays) {
  const now = new Date();
  const recent = { revenue: 0, orders: 0, units: 0 };
  const previous = { revenue: 0, orders: 0, units: 0 };

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    const daysAgo = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));
    if (daysAgo < 0 || daysAgo >= recentDays * 2) {
      continue;
    }

    const target = daysAgo < recentDays ? recent : previous;
    target.revenue += order.totalPrice || 0;
    target.orders += 1;
    target.units += order.lineItems?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
  }

  return {
    recent_days: recentDays,
    recent_revenue: roundMoney(recent.revenue),
    previous_revenue: roundMoney(previous.revenue),
    revenue_change_percent: previous.revenue ? percent(recent.revenue - previous.revenue, previous.revenue) : 0,
    recent_orders: recent.orders,
    previous_orders: previous.orders,
    order_change_percent: previous.orders ? percent(recent.orders - previous.orders, previous.orders) : 0,
    recent_units: recent.units,
    previous_units: previous.units,
  };
}

function sortByRevenueDesc(a, b) {
  return (b.revenue || b.estimated_revenue_30d || 0) - (a.revenue || a.estimated_revenue_30d || 0);
}

function filterOrdersByRecentDays(orders, dayRange) {
  const since = new Date();
  since.setDate(since.getDate() - dayRange);

  return (orders || []).filter((order) => {
    const createdAt = new Date(order.createdAt);
    return !Number.isNaN(createdAt.getTime()) && createdAt >= since;
  });
}

// ═══════════════════════════════════════════════════════════════
// GraphQL Client
// ═══════════════════════════════════════════════════════════════

/**
 * Shopify Admin GraphQL API'ye istek gönderir.
 *
 * @param {string} shop       - mystore.myshopify.com
 * @param {string} token      - Access token (düz metin)
 * @param {string} query      - GraphQL query string
 * @param {object} [variables] - Query variables
 * @returns {Promise<object>}  - response.data
 */
async function shopifyGraphQLRequest(shop, token, query, variables = {}) {
  const url = config.graphqlUrl(shop);

  const response = await axios.post(url, { query, variables }, {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  if (response.data.errors) {
    const errMsg = response.data.errors.map((e) => e.message).join('; ');
    throw new Error(`Shopify GraphQL hatası: ${errMsg}`);
  }

  return response.data.data;
}

async function shopifyGraphQL(shop, token, query, variables = {}) {
  for (let attempt = 1; attempt <= SHOPIFY_GRAPHQL_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await shopifyGraphQLRequest(shop, token, query, variables);
    } catch (err) {
      if (attempt < SHOPIFY_GRAPHQL_MAX_ATTEMPTS && isRetryableShopifyRequestError(err)) {
        const delayMs = getShopifyRetryDelayMs(err, attempt);
        console.warn(`Shopify GraphQL retry ${attempt}/${SHOPIFY_GRAPHQL_MAX_ATTEMPTS} for ${shop} in ${delayMs}ms:`, err.message);
        await sleep(delayMs);
        continue;
      }

      throw err;
    }
  }

  throw new Error('Shopify GraphQL retry limit exceeded');
}

function isRetryableShopifyRequestError(err) {
  if (err.retryable || hasRetryableGraphQLError(err.message)) {
    return true;
  }

  const status = err.response?.status;
  if (status === 429 || (status >= 500 && status <= 599)) {
    return true;
  }

  return ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code);
}

function hasRetryableGraphQLError(message = '') {
  const normalized = String(message).toLowerCase();
  return normalized.includes('throttle') || normalized.includes('rate limit');
}

function getShopifyRetryDelayMs(err, attempt) {
  const retryAfter = Number.parseFloat(err.response?.headers?.['retry-after']);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 30000);
  }

  const backoff = SHOPIFY_GRAPHQL_BASE_BACKOFF_MS * (2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return backoff + jitter;
}

// ═══════════════════════════════════════════════════════════════
// Webhook Registration — GraphQL
// ═══════════════════════════════════════════════════════════════

const WEBHOOK_SUBSCRIPTION_CREATE = `
  mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
`;

/**
 * Shopify mağazasına tüm webhook'ları GraphQL ile kaydeder.
 * Mevcut webhook varsa userError döner ama akış kesilmez.
 *
 * @param {string} shop        - Shopify domain
 * @param {string} accessToken - Düz metin access token
 */
async function registerWebhooks(shop, accessToken) {
  const failures = [];
  const registeredTopics = [];

  for (const { graphqlTopic, callbackSlug, required } of config.WEBHOOK_TOPICS) {
    try {
      const data = await shopifyGraphQL(shop, accessToken, WEBHOOK_SUBSCRIPTION_CREATE, {
        topic: graphqlTopic,
        webhookSubscription: {
          callbackUrl: config.webhookCallbackUrl(callbackSlug),
          format: 'JSON',
        },
      });

      const result = data.webhookSubscriptionCreate;
      if (result.userErrors && result.userErrors.length > 0) {
        const message = result.userErrors.map((error) => error.message).join('; ');

        if (_isExistingWebhookUserError(message)) {
          registeredTopics.push(graphqlTopic);
          console.log(`Webhook already registered: ${graphqlTopic} -> ${shop}`);
          continue;
        }

        if (required) {
          failures.push({ topic: graphqlTopic, reason: message });
        }
        console.warn(`Webhook registration failed for ${graphqlTopic} on ${shop}: ${message}`);
        continue;
      } else {
        registeredTopics.push(graphqlTopic);
        console.log(`✅ Webhook kaydedildi: ${graphqlTopic} → ${shop}`);
      }
    } catch (err) {
      if (required) {
        failures.push({ topic: graphqlTopic, reason: err.message });
      }
      console.warn(`⚠️  Webhook kaydedilemedi: ${graphqlTopic} →`, err.message);
    }
  }

  if (failures.length > 0) {
    const error = new Error(
      `Zorunlu webhook kaydÄ± tamamlanamadÄ±: ${failures.map((failure) => failure.topic).join(', ')}`
    );
    error.code = 'webhook_registration_failed';
    error.details = failures;
    throw error;
  }

  return {
    success: true,
    registeredTopics,
  };
}

function _isExistingWebhookUserError(message = '') {
  const normalized = message.toLowerCase();
  return normalized.includes('already') || normalized.includes('taken') || normalized.includes('exists');
}

// ═══════════════════════════════════════════════════════════════
// 1. FETCH ORDERS — GraphQL ile paginated sipariş çekme
// ═══════════════════════════════════════════════════════════════

const ORDERS_QUERY = `
  query FetchOrders($query: String!, $cursor: String) {
    orders(first: 100, after: $cursor, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          createdAt
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalDiscountsSet {
            shopMoney { amount }
          }
          totalRefundedSet {
            shopMoney { amount }
          }
          cancelledAt
          sourceName
          subtotalLineItemsQuantity
          lineItems(first: 50) {
            edges {
              node {
                title
                quantity
                originalUnitPriceSet {
                  shopMoney { amount }
                }
                product { id }
                variant { id title }
              }
            }
          }
          displayFinancialStatus
          displayFulfillmentStatus
        }
      }
    }
  }
`;

/**
 * Son {dayRange} günlük siparişleri GraphQL ile paginated çeker.
 *
 * @param {string} shopDomain   - mystore.myshopify.com
 * @param {string} accessToken  - Düz metin
 * @param {number} dayRange     - Gün sayısı (7, 30, vb.)
 * @returns {Promise<Array>}    - Ham sipariş dizisi
 */
async function fetchOrders(shopDomain, accessToken, dayRange) {
  const since = new Date();
  since.setDate(since.getDate() - dayRange);
  const sinceISO = since.toISOString();

  const allOrders = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await shopifyGraphQL(shopDomain, accessToken, ORDERS_QUERY, {
      query: `created_at:>='${sinceISO}'`,
      cursor,
    });

    const { edges, pageInfo } = data.orders;

    for (const edge of edges) {
      const node = edge.node;
      allOrders.push({
        id: node.id,
        createdAt: node.createdAt,
        totalPrice: parseFloat(node.totalPriceSet.shopMoney.amount),
        currency: node.totalPriceSet.shopMoney.currencyCode,
        discountAmount: parseMoneyBag(node.totalDiscountsSet),
        refundedAmount: parseMoneyBag(node.totalRefundedSet),
        cancelledAt: node.cancelledAt || null,
        sourceName: normalizeSourceName(node.sourceName),
        totalItems: node.subtotalLineItemsQuantity || 0,
        financialStatus: node.displayFinancialStatus,
        fulfillmentStatus: node.displayFulfillmentStatus,
        lineItems: node.lineItems.edges.map((li) => ({
          title: li.node.title,
          quantity: li.node.quantity,
          unitPrice: parseFloat(li.node.originalUnitPriceSet.shopMoney.amount),
          productId: li.node.product?.id || null,
          variantId: li.node.variant?.id || null,
          variantTitle: li.node.variant?.title || null,
        })),
      });
    }

    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  console.log(`  📦 ${allOrders.length} sipariş çekildi (${dayRange} gün) — ${shopDomain}`);
  return allOrders;
}

// ═══════════════════════════════════════════════════════════════
// 2. NORMALIZE ORDERS — Ham veriyi AI-ready metriğe dönüştür
// ═══════════════════════════════════════════════════════════════

/**
 * Ham sipariş dizisini analiz edilebilir metriklere dönüştürür.
 *
 * @param {Array}  orders   - fetchOrders çıktısı
 * @param {number} dayRange - Dönem gün sayısı
 * @returns {object}
 */
function normalizeOrders(orders, dayRange) {
  if (!orders || orders.length === 0) {
    return {
      total_revenue: 0,
      order_count: 0,
      avg_order_value: 0,
      daily_average: 0,
      top_products: [],
      conversion_trend: 'stable',
      fulfillment_rate: 0,
    };
  }

  // ── Temel metrikler ──
  const totalRevenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);
  const orderCount = orders.length;
  const avgOrderValue = totalRevenue / orderCount;
  const dailyAverage = totalRevenue / dayRange;

  // ── Top 5 ürün ──
  const productMap = {};
  for (const order of orders) {
    for (const item of order.lineItems) {
      const key = item.title;
      if (!productMap[key]) {
        productMap[key] = { title: key, quantity: 0, revenue: 0 };
      }
      productMap[key].quantity += item.quantity;
      productMap[key].revenue += item.unitPrice * item.quantity;
    }
  }

  const topProducts = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({
      title: p.title,
      quantity: p.quantity,
      revenue: Math.round(p.revenue * 100) / 100,
    }));

  // ── Dönüşüm trendi (günlük gelir — ilk yarı vs. ikinci yarı) ──
  const midpoint = Math.floor(dayRange / 2);
  const now = new Date();
  let firstHalfRevenue = 0;
  let secondHalfRevenue = 0;

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    const daysAgo = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));

    if (daysAgo >= midpoint) {
      firstHalfRevenue += order.totalPrice;
    } else {
      secondHalfRevenue += order.totalPrice;
    }
  }

  let conversionTrend = 'stable';
  if (firstHalfRevenue > 0) {
    const changeRate = ((secondHalfRevenue - firstHalfRevenue) / firstHalfRevenue) * 100;
    if (changeRate > 10) conversionTrend = 'up';
    else if (changeRate < -10) conversionTrend = 'down';
  }

  // ── Fulfillment rate ──
  const fulfilledCount = orders.filter((o) =>
    o.fulfillmentStatus === 'FULFILLED' || o.fulfillmentStatus === 'PARTIALLY_FULFILLED'
  ).length;
  const fulfillmentRate = orderCount > 0
    ? Math.round((fulfilledCount / orderCount) * 100 * 10) / 10
    : 0;

  return {
    total_revenue: Math.round(totalRevenue * 100) / 100,
    order_count: orderCount,
    avg_order_value: Math.round(avgOrderValue * 100) / 100,
    daily_average: Math.round(dailyAverage * 100) / 100,
    top_products: topProducts,
    conversion_trend: conversionTrend,
    fulfillment_rate: fulfillmentRate,
  };
}

// ═══════════════════════════════════════════════════════════════
// 3. FETCH INVENTORY — Ürün stok durumu + tahmini stok biteceği gün
// ═══════════════════════════════════════════════════════════════

function normalizeOrdersForAI(orders, dayRange) {
  if (!orders || orders.length === 0) {
    return {
      total_revenue: 0,
      net_revenue: 0,
      order_count: 0,
      total_units: 0,
      avg_order_value: 0,
      daily_average: 0,
      top_products: [],
      variant_performance: [],
      channel_breakdown: [],
      orders_by_day: buildDateBuckets([], dayRange),
      weekday_performance: [],
      revenue_concentration: { top_1_percent: 0, top_3_percent: 0, top_5_percent: 0 },
      basket_metrics: { avg_items_per_order: 0, multi_item_order_rate: 0 },
      discount_metrics: { discount_amount: 0, discounted_orders: 0, discounted_order_rate: 0 },
      refund_metrics: { refunded_amount: 0, refunded_orders: 0, refund_rate: 0 },
      cancellation_metrics: { canceled_orders: 0, cancellation_rate: 0 },
      fulfillment_breakdown: {},
      period_comparison: buildPeriodComparison([], dayRange),
      recent_7d_vs_previous_7d: dayRange >= 14 ? buildRecentVsPrevious([], 7) : null,
      conversion_trend: 'stable',
      fulfillment_rate: 0,
    };
  }

  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
  const refundedAmount = orders.reduce((sum, o) => sum + (o.refundedAmount || 0), 0);
  const discountAmount = orders.reduce((sum, o) => sum + (o.discountAmount || 0), 0);
  const totalUnits = orders.reduce(
    (sum, order) => sum + (order.totalItems || order.lineItems.reduce((itemSum, item) => itemSum + item.quantity, 0)),
    0
  );
  const orderCount = orders.length;
  const avgOrderValue = totalRevenue / orderCount;
  const dailyAverage = totalRevenue / dayRange;
  const productMap = {};
  const variantMap = {};
  const channelMap = {};
  const fulfillmentBreakdown = {};
  let multiItemOrders = 0;
  let discountedOrders = 0;
  let refundedOrders = 0;
  let canceledOrders = 0;

  for (const order of orders) {
    const orderUnitCount = order.totalItems || order.lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const source = normalizeSourceName(order.sourceName);
    if (!channelMap[source]) {
      channelMap[source] = { source, revenue: 0, orders: 0 };
    }
    channelMap[source].revenue += order.totalPrice || 0;
    channelMap[source].orders += 1;

    const fulfillmentStatus = order.fulfillmentStatus || 'UNKNOWN';
    fulfillmentBreakdown[fulfillmentStatus] = (fulfillmentBreakdown[fulfillmentStatus] || 0) + 1;

    if (orderUnitCount > 1) multiItemOrders += 1;
    if ((order.discountAmount || 0) > 0) discountedOrders += 1;
    if ((order.refundedAmount || 0) > 0) refundedOrders += 1;
    if (order.cancelledAt) canceledOrders += 1;

    for (const item of order.lineItems) {
      const productKey = item.productId || item.title;
      if (!productMap[productKey]) {
        productMap[productKey] = {
          product_id: item.productId || null,
          title: item.title,
          quantity: 0,
          revenue: 0,
          order_count: 0,
        };
      }
      productMap[productKey].quantity += item.quantity;
      productMap[productKey].revenue += item.unitPrice * item.quantity;
      productMap[productKey].order_count += 1;

      const variantKey = item.variantId || `${item.title}::${item.variantTitle || 'default'}`;
      if (!variantMap[variantKey]) {
        variantMap[variantKey] = {
          variant_id: item.variantId || null,
          product_id: item.productId || null,
          product_title: item.title,
          variant_title: item.variantTitle || 'default',
          quantity: 0,
          revenue: 0,
          order_count: 0,
        };
      }
      variantMap[variantKey].quantity += item.quantity;
      variantMap[variantKey].revenue += item.unitPrice * item.quantity;
      variantMap[variantKey].order_count += 1;
    }
  }

  const productRevenues = Object.values(productMap).sort(sortByRevenueDesc);
  const revenueTop = (count) => productRevenues
    .slice(0, count)
    .reduce((sum, product) => sum + product.revenue, 0);
  const periodComparison = buildPeriodComparison(orders, dayRange);
  const fulfilledCount = orders.filter((o) =>
    o.fulfillmentStatus === 'FULFILLED' || o.fulfillmentStatus === 'PARTIALLY_FULFILLED'
  ).length;

  return {
    total_revenue: roundMoney(totalRevenue),
    net_revenue: roundMoney(totalRevenue - refundedAmount),
    order_count: orderCount,
    total_units: totalUnits,
    avg_order_value: roundMoney(avgOrderValue),
    daily_average: roundMoney(dailyAverage),
    top_products: productRevenues.slice(0, 5).map((product) => ({
      product_id: product.product_id,
      title: product.title,
      quantity: product.quantity,
      order_count: product.order_count,
      revenue: roundMoney(product.revenue),
      revenue_share_percent: percent(product.revenue, totalRevenue),
      avg_unit_price: product.quantity ? roundMoney(product.revenue / product.quantity) : 0,
    })),
    variant_performance: Object.values(variantMap)
      .sort(sortByRevenueDesc)
      .slice(0, 10)
      .map((variant) => ({
        ...variant,
        revenue: roundMoney(variant.revenue),
        revenue_share_percent: percent(variant.revenue, totalRevenue),
      })),
    channel_breakdown: Object.values(channelMap)
      .sort(sortByRevenueDesc)
      .map((channel) => ({
        ...channel,
        revenue: roundMoney(channel.revenue),
        revenue_share_percent: percent(channel.revenue, totalRevenue),
      })),
    orders_by_day: buildDateBuckets(orders, dayRange),
    weekday_performance: buildWeekdayPerformance(orders),
    revenue_concentration: {
      top_1_percent: percent(revenueTop(1), totalRevenue),
      top_3_percent: percent(revenueTop(3), totalRevenue),
      top_5_percent: percent(revenueTop(5), totalRevenue),
    },
    basket_metrics: {
      avg_items_per_order: orderCount ? roundRate(totalUnits / orderCount) : 0,
      multi_item_order_rate: percent(multiItemOrders, orderCount),
    },
    discount_metrics: {
      discount_amount: roundMoney(discountAmount),
      discounted_orders: discountedOrders,
      discounted_order_rate: percent(discountedOrders, orderCount),
    },
    refund_metrics: {
      refunded_amount: roundMoney(refundedAmount),
      refunded_orders: refundedOrders,
      refund_rate: percent(refundedOrders, orderCount),
    },
    cancellation_metrics: {
      canceled_orders: canceledOrders,
      cancellation_rate: percent(canceledOrders, orderCount),
    },
    fulfillment_breakdown: fulfillmentBreakdown,
    period_comparison: periodComparison,
    recent_7d_vs_previous_7d: dayRange >= 14 ? buildRecentVsPrevious(orders, 7) : null,
    conversion_trend: periodComparison.trend,
    fulfillment_rate: percent(fulfilledCount, orderCount),
  };
}

const INVENTORY_QUERY = `
  query FetchProducts($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          productType
          vendor
          tags
          status
          totalInventory
          variants(first: 10) {
            edges {
              node {
                id
                title
                inventoryQuantity
                price
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Tüm ürünleri ve stok miktarlarını çeker.
 * Son 30 günlük satış hızı ile tahmini stok gününü hesaplar.
 *
 * @param {string} shopDomain
 * @param {string} accessToken
 * @param {Array}  [orders30d]  - Son 30 günlük siparişler (satış hızı hesabı için)
 * @returns {Promise<Array>}
 */
async function fetchInventory(shopDomain, accessToken, orders30d = []) {
  // Ürünleri çek (paginated)
  const allProducts = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await shopifyGraphQL(shopDomain, accessToken, INVENTORY_QUERY, { cursor });
    const { edges, pageInfo } = data.products;

    for (const edge of edges) {
      const node = edge.node;
      const variants = node.variants.edges.map((v) => ({
        id: v.node.id,
        title: v.node.title,
        inventory_quantity: v.node.inventoryQuantity,
        price: parseFloat(v.node.price),
      }));

      allProducts.push({
        id: node.id,
        title: node.title,
        product_type: node.productType || null,
        vendor: node.vendor || null,
        tags: node.tags || [],
        status: node.status,
        total_inventory: node.totalInventory,
        variants,
      });
    }

    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  // ── Satış hızı hesapla (son 30 gün) ──
  const salesVelocity = {};
  for (const order of orders30d) {
    for (const item of order.lineItems) {
      if (!salesVelocity[item.title]) salesVelocity[item.title] = 0;
      salesVelocity[item.title] += item.quantity;
    }
  }

  // ── Her ürüne tahmini stok günü ekle ──
  const enriched = allProducts.map((product) => {
    const dailySales = (salesVelocity[product.title] || 0) / 30;
    const daysOfStock = dailySales > 0
      ? Math.round(product.total_inventory / dailySales)
      : null; // Satış yoksa hesaplanamaz

    return {
      ...product,
      daily_sales_rate: Math.round(dailySales * 100) / 100,
      days_of_stock: daysOfStock,
      stock_risk: daysOfStock !== null && daysOfStock < 14 ? true : false,
    };
  });

  console.log(`  📦 ${enriched.length} ürün çekildi — ${shopDomain}`);
  return enrichInventoryForAI(enriched, orders30d);
}

function enrichInventoryForAI(products, orders30d = []) {
  const salesVelocity = {};
  const salesRevenue = {};
  const orderVelocity = {};
  const variantVelocity = {};
  const variantRevenue = {};

  for (const order of orders30d) {
    for (const item of order.lineItems) {
      const productKey = item.productId || item.title;
      const variantKey = item.variantId || `${productKey}::${item.variantTitle || 'default'}`;
      salesVelocity[productKey] = (salesVelocity[productKey] || 0) + item.quantity;
      salesVelocity[item.title] = (salesVelocity[item.title] || 0) + item.quantity;
      salesRevenue[productKey] = (salesRevenue[productKey] || 0) + item.quantity * item.unitPrice;
      salesRevenue[item.title] = (salesRevenue[item.title] || 0) + item.quantity * item.unitPrice;
      orderVelocity[productKey] = (orderVelocity[productKey] || 0) + 1;
      orderVelocity[item.title] = (orderVelocity[item.title] || 0) + 1;
      variantVelocity[variantKey] = (variantVelocity[variantKey] || 0) + item.quantity;
      variantRevenue[variantKey] = (variantRevenue[variantKey] || 0) + item.quantity * item.unitPrice;
    }
  }

  return products
    .map((product) => {
      const productUnitsSold = salesVelocity[product.id] || salesVelocity[product.title] || 0;
      const productRevenue = salesRevenue[product.id] || salesRevenue[product.title] || 0;
      const productOrderCount = orderVelocity[product.id] || orderVelocity[product.title] || 0;
      const dailySales = productUnitsSold / 30;
      const daysOfStock = dailySales > 0
        ? Math.round((product.total_inventory || 0) / dailySales)
        : null;
      const sellThroughRate = productUnitsSold + (product.total_inventory || 0) > 0
        ? percent(productUnitsSold, productUnitsSold + (product.total_inventory || 0))
        : 0;
      const variants = (product.variants || []).map((variant) => {
        const variantKey = variant.id || `${product.id}::${variant.title || 'default'}`;
        const unitsSold30d = variantVelocity[variantKey] || 0;
        const variantDailySales = unitsSold30d / 30;
        const variantDaysOfStock = variantDailySales > 0
          ? Math.round((variant.inventory_quantity || 0) / variantDailySales)
          : null;

        return {
          ...variant,
          units_sold_30d: unitsSold30d,
          estimated_revenue_30d: roundMoney(variantRevenue[variantKey] || 0),
          daily_sales_rate: roundRate(variantDailySales),
          days_of_stock: variantDaysOfStock,
          stock_risk: variantDaysOfStock !== null && variantDaysOfStock < 14,
        };
      });
      const demandInventoryScore = Math.min(
        100,
        Math.round((dailySales * 20) + (daysOfStock !== null ? Math.max(0, 30 - daysOfStock) * 2 : 0))
      );

      return {
        ...product,
        variants,
        units_sold_30d: productUnitsSold,
        order_count_30d: productOrderCount,
        estimated_revenue_30d: roundMoney(productRevenue),
        daily_sales_rate: roundRate(dailySales),
        days_of_stock: daysOfStock,
        sell_through_rate: sellThroughRate,
        inventory_turnover_30d: product.total_inventory > 0 ? roundRate(productUnitsSold / product.total_inventory) : 0,
        stock_risk: daysOfStock !== null && daysOfStock < 14,
        slow_moving: product.total_inventory > 0 && productUnitsSold === 0,
        dead_stock_risk: product.total_inventory >= 10 && productUnitsSold === 0,
        demand_inventory_score: demandInventoryScore,
        reorder_point: Math.max(3, Math.ceil(dailySales * 14)),
      };
    })
    .sort((a, b) => b.estimated_revenue_30d - a.estimated_revenue_30d);
}

// ═══════════════════════════════════════════════════════════════
// 4. SYNC SHOP DATA — Tüm verileri çek, normalize et, cache'e yaz
// ═══════════════════════════════════════════════════════════════

/**
 * Bir mağazanın tüm Shopify verilerini çekip cache'e yazar.
 *
 * @param {string} shopId - UUID
 * @param {object} dbClient - db/client modülü
 * @returns {Promise<{ synced_at, orders_7d, orders_30d, products }>}
 */
async function syncShopData(shopId, dbClient) {
  const syncKey = String(shopId);
  const activeSync = activeShopSyncs.get(syncKey);
  if (activeSync) {
    return activeSync;
  }

  const syncPromise = (async () => {
    const cachedResult = await getFreshCachedSyncResult(shopId, dbClient);
    if (cachedResult) {
      return cachedResult;
    }

    return runWithGlobalSyncSlot(() => _syncShopDataInternal(shopId, dbClient));
  })().finally(() => {
    activeShopSyncs.delete(syncKey);
  });

  activeShopSyncs.set(syncKey, syncPromise);
  return syncPromise;
}

async function getFreshCachedSyncResult(shopId, dbClient) {
  const result = await dbClient.query(
    `SELECT data_type, raw_data, normalized_data, fetched_at
     FROM shop_data_cache
     WHERE shop_id = $1
       AND data_type IN ('orders_7d', 'orders_30d', 'products', 'stock_alerts')`,
    [shopId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const latestFetchedAt = result.rows.reduce((latest, row) => {
    const fetchedAt = new Date(row.fetched_at);
    if (Number.isNaN(fetchedAt.getTime())) {
      return latest;
    }

    return !latest || fetchedAt > latest ? fetchedAt : latest;
  }, null);

  if (!latestFetchedAt || Date.now() - latestFetchedAt.getTime() > SYNC_COOLDOWN_MS) {
    return null;
  }

  const rowsByType = new Map(result.rows.map((row) => [row.data_type, row]));
  console.log(`Shopify sync cooldown active for shop ${shopId}; using cached data from ${latestFetchedAt.toISOString()}`);

  return {
    synced_at: latestFetchedAt.toISOString(),
    orders_7d: getCachedArrayLength(rowsByType.get('orders_7d')?.raw_data),
    orders_30d: getCachedArrayLength(rowsByType.get('orders_30d')?.raw_data),
    products: getCachedArrayLength(rowsByType.get('products')?.normalized_data),
    stock_alerts: getCachedArrayLength(rowsByType.get('stock_alerts')?.normalized_data),
    cached: true,
    cooldown_ms: SYNC_COOLDOWN_MS,
  };
}

function getCachedArrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

async function _syncShopDataInternal(shopId, dbClient) {
  // ── Shop bilgilerini al ──
  const shopResult = await dbClient.query(
    `SELECT shopify_domain, shopify_access_token, shopify_refresh_token,
            shopify_access_token_expires_at, shopify_refresh_token_expires_at,
            plan
     FROM shops
     WHERE id = $1`,
    [shopId]
  );

  if (shopResult.rows.length === 0) {
    throw new Error(`Shop bulunamadı: ${shopId}`);
  }

  const shop = shopResult.rows[0];
  const accessToken = await getValidAccessTokenForShopRow(
    {
      id: shopId,
      shopify_domain: shop.shopify_domain,
      shopify_access_token: shop.shopify_access_token,
      shopify_refresh_token: shop.shopify_refresh_token,
      shopify_access_token_expires_at: shop.shopify_access_token_expires_at,
      shopify_refresh_token_expires_at: shop.shopify_refresh_token_expires_at,
    },
    dbClient
  );

  console.log(`🔄 Sync başlıyor: ${shop.shopify_domain}`);

  // ── Siparişleri çek ──
  const orders30d = await fetchOrders(shop.shopify_domain, accessToken, 30);
  const orders7d = filterOrdersByRecentDays(orders30d, 7);

  // ── Normalize et ──
  const normalized7d = normalizeOrdersForAI(orders7d, 7);
  const normalized30d = normalizeOrdersForAI(orders30d, 30);

  // ── Envanteri çek (30 gün satış verisiyle birlikte) ──
  const inventory = await fetchInventory(shop.shopify_domain, accessToken, orders30d);

  // ── Stok uyarıları ──
  const stockAlerts = inventory
    .filter((p) => p.stock_risk)
    .sort((a, b) => b.demand_inventory_score - a.demand_inventory_score)
    .map((product) => ({
      title: product.title,
      current_stock: product.total_inventory,
      days_remaining: product.days_of_stock,
      daily_sales_rate: product.daily_sales_rate,
      units_sold_30d: product.units_sold_30d,
      estimated_revenue_30d: product.estimated_revenue_30d,
      reorder_point: product.reorder_point,
      urgency_score: product.demand_inventory_score,
    }));

  // ── Cache'e yaz ──
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

  const cacheEntries = [
    { type: 'orders_7d', raw: orders7d, normalized: normalized7d },
    { type: 'orders_30d', raw: orders30d, normalized: normalized30d },
    { type: 'products', raw: null, normalized: inventory },
    { type: 'stock_alerts', raw: null, normalized: stockAlerts },
  ];

  for (const entry of cacheEntries) {
    await dbClient.query(
      `INSERT INTO shop_data_cache (shop_id, data_type, raw_data, normalized_data, fetched_at, expires_at)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (shop_id, data_type)
       DO UPDATE SET
         raw_data = COALESCE($3, shop_data_cache.raw_data),
         normalized_data = $4,
         fetched_at = NOW(),
         expires_at = $5`,
      [
        shopId,
        entry.type,
        entry.raw ? JSON.stringify(entry.raw) : null,
        JSON.stringify(entry.normalized),
        expiresAt,
      ]
    );
  }

  const syncResult = {
    synced_at: new Date().toISOString(),
    orders_7d: orders7d.length,
    orders_30d: orders30d.length,
    products: inventory.length,
    stock_alerts: stockAlerts.length,
  };

  console.log(`✅ Sync tamamlandı: ${shop.shopify_domain} —`, syncResult);
  return syncResult;
}

module.exports = {
  shopifyGraphQL,
  registerWebhooks,
  fetchOrders,
  normalizeOrders: normalizeOrdersForAI,
  fetchInventory,
  syncShopData,
};
