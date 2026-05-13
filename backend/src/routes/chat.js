const express = require('express');
const db = require('../db/client');
const { decrypt } = require('../services/crypto');
const {
  buildSystemPrompt,
  getSystemPromptProfile,
  parseTasksFromResponse,
  parseAnomaliesFromResponse,
} = require('../services/skills');
const { callAI, streamAI } = require('../services/ai-router');
const { buildRoutingContext } = require('../services/context-router');
const { syncShopData } = require('../services/shopify');
const {
  buildContextProfile,
  buildPromptCacheKey,
  getOutputTokenLimit,
  selectShopContextForPrompt,
  stableCompactStringify,
} = require('../services/prompt-optimizer');
const { PROVIDERS, getEncryptedProviderKey } = require('../services/ai-credentials');
const {
  AI_MODEL_KEYS,
  getDefaultModelForProvider,
  getModelLabel,
  getProviderForModel,
} = require('../services/ai-models');
const {
  MAX_ATTACHMENTS_PER_MESSAGE,
  buildAttachmentContextPayload,
  buildImageContentParts,
  deleteConversationAttachmentsAfterIndex,
  getAttachmentRowsByIds,
  linkAttachmentsToMessage,
  serializeAttachmentRow,
} = require('../services/attachments');
const authMiddleware = require('../middleware/auth');
const shopifySessionMiddleware = require('../middleware/shopify-session');

const router = express.Router();

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateLimitMap = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap) {
    if (value.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

function checkRateLimit(shopDomain) {
  const now = Date.now();
  let entry = rateLimitMap.get(shopDomain);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(shopDomain, entry);
  }

  entry.count += 1;

  return {
    allowed: entry.count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - entry.count),
    resetAt: entry.resetAt,
  };
}

