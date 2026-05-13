import { create } from 'zustand';
import axios from 'axios';
import { getSessionToken } from '../lib/shopify-session';
import { getDefaultModelForProvider, type AIModelKey, type ProviderKey } from '../lib/providers';
import { getResponseLanguageName, getStoredLanguage, translate } from '../lib/i18n';

const API_URL = '';

export type ProviderStatusMap = Record<ProviderKey, { has_api_key: boolean }>;

export interface Shop {
  id: string;
  shopify_domain: string;
  plan: 'sirius';
  ai_provider: ProviderKey | null;
  ai_model: AIModelKey | null;
  selected_provider: ProviderKey | null;
  selected_model: AIModelKey | null;
  has_ai_key: boolean;
  billing_status: string;
  has_refresh_token?: boolean;
  trial_days_left: number | null;
  available_skills: string[];
  provider_statuses: ProviderStatusMap;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  provider?: ProviderKey;
  model?: AIModelKey;
  skillsUsed?: string[];
  isError?: boolean;
  streaming?: boolean;
  conversationId?: string | null;
  messageIndex?: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  original_name: string;
  file_ext: string;
  mime_type: string;
  attachment_kind: 'image' | 'pdf' | 'csv' | 'docx' | 'text' | 'zip';
  size_bytes: number;
  size_label: string;
  processing_status: 'ready' | 'failed';
  structured_summary?: Record<string, any>;
  created_at?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority_score: number;
  confidence_score: number;
  status: 'pending' | 'in_progress' | 'done';
  source_skill: string;
  created_at: string;
  completed_at: string | null;
}

export interface Anomaly {
  level: 'critical' | 'warning';
  title: string;
  description: string;
  confidence_score: number;
}

export interface ShopStatus {
  plan: string;
  billing_status: string;
  trial_days_left: number | null;
  token_usage_this_month: {
    requests: number;
    total_tokens: number;
  };
  last_sync: string | null;
}

export interface SyncResult {
  synced_at: string;
  orders_fetched: number;
  products_fetched: number;
}

const EMPTY_PROVIDER_STATUSES: ProviderStatusMap = {
  claude: { has_api_key: false },
  chatgpt: { has_api_key: false },
  gemini: { has_api_key: false },
};

const apiClient = axios.create({
  baseURL: API_URL,
});

function sessionErrorMessage(error?: string, fallback?: string) {
  const locale = getStoredLanguage();
  if (error === 'missing_token' || error === 'invalid_token') {
    return translate(locale, 'store.sessionMissing');
  }

  return fallback || translate(locale, 'store.genericFailure');
}

