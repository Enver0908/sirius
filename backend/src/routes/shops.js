const express = require('express');
const db = require('../db/client');
const authMiddleware = require('../middleware/auth');
const shopifySessionMiddleware = require('../middleware/shopify-session');
const { getAvailableSkills } = require('../services/skills');
const { syncShopData } = require('../services/shopify');
const { validateModelAccess } = require('../services/ai-router');
const {
  PROVIDERS,
  getProviderStatusMap,
  hasAnyProviderKey,
  upsertProviderCredential,
} = require('../services/ai-credentials');
const {
  exchangeSessionTokenForOfflineToken,
  persistRefreshedTokens,
} = require('../services/shopify-tokens');
const {
  AI_MODEL_KEYS,
  getDefaultModelForProvider,
  getProviderForModel,
} = require('../services/ai-models');
const {
  MAX_ATTACHMENTS_PER_MESSAGE,
  createAttachmentRecord,
  deleteFilesForRows,
  deletePendingAttachment,
  getAttachmentAcceptString,
  getConversationAttachments,
  uploadParser,
} = require('../services/attachments');

const router = express.Router();

router.use(shopifySessionMiddleware);
router.use(authMiddleware);

function runUploadParser(req, res) {
  return new Promise((resolve, reject) => {
    uploadParser.array('files', MAX_ATTACHMENTS_PER_MESSAGE)(req, res, (err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

router.get('/me', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, shopify_domain, plan, ai_provider, ai_model, billing_status,
              trial_ends_at, shopify_refresh_token, created_at, updated_at
       FROM shops
       WHERE id = $1`,
      [req.shop.id]
    );

    const shop = result.rows[0];
    const providerStatuses = await getProviderStatusMap(shop.id, db);

    let trialDaysLeft = null;
    if (shop.billing_status === 'trial' && shop.trial_ends_at) {
      const diff = new Date(shop.trial_ends_at) - new Date();
      trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    res.json({
      id: shop.id,
      shopify_domain: shop.shopify_domain,
      plan: shop.plan,
      ai_provider: shop.ai_provider,
      ai_model: shop.ai_model || getDefaultModelForProvider(shop.ai_provider),
      selected_provider: shop.ai_provider,
      selected_model: shop.ai_model || getDefaultModelForProvider(shop.ai_provider),
      has_ai_key: await hasAnyProviderKey(shop.id, db),
      billing_status: shop.billing_status,
      trial_days_left: trialDaysLeft,
      has_refresh_token: !!shop.shopify_refresh_token,
      available_skills: getAvailableSkills(shop.plan),
      provider_statuses: providerStatuses,
      created_at: shop.created_at,
    });
  } catch (err) {
    console.error('GET /shops/me error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Magaza bilgileri alinamadi' });
  }
});

router.post('/token-migration', async (req, res) => {
  try {
    const tokenResult = await db.query(
      `SELECT shopify_refresh_token
       FROM shops
       WHERE id = $1`,
      [req.shop.id]
    );

    if (tokenResult.rows[0]?.shopify_refresh_token) {
      return res.json({ success: true, migrated: false, message: 'Refresh token zaten mevcut' });
    }

    const sessionToken = req.shopifySessionToken;
    if (!sessionToken) {
      return res.status(401).json({
        error: 'missing_session_token',
        message: 'Shopify session token bulunamadi',
      });
    }

    const tokenBundle = await exchangeSessionTokenForOfflineToken(req.shop.shopify_domain, sessionToken);
    await persistRefreshedTokens(req.shop.id, tokenBundle, db);

    res.json({
      success: true,
      migrated: true,
      access_token_expires_at: tokenBundle.accessTokenExpiresAt,
      refresh_token_expires_at: tokenBundle.refreshTokenExpiresAt,
    });
  } catch (err) {
    console.error('POST /shops/token-migration error:', err.message);
    if (err.response) {
      console.error('   Shopify yaniti:', err.response.status, err.response.data);
    }
    res.status(500).json({
      error: 'token_migration_failed',
      message: 'Shopify token migration tamamlanamadi',
    });
  }
});

router.put('/ai-selection', async (req, res) => {
  const { model } = req.body;

  if (!model || !AI_MODEL_KEYS.includes(model)) {
    return res.status(400).json({
      error: 'invalid_model',
      message: 'Gecersiz model secimi.',
    });
  }

  try {
    const provider = getProviderForModel(model);
    await db.query(
      `UPDATE shops
       SET ai_provider = $1,
           ai_model = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [provider, model, req.shop.id]
    );

    res.json({ success: true, provider, model });
  } catch (err) {
    console.error('PUT /shops/ai-selection error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Model secimi kaydedilemedi' });
  }
});

router.put('/ai-settings', async (req, res) => {
  const { ai_provider, ai_api_key, ai_model } = req.body;

  if (ai_provider && !PROVIDERS.includes(ai_provider)) {
    return res.status(400).json({
      error: 'invalid_provider',
      message: `Gecersiz AI provider. Secenekler: ${PROVIDERS.join(', ')}`,
    });
  }

  if (ai_model && !AI_MODEL_KEYS.includes(ai_model)) {
    return res.status(400).json({
      error: 'invalid_model',
      message: 'Gecersiz model secimi',
    });
  }

  if (!ai_provider && !ai_api_key && !ai_model) {
    return res.status(400).json({
      error: 'no_updates',
      message: 'Guncellenecek alan belirtilmedi',
    });
  }

  try {
    const nextModel = ai_model || (ai_provider ? getDefaultModelForProvider(ai_provider) : req.shop.ai_model);
    const nextProvider = nextModel ? getProviderForModel(nextModel) : ai_provider || req.shop.ai_provider;

    if (nextProvider || nextModel) {
      await db.query(
        `UPDATE shops
         SET ai_provider = $1,
             ai_model = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [nextProvider, nextModel, req.shop.id]
      );
    }

    if (ai_api_key) {
      const providerForKey = nextProvider || ai_provider;
      if (!providerForKey) {
        return res.status(400).json({
          error: 'missing_provider',
          message: 'API anahtari icin once bir model secin',
        });
      }

      const modelForKey = nextModel || getDefaultModelForProvider(providerForKey);
      const validation = await validateModelAccess({
        provider: providerForKey,
        model: modelForKey,
        apiKey: ai_api_key.trim(),
      });

      if (!validation.success) {
        return res.status(400).json({
          error: 'provider_validation_failed',
          message: validation.message || 'API anahtari bu model icin dogrulanamadi',
        });
      }

      await upsertProviderCredential(req.shop.id, providerForKey, ai_api_key, db);
    }

    res.json({
      success: true,
      message: 'AI ayarlari guncellendi',
      ai_provider: nextProvider,
      ai_model: nextModel,
      selected_model: nextModel,
      provider_statuses: await getProviderStatusMap(req.shop.id, db),
    });
  } catch (err) {
    console.error('PUT /shops/ai-settings error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'AI ayarlari guncellenemedi' });
  }
});

router.get('/data/sync', async (req, res) => {
  try {
    const result = await syncShopData(req.shop.id, db);

    res.json({
      success: true,
      synced_at: result.synced_at,
      orders_fetched: result.orders_7d + result.orders_30d,
      products_fetched: result.products,
      stock_alerts: result.stock_alerts,
    });
  } catch (err) {
    console.error('GET /shops/data/sync error:', err.message);
    res.status(500).json({ error: 'sync_failed', message: 'Veri senkronizasyonu basarisiz' });
  }
});

router.post('/uploads', async (req, res) => {
  try {
    await runUploadParser(req, res);
  } catch (err) {
    console.error('POST /shops/uploads parser error:', err.message);
    return res.status(400).json({
      error: 'upload_invalid',
      message: err.message || 'Dosya yukleme istegi islenemedi.',
    });
  }

  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) {
    return res.status(400).json({
      error: 'missing_files',
      message: 'En az bir dosya secin.',
    });
  }

  const attachments = [];
  const errors = [];

  for (const file of files) {
    try {
      const attachment = await createAttachmentRecord({
        shopId: req.shop.id,
        file,
        db,
      });
      attachments.push(attachment);
    } catch (err) {
      errors.push({
        file_name: file.originalname,
        message: err.message || 'Dosya islenemedi.',
      });
    }
  }

  if (attachments.length === 0) {
    return res.status(400).json({
      error: 'upload_failed',
      message: errors[0]?.message || 'Yuklenen dosyalar islenemedi.',
      errors,
    });
  }

  return res.json({
    attachments,
    errors,
    accepted_types: getAttachmentAcceptString(),
  });
});

router.delete('/uploads/:id', async (req, res) => {
  try {
    const deleted = await deletePendingAttachment({
      shopId: req.shop.id,
      attachmentId: req.params.id,
      db,
    });

    if (!deleted) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Ek bulunamadi veya artik silinemez durumda.',
      });
    }

    return res.json({
      success: true,
      id: deleted.id,
    });
  } catch (err) {
    console.error('DELETE /shops/uploads/:id error:', err.message);
    return res.status(500).json({
      error: 'server_error',
      message: 'Ek silinemedi.',
    });
  }
});

router.post('/ai-key', async (req, res) => {
  const { provider, api_key } = req.body;

  if (!provider || !PROVIDERS.includes(provider)) {
    return res.status(400).json({
      error: 'invalid_provider',
      message: `Gecersiz provider. Secenekler: ${PROVIDERS.join(', ')}`,
    });
  }

  if (!api_key || typeof api_key !== 'string' || api_key.trim().length < 10) {
    return res.status(400).json({
      error: 'invalid_key',
      message: 'Gecerli bir API anahtari giriniz',
    });
  }

  try {
    const currentModelProvider = req.shop.ai_model ? getProviderForModel(req.shop.ai_model) : null;
    const nextModel = currentModelProvider === provider
      ? req.shop.ai_model
      : getDefaultModelForProvider(provider);

    const validation = await validateModelAccess({
      provider,
      model: nextModel,
      apiKey: api_key.trim(),
    });

    if (!validation.success) {
      return res.status(400).json({
        error: 'provider_validation_failed',
        message: validation.message || 'API anahtari bu model icin dogrulanamadi',
      });
    }

    await upsertProviderCredential(req.shop.id, provider, api_key, db);

    await db.query(
      `UPDATE shops
       SET ai_provider = $1,
           ai_model = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [provider, nextModel, req.shop.id]
    );

    res.json({
      success: true,
      message: 'AI API anahtari kaydedildi',
      provider,
      model: nextModel,
      provider_statuses: await getProviderStatusMap(req.shop.id, db),
    });
  } catch (err) {
    console.error('POST /shops/ai-key error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'API anahtari kaydedilemedi' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const shop = req.shop;

    let trialDaysLeft = null;
    if (shop.billing_status === 'trial' && shop.trial_ends_at) {
      const diff = new Date(shop.trial_ends_at) - new Date();
      trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    const usageResult = await db.query(
      `SELECT
         COUNT(*) as request_count,
         COALESCE(SUM(input_tokens), 0) as total_input,
         COALESCE(SUM(output_tokens), 0) as total_output,
         COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens
       FROM token_usage
       WHERE shop_id = $1
         AND created_at >= date_trunc('month', NOW())`,
      [shop.id]
    );

    const syncResult = await db.query(
      `SELECT MAX(fetched_at) as last_sync
       FROM shop_data_cache
       WHERE shop_id = $1`,
      [shop.id]
    );

    res.json({
      plan: shop.plan,
      billing_status: shop.billing_status,
      trial_ends_at: shop.trial_ends_at,
      trial_days_left: trialDaysLeft,
      token_usage_this_month: {
        requests: parseInt(usageResult.rows[0].request_count, 10),
        input_tokens: parseInt(usageResult.rows[0].total_input, 10),
        output_tokens: parseInt(usageResult.rows[0].total_output, 10),
        total_tokens: parseInt(usageResult.rows[0].total_tokens, 10),
      },
      last_sync: syncResult.rows[0]?.last_sync || null,
    });
  } catch (err) {
    console.error('GET /shops/status error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Durum bilgisi alinamadi' });
  }
});

router.get('/conversations', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, messages, created_at, updated_at
       FROM conversations
       WHERE shop_id = $1
       ORDER BY updated_at DESC
       LIMIT 50`,
      [req.shop.id]
    );

    const conversations = result.rows.map((row) => {
      const messages = Array.isArray(row.messages) ? row.messages : [];
      const lastMessage = messages[messages.length - 1]?.content || '';

      return {
        id: row.id,
        title: buildConversationTitle(messages),
        preview: lastMessage.slice(0, 120),
        message_count: messages.length,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    res.json({ conversations });
  } catch (err) {
    console.error('GET /shops/conversations error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Konusmalar alinamadi' });
  }
});

router.get('/conversations/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, messages, created_at, updated_at
       FROM conversations
       WHERE id = $1 AND shop_id = $2`,
      [req.params.id, req.shop.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Konusma bulunamadi',
      });
    }

    const conversation = result.rows[0];

    res.json({
      id: conversation.id,
      messages: conversation.messages || [],
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
    });
  } catch (err) {
    console.error('GET /shops/conversations/:id error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Konusma yuklenemedi' });
  }
});