router.post('/', [shopifySessionMiddleware, authMiddleware], async (req, res) => {
  const { message, conversation_id, model, regenerate_from_message_index, response_language } = req.body;
  const shop = req.shop;
  const wantsStream = req.body?.stream === true || String(req.headers.accept || '').includes('text/event-stream');
  const regenerationRequested = regenerate_from_message_index !== undefined && regenerate_from_message_index !== null;
  const regenerationIndex = regenerationRequested ? Number.parseInt(regenerate_from_message_index, 10) : null;
  const requestedAttachmentIds = normalizeAttachmentIds(req.body?.attachment_ids);

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      error: 'missing_message',
      message: 'Mesaj alani zorunludur',
    });
  }

  if (message.length > 4000) {
    return res.status(400).json({
      error: 'message_too_long',
      message: 'Mesaj en fazla 4000 karakter olabilir',
    });
  }

  if (requestedAttachmentIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return res.status(400).json({
      error: 'too_many_attachments',
      message: `Bir mesajda en fazla ${MAX_ATTACHMENTS_PER_MESSAGE} ek kullanabilirsiniz.`,
    });
  }

  if (regenerationRequested && (!Number.isInteger(regenerationIndex) || regenerationIndex < 0 || !conversation_id)) {
    return res.status(400).json({
      error: 'invalid_regeneration_request',
      message: 'Mesaj yeniden uretimi icin gecerli konusma ve mesaj sirasi gerekir.',
    });
  }

  const selectedModel = resolveSelectedModel(model, shop);
  const selectedProvider = getProviderForModel(selectedModel);
  if (!selectedModel || !selectedProvider || !PROVIDERS.includes(selectedProvider) || !AI_MODEL_KEYS.includes(selectedModel)) {
    return res.status(400).json({
      error: 'invalid_model',
      message: 'Lutfen listelenen modellerden birini secin.',
    });
  }

  const rateCheck = checkRateLimit(shop.shopify_domain);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: 'rate_limit',
      message: 'Cok fazla istek gonderdiniz. Lutfen biraz bekleyin.',
      retry_after_ms: rateCheck.resetAt - Date.now(),
    });
  }

  try {
    const encryptedKey = await getEncryptedProviderKey(shop.id, selectedProvider, db);
    if (!encryptedKey) {
      return res.status(400).json({
        error: 'missing_provider_key',
        message: `${getModelLabel(selectedModel)} modeli icin API anahtari eklenmemis.`,
      });
    }

    let apiKey;
    try {
      apiKey = decrypt(encryptedKey);
    } catch (decryptErr) {
      console.error('AI key decrypt error:', decryptErr.message);
      return res.status(500).json({
        error: 'decrypt_failed',
        message: `${getModelLabel(selectedModel)} modeli icin API anahtari cozumlenemedi. Lutfen anahtari tekrar kaydedin.`,
      });
    }

    let conversationId = conversation_id;
    let previousMessages = [];
    let regeneratedFromIndex = null;
    let existingMessageCount = 0;
    let storedMessages = [];

    if (conversationId) {
      const convResult = await db.query(
        `SELECT id, messages, skills_used, token_count
         FROM conversations
         WHERE id = $1 AND shop_id = $2`,
        [conversationId, shop.id]
      );

      if (convResult.rows.length > 0) {
        storedMessages = Array.isArray(convResult.rows[0].messages) ? convResult.rows[0].messages : [];
        existingMessageCount = storedMessages.length;

        if (regenerationRequested) {
          const targetMessage = storedMessages[regenerationIndex];

          if (!targetMessage || targetMessage.role !== 'user') {
            return res.status(400).json({
              error: 'message_not_regeneratable',
              message: 'Sadece kullanici mesajlari duzenlenip yeniden uretilebilir.',
            });
          }

          const trimmedMessages = storedMessages.slice(0, regenerationIndex + 1);
          trimmedMessages[regenerationIndex] = {
            ...targetMessage,
            content: message.trim(),
            edited_at: new Date().toISOString(),
          };

          await db.query(
            `UPDATE conversations
             SET messages = $1::jsonb,
                 updated_at = NOW()
             WHERE id = $2 AND shop_id = $3`,
            [JSON.stringify(trimmedMessages), conversationId, shop.id]
          );

          await deleteConversationAttachmentsAfterIndex({
            shopId: shop.id,
            conversationId,
            messageIndex: regenerationIndex,
            db,
          });

          previousMessages = trimmedMessages.slice(-10);
          regeneratedFromIndex = regenerationIndex;
          storedMessages = trimmedMessages;
          existingMessageCount = trimmedMessages.length;
        } else {
          previousMessages = storedMessages.slice(-10);
        }
      } else {
        conversationId = null;
      }
    }

    if (regenerationRequested && !conversationId) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Konusma bulunamadi',
      });
    }

    const effectiveAttachmentIds = regenerationRequested
      ? normalizeAttachmentIds(previousMessages[previousMessages.length - 1]?.attachments?.map((item) => item?.id))
      : requestedAttachmentIds;
    const attachmentRows = await getAttachmentRowsByIds({
      shopId: shop.id,
      attachmentIds: effectiveAttachmentIds,
      db,
    });

    if (attachmentRows.length !== effectiveAttachmentIds.length) {
      return res.status(400).json({
        error: 'attachment_not_found',
        message: 'Eklerden biri bulunamadi veya bu magaza icin erisilebilir degil.',
      });
    }

    const invalidLinkedAttachment = attachmentRows.find(
      (row) => row.conversation_id && row.conversation_id !== conversationId
    );
    if (invalidLinkedAttachment) {
      return res.status(400).json({
        error: 'attachment_already_linked',
        message: 'Eklerden biri baska bir konusmaya bagli.',
      });
    }

    const routingContext = buildRoutingContext(message.trim(), previousMessages);
    const systemPrompt = await buildSystemPrompt(shop.id, db, {
      provider: selectedProvider,
      model: selectedModel,
      responseLanguage: normalizeResponseLanguage(response_language),
      routingContext,
      userMessage: message.trim(),
      attachmentKinds: attachmentRows.map((row) => row.attachment_kind),
    });
    const rawShopContext = await getShopContextForRouting(shop.id, routingContext);
    const shopContext = selectShopContextForPrompt(rawShopContext, routingContext, message.trim());
    const outputTokenLimit = getOutputTokenLimit({
      routingContext,
      userMessage: message.trim(),
      attachmentRows,
    });
    const promptProfile = getSystemPromptProfile(systemPrompt);
    const contextProfile = buildContextProfile({
      routingContext,
      shopContext,
      attachmentRows,
      outputTokenLimit,
    });
    const promptCacheKey = buildPromptCacheKey({
      shopId: shop.id,
      provider: selectedProvider,
      model: selectedModel,
      promptProfile,
    });
    const promptCacheRetention = getPromptCacheRetention(selectedProvider, selectedModel);
    const enrichedMessage = buildEnrichedMessage({
      shopContext,
      routingContext,
      userMessage: message.trim(),
      attachmentContext: buildAttachmentContextPayload(attachmentRows, { userMessage: message.trim() }),
    });
    const currentUserContent = await buildAiUserContent(enrichedMessage, attachmentRows);
    const hydratedPreviousMessages = await hydrateMessagesForAI(previousMessages, shop.id);
    const aiMessages = regeneratedFromIndex !== null
      ? hydratedPreviousMessages.map((previousMessage, index) =>
          index === hydratedPreviousMessages.length - 1 && previousMessage.role === 'user'
            ? { ...previousMessage, content: currentUserContent }
            : previousMessage
        )
      : [...hydratedPreviousMessages, { role: 'user', content: currentUserContent }];
    const currentUserMessageEntry = buildStoredUserMessageEntry(message.trim(), attachmentRows);

    if (wantsStream) {
      await handleStreamingChat({
        req,
        res,
        shop,
        conversationId,
        message: message.trim(),
        userMessageEntry: currentUserMessageEntry,
        attachmentIds: effectiveAttachmentIds,
        existingMessageCount,
        selectedProvider,
        selectedModel,
        apiKey,
        systemPrompt,
        aiMessages,
        promptProfile,
        contextProfile,
        maxOutputTokens: outputTokenLimit,
        promptCacheKey,
        promptCacheRetention,
        persistUserMessage: regeneratedFromIndex === null,
      });
      return;
    }

    const aiResult = await callAI({
      provider: selectedProvider,
      model: selectedModel,
      apiKey,
      systemPrompt,
      messages: aiMessages,
      shopId: shop.id,
      db,
      skillsUsed: [],
      promptProfile,
      contextProfile,
      maxOutputTokens: outputTokenLimit,
      promptCacheKey,
      promptCacheRetention,
    });

    await db.query(
      `UPDATE shops
       SET ai_provider = $1,
           ai_model = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [selectedProvider, selectedModel, shop.id]
    );

    const rawAiContent = aiResult.content || '';
    const visibleAiContent = cleanAssistantContent(rawAiContent);
    const skillsUsed = extractSkillTags(rawAiContent);
    const tasksParsed = parseTasksFromResponse(rawAiContent);
    const anomalies = parseAnomaliesFromResponse(rawAiContent);

    if (skillsUsed.length > 0) {
      updateLatestTokenUsageSkills(shop.id, skillsUsed);
    }

    let tasksCreated = 0;
    if (tasksParsed && tasksParsed.tasks.length > 0) {
      tasksCreated = await insertTasks(shop.id, tasksParsed.tasks);
    }

    const newMessages = [
      ...(regeneratedFromIndex === null
        ? [currentUserMessageEntry]
        : []),
      {
        role: 'assistant',
        content: visibleAiContent,
        timestamp: new Date().toISOString(),
        provider: selectedProvider,
        model: selectedModel,
        ai_error: !!aiResult.error,
      },
    ];

    const totalTokens = aiResult.input_tokens + aiResult.output_tokens;

    if (conversationId) {
      await db.query(
        `UPDATE conversations
         SET messages = messages || $1::jsonb,
             skills_used = array_cat(skills_used, $2::text[]),
             token_count = token_count + $3,
             updated_at = NOW()
         WHERE id = $4 AND shop_id = $5`,
        [
          JSON.stringify(newMessages),
          skillsUsed,
          totalTokens,
          conversationId,
          shop.id,
        ]
      );

      if (regeneratedFromIndex === null && effectiveAttachmentIds.length > 0) {
        await linkAttachmentsToMessage({
          shopId: shop.id,
          conversationId,
          messageIndex: existingMessageCount,
          attachmentIds: effectiveAttachmentIds,
          db,
        });
      }
    } else {
      const insertResult = await db.query(
        `INSERT INTO conversations (shop_id, messages, skills_used, token_count)
         VALUES ($1, $2::jsonb, $3::text[], $4)
         RETURNING id`,
        [
          shop.id,
          JSON.stringify(newMessages),
          skillsUsed,
          totalTokens,
        ]
      );
      conversationId = insertResult.rows[0].id;

      if (regeneratedFromIndex === null && effectiveAttachmentIds.length > 0) {
        await linkAttachmentsToMessage({
          shopId: shop.id,
          conversationId,
          messageIndex: 0,
          attachmentIds: effectiveAttachmentIds,
          db,
        });
      }
    }

    res.json({
      message: visibleAiContent,
      provider: selectedProvider,
      model: selectedModel,
      conversation_id: conversationId,
      skills_used: skillsUsed,
      token_count: totalTokens,
      tasks_created: tasksCreated,
      anomalies_detected: anomalies.length,
      anomalies: [],
      ...(aiResult.error && { ai_error: true }),
    });
  } catch (err) {
    console.error('Chat endpoint error:', err.message);
    console.error(err.stack);

    res.status(500).json({
      error: 'chat_failed',
      message: 'Sohbet islenirken bir hata olustu. Lutfen tekrar deneyin.',
    });
  }
});

function normalizeResponseLanguage(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) {
    return null;
  }

  return trimmed;
}

function getPromptCacheRetention(provider, model) {
  if (provider !== 'chatgpt') {
    return null;
  }

  return String(model || '').startsWith('gpt-5.5') ? '24h' : null;
}

function updateLatestTokenUsageSkills(shopId, skillsUsed) {
  db.query(
    `UPDATE token_usage
     SET skills_used = $1
     WHERE shop_id = $2
       AND created_at = (SELECT MAX(created_at) FROM token_usage WHERE shop_id = $2)`,
    [skillsUsed, shopId]
  ).catch((err) => console.error('Skill update error:', err.message));
}

async function handleStreamingChat({
  req,
  res,
  shop,
  conversationId,
  message,
  userMessageEntry,
  attachmentIds = [],
  existingMessageCount = 0,
  selectedProvider,
  selectedModel,
  apiKey,
  systemPrompt,
  aiMessages,
  promptProfile,
  contextProfile,
  maxOutputTokens,
  promptCacheKey,
  promptCacheRetention,
  persistUserMessage = true,
}) {
  const persistedUserEntry = userMessageEntry || buildStoredUserMessageEntry(message, []);
  const nextUserMessageIndex = conversationId ? existingMessageCount : 0;

  if (conversationId && persistUserMessage) {
    await db.query(
      `UPDATE conversations
       SET messages = messages || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND shop_id = $3`,
      [JSON.stringify([persistedUserEntry]), conversationId, shop.id]
    );

    if (attachmentIds.length > 0) {
      await linkAttachmentsToMessage({
        shopId: shop.id,
        conversationId,
        messageIndex: nextUserMessageIndex,
        attachmentIds,
        db,
      });
    }
  } else if (!conversationId) {
    const insertResult = await db.query(
      `INSERT INTO conversations (shop_id, messages, skills_used, token_count)
       VALUES ($1, $2::jsonb, $3::text[], $4)
       RETURNING id`,
      [shop.id, JSON.stringify([persistedUserEntry]), [], 0]
    );
    conversationId = insertResult.rows[0].id;

    if (attachmentIds.length > 0) {
      await linkAttachmentsToMessage({
        shopId: shop.id,
        conversationId,
        messageIndex: 0,
        attachmentIds,
        db,
      });
    }
  }

  await db.query(
    `UPDATE shops
     SET ai_provider = $1,
         ai_model = $2,
         updated_at = NOW()
     WHERE id = $3`,
    [selectedProvider, selectedModel, shop.id]
  );

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const abortController = new AbortController();
  let clientDisconnected = false;
  let rawAiContent = '';
  let visibleAiContent = '';
  let finalResult = null;

  const handleDisconnect = () => {
    clientDisconnected = true;
    abortController.abort();
  };

  req.on('close', handleDisconnect);
  res.on('close', handleDisconnect);

  try {
    sendSseEvent(res, 'conversation', {
      conversation_id: conversationId,
      provider: selectedProvider,
      model: selectedModel,
    });

    finalResult = await streamAI({
      provider: selectedProvider,
      model: selectedModel,
      apiKey,
      systemPrompt,
      messages: aiMessages,
      shopId: shop.id,
      db,
      skillsUsed: [],
      promptProfile,
      contextProfile,
      maxOutputTokens,
      promptCacheKey,
      promptCacheRetention,
      signal: abortController.signal,
      onChunk: (delta) => {
        rawAiContent += delta;
        visibleAiContent = syncVisibleContent(rawAiContent, visibleAiContent, res);
      },
    });

    if (!rawAiContent && finalResult.content) {
      rawAiContent = finalResult.content;
      visibleAiContent = syncVisibleContent(rawAiContent, visibleAiContent, res);
    }
  } catch (err) {
    if (!isAbortError(err)) {
      console.error('Streaming chat error:', err.message);
      rawAiContent = `Model istegi tamamlanamadi. ${err.message || 'Lutfen tekrar deneyin.'}`.trim();
      visibleAiContent = syncVisibleContent(rawAiContent, visibleAiContent, res);
      finalResult = {
        content: rawAiContent,
        input_tokens: 0,
        output_tokens: 0,
        provider: selectedProvider,
        model: selectedModel,
        error: true,
      };
    }
  } finally {
    req.off('close', handleDisconnect);
    res.off('close', handleDisconnect);
  }

  const wasAborted = abortController.signal.aborted;
  const rawContentToPersist = finalResult?.content || rawAiContent;
  const visibleContentToPersist = cleanAssistantContent(rawContentToPersist);
  const skillsUsed = extractSkillTags(rawContentToPersist);
  const tasksParsed = !wasAborted ? parseTasksFromResponse(rawContentToPersist) : null;
  const anomalies = !wasAborted ? parseAnomaliesFromResponse(rawContentToPersist) : [];
  const tasksCreated = tasksParsed && tasksParsed.tasks.length > 0 ? await insertTasks(shop.id, tasksParsed.tasks) : 0;
  const totalTokens = (finalResult?.input_tokens || 0) + (finalResult?.output_tokens || 0);

  if (skillsUsed.length > 0) {
    updateLatestTokenUsageSkills(shop.id, skillsUsed);
  }

  if (visibleContentToPersist || finalResult?.error) {
    await db.query(
      `UPDATE conversations
       SET messages = messages || $1::jsonb,
           skills_used = array_cat(skills_used, $2::text[]),
           token_count = token_count + $3,
           updated_at = NOW()
       WHERE id = $4 AND shop_id = $5`,
      [
        JSON.stringify([
          {
            role: 'assistant',
            content: visibleContentToPersist,
            timestamp: new Date().toISOString(),
            provider: selectedProvider,
            model: selectedModel,
            ai_error: !!finalResult?.error,
          },
        ]),
        skillsUsed,
        totalTokens,
        conversationId,
        shop.id,
      ]
    );
  }

  if (!clientDisconnected && !res.writableEnded) {
    sendSseEvent(res, 'done', {
      conversation_id: conversationId,
      provider: selectedProvider,
      model: selectedModel,
      skills_used: skillsUsed,
      token_count: totalTokens,
      tasks_created: tasksCreated,
      anomalies_detected: anomalies.length,
      anomalies: [],
      ai_error: !!finalResult?.error,
      stopped: wasAborted,
    });
    res.end();
  }
}

function resolveSelectedModel(model, shop) {
  if (model) {
    return model;
  }

  if (shop.ai_model) {
    return shop.ai_model;
  }

  if (shop.ai_provider) {
    return getDefaultModelForProvider(shop.ai_provider);
  }

  return null;
}

function anonymizeOrders(ordersData) {
  if (!Array.isArray(ordersData)) {
    return ordersData;
  }

  return ordersData.map((order) => {
    const safeOrder = { ...order };
    delete safeOrder.customerId;
    delete safeOrder.customer;
    delete safeOrder.billing_address;
    delete safeOrder.shipping_address;
    delete safeOrder.client_details;
    return safeOrder;
  });
}

async function buildShopContext(shopId) {
  const context = {
    shop_summary: null,
    sales_7d: null,
    sales_30d: null,
    top_products: null,
    stock_alerts: null,
    product_insights: null,
    active_anomalies: null,
  };

  try {
    const cacheResult = await db.query(
      `SELECT data_type, normalized_data
       FROM shop_data_cache
       WHERE shop_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [shopId]
    );

    for (const row of cacheResult.rows) {
      const data = row.normalized_data;
      if (!data) {
        continue;
      }

      switch (row.data_type) {
        case 'shop_summary':
          context.shop_summary = data;
          break;
        case 'orders_7d':
          context.sales_7d = anonymizeOrders(data);
          break;
        case 'orders_30d':
          context.sales_30d = anonymizeOrders(data);
          break;
        case 'products': {
          const products = Array.isArray(data) ? data : data.products || [];
          context.top_products = products.slice(0, 5);
          context.stock_alerts = products
            .filter((product) => product.days_of_stock != null && product.days_of_stock < 14)
            .map((product) => ({
              title: product.title,
              variant: product.variant_title || 'default',
              current_stock: product.inventory_quantity ?? product.total_inventory,
              days_remaining: product.days_of_stock,
              daily_sales_rate: product.daily_sales_rate,
              units_sold_30d: product.units_sold_30d,
              urgency_score: product.demand_inventory_score,
            }));
          context.product_insights = buildProductInsights(products);
          break;
        }
        case 'stock_alerts':
          if (!context.stock_alerts) {
            context.stock_alerts = Array.isArray(data) ? data : [];
          }
          break;
        case 'anomalies':
          context.active_anomalies = data;
          break;
      }
    }
  } catch (err) {
    console.error('Shop context could not be built:', err.message);
  }

  return context;
}

