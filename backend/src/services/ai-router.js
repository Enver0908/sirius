const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getModelDefinition, getModelLabel } = require('./ai-models');
const {
  PROMPT_CACHE_BOUNDARY,
  getSystemPromptProfile,
  getSystemPromptText,
} = require('./skills');
const { MAX_OUTPUT_TOKEN_LIMIT } = require('./prompt-optimizer');

const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 1;

async function callAI({
  provider,
  model,
  apiKey,
  systemPrompt,
  messages,
  shopId,
  db,
  skillsUsed = [],
  promptProfile = null,
  contextProfile = null,
  maxOutputTokens = MAX_OUTPUT_TOKEN_LIMIT,
  promptCacheKey = null,
  promptCacheRetention = null,
}) {
  if (!apiKey) {
    return errorResponse(provider, model, `${getModelLabel(model)} modeli icin API anahtari tanimli degil.`, true);
  }

  const modelDefinition = getModelDefinition(model);
  if (!modelDefinition || modelDefinition.provider !== provider) {
    return errorResponse(provider, model, 'Gecersiz model secimi.', true);
  }

  const handlers = {
    claude: callClaude,
    gemini: callGemini,
    chatgpt: callChatGPT,
  };

  const handler = handlers[provider];
  if (!handler) {
    return errorResponse(provider, model, `Desteklenmeyen AI provider: ${provider}`, true);
  }

  try {
    const options = buildAiRequestOptions({
      maxOutputTokens,
      promptCacheKey,
      promptCacheRetention,
      promptProfile: promptProfile || getSystemPromptProfile(systemPrompt),
      contextProfile,
    });
    const result = await callHandlerWithCacheFallback(handler, apiKey, modelDefinition.apiModel, systemPrompt, messages, options);
    const finalResult = await retryForLengthIfNeeded(handler, apiKey, modelDefinition.apiModel, systemPrompt, messages, options, result);
    logTokenUsage(db, shopId, provider, finalResult, skillsUsed, options);
    return finalResult;
  } catch (err) {
    if (shouldUseDevelopmentFallback(err)) {
      return buildDevelopmentFallback(provider, model, messages);
    }

    return handleProviderError(err, provider, model);
  }
}

async function streamAI({
  provider,
  model,
  apiKey,
  systemPrompt,
  messages,
  shopId,
  db,
  skillsUsed = [],
  onChunk,
  signal,
  promptProfile = null,
  contextProfile = null,
  maxOutputTokens = MAX_OUTPUT_TOKEN_LIMIT,
  promptCacheKey = null,
  promptCacheRetention = null,
}) {
  if (!apiKey) {
    return errorResponse(provider, model, `${getModelLabel(model)} modeli icin API anahtari tanimli degil.`, true);
  }

  const modelDefinition = getModelDefinition(model);
  if (!modelDefinition || modelDefinition.provider !== provider) {
    return errorResponse(provider, model, 'Gecersiz model secimi.', true);
  }

  const handlers = {
    claude: streamClaude,
    gemini: streamGemini,
    chatgpt: streamChatGPT,
  };

  const handler = handlers[provider];
  if (!handler) {
    return errorResponse(provider, model, `Desteklenmeyen AI provider: ${provider}`, true);
  }

  try {
    const options = buildAiRequestOptions({
      maxOutputTokens,
      promptCacheKey,
      promptCacheRetention,
      promptProfile: promptProfile || getSystemPromptProfile(systemPrompt),
      contextProfile,
      onChunk,
      signal,
    });
    const result = await callHandlerWithCacheFallback(handler, apiKey, modelDefinition.apiModel, systemPrompt, messages, options);
    logTokenUsage(db, shopId, provider, result, skillsUsed, options);
    return result;
  } catch (err) {
    if (isAbortError(err)) {
      throw err;
    }

    if (shouldUseDevelopmentFallback(err)) {
      return buildDevelopmentFallback(provider, model, messages);
    }

    return handleProviderError(err, provider, model);
  }
}

async function validateModelAccess({ provider, model, apiKey }) {
  if (!apiKey) {
    return {
      success: false,
      message: `${getModelLabel(model)} modeli icin API anahtari tanimli degil.`,
    };
  }

  const modelDefinition = getModelDefinition(model);
  if (!modelDefinition || modelDefinition.provider !== provider) {
    return {
      success: false,
      message: 'Gecersiz model secimi.',
    };
  }

  const handlers = {
    claude: callClaude,
    gemini: callGemini,
    chatgpt: callChatGPT,
  };

  const handler = handlers[provider];
  if (!handler) {
    return {
      success: false,
      message: `Desteklenmeyen AI provider: ${provider}`,
    };
  }

  try {
    await handler(apiKey, modelDefinition.apiModel, 'Yanita sadece OK yaz.', [
      { role: 'user', content: 'OK' },
    ]);

    return { success: true };
  } catch (err) {
    const errorResult = handleProviderError(err, provider, model);
    return {
      success: false,
      message: errorResult.content,
    };
  }
}