router.patch('/conversations/:id/messages/:messageIndex', async (req, res) => {
  const { content } = req.body || {};
  const messageIndex = Number.parseInt(req.params.messageIndex, 10);

  if (!Number.isInteger(messageIndex) || messageIndex < 0) {
    return res.status(400).json({
      error: 'invalid_message_index',
      message: 'Gecersiz mesaj sirasi.',
    });
  }

  if (typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({
      error: 'missing_content',
      message: 'Mesaj icerigi bos birakilamaz.',
    });
  }

  if (content.length > 20000) {
    return res.status(400).json({
      error: 'message_too_long',
      message: 'Mesaj en fazla 20000 karakter olabilir.',
    });
  }

  try {
    const result = await db.query(
      `SELECT messages
       FROM conversations
       WHERE id = $1 AND shop_id = $2`,
      [req.params.id, req.shop.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Konusma bulunamadi',
      });
    }

    const messages = Array.isArray(result.rows[0].messages) ? [...result.rows[0].messages] : [];
    const targetMessage = messages[messageIndex];

    if (!targetMessage) {
      return res.status(404).json({
        error: 'message_not_found',
        message: 'Mesaj bulunamadi',
      });
    }

    if (!['assistant', 'user'].includes(targetMessage.role)) {
      return res.status(400).json({
        error: 'message_not_editable',
        message: 'Bu mesaj duzenlenemiyor.',
      });
    }

    messages[messageIndex] = {
      ...targetMessage,
      content: content.trim(),
    };

    await db.query(
      `UPDATE conversations
       SET messages = $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND shop_id = $3`,
      [JSON.stringify(messages), req.params.id, req.shop.id]
    );

    res.json({
      success: true,
      conversation_id: req.params.id,
      message_index: messageIndex,
      message: messages[messageIndex],
    });
  } catch (err) {
    console.error('PATCH /shops/conversations/:id/messages/:messageIndex error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Mesaj guncellenemedi' });
  }
});