async function getShopContextForRouting(shopId, routingContext) {
  if (!routingContext?.includeShopData) {
    return null;
  }

  let context = await buildShopContext(shopId);
  if (hasUsableShopContext(context) && hasProductContext(context)) {
    return context;
  }

  try {
    await syncShopData(shopId, db);
    context = await buildShopContext(shopId);
  } catch (err) {
    console.warn('Shop context auto-sync skipped:', err.message);
  }

  return context;
}

function hasProductContext(context) {
  return context?.top_products !== null || context?.product_insights !== null;
}

function hasUsableShopContext(context) {
  if (!context) {
    return false;
  }

  return Object.values(context).some((value) => {
    if (value == null) {
      return false;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === 'object') {
      return Object.keys(value).length > 0;
    }

    return true;
  });
}

function buildProductInsights(products) {
  const sortedByRevenue = [...products]
    .sort((a, b) => (b.estimated_revenue_30d || 0) - (a.estimated_revenue_30d || 0));
  const highDemandLowStock = products
    .filter((product) => product.stock_risk && (product.units_sold_30d || 0) > 0)
    .sort((a, b) => (b.demand_inventory_score || 0) - (a.demand_inventory_score || 0))
    .slice(0, 5);
  const slowMoving = products
    .filter((product) => product.slow_moving || product.dead_stock_risk)
    .sort((a, b) => (b.total_inventory || 0) - (a.total_inventory || 0))
    .slice(0, 5);
  const variantRisks = products
    .flatMap((product) => (product.variants || [])
      .filter((variant) => variant.stock_risk)
      .map((variant) => ({
        product_title: product.title,
        variant_title: variant.title,
        current_stock: variant.inventory_quantity,
        days_remaining: variant.days_of_stock,
        units_sold_30d: variant.units_sold_30d,
      })))
    .slice(0, 8);

  return {
    high_demand_low_stock: highDemandLowStock.map((product) => ({
      title: product.title,
      current_stock: product.total_inventory ?? product.inventory_quantity,
      days_remaining: product.days_of_stock,
      units_sold_30d: product.units_sold_30d,
      estimated_revenue_30d: product.estimated_revenue_30d,
      reorder_point: product.reorder_point,
      urgency_score: product.demand_inventory_score,
    })),
    slow_moving_products: slowMoving.map((product) => ({
      title: product.title,
      current_stock: product.total_inventory ?? product.inventory_quantity,
      units_sold_30d: product.units_sold_30d || 0,
      estimated_revenue_30d: product.estimated_revenue_30d || 0,
      dead_stock_risk: !!product.dead_stock_risk,
    })),
    variant_stock_risks: variantRisks,
    revenue_leaders: sortedByRevenue.slice(0, 5).map((product) => ({
      title: product.title,
      estimated_revenue_30d: product.estimated_revenue_30d || 0,
      units_sold_30d: product.units_sold_30d || 0,
      sell_through_rate: product.sell_through_rate,
    })),
  };
}