async function callClaude(apiKey, model, systemPrompt, messages, options = {}) {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create(
    {
      model,
      max_tokens: normalizeMaxOutputTokens(options.maxOutputTokens),
      system: buildClaudeSystemPrompt(systemPrompt, options),
      messages: messages.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: mapClaudeContent(message.content),
      })),
    },
    { headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' } }
  );

  return {
    content: response.content[0]?.text || '',
    input_tokens: response.usage?.input_tokens || 0,
    output_tokens: response.usage?.output_tokens || 0,
    cached_input_tokens: response.usage?.cache_read_input_tokens || 0,
    cache_creation_input_tokens: response.usage?.cache_creation_input_tokens || 0,
    finish_reason: response.stop_reason || null,
    provider: 'claude',
    model,
  };
}

async function callGemini(apiKey, model, systemPrompt, messages, options = {}) {
  const genAI = new GoogleGenerativeAI(apiKey);

  const geminiModel = genAI.getGenerativeModel({
    model,
    systemInstruction: stripPromptCacheBoundary(getSystemPromptText(systemPrompt)),
    generationConfig: {
      maxOutputTokens: normalizeMaxOutputTokens(options.maxOutputTokens),
    },
  });

  const geminiHistory = messages.slice(0, -1).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: mapGeminiParts(message.content),
  }));

  const lastMessage = messages[messages.length - 1];
  const chat = geminiModel.startChat({ history: geminiHistory });
  const response = await chat.sendMessage(mapGeminiParts(lastMessage.content));
  const result = response.response;
  const usageMetadata = result.usageMetadata || {};

  return {
    content: result.text() || '',
    input_tokens: usageMetadata.promptTokenCount || 0,
    output_tokens: usageMetadata.candidatesTokenCount || 0,
    cached_input_tokens: usageMetadata.cachedContentTokenCount || 0,
    cache_creation_input_tokens: 0,
    finish_reason: result.candidates?.[0]?.finishReason || null,
    provider: 'gemini',
    model,
  };
}

async function callChatGPT(apiKey, model, systemPrompt, messages, options = {}) {
  const client = new OpenAI({ apiKey });

  const openAIMessages = [
    { role: 'system', content: stripPromptCacheBoundary(getSystemPromptText(systemPrompt)) },
    ...messages.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: mapOpenAIContent(message.content),
    })),
  ];

  const response = await client.chat.completions.create({
    model,
    messages: openAIMessages,
    max_completion_tokens: normalizeMaxOutputTokens(options.maxOutputTokens),
    ...buildOpenAICacheOptions(options),
  });

  const usage = response.usage || {};

  return {
    content: response.choices[0]?.message?.content || '',
    input_tokens: usage.prompt_tokens || 0,
    output_tokens: usage.completion_tokens || 0,
    cached_input_tokens: usage.prompt_tokens_details?.cached_tokens || 0,
    cache_creation_input_tokens: 0,
    finish_reason: response.choices[0]?.finish_reason || null,
    provider: 'chatgpt',
    model,
  };
}

async function streamChatGPT(apiKey, model, systemPrompt, messages, options = {}) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: stripPromptCacheBoundary(getSystemPromptText(systemPrompt)) },
        ...messages.map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: mapOpenAIContent(message.content),
        })),
      ],
      max_completion_tokens: normalizeMaxOutputTokens(options.maxOutputTokens),
      ...buildOpenAICacheOptions(options),
      stream: true,
      stream_options: {
        include_usage: true,
      },
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    throw await buildFetchError(response);
  }

  const state = createStreamState();

  await readSSEStream(response, ({ data }) => {
    if (!data || data === '[DONE]') {
      return;
    }

    const payload = JSON.parse(data);
    const nextText = payload.choices?.[0]?.delta?.content || '';
    pushStreamText(state, nextText, options.onChunk);

    if (payload.choices?.[0]?.finish_reason) {
      state.finishReason = payload.choices[0].finish_reason;
    }

    if (payload.usage) {
      state.inputTokens = payload.usage.prompt_tokens || 0;
      state.outputTokens = payload.usage.completion_tokens || 0;
      state.cachedInputTokens = payload.usage.prompt_tokens_details?.cached_tokens || 0;
    }
  });

  return {
    content: state.fullText,
    input_tokens: state.inputTokens,
    output_tokens: state.outputTokens,
    cached_input_tokens: state.cachedInputTokens,
    cache_creation_input_tokens: 0,
    finish_reason: state.finishReason,
    provider: 'chatgpt',
    model,
  };
}