function cleanAssistantDisplayContent(content: string) {
  return content
    .replace(/\[SKILL:\s*[^\]]+\]/gi, '')
    .replace(/^\s*\[SKILL:\s*[^\n\]]*(?:\])?\s*/i, '')
    .replace(/^\s*\[SKILL\s*/i, '')
    .replace(/^\s*\[SKILL:\s*[^\n]*$/gim, '')
    .replace(/\n?\s*\[SKILL:\s*[^\n]*$/gi, '\n')
    .replace(/\n?\s*\[SKILL\s*/gi, '\n')
    .replace(/\[(KR[Iİ]T[Iİ]K|CRITICAL|UYARI|WARNING)\]/gi, '')
    .replace(/(?:\uD83D\uDD34|\uD83D\uDFE1)\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

apiClient.interceptors.request.use(
  async (config) => {
    const token = await getSessionToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

function api() {
  return apiClient;
}

function createMessageId() {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseAssistantDisplayContent(content: string) {
  return cleanAssistantDisplayContent(content || '');
}

async function streamChatRequest({
  message,
  model,
  conversationId,
  attachmentIds,
  regenerateFromMessageIndex,
  signal,
  onEvent,
}: {
  message: string;
  model: AIModelKey;
  conversationId: string | null;
  attachmentIds?: string[];
  regenerateFromMessageIndex?: number;
  signal: AbortSignal;
  onEvent: (event: string, payload: any) => void;
}) {
  const token = await getSessionToken();
  const locale = getStoredLanguage();
  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message,
      model,
      conversation_id: conversationId,
      attachment_ids: attachmentIds || [],
      ...(regenerateFromMessageIndex !== undefined ? { regenerate_from_message_index: regenerateFromMessageIndex } : {}),
      response_language: getResponseLanguageName(locale),
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    throw await buildStreamError(response);
  }

  if (!response.body) {
    throw new Error('Chat stream baslatilamadi.');
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
        const parsed = parseSSEEvent(rawEvent);
        const payload = parsed.data ? JSON.parse(parsed.data) : {};
        onEvent(parsed.event, payload);
      }

      boundaryIndex = buffer.indexOf('\n\n');
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    const parsed = parseSSEEvent(trailing);
    const payload = parsed.data ? JSON.parse(parsed.data) : {};
    onEvent(parsed.event, payload);
  }
}

async function buildStreamError(response: Response) {
  let message = `HTTP ${response.status}`;

  try {
    const payload = await response.json();
    message = payload?.message || payload?.error || message;
  } catch {
    try {
      const text = await response.text();
      if (text) {
        message = text;
      }
    } catch {}
  }

  const error = new Error(message);
  (error as any).status = response.status;
  return error;
}

function parseSSEEvent(rawEvent: string) {
  let event = 'message';
  const dataLines: string[] = [];

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

interface ShopState {
  shop: Shop | null;
  status: ShopStatus | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  fetchShop: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  saveAIKey: (provider: ProviderKey, apiKey: string) => Promise<{ success: boolean; error?: string }>;
  selectAIModel: (model: AIModelKey) => Promise<{ success: boolean; error?: string }>;
  ensureExpiringOfflineToken: () => Promise<{ success: boolean; migrated?: boolean; error?: string }>;
  subscribePlan: (plan: string) => Promise<{
    success: boolean;
    confirmation_url?: string;
    already_active?: boolean;
    message?: string;
    error?: string;
  }>;
  syncData: () => Promise<SyncResult | null>;
}

export const useShopStore = create<ShopState>((set, get) => ({
  shop: null,
  status: null,
  loading: false,
  error: null,
  errorCode: null,

  fetchShop: async () => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const { data } = await api().get('/api/shops/me');
      const normalizedShop = {
        ...data,
        provider_statuses: data.provider_statuses || EMPTY_PROVIDER_STATUSES,
      };

      if (typeof window !== 'undefined' && normalizedShop.shopify_domain) {
        window.localStorage.setItem('sirius:last_shop_domain', normalizedShop.shopify_domain);
      }

      set({
        shop: normalizedShop,
        loading: false,
        error: null,
        errorCode: null,
      });

      if (!normalizedShop.has_refresh_token) {
        try {
          await api().post('/api/shops/token-migration');
          set((state) => ({
            shop: state.shop ? { ...state.shop, has_refresh_token: true } : state.shop,
          }));
        } catch (migrationError) {
          console.warn('Shopify token migration could not be completed automatically', migrationError);
        }
      }
    } catch (err: any) {
      set({
        error: sessionErrorMessage(err.response?.data?.error, err.response?.data?.message || translate(getStoredLanguage(), 'store.storeInfoFailed')),
        errorCode: err.response?.data?.error || null,
        loading: false,
      });
    }
  },

  fetchStatus: async () => {
    try {
      const { data } = await api().get('/api/shops/status');
      set({ status: data });
    } catch {}
  },

  saveAIKey: async (provider, apiKey) => {
    try {
      await api().post('/api/shops/ai-key', { provider, api_key: apiKey });
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: sessionErrorMessage(err.response?.data?.error, err.response?.data?.message),
      };
    }
  },

  selectAIModel: async (model) => {
    try {
      await api().put('/api/shops/ai-selection', { model });
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: sessionErrorMessage(err.response?.data?.error, err.response?.data?.message),
      };
    }
  },

  ensureExpiringOfflineToken: async () => {
    try {
      const { data } = await api().post('/api/shops/token-migration');
      set((state) => ({
        shop: state.shop ? { ...state.shop, has_refresh_token: true } : state.shop,
      }));
      return { success: true, migrated: data.migrated };
    } catch (err: any) {
      return {
        success: false,
        error: sessionErrorMessage(err.response?.data?.error, err.response?.data?.message || translate(getStoredLanguage(), 'store.tokenMigrationFailed')),
      };
    }
  },

  subscribePlan: async (plan) => {
    try {
      const migrationResult = await get().ensureExpiringOfflineToken();
      if (!migrationResult.success) {
        return {
          success: false,
          error: migrationResult.error || translate(getStoredLanguage(), 'store.tokenMigrationStartFailed'),
        };
      }

      const { data } = await api().post('/api/billing/subscribe', { plan });
      return {
        success: true,
        confirmation_url: data.confirmation_url,
        already_active: data.already_active,
        message: data.message,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.message || translate(getStoredLanguage(), 'store.subscriptionFailed'),
      };
    }
  },

  syncData: async () => {
    try {
      const { data } = await api().get('/api/shops/data/sync');
      return data;
    } catch {
      return null;
    }
  },
}));

interface ChatState {
  messages: Message[];
  attachments: Attachment[];
  conversations: ConversationSummary[];
  conversationId: string | null;
  selectedModel: AIModelKey;
  sidebarOpen: boolean;
  sending: boolean;
  uploadingAttachments: boolean;
  attachmentError: string | null;
  activeAbortController: AbortController | null;
  skillsUsed: string[];
  anomalies: Anomaly[];
  tasksCreated: number;
  fetchConversations: () => Promise<void>;
  loadConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  setSelectedModel: (model: AIModelKey) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  uploadAttachments: (files: FileList | File[]) => Promise<{ success: boolean; error?: string }>;
  removeAttachment: (attachmentId: string) => Promise<void>;
  clearPendingAttachments: () => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  stopGeneration: () => void;
  updateConversationMessage: (
    conversationId: string,
    messageIndex: number,
    content: string
  ) => Promise<{ success: boolean; error?: string }>;
  regenerateFromEditedMessage: (
    conversationId: string,
    messageIndex: number,
    content: string
  ) => Promise<{ success: boolean; error?: string }>;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  attachments: [],
  conversations: [],
  conversationId: null,
  selectedModel: 'gpt-5.4',
  sidebarOpen: true,
  sending: false,
  uploadingAttachments: false,
  attachmentError: null,
  activeAbortController: null,
  skillsUsed: [],
  anomalies: [],
  tasksCreated: 0,

  fetchConversations: async () => {
    try {
      const { data } = await api().get('/api/shops/conversations');
      set({ conversations: data.conversations || [] });
    } catch {}
  },

  loadConversation: async (conversationId) => {
    try {
      const { data } = await api().get(`/api/shops/conversations/${conversationId}`);
      const messages = (data.messages || []).map((message: any, index: number) => ({
        id: createMessageId(),
        role: message.role,
        content: message.role === 'assistant' ? parseAssistantDisplayContent(message.content || '') : message.content,
        timestamp: message.timestamp || new Date().toISOString(),
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        provider: message.provider,
        model: message.model || (message.provider ? getDefaultModelForProvider(message.provider) : undefined),
        isError: message.ai_error || false,
        conversationId,
        messageIndex: index,
      }));
      const lastAssistantModel = [...messages].reverse().find((message) => message.role === 'assistant')?.model;

      set({
        conversationId: data.id,
        messages,
        selectedModel: lastAssistantModel || get().selectedModel,
      });
    } catch {}
  },

  deleteConversation: async (conversationId) => {
    try {
      await api().delete(`/api/shops/conversations/${conversationId}`);

      set((state) => {
        const remainingConversations = state.conversations.filter((conversation) => conversation.id !== conversationId);
        const isActiveConversation = state.conversationId === conversationId;

        return {
          conversations: remainingConversations,
          conversationId: isActiveConversation ? null : state.conversationId,
          messages: isActiveConversation ? [] : state.messages,
          skillsUsed: isActiveConversation ? [] : state.skillsUsed,
          anomalies: isActiveConversation ? [] : state.anomalies,
          tasksCreated: isActiveConversation ? 0 : state.tasksCreated,
        };
      });
    } catch {}
  },

  setSelectedModel: (model) => set({ selectedModel: model }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  uploadAttachments: async (files) => {
    const fileList = Array.from(files || []);
    const currentAttachments = get().attachments;

    if (fileList.length === 0) {
      return { success: false, error: translate(getStoredLanguage(), 'store.attachAtLeastOne') };
    }

    if (currentAttachments.length + fileList.length > 5) {
      return { success: false, error: translate(getStoredLanguage(), 'store.tooManyAttachments') };
    }

    set({ uploadingAttachments: true, attachmentError: null });

    try {
      const formData = new FormData();
      for (const file of fileList) {
        formData.append('files', file);
      }

      const { data } = await api().post('/api/shops/uploads', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      set((state) => ({
        attachments: [...state.attachments, ...(data.attachments || [])],
        uploadingAttachments: false,
        attachmentError: data.errors?.[0]?.message || null,
      }));

      if (data.errors?.length) {
        return {
          success: true,
          error: data.errors.map((item: any) => item.message).join(' '),
        };
      }

      return { success: true };
    } catch (err: any) {
      const error = sessionErrorMessage(
        err.response?.data?.error,
        err.response?.data?.message || translate(getStoredLanguage(), 'store.filesUploadFailed')
      );
      set({ uploadingAttachments: false, attachmentError: error });
      return { success: false, error };
    }
  },

  removeAttachment: async (attachmentId) => {
    const target = get().attachments.find((attachment) => attachment.id === attachmentId);
    set((state) => ({
      attachments: state.attachments.filter((attachment) => attachment.id !== attachmentId),
    }));

    if (!target) {
      return;
    }

    try {
      await api().delete(`/api/shops/uploads/${attachmentId}`);
    } catch {
      set((state) => ({
        attachments: [...state.attachments, target],
      }));
    }
  },

  clearPendingAttachments: async () => {
    const currentAttachments = [...get().attachments];
    set({ attachments: [], attachmentError: null });

    await Promise.allSettled(
      currentAttachments.map((attachment) => api().delete(`/api/shops/uploads/${attachment.id}`))
    );
  },

  sendMessage: async (message) => {
    const currentConversationId = get().conversationId;
    const currentMessages = get().messages;
    const currentModel = get().selectedModel;
    const pendingAttachments = [...get().attachments];
    const pendingAttachmentIds = pendingAttachments.map((attachment) => attachment.id);
    const controller = new AbortController();
    let streamedConversationId = currentConversationId;
    let assistantMessageContent = '';

    const userMsg: Message = {
      id: createMessageId(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      attachments: pendingAttachments,
      conversationId: currentConversationId,
      messageIndex: currentMessages.length,
    };

    const assistantMsg: Message = {
      id: createMessageId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      model: currentModel,
      conversationId: currentConversationId,
      messageIndex: currentMessages.length + 1,
      streaming: true,
    };

    set((state) => ({
      messages: [...state.messages, userMsg, assistantMsg],
      attachments: [],
      attachmentError: null,
      sending: true,
      activeAbortController: controller,
    }));

    try {
      await streamChatRequest({
        message,
        model: currentModel,
        conversationId: currentConversationId,
        attachmentIds: pendingAttachmentIds,
        signal: controller.signal,
        onEvent: (event, payload) => {
          if (event === 'conversation') {
            streamedConversationId = payload.conversation_id || streamedConversationId;
            set((state) => ({
              conversationId: streamedConversationId,
              messages: state.messages.map((item) =>
                item.id === userMsg.id || item.id === assistantMsg.id
                  ? { ...item, conversationId: streamedConversationId }
                  : item
              ),
            }));
            return;
          }

          if (event === 'chunk') {
            assistantMessageContent += payload.delta || '';
            set((state) => ({
              messages: state.messages.map((item) =>
                item.id === assistantMsg.id
                  ? {
                      ...item,
                      content: assistantMessageContent,
                    }
                  : item
              ),
            }));
            return;
          }

          if (event === 'done') {
            streamedConversationId = payload.conversation_id || streamedConversationId;
            set((state) => ({
              conversationId: streamedConversationId,
              messages: state.messages.map((item) =>
                item.id === assistantMsg.id
                  ? {
                      ...item,
                      content: assistantMessageContent,
                      provider: payload.provider,
                      model: payload.model || item.model,
                      isError: !!payload.ai_error,
                      streaming: false,
                      conversationId: streamedConversationId,
                    }
                  : item.id === userMsg.id
                    ? {
                        ...item,
                        conversationId: streamedConversationId,
                      }
                    : item
              ),
              skillsUsed: payload.skills_used || [],
              tasksCreated: state.tasksCreated + (payload.tasks_created || 0),
              anomalies: [],
              sending: state.activeAbortController === controller ? false : state.sending,
              activeAbortController: state.activeAbortController === controller ? null : state.activeAbortController,
            }));
          }
        },
      });
    } catch (err: any) {
      const aborted = err?.name === 'AbortError';
      const fallbackMessage = err?.message || translate(getStoredLanguage(), 'store.genericRetry');

      set((state) => ({
        conversationId: streamedConversationId,
        messages: state.messages
          .map((item) => {
            if (item.id !== assistantMsg.id) {
              return item;
            }

            if (aborted) {
              return {
                ...item,
                streaming: false,
                conversationId: streamedConversationId,
              };
            }

            return {
              ...item,
              content: assistantMessageContent || fallbackMessage,
              streaming: false,
              isError: true,
              conversationId: streamedConversationId,
            };
          })
          .filter((item) => !(aborted && item.id === assistantMsg.id && !item.content.trim())),
        attachments:
          !aborted && !streamedConversationId && !currentConversationId
            ? pendingAttachments
            : state.attachments,
        sending: state.activeAbortController === controller ? false : state.sending,
        activeAbortController: state.activeAbortController === controller ? null : state.activeAbortController,
      }));
    } finally {
      await get().fetchConversations();
    }
  },

  stopGeneration: () => {
    const controller = get().activeAbortController;
    if (controller) {
      controller.abort();
    }
  },

  updateConversationMessage: async (conversationId, messageIndex, content) => {
    try {
      await api().patch(`/api/shops/conversations/${conversationId}/messages/${messageIndex}`, {
        content,
      });

      set((state) => ({
        messages: state.messages.map((message) =>
          message.conversationId === conversationId && message.messageIndex === messageIndex
            ? { ...message, content: parseAssistantDisplayContent(content) }
            : message
        ),
      }));

      await get().fetchConversations();
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: sessionErrorMessage(err.response?.data?.error, err.response?.data?.message || 'Mesaj guncellenemedi'),
      };
    }
  },

  regenerateFromEditedMessage: async (conversationId, messageIndex, content) => {
    const current = get();
    const targetIndex = current.messages.findIndex(
      (message) => message.conversationId === conversationId && message.messageIndex === messageIndex
    );
    const targetMessage = current.messages[targetIndex];

    if (targetIndex === -1 || !targetMessage || targetMessage.role !== 'user') {
      return { success: false, error: 'Bu mesaj su anda duzenlenemiyor.' };
    }

    if (current.activeAbortController) {
      current.activeAbortController.abort();
    }

    const controller = new AbortController();
    const currentModel = current.selectedModel;
    let assistantMessageContent = '';

    const trimmedMessages = current.messages.slice(0, targetIndex + 1).map((message, index) =>
      index === targetIndex
        ? {
            ...message,
            content,
            messageIndex,
            streaming: false,
          }
        : {
            ...message,
            messageIndex: index,
            streaming: false,
          }
    );

    const assistantMsg: Message = {
      id: createMessageId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      model: currentModel,
      conversationId,
      messageIndex: messageIndex + 1,
      streaming: true,
    };

    set({
      messages: [...trimmedMessages, assistantMsg],
      conversationId,
      sending: true,
      activeAbortController: controller,
      skillsUsed: [],
      anomalies: [],
    });

    try {
      await streamChatRequest({
        message: content,
        model: currentModel,
        conversationId,
        regenerateFromMessageIndex: messageIndex,
        signal: controller.signal,
        onEvent: (event, payload) => {
          if (event === 'conversation') {
            set((state) => ({
              conversationId: payload.conversation_id || state.conversationId,
              messages: state.messages.map((item) =>
                item.id === assistantMsg.id ? { ...item, conversationId: payload.conversation_id || conversationId } : item
              ),
            }));
            return;
          }

          if (event === 'chunk') {
            assistantMessageContent += payload.delta || '';
            set((state) => ({
              messages: state.messages.map((item) =>
                item.id === assistantMsg.id ? { ...item, content: assistantMessageContent } : item
              ),
            }));
            return;
          }

          if (event === 'done') {
            set((state) => ({
              conversationId: payload.conversation_id || conversationId,
              messages: state.messages.map((item) =>
                item.id === assistantMsg.id
                  ? {
                      ...item,
                      content: assistantMessageContent,
                      provider: payload.provider,
                      model: payload.model || item.model,
                      isError: !!payload.ai_error,
                      streaming: false,
                      conversationId: payload.conversation_id || conversationId,
                    }
                  : item
              ),
              skillsUsed: payload.skills_used || [],
              tasksCreated: state.tasksCreated + (payload.tasks_created || 0),
              anomalies: [],
              sending: state.activeAbortController === controller ? false : state.sending,
              activeAbortController: state.activeAbortController === controller ? null : state.activeAbortController,
            }));
          }
        },
      });

      await get().fetchConversations();
      return { success: true };
    } catch (err: any) {
      const aborted = err?.name === 'AbortError';
      const fallbackMessage = err?.message || translate(getStoredLanguage(), 'store.genericRetry');

      set((state) => ({
        messages: state.messages
          .map((item) => {
            if (item.id !== assistantMsg.id) {
              return item;
            }

            if (aborted) {
              return {
                ...item,
                streaming: false,
                conversationId,
              };
            }

            return {
              ...item,
              content: assistantMessageContent || fallbackMessage,
              streaming: false,
              isError: true,
              conversationId,
            };
          })
          .filter((item) => !(aborted && item.id === assistantMsg.id && !item.content.trim())),
        sending: state.activeAbortController === controller ? false : state.sending,
        activeAbortController: state.activeAbortController === controller ? null : state.activeAbortController,
      }));

      await get().fetchConversations();

      if (aborted) {
        return { success: true };
      }

      return {
        success: false,
        error: sessionErrorMessage(err.response?.data?.error, err.response?.data?.message || 'Mesaj guncellenemedi'),
      };
    }
  },

  clearChat: () =>
    {
      const pendingAttachments = [...get().attachments];
      set({
        messages: [],
        attachments: [],
        conversationId: null,
        activeAbortController: null,
        skillsUsed: [],
        anomalies: [],
        tasksCreated: 0,
      });

      Promise.allSettled(
        pendingAttachments.map((attachment) => api().delete(`/api/shops/uploads/${attachment.id}`))
      ).catch(() => {});
    },
}));

interface TaskState {
  tasks: Task[];
  loading: boolean;
  fetchTasks: (status?: string) => Promise<void>;
  updateTaskStatus: (taskId: string, status: string) => Promise<void>;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  loading: false,

  fetchTasks: async (status = 'all') => {
    set({ loading: true });
    try {
      const { data } = await api().get('/api/shops/tasks', { params: { status, limit: 50 } });
      set({ tasks: data.tasks, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  updateTaskStatus: async (taskId, status) => {
    try {
      await api().patch(`/api/shops/tasks/${taskId}`, { status });
      const { data } = await api().get('/api/shops/tasks', { params: { status: 'all', limit: 50 } });
      set({ tasks: data.tasks });
    } catch {}
  },
}));