router.delete('/conversations/:id', async (req, res) => {
  try {
    const attachmentRows = await getConversationAttachments({
      shopId: req.shop.id,
      conversationId: req.params.id,
      db,
    });

    const result = await db.query(
      `DELETE FROM conversations
       WHERE id = $1 AND shop_id = $2
       RETURNING id`,
      [req.params.id, req.shop.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Konusma bulunamadi',
      });
    }

    deleteFilesForRows(attachmentRows);

    res.json({
      success: true,
      id: result.rows[0].id,
      message: 'Konusma silindi',
    });
  } catch (err) {
    console.error('DELETE /shops/conversations/:id error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Konusma silinemedi' });
  }
});

router.get('/tasks', async (req, res) => {
  const { status = 'pending', limit = 20 } = req.query;

  try {
    const result = await db.query(
      `SELECT id, title, description, priority_score, confidence_score,
              status, source_skill, created_at, completed_at
       FROM tasks
       WHERE shop_id = $1 AND ($2::varchar IS NULL OR status = $2)
       ORDER BY priority_score DESC, created_at DESC
       LIMIT $3`,
      [req.shop.id, status === 'all' ? null : status, Math.min(parseInt(limit, 10), 100)]
    );

    res.json({
      tasks: result.rows,
      total: result.rows.length,
    });
  } catch (err) {
    console.error('GET /shops/tasks error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Gorevler alinamadi' });
  }
});