async function streamClaude(apiKey, model, systemPrompt, messages, options = {}) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model,
      max_tokens: normalizeMaxOutputTokens(options.maxOutputTokens),
      system: buildClaudeSystemPrompt(systemPrompt, options),
      stream: true,
      messages: messages.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: mapClaudeContent(message.content),
      })),
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    throw await buildFetchError(response);
  }

  const state = createStreamState();

  await readSSEStream(response, ({ event, data }) => {
    if (!data) {
      return;
    }

    const payload = JSON.parse(data);

    if (event === 'content_block_delta') {
      pushStreamText(state, payload.delta?.text || '', options.onChunk);
      return;
    }

    if (event === 'message_start') {
      state.inputTokens = payload.message?.usage?.input_tokens || 0;
      state.cachedInputTokens = payload.message?.usage?.cache_read_input_tokens || 0;
      state.cacheCreationInputTokens = payload.message?.usage?.cache_creation_input_tokens || 0;
      return;
    }

    if (event === 'message_delta') {
      state.outputTokens = payload.usage?.output_tokens || state.outputTokens;
      state.finishReason = payload.delta?.stop_reason || state.finishReason;
      return;
    }

    if (event === 'error') {
      throw buildProviderStreamError(payload.error?.message || 'Anthropic stream hatasi', payload.error?.type, response.status);
    }
  });

  return {
    content: state.fullText,
    input_tokens: state.inputTokens,
    output_tokens: state.outputTokens,
    cached_input_tokens: state.cachedInputTokens,
    cache_creation_input_tokens: state.cacheCreationInputTokens,
    finish_reason: state.finishReason,
    provider: 'claude',
    model,
  };
}

async function streamGemini(apiKey, model, systemPrompt, messages, options = {}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: stripPromptCacheBoundary(getSystemPromptText(systemPrompt)) }],
        },
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: mapGeminiParts(message.content),
        })),
        generationConfig: {
          maxOutputTokens: normalizeMaxOutputTokens(options.maxOutputTokens),
        },
      }),
      signal: options.signal,
    }
  );

  if (!response.ok) {
    throw await buildFetchError(response);
  }

  const state = createStreamState();

  await readSSEStream(response, ({ data }) => {
    if (!data) {
      return;
    }

    const payload = JSON.parse(data);
    pushStreamText(state, extractGeminiText(payload), options.onChunk);

    if (payload.candidates?.[0]?.finishReason) {
      state.finishReason = payload.candidates[0].finishReason;
    }

    if (payload.usageMetadata) {
      state.inputTokens = payload.usageMetadata.promptTokenCount || state.inputTokens;
      state.outputTokens = payload.usageMetadata.candidatesTokenCount || state.outputTokens;
      state.cachedInputTokens = payload.usageMetadata.cachedContentTokenCount || state.cachedInputTokens;
    }
  });

  return {
    content: state.fullText,
    input_tokens: state.inputTokens,
    output_tokens: state.outputTokens,
    cached_input_tokens: state.cachedInputTokens,
    cache_creation_input_tokens: 0,
    finish_reason: state.finishReason,
    provider: 'gemini',
    model,
  };
}

function buildAiRequestOptions(options = {}) {
  return {
    maxOutputTokens: normalizeMaxOutputTokens(options.maxOutputTokens),
    promptCacheKey: options.promptCacheKey || null,
    promptCacheRetention: options.promptCacheRetention || null,
    promptProfile: options.promptProfile || {},
    contextProfile: options.contextProfile || {},
    onChunk: options.onChunk,
    signal: options.signal,
  };
}

async function callHandlerWithCacheFallback(handler, apiKey, model, systemPrompt, messages, options) {
  try {
    return await withRetry(() => handler(apiKey, model, systemPrompt, messages, options));
  } catch (err) {
    if (hasProviderCacheOptions(options) && isCacheOptionUnsupportedError(err)) {
      console.warn('Provider cache options were rejected; retrying without cache options:', err.message);
      return withRetry(() => handler(apiKey, model, systemPrompt, messages, {
        ...options,
        promptCacheKey: null,
        promptCacheRetention: null,
      }));
    }

    throw err;
  }
}

