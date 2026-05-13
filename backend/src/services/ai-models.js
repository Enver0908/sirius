const AI_MODELS = [
  {
    key: 'gemini-3.1-pro',
    label: 'Gemini 3.1 Pro',
    provider: 'gemini',
    apiModel: 'gemini-3.1-pro-preview',
  },
  {
    key: 'claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    provider: 'claude',
    apiModel: 'claude-sonnet-4-6',
  },
  {
    key: 'claude-opus-4.6',
    label: 'Claude Opus 4.6',
    provider: 'claude',
    apiModel: 'claude-opus-4-6',
  },
  {
    key: 'gpt-5.4',
    label: 'GPT-5.4',
    provider: 'chatgpt',
    apiModel: 'gpt-5.4',
  },
  {
    key: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: 'chatgpt',
    apiModel: 'gpt-5.5',
  },
];

const AI_MODEL_KEYS = AI_MODELS.map((model) => model.key);

const DEFAULT_MODEL_BY_PROVIDER = {
  claude: 'claude-sonnet-4.6',
  chatgpt: 'gpt-5.4',
  gemini: 'gemini-3.1-pro',
};

function getModelDefinition(modelKey) {
  return AI_MODELS.find((model) => model.key === modelKey) || null;
}

function getModelLabel(modelKey) {
  return getModelDefinition(modelKey)?.label || 'Model';
}

function getProviderForModel(modelKey) {
  return getModelDefinition(modelKey)?.provider || null;
}

function getDefaultModelForProvider(provider) {
  return DEFAULT_MODEL_BY_PROVIDER[provider] || null;
}

module.exports = {
  AI_MODELS,
  AI_MODEL_KEYS,
  DEFAULT_MODEL_BY_PROVIDER,
  getDefaultModelForProvider,
  getModelDefinition,
  getModelLabel,
  getProviderForModel,
};