function buildEnrichedMessage({
  shopContext,
  routingContext,
  userMessage,
  attachmentContext = [],
  includeShopPolicy = true,
}) {
  const parts = [];
  const hasContext = shopContext && Object.values(shopContext).some((value) => value !== null);

  if (routingContext) {
    parts.push('<routing_context>');
    parts.push(stableCompactStringify(routingContext));
    parts.push('</routing_context>');
  }

  if (Array.isArray(attachmentContext) && attachmentContext.length > 0) {
    parts.push('<uploaded_file_context>');
    parts.push(stableCompactStringify(attachmentContext));
    parts.push('</uploaded_file_context>');
  }

  if (hasContext) {
    parts.push('<shop_data_json>');
    parts.push(stableCompactStringify(shopContext));
    parts.push('</shop_data_json>');
  } else if (includeShopPolicy) {
    parts.push('<shop_data_policy>');
    parts.push('Shop data is intentionally not included for this message. Do not cite or infer store metrics unless the user explicitly asks about their own store.');
    parts.push('</shop_data_policy>');
  }

  parts.push('<user_question>');
  parts.push(userMessage);
  parts.push('</user_question>');

  return parts.join('\n');
}

function normalizeAttachmentIds(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return [...new Set(
    input
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
  )];
}

function buildStoredUserMessageEntry(userMessage, attachmentRows) {
  return {
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachmentRows.map((row) => serializeAttachmentRow(row)),
  };
}