async function retryForLengthIfNeeded(handler, apiKey, model, systemPrompt, messages, options, result) {
  if (!isLengthFinish(result) || options.maxOutputTokens >= MAX_OUTPUT_TOKEN_LIMIT) {
    return result;
  }

  const retryResult = await callHandlerWithCacheFallback(handler, apiKey, model, systemPrompt, messages, {
    ...options,
    maxOutputTokens: MAX_OUTPUT_TOKEN_LIMIT,
    contextProfile: {
      ...options.contextProfile,
      output_token_limit_retry: MAX_OUTPUT_TOKEN_LIMIT,
    },
  });

  return {
    ...retryResult,
    input_tokens: (result.input_tokens || 0) + (retryResult.input_tokens || 0),
    output_tokens: (result.output_tokens || 0) + (retryResult.output_tokens || 0),
    cached_input_tokens: (result.cached_input_tokens || 0) + (retryResult.cached_input_tokens || 0),
    cache_creation_input_tokens:
      (result.cache_creation_input_tokens || 0) + (retryResult.cache_creation_input_tokens || 0),
    retried_for_length: true,
  };
}

function normalizeMaxOutputTokens(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return MAX_OUTPUT_TOKEN_LIMIT;
  }

  return Math.min(parsed, MAX_OUTPUT_TOKEN_LIMIT);
}

function isLengthFinish(result) {
  const reason = String(result?.finish_reason || '').toLowerCase();
  return reason === 'length' || reason === 'max_tokens' || reason === 'max_output_tokens';
}

function hasProviderCacheOptions(options = {}) {
  return !!(options.promptCacheKey || options.promptCacheRetention);
}

function isCacheOptionUnsupportedError(err) {
  const status = err.status || err.statusCode || err.httpCode;
  const message = String(err.message || '').toLowerCase();

  return status === 400 && (
    message.includes('prompt_cache') ||
    message.includes('cache_control') ||
    message.includes('unknown parameter') ||
    message.includes('unrecognized')
  );
}

function buildOpenAICacheOptions(options = {}) {
  const payload = {};

  if (options.promptCacheKey) {
    payload.prompt_cache_key = options.promptCacheKey;
  }

  if (options.promptCacheRetention) {
    payload.prompt_cache_retention = options.promptCacheRetention;
  }

  return payload;
}

function buildClaudeSystemPrompt(systemPrompt, options = {}) {
  const text = getSystemPromptText(systemPrompt);
  const [staticPrefix, dynamicSuffix] = splitSystemPromptForCaching(text);

  if (!staticPrefix || !options.promptCacheKey) {
    return stripPromptCacheBoundary(text);
  }

  const blocks = [
    {
      type: 'text',
      text: staticPrefix.trim(),
      cache_control: { type: 'ephemeral' },
    },
  ];

  if (dynamicSuffix.trim()) {
    blocks.push({
      type: 'text',
      text: dynamicSuffix.trim(),
    });
  }

  return blocks;
}

function splitSystemPromptForCaching(text) {
  const index = text.indexOf(PROMPT_CACHE_BOUNDARY);
  if (index === -1) {
    return ['', text];
  }

  return [
    text.slice(0, index),
    text.slice(index + PROMPT_CACHE_BOUNDARY.length),
  ];
}

function stripPromptCacheBoundary(text) {
  return String(text || '').replace(PROMPT_CACHE_BOUNDARY, '\n');
}