router.patch('/tasks/:id', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'in_progress', 'done'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      error: 'invalid_status',
      message: `Gecersiz durum. Secenekler: ${validStatuses.join(', ')}`,
    });
  }

  try {
    const result = await db.query(
      `UPDATE tasks
       SET status = $1,
           completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE NULL END
       WHERE id = $2 AND shop_id = $3
       RETURNING id, status, completed_at`,
      [status, req.params.id, req.shop.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Gorev bulunamadi' });
    }

    res.json({ success: true, task: result.rows[0] });
  } catch (err) {
    console.error('PATCH /shops/tasks/:id error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Gorev guncellenemedi' });
  }
});

router.get('/usage', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         ai_provider,
         COUNT(*) as request_count,
         SUM(input_tokens) as total_input_tokens,
         SUM(output_tokens) as total_output_tokens,
         SUM(input_tokens + output_tokens) as total_tokens,
         MIN(created_at) as first_usage,
         MAX(created_at) as last_usage
       FROM token_usage
       WHERE shop_id = $1
         AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY ai_provider`,
      [req.shop.id]
    );

    const dailyResult = await db.query(
      `SELECT
         DATE(created_at) as day,
         SUM(input_tokens + output_tokens) as tokens
       FROM token_usage
       WHERE shop_id = $1
         AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY day`,
      [req.shop.id]
    );

    res.json({
      providers: result.rows,
      daily_usage_7d: dailyResult.rows,
    });
  } catch (err) {
    console.error('GET /shops/usage error:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Kullanim verileri alinamadi' });
  }
});

function buildConversationTitle(messages) {
  const messageList = Array.isArray(messages) ? messages : [];
  const assistantMessage = messageList.find((message) => message.role === 'assistant' && message.content)?.content;
  const firstUserMessage = messageList.find((message) => message.role === 'user' && message.content)?.content;
  const source = assistantMessage || firstUserMessage || '';
  const firstUsefulLine = String(source)
    .replace(/\[SKILL:?\s*[^\]\n]*(?:\])?/gi, '')
    .replace(/\[(KRITIK|CRITICAL|UYARI|WARNING)\]/gi, '')
    .split('\n')
    .map((line) => line.replace(/^\s*(?:#{1,6}|\d+[.)]|[-*])\s*/, '').trim())
    .find((line) => line.length >= 8) || source;

  const compact = String(firstUsefulLine || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!compact) {
    return 'Yeni sohbet';
  }

  return compact.length > 48 ? `${compact.slice(0, 48)}...` : compact;
}

module.exports = router;