async function buildAiUserContent(textContent, attachmentRows) {
  const imageParts = await buildImageContentParts(attachmentRows);
  if (imageParts.length === 0) {
    return textContent;
  }

  return [
    { type: 'text', text: textContent },
    ...imageParts,
  ];
}

async function hydrateMessagesForAI(messages, shopId) {
  const hydrated = [];

  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      continue;
    }

    if (message.role !== 'user') {
      hydrated.push({
        role: message.role,
        content: message.content || '',
      });
      continue;
    }

    const attachmentIds = normalizeAttachmentIds((message.attachments || []).map((item) => item?.id));
    if (attachmentIds.length === 0) {
      hydrated.push({
        role: message.role,
        content: message.content || '',
      });
      continue;
    }

    const attachmentRows = await getAttachmentRowsByIds({
      shopId,
      attachmentIds,
      db,
    });
    const enriched = buildEnrichedMessage({
      userMessage: message.content || '',
      attachmentContext: buildAttachmentContextPayload(attachmentRows),
      includeShopPolicy: false,
    });

    hydrated.push({
      role: message.role,
      content: await buildAiUserContent(enriched, attachmentRows),
    });
  }

  return hydrated;
}

function syncVisibleContent(rawAiContent, currentVisibleContent, res) {
  const nextVisibleContent = cleanAssistantContent(rawAiContent);
  const visibleDelta = nextVisibleContent.startsWith(currentVisibleContent)
    ? nextVisibleContent.slice(currentVisibleContent.length)
    : nextVisibleContent;

  if (visibleDelta) {
    sendSseEvent(res, 'chunk', { delta: visibleDelta });
  }

  return nextVisibleContent;
}