async function withRetry(fn) {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = err.status || err.statusCode || err.httpCode;
      const isRetryable = status === 429 || (status >= 500 && status < 600);

      if (isRetryable && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

function handleProviderError(err, provider, model) {
  const status = err.status || err.statusCode || err.httpCode;
  const errType = err.constructor?.name || '';
  const errMsg = String(err.message || '');
  const modelLabel = getModelLabel(model);

  console.error(`AI error [${provider}]:`, errMsg);

  if (
    status === 401 ||
    status === 403 ||
    errType === 'AuthenticationError' ||
    (errMsg.toLowerCase().includes('invalid') && errMsg.toLowerCase().includes('key'))
  ) {
    return errorResponse(
      provider,
      model,
      `${modelLabel} icin girdiginiz API anahtari gecersiz. Lutfen anahtari kontrol edin.`,
      true
    );
  }

  if (status === 429) {
    return errorResponse(
      provider,
      model,
      `${modelLabel} modeli icin saglayici limiti dolu. Lutfen biraz bekleyip tekrar deneyin.`,
      true
    );
  }

  if (
    errMsg.toLowerCase().includes('quota') ||
    errMsg.toLowerCase().includes('billing') ||
    errMsg.toLowerCase().includes('insufficient') ||
    errMsg.toLowerCase().includes('credit')
  ) {
    return errorResponse(
      provider,
      model,
      `${modelLabel} modeli icin istek hakkiniz kalmamis veya saglayici bakiyeniz bitmis olabilir.`,
      true
    );
  }

  if (
    errMsg.toLowerCase().includes('model') &&
    (errMsg.toLowerCase().includes('not found') ||
      errMsg.toLowerCase().includes('does not exist') ||
      errMsg.toLowerCase().includes('unsupported'))
  ) {
    return errorResponse(
      provider,
      model,
      `${modelLabel} secenegi bu saglayici hesabinda kullanilamiyor olabilir. Lutfen model erisiminizi kontrol edin.`,
      true
    );
  }

  if (status === 400 || errType === 'InvalidRequestError') {
    return errorResponse(
      provider,
      model,
      `${modelLabel} istegi olusturulamadi. Lutfen daha sonra tekrar deneyin.`,
      true
    );
  }

  return errorResponse(
    provider,
    model,
    `${modelLabel} servisinde beklenmeyen bir hata olustu. Lutfen tekrar deneyin.`,
    true
  );
}

function shouldUseDevelopmentFallback(err) {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  if (process.env.AI_DEVELOPMENT_FALLBACK !== 'true') {
    return false;
  }

  const status = err.status || err.statusCode || err.httpCode;
  const errMsg = String(err.message || '').toLowerCase();

  if (status === 429) {
    return true;
  }

  return (
    errMsg.includes('quota') ||
    errMsg.includes('billing') ||
    errMsg.includes('insufficient') ||
    errMsg.includes('credit') ||
    errMsg.includes('rate limit')
  );
}

function buildDevelopmentFallback(provider, model, messages) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role !== 'assistant')?.content || '';
  const normalizedPrompt = extractPlainText(lastUserMessage).toLowerCase();

  let skillTag = 'genel-analiz';
  let title = 'Gelisim modu analizi';
  let bullets = [
    'Gercek AI saglayicisi kota veya billing limitine takildigi icin Sirius simule edilmis analiz modunda yanit veriyor.',
    'Shopify kurulumunuz, planiniz ve uygulama akisi su anda calisir durumda.',
    'Canli model cevabi icin ilgili saglayicida API kotasi veya billing acmaniz gerekecek.',
  ];

  if (normalizedPrompt.includes('stok') || normalizedPrompt.includes('envanter')) {
    skillTag = 'anomali';
    title = 'Stok ve envanter odakli ilk bakis';
    bullets = [
      'Dusuk stok riski olan urunleri one cikarmak icin once Veri yenile aksiyonunu calistirin.',
      '14 gunun altinda kalan urunler icin yeniden siparis esigi tanimlamaniz faydali olur.',
      'En cok satan urunlerle dusuk stoklu urunleri eslestirip acil replenishment listesi cikarmak dogru sonraki adimdir.',
    ];
  } else if (
    normalizedPrompt.includes('satis') ||
    normalizedPrompt.includes('ciro') ||
    normalizedPrompt.includes('rapor')
  ) {
    skillTag = 'satis-raporu';
    title = 'Satis raporu taslagi';
    bullets = [
      'Once son 7 gun ve son 30 gun performansini ayri ayri karsilastirin.',
      'Siparis sayisi, ortalama sepet ve iade etkisini ayni tabloda toplarsaniz dogru yorum yaparsiniz.',
      'Buyume varsa hangi urun veya kanal tasidigini bulmak sonraki en degerli analiz olur.',
    ];
  } else if (
    normalizedPrompt.includes('neden') ||
    normalizedPrompt.includes('kok neden') ||
    normalizedPrompt.includes('anomali')
  ) {
    skillTag = 'rca-aksiyon';
    title = 'Kok neden analizi taslagi';
    bullets = [
      'Sapmanin ne zaman basladigini bulmak ilk adimdir.',
      'Promosyon, fiyat, trafik kaynagi ve stok degisikliklerini ayni zaman cizgisinde karsilastirin.',
      'Tek bir hipotez yerine 2-3 olasi neden cikarip hizli dogrulama yapmak en guvenli yaklasimdir.',
    ];
  }

  return {
    content: [
      `[SKILL: ${skillTag}]`,
      `${title}`,
      '',
      ...bullets.map((bullet) => `- ${bullet}`),
      '',
      'Not: Bu yanit development fallback modunda uretildi.',
    ].join('\n'),
    input_tokens: 0,
    output_tokens: 0,
    provider,
    model,
    error: false,
  };
}

