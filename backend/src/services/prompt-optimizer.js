const { normalizeText } = require('./context-router');

const PROMPT_PROFILE_VERSION = 'sirius_prompt_v1';
const DEFAULT_OUTPUT_TOKEN_LIMIT = 1024;
const SIMPLE_OUTPUT_TOKEN_LIMIT = 768;
const ANALYSIS_OUTPUT_TOKEN_LIMIT = 1536;
const MAX_OUTPUT_TOKEN_LIMIT = 2048;

function stableCompactStringify(value) {
  const pruned = prunePromptValue(value);
  return JSON.stringify(pruned === undefined ? null : pruned);
}

function prunePromptValue(value) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => prunePromptValue(item))
      .filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => [key, prunePromptValue(value[key])])
      .filter(([, item]) => item !== undefined && item !== '');

    if (entries.length === 0) {
      return undefined;
    }

    return Object.fromEntries(entries);
  }

  return value;
}

function selectShopContextForPrompt(shopContext, routingContext, userMessage) {
  if (!routingContext?.includeShopData || !shopContext) {
    return null;
  }

  const focus = detectContextFocus(userMessage, routingContext);
  const context = {};

  if (shopContext.shop_summary) {
    context.shop_summary = shopContext.shop_summary;
  }

  if (focus === 'sales') {
    context.sales_7d = compactSalesMetrics(shopContext.sales_7d);
    context.sales_30d = compactSalesMetrics(shopContext.sales_30d);
    context.top_products = limitArray(shopContext.top_products, 5);
    context.stock_alerts = limitArray(shopContext.stock_alerts, 3);
    context.active_anomalies = limitArray(shopContext.active_anomalies, 5);
    return prunePromptValue(context) || null;
  }

  if (focus === 'stock') {
    context.stock_alerts = limitArray(shopContext.stock_alerts, 8);
    context.top_products = limitArray(shopContext.top_products, 5);
    context.product_insights = compactProductInsights(shopContext.product_insights);
    context.sales_30d = compactSalesForInventory(shopContext.sales_30d);
    context.active_anomalies = limitArray(shopContext.active_anomalies, 5);
    return prunePromptValue(context) || null;
  }

  if (focus === 'anomaly') {
    context.active_anomalies = limitArray(shopContext.active_anomalies, 8);
    context.sales_7d = compactSalesMetrics(shopContext.sales_7d);
    context.sales_30d = compactSalesMetrics(shopContext.sales_30d);
    context.stock_alerts = limitArray(shopContext.stock_alerts, 5);
    context.product_insights = compactProductInsights(shopContext.product_insights);
    return prunePromptValue(context) || null;
  }

  if (focus === 'product') {
    context.top_products = limitArray(shopContext.top_products, 8);
    context.product_insights = compactProductInsights(shopContext.product_insights);
    context.stock_alerts = limitArray(shopContext.stock_alerts, 5);
    context.sales_30d = compactSalesForInventory(shopContext.sales_30d);
    context.active_anomalies = limitArray(shopContext.active_anomalies, 5);
    return prunePromptValue(context) || null;
  }

  return prunePromptValue({
    shop_summary: shopContext.shop_summary,
    sales_7d: compactSalesMetrics(shopContext.sales_7d),
    sales_30d: compactSalesMetrics(shopContext.sales_30d),
    top_products: limitArray(shopContext.top_products, 5),
    stock_alerts: limitArray(shopContext.stock_alerts, 5),
    product_insights: compactProductInsights(shopContext.product_insights),
    active_anomalies: limitArray(shopContext.active_anomalies, 5),
  }) || null;
}

function detectContextFocus(userMessage, routingContext = {}) {
  const normalized = normalizeText(userMessage);

  if (routingContext.intent === 'followup' && routingContext.focus?.intent === 'store_specific') {
    return 'general_store';
  }

  if (/\b(stok|envanter|inventory|stock|tedarik|reorder|yeniden siparis|bitiyor|dusuk stok)\b/.test(normalized)) {
    return 'stock';
  }

  if (/\b(anomali|risk|problem|neden dustu|neden yukseldi|kotu gidiyor|ne oldu|acil|uyari|sapma)\b/.test(normalized)) {
    return 'anomaly';
  }

  if (/\b(urun|urunler|sku|varyant|koleksiyon|en cok satan|merchandising|kategori)\b/.test(normalized)) {
    return 'product';
  }

  if (/\b(satis|ciro|siparis|rapor|performans|aov|sepet|gelir|hafta|ay|trend)\b/.test(normalized)) {
    return 'sales';
  }

  return 'general_store';
}

function compactSalesMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return metrics || null;
  }

  return prunePromptValue({
    total_revenue: metrics.total_revenue,
    net_revenue: metrics.net_revenue,
    order_count: metrics.order_count,
    total_units: metrics.total_units,
    avg_order_value: metrics.avg_order_value,
    daily_average: metrics.daily_average,
    top_products: limitArray(metrics.top_products, 5),
    variant_performance: limitArray(metrics.variant_performance, 5),
    channel_breakdown: limitArray(metrics.channel_breakdown, 5),
    orders_by_day: limitArray(metrics.orders_by_day, 31),
    weekday_performance: limitArray(metrics.weekday_performance, 7),
    revenue_concentration: metrics.revenue_concentration,
    basket_metrics: metrics.basket_metrics,
    discount_metrics: metrics.discount_metrics,
    refund_metrics: metrics.refund_metrics,
    cancellation_metrics: metrics.cancellation_metrics,
    fulfillment_breakdown: metrics.fulfillment_breakdown,
    period_comparison: metrics.period_comparison,
    recent_7d_vs_previous_7d: metrics.recent_7d_vs_previous_7d,
    conversion_trend: metrics.conversion_trend,
    fulfillment_rate: metrics.fulfillment_rate,
  });
}

function compactSalesForInventory(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return metrics || null;
  }

  return prunePromptValue({
    total_revenue: metrics.total_revenue,
    order_count: metrics.order_count,
    total_units: metrics.total_units,
    top_products: limitArray(metrics.top_products, 5),
    variant_performance: limitArray(metrics.variant_performance, 5),
    revenue_concentration: metrics.revenue_concentration,
    period_comparison: metrics.period_comparison,
  });
}

function compactProductInsights(insights) {
  if (!insights || typeof insights !== 'object') {
    return insights || null;
  }

  return prunePromptValue({
    high_demand_low_stock: limitArray(insights.high_demand_low_stock, 5),
    slow_moving_products: limitArray(insights.slow_moving_products, 5),
    variant_stock_risks: limitArray(insights.variant_stock_risks, 8),
    revenue_leaders: limitArray(insights.revenue_leaders, 5),
  });
}

function limitArray(value, limit) {
  return Array.isArray(value) ? value.slice(0, limit) : value;
}

function getOutputTokenLimit({ routingContext, userMessage, attachmentRows = [] } = {}) {
  const normalized = normalizeText(userMessage);
  const hasAttachments = attachmentRows.length > 0;
  const wantsLongAnswer = /\b(analiz|rapor|detay|detayli|plan|adim adim|task|gorev|tamami|tamamini|dosyanin tamami|pdf|csv)\b/.test(normalized);

  if (hasAttachments || wantsLongAnswer || routingContext?.includeShopData) {
    return wantsLongAnswer ? MAX_OUTPUT_TOKEN_LIMIT : ANALYSIS_OUTPUT_TOKEN_LIMIT;
  }

  if (routingContext?.intent === 'off_topic' || routingContext?.intent === 'commerce_general') {
    return SIMPLE_OUTPUT_TOKEN_LIMIT;
  }

  return DEFAULT_OUTPUT_TOKEN_LIMIT;
}

function buildContextProfile({ routingContext, shopContext, attachmentRows = [], outputTokenLimit }) {
  return prunePromptValue({
    prompt_profile_version: PROMPT_PROFILE_VERSION,
    routing_intent: routingContext?.intent,
    include_shop_data: !!routingContext?.includeShopData,
    shop_context_keys: shopContext && typeof shopContext === 'object' ? Object.keys(shopContext).sort() : [],
    attachment_count: attachmentRows.length,
    attachment_kinds: [...new Set(attachmentRows.map((row) => row.attachment_kind).filter(Boolean))],
    output_token_limit: outputTokenLimit,
  }) || {};
}

function buildPromptCacheKey({ shopId, provider, model, promptProfile }) {
  return [
    PROMPT_PROFILE_VERSION,
    provider || 'provider',
    model || 'model',
    shopId || 'shop',
    (promptProfile?.selected_skills || []).join('-') || 'base',
  ].join(':').slice(0, 180);
}

module.exports = {
  ANALYSIS_OUTPUT_TOKEN_LIMIT,
  DEFAULT_OUTPUT_TOKEN_LIMIT,
  MAX_OUTPUT_TOKEN_LIMIT,
  PROMPT_PROFILE_VERSION,
  SIMPLE_OUTPUT_TOKEN_LIMIT,
  buildContextProfile,
  buildPromptCacheKey,
  detectContextFocus,
  getOutputTokenLimit,
  prunePromptValue,
  selectShopContextForPrompt,
  stableCompactStringify,
};