function sendSseEvent(res, event, payload) {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function extractSkillTags(aiResponse) {
  if (!aiResponse) {
    return [];
  }

  const tags = [];
  const regex = /\[SKILL:\s*([^\]]+)\]/gi;
  let match;

  while ((match = regex.exec(aiResponse)) !== null) {
    const raw = match[1].trim();
    if (raw.includes('→') || raw.includes('->')) {
      tags.push(...raw.split(/\s*(?:→|->)\s*/).map((tag) => tag.trim()));
    } else {
      tags.push(raw);
    }
  }

  return [...new Set(tags)];
}

function cleanAssistantContent(aiResponse) {
  if (!aiResponse || typeof aiResponse !== 'string') {
    return '';
  }

  return stripAnomalyMarkers(stripTaskJsonBlock(stripSkillTags(aiResponse)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripSkillTags(aiResponse) {
  return aiResponse
    .replace(/^\s*(?:\[SKILL:\s*[^\]]+\]\s*)+/i, '')
    .replace(/^\s*\[SKILL:\s*[^\n\]]*(?:\])?\s*/i, '')
    .replace(/^\s*\[SKILL\s*/i, '')
    .replace(/^\s*\[SKILL:\s*[^\n]*$/gim, '')
    .replace(/\n?\s*\[SKILL:\s*[^\]]+\]\s*/gi, '\n')
    .replace(/\n?\s*\[SKILL:\s*[^\n]*$/gi, '\n')
    .replace(/\n?\s*\[SKILL\s*/gi, '\n');
}

function stripTaskJsonBlock(aiResponse) {
  return aiResponse.replace(
    /```(?:json)?\s*\n?\{\s*"tasks"\s*:\s*\[[\s\S]*?\]\s*\}\s*\n?```/gi,
    ''
  );
}

function stripAnomalyMarkers(aiResponse) {
  return aiResponse
    .replace(/\[(KR[Iİ]T[Iİ]K|CRITICAL|UYARI|WARNING)\]/gi, '')
    .replace(/(?:\uD83D\uDD34|\uD83D\uDFE1)\s*/g, '');
}

function isAbortError(err) {
  return err?.name === 'AbortError' || err?.code === 'ABORT_ERR';
}

async function insertTasks(shopId, tasks) {
  let inserted = 0;

  for (const task of tasks) {
    try {
      await db.query(
        `INSERT INTO tasks (shop_id, title, description, priority_score, confidence_score, status, source_skill)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
        [
          shopId,
          task.title,
          task.description || '',
          task.priority_score || 0,
          task.confidence_score || 0,
          resolveTaskSourceSkill(task),
        ]
      );
      inserted += 1;
    } catch (err) {
      console.error('Task insert error:', err.message);
    }
  }

  return inserted;
}

function resolveTaskSourceSkill(task) {
  const candidate = task?.source_skill || task?.skill || task?.source;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : 'gorev';
}

module.exports = router;
