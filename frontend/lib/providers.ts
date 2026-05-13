export type ProviderKey = 'claude' | 'chatgpt' | 'gemini';

export type AIModelKey =
  | 'gemini-3.1-pro'
  | 'claude-sonnet-4.6'
  | 'claude-opus-4.6'
  | 'gpt-5.4'
  | 'gpt-5.5';

export const PROVIDERS: Array<{
  key: ProviderKey;
  label: string;
  company: string;
  icon: string;
  desc: string;
}> = [
  {
    key: 'claude',
    label: 'Claude',
    company: 'Anthropic',
    icon: 'C',
    desc: 'Sonnet 4.6 ve Opus 4.6',
  },
  {
    key: 'chatgpt',
    label: 'GPT',
    company: 'OpenAI',
    icon: 'G',
    desc: 'GPT-5.4 ve GPT-5.5',
  },
  {
    key: 'gemini',
    label: 'Gemini',
    company: 'Google',
    icon: 'M',
    desc: 'Gemini 3.1 Pro',
  },
];

export const AI_MODELS: Array<{
  key: AIModelKey;
  label: string;
  provider: ProviderKey;
  company: string;
  icon: string;
  desc: string;
  badge?: string;
}> = [
  {
    key: 'gemini-3.1-pro',
    label: 'Gemini 3.1 Pro',
    provider: 'gemini',
    company: 'Google',
    icon: 'M',
    desc: 'Genis baglam ve multimodal analiz',
    badge: 'New',
  },
  {
    key: 'claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    provider: 'claude',
    company: 'Anthropic',
    icon: 'C',
    desc: 'Dengeli muhakeme ve hiz',
  },
  {
    key: 'claude-opus-4.6',
    label: 'Claude Opus 4.6',
    provider: 'claude',
    company: 'Anthropic',
    icon: 'C',
    desc: 'Derin analiz ve ileri muhakeme',
  },
  {
    key: 'gpt-5.4',
    label: 'GPT-5.4',
    provider: 'chatgpt',
    company: 'OpenAI',
    icon: 'G',
    desc: 'Guclu genel amacli reasoning',
  },
  {
    key: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: 'chatgpt',
    company: 'OpenAI',
    icon: 'G',
    desc: 'Ileri seviye GPT varyanti',
  },
];

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderKey, AIModelKey> = {
  claude: 'claude-sonnet-4.6',
  chatgpt: 'gpt-5.4',
  gemini: 'gemini-3.1-pro',
};

export function getProviderLabel(provider: ProviderKey) {
  return PROVIDERS.find((item) => item.key === provider)?.label || 'Model';
}

export function getModelDefinition(model: AIModelKey | null | undefined) {
  return AI_MODELS.find((item) => item.key === model) || null;
}

export function getModelLabel(model: AIModelKey | null | undefined) {
  return getModelDefinition(model)?.label || 'Model';
}

export function getProviderForModel(model: AIModelKey) {
  return getModelDefinition(model)?.provider || 'chatgpt';
}

export function getDefaultModelForProvider(provider: ProviderKey) {
  return DEFAULT_MODEL_BY_PROVIDER[provider];
}