function createStreamState() {
  return {
    fullText: '',
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    finishReason: null,
  };
}

function extractPlainText(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
}

function normalizeContentParts(content) {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  if (!Array.isArray(content)) {
    return [{ type: 'text', text: '' }];
  }

  return content.filter((part) => part && typeof part === 'object');
}

function mapOpenAIContent(content) {
  const parts = normalizeContentParts(content);
  if (parts.length === 1 && parts[0].type === 'text') {
    return parts[0].text;
  }

  return parts.map((part) => {
    if (part.type === 'image') {
      return {
        type: 'image_url',
        image_url: {
          url: `data:${part.mimeType};base64,${part.data}`,
        },
      };
    }

    return {
      type: 'text',
      text: part.text || '',
    };
  });
}

function mapClaudeContent(content) {
  return normalizeContentParts(content).map((part) => {
    if (part.type === 'image') {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.mimeType,
          data: part.data,
        },
      };
    }

    return {
      type: 'text',
      text: part.text || '',
    };
  });
}

function mapGeminiParts(content) {
  return normalizeContentParts(content).map((part) => {
    if (part.type === 'image') {
      return {
        inlineData: {
          mimeType: part.mimeType,
          data: part.data,
        },
      };
    }

    return {
      text: part.text || '',
    };
  });
}

function pushStreamText(state, nextText, onChunk) {
  if (!nextText) {
    return;
  }

  const text = String(nextText);
  const delta = text.startsWith(state.fullText) ? text.slice(state.fullText.length) : text;

  if (!delta) {
    return;
  }

  state.fullText += delta;
  if (typeof onChunk === 'function') {
    onChunk(delta);
  }
}

function extractGeminiText(payload) {
  const parts = payload.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
}

async function readSSEStream(response, onEvent) {
  if (!response.body) {
    throw new Error('AI stream body bulunamadi.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    let boundaryIndex = buffer.indexOf('\n\n');
    while (boundaryIndex !== -1) {
      const rawEvent = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);

      if (rawEvent) {
        await onEvent(parseSSEEvent(rawEvent));
      }

      boundaryIndex = buffer.indexOf('\n\n');
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    await onEvent(parseSSEEvent(trailing));
  }
}

function parseSSEEvent(rawEvent) {
  let event = 'message';
  const dataLines = [];

  for (const line of rawEvent.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  return {
    event,
    data: dataLines.join('\n'),
  };
}

async function buildFetchError(response) {
  let message = `HTTP ${response.status}`;

  try {
    const payload = await response.json();
    message =
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      message;
  } catch {
    try {
      const text = await response.text();
      if (text) {
        message = text;
      }
    } catch {}
  }

  return buildProviderStreamError(message, 'stream_http_error', response.status);
}

function buildProviderStreamError(message, type, status) {
  const error = new Error(message);
  error.type = type;
  error.status = status;
  return error;
}

function isAbortError(err) {
  return err?.name === 'AbortError' || err?.code === 'ABORT_ERR';
}

function logTokenUsage(db, shopId, provider, result, skillsUsed, options = {}) {
  if (!db || !shopId) {
    return;
  }

  db.query(
    `INSERT INTO token_usage (
       shop_id,
       ai_provider,
       input_tokens,
       output_tokens,
       cached_input_tokens,
       cache_creation_input_tokens,
       skills_used,
       prompt_profile,
       context_profile,
       finish_reason
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
    [
      shopId,
      provider,
      result?.input_tokens || 0,
      result?.output_tokens || 0,
      result?.cached_input_tokens || 0,
      result?.cache_creation_input_tokens || 0,
      skillsUsed,
      JSON.stringify(options.promptProfile || {}),
      JSON.stringify(options.contextProfile || {}),
      result?.finish_reason || null,
    ]
  ).catch((err) => {
    console.error('Token usage could not be saved:', err.message);
  });
}

function errorResponse(provider, model, message, error = false) {
  return {
    content: message,
    input_tokens: 0,
    output_tokens: 0,
    provider,
    model,
    error,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { callAI, streamAI, validateModelAccess };
