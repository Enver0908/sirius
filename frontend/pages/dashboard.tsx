import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useRouter } from 'next/router';
import { useChatStore, useShopStore, type Attachment } from '../store/index';
import { useI18n, SUPPORTED_LANGUAGES } from '../lib/i18n';
import {
  AI_MODELS,
  PROVIDERS,
  getDefaultModelForProvider,
  getModelDefinition,
  getModelLabel,
  getProviderForModel,
  type AIModelKey,
  type ProviderKey,
} from '../lib/providers';

function navigateToExternalUrl(url: string) {
  if (typeof window !== 'undefined') {
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.assign(url);
        return;
      }
    } catch (error) {
      console.warn('Top-level redirect failed, falling back to _top navigation', error);
    }

    window.open(url, '_top');
  }
}

function embeddedAdminUrl(shopDomain: string) {
  const shopName = shopDomain.replace('.myshopify.com', '');
  const handle = process.env.NEXT_PUBLIC_SHOPIFY_APP_HANDLE || 'sirius-store-assistant';
  return `https://admin.shopify.com/store/${shopName}/apps/${handle}/dashboard`;
}

const COMPOSER_MAX_TEXTAREA_HEIGHT = 240;

function SettingsButtonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .9 1.7 1.7 0 0 1-3.2 0 1.7 1.7 0 0 0-1-.9 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.9-1 1.7 1.7 0 0 1 0-3.2 1.7 1.7 0 0 0 .9-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.9 1.7 1.7 0 0 1 3.2 0 1.7 1.7 0 0 0 1 .9 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .39.35.78.9 1a1.7 1.7 0 0 1 0 3.2c-.55.22-.9.61-.9 1Z" />
    </svg>
  );
}

function SettingsMenuIcon() {
  return <SettingsButtonIcon />;
}

function RefreshMenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function LanguageMenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 8h14" />
      <path d="M4 12h10" />
      <path d="M6 16h6" />
      <path d="M16 16s1.5-2 2.5-4 1.5-4 1.5-4" />
      <path d="M14 20s1.3-.7 2.8-2.2S20 14 20 14" />
    </svg>
  );
}

export default function DashboardPage() {
  const { t, locale, setLocale } = useI18n();
  const [input, setInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [billingFlash, setBillingFlash] = useState<string | null>(null);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<ProviderKey | null>(null);
  const [embeddedRecoveryUrl, setEmbeddedRecoveryUrl] = useState<string | null>(null);
  const [providerInputs, setProviderInputs] = useState<Record<ProviderKey, string>>({
    claude: '',
    chatgpt: '',
    gemini: '',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const { shop, errorCode, fetchShop, fetchStatus, syncData, saveAIKey, selectAIModel } = useShopStore();
  const {
    messages,
    attachments,
    sending,
    uploadingAttachments,
    attachmentError,
    conversations,
    conversationId,
    selectedModel,
    sidebarOpen,
    uploadAttachments,
    removeAttachment,
    sendMessage,
    clearChat,
    fetchConversations,
    loadConversation,
    deleteConversation,
    setSelectedModel,
    toggleSidebar,
    stopGeneration,
    regenerateFromEditedMessage,
  } = useChatStore();

  useEffect(() => {
    fetchShop();
    fetchStatus();
    fetchConversations();
  }, []);

  useEffect(() => {
    if (shop?.selected_model) {
      setSelectedModel(shop.selected_model);
    }
  }, [shop?.selected_model, setSelectedModel]);

  useEffect(() => {
    if (!router.isReady) return;

    const billing = router.query.billing;
    let flashMessage: string | null = null;

    if (billing === 'success') {
      flashMessage = t('dashboard.planChanged');
    } else if (billing === 'declined') {
      flashMessage = t('dashboard.planDeclined');
    } else if (billing === 'error') {
      flashMessage = t('dashboard.billingError');
    }

    setBillingFlash(flashMessage);

    if (billing) {
      const nextQuery = { ...router.query };
      delete nextQuery.billing;
      router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
    }
  }, [router.isReady, router.query.billing]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    if (!shop) return;
    if (!shop.has_ai_key) {
      router.replace('/setup');
    }
  }, [router, shop]);

  useEffect(() => {
    if (!router.isReady) return;
    const shopQuery = typeof router.query.shop === 'string' ? router.query.shop : '';

    if (errorCode === 'shop_not_found' && shopQuery) {
      navigateToExternalUrl(`/api/auth/shopify/install?shop=${encodeURIComponent(shopQuery)}`);
    }

    if (errorCode === 'missing_token' || errorCode === 'invalid_token') {
      const lastShopDomain =
        typeof window !== 'undefined' ? window.localStorage.getItem('sirius:last_shop_domain') : null;
      setEmbeddedRecoveryUrl(lastShopDomain ? embeddedAdminUrl(lastShopDomain) : null);
      setBillingFlash(
        lastShopDomain
          ? t('dashboard.missingSession')
          : t('dashboard.missingSessionDirect')
      );
    }
  }, [errorCode, router.isReady, router.query.shop, t]);

  useEffect(() => {
    setModelMenuOpen(false);
  }, [selectedModel, messages.length]);

  useEffect(() => {
    if (!editingMessageId) return;
    const stillExists = messages.some((message) => message.id === editingMessageId);
    if (!stillExists) {
      setEditingMessageId(null);
      setEditingDraft('');
    }
  }, [editingMessageId, messages]);

  useEffect(() => {
    if (sending && editingMessageId) {
      setEditingMessageId(null);
      setEditingDraft('');
    }
  }, [editingMessageId, sending]);
  const activeModel = getModelDefinition(selectedModel) || AI_MODELS[0];
  const activeProviderKey = getProviderForModel(activeModel.key);
  const selectedProviderHasKey = shop?.provider_statuses?.[activeProviderKey]?.has_api_key ?? false;

  useEffect(() => {
    if (!settingsMenuOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (settingsMenuRef.current?.contains(target) || settingsButtonRef.current?.contains(target)) {
        return;
      }

      setSettingsMenuOpen(false);
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [settingsMenuOpen]);

  const handleSend = async () => {
    if (sending || !selectedProviderHasKey) return;
    const msg = input.trim() || (attachments.length > 0 ? t('common.attachmentOnlyPrompt') : '');
    if (!msg) return;
    setInput('');
    await sendMessage(msg);
    inputRef.current?.focus();
  };

  const handleStop = () => {
    stopGeneration();
    inputRef.current?.focus();
  };

  const handleAttachmentSelect = async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    await uploadAttachments(files);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    await syncData();
    await fetchStatus();
    setSyncing(false);
  };

  const handleModelSelect = async (model: AIModelKey) => {
    if (model === selectedModel) {
      setModelMenuOpen(false);
      return;
    }

    setSelectedModel(model);
    await selectAIModel(model);
    await fetchShop();
    setModelMenuOpen(false);
  };

  const handleEditStart = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingDraft(content);
  };

  const handleEditCancel = () => {
    setEditingMessageId(null);
    setEditingDraft('');
  };

  const handleEditKeyDown = async (
    event: KeyboardEvent<HTMLTextAreaElement>,
    message: (typeof messages)[number]
  ) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await handleEditSave(message);
    }
  };

  const handleEditSave = async (message: (typeof messages)[number]) => {
    if (!message.conversationId || message.messageIndex === undefined) {
      setBillingFlash(t('dashboard.invalidEdit'));
      return;
    }

    const nextContent = editingDraft.trim();
    if (!nextContent) {
      setBillingFlash(t('dashboard.emptyMessage'));
      return;
    }

    if (sending) {
      stopGeneration();
    }

    setSavingEditId(message.id);
    setEditingMessageId(null);
    setEditingDraft('');
    const result = await regenerateFromEditedMessage(message.conversationId, message.messageIndex, nextContent);
    setSavingEditId(null);

    if (!result.success) {
      setBillingFlash(result.error || t('dashboard.updateFailed'));
      return;
    }
  };

  const handleCopyMessage = async (messageId: string, content: string) => {
    const text = content.trim();
    if (!text) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const tempTextarea = document.createElement('textarea');
        tempTextarea.value = text;
        tempTextarea.style.position = 'fixed';
        tempTextarea.style.opacity = '0';
        document.body.appendChild(tempTextarea);
        tempTextarea.focus();
        tempTextarea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextarea);
      }

      setCopiedMessageId(messageId);
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current));
      }, 1400);
    } catch {
      setBillingFlash(t('dashboard.copyFailed'));
    }
  };

  const handleProviderInputChange = (provider: ProviderKey, value: string) => {
    setProviderInputs((current) => ({
      ...current,
      [provider]: value,
    }));
  };

  const handleSaveProvider = async (provider: ProviderKey) => {
    if (!providerInputs[provider].trim()) {
      const providerLabel = PROVIDERS.find((item) => item.key === provider)?.label || 'Bu saglayici';
      setBillingFlash(t('dashboard.saveProviderKey', { provider: providerLabel }));
      return;
    }

    setSavingProvider(provider);
    const result = await saveAIKey(provider, providerInputs[provider].trim());
    setSavingProvider(null);

    if (!result.success) {
      setBillingFlash(result.error || t('setup.apiKeySaveFailed'));
      return;
    }

    setProviderInputs((current) => ({ ...current, [provider]: '' }));
    const nextModel = getDefaultModelForProvider(provider);
    setSelectedModel(nextModel);
    await selectAIModel(nextModel);
    await fetchShop();
    setBillingFlash(t('dashboard.providerSaved', { model: getModelLabel(nextModel) }));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#05070c] text-white">
      <aside
        className={`${
          sidebarOpen ? 'w-[204px] px-2 py-3' : 'w-0 px-0 py-0'
        } border-r border-white/[0.05] bg-[#17191f] transition-all duration-300 overflow-hidden flex flex-col shrink-0`}
      >
        <div className="px-2 pb-3">
          <div className="text-[14px] font-semibold tracking-tight text-white">Sirius</div>
          <div className="mt-0.5 truncate text-[11px] text-white/30">{shop?.shopify_domain || t('common.storeLabel')}</div>
        </div>

        <button
          onClick={clearChat}
          className="mx-1 rounded-lg bg-[#101c3a] px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#13244a]"
        >
          + {t('common.newChat')}
        </button>

        <div className="history-scroll mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="mb-2 px-2 text-[10px] uppercase tracking-[0.18em] text-white/[0.18]">{t('common.history')}</div>

          <div className="space-y-0.5">
            {conversations.length === 0 ? (
              <div className="px-2 py-2 text-xs leading-5 text-white/30">
                {t('common.noConversations')}
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group rounded-md px-2 py-1.5 transition-colors ${
                    conversationId === conversation.id
                      ? 'bg-white/[0.075]'
                      : 'hover:bg-white/[0.045]'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => loadConversation(conversation.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-[13px] leading-6 text-white/82">{conversation.title}</div>
                    </button>

                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteConversation(conversation.id);
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/0 transition-all hover:bg-white/[0.06] hover:text-white/75 group-hover:text-white/35"
                      aria-label={t('common.deleteConversation')}
                      title={t('common.deleteConversation')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="relative mt-4 border-t border-white/[0.06] pt-4">
          {settingsMenuOpen && (
            <div
              ref={settingsMenuRef}
              className="absolute bottom-[calc(100%+12px)] left-0 right-0 mx-1 rounded-[22px] border border-white/[0.08] bg-[#f4f4f6] p-2 text-[#22252d] shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
            >
              <button
                onClick={() => {
                  setProviderModalOpen(true);
                  setSettingsMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] transition-colors hover:bg-black/[0.04]"
              >
                <SettingsMenuIcon />
                <span>{t('common.apiKeys')}</span>
              </button>

              <button
                onClick={async () => {
                  setSettingsMenuOpen(false);
                  await handleSync();
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] transition-colors hover:bg-black/[0.04]"
              >
                <RefreshMenuIcon />
                <span>{syncing ? t('common.sync') : t('common.refreshData')}</span>
              </button>

              <button
                onClick={() => {
                  setLanguageModalOpen(true);
                  setSettingsMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] transition-colors hover:bg-black/[0.04]"
              >
                <LanguageMenuIcon />
                <span className="min-w-0 flex-1">{t('app.language')}</span>
              </button>
            </div>
          )}

          <button
            ref={settingsButtonRef}
            onClick={() => setSettingsMenuOpen((current) => !current)}
            className="mx-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] text-white/78 transition-colors hover:bg-white/[0.05]"
          >
            <SettingsButtonIcon />
            <span>{t('common.settings')}</span>
          </button>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(25,42,86,0.24),transparent_32%),linear-gradient(180deg,#05070c_0%,#070a10_100%)]">
        {billingFlash && (
          <div className="px-5 pt-4">
            <div className="rounded-xl border border-sky-400/30 bg-sky-400/12 px-4 py-3 text-sm text-sky-50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">{t('common.status')}</div>
                  <div className="mt-1 text-sky-50/82">{billingFlash}</div>
                  {embeddedRecoveryUrl && (
                    <button
                      onClick={() => navigateToExternalUrl(embeddedRecoveryUrl)}
                      className="mt-3 rounded-lg bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-200"
                    >
                      {t('common.openInShopifyAdmin')}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    setBillingFlash(null);
                    setEmbeddedRecoveryUrl(null);
                  }}
                  className="rounded-lg px-2 text-lg leading-6 text-sky-50/60 hover:bg-white/10 hover:text-white"
                  aria-label={t('common.close')}
                >
                  x
                </button>
              </div>
            </div>
          </div>
        )}

        <header className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] text-white/75 hover:bg-white/[0.05]"
              aria-label={t('common.sidebarToggle')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h6v6H4z" />
                <path d="M14 4h6v6h-6z" />
                <path d="M4 14h6v6H4z" />
                <path d="M14 14h6v6h-6z" />
              </svg>
            </button>

            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-white">Sirius</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/tasks')}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs font-medium text-white/75 hover:bg-white/[0.05]"
            >
              {t('common.tasks')}
            </button>
          </div>
        </header>

        <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-6">
          {messages.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center">
              <div className="w-full max-w-4xl text-center">
                <h2 className="mx-auto max-w-3xl text-[2rem] font-semibold tracking-tight text-white md:text-[2.75rem]">
                  {t('common.welcomePrompt')}
                </h2>

                <div className="mx-auto mt-8 w-full max-w-2xl">
                  <Composer
                    activeProvider={activeModel}
                    selectedModel={selectedModel}
                    selectedProviderHasKey={selectedProviderHasKey}
                    modelMenuOpen={modelMenuOpen}
                    sending={sending}
                    uploadingAttachments={uploadingAttachments}
                    input={input}
                    attachments={attachments}
                    attachmentError={attachmentError}
                    inputRef={inputRef}
                    onInputChange={setInput}
                    onKeyDown={handleKeyDown}
                    onSend={handleSend}
                    onStop={handleStop}
                    onAttachmentSelect={handleAttachmentSelect}
                    onAttachmentRemove={removeAttachment}
                    onToggleModelMenu={() => setModelMenuOpen((current) => !current)}
                    onRequestCloseModelMenu={() => setModelMenuOpen(false)}
                    onModelSelect={handleModelSelect}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-4xl space-y-5">
              {messages.map((msg) => {
                const isUserEditMode = msg.role === 'user' && editingMessageId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={`group/message flex ${
                      isUserEditMode ? 'w-full justify-stretch' : msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                  {msg.isError ? (
                    <div className="max-w-2xl rounded-2xl border border-red-500/35 bg-red-500/10 px-5 py-4 text-red-50">
                      <div className="text-sm font-semibold">{t('common.modelWarning')}</div>
                      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-red-50/85">
                        {msg.content || t('common.modelRequestFailed')}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`flex flex-col ${
                        isUserEditMode
                          ? 'w-full max-w-none items-stretch'
                          : msg.role === 'user'
                            ? 'max-w-2xl items-end'
                            : 'max-w-2xl items-start'
                      }`}
                    >
                      <div
                        className={`relative w-full px-1 py-1 text-white/88 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                      >
                        {msg.role !== 'user' && (
                          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/32">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-[11px] font-semibold text-white/78">
                              {msg.model ? getModelLabel(msg.model).slice(0, 1) : 'S'}
                            </span>
                            <span>{msg.model ? getModelLabel(msg.model) : 'Sirius'}</span>
                          </div>
                        )}

                        {editingMessageId === msg.id ? (
                          <div className="space-y-3">
                            <textarea
                              value={editingDraft}
                              onChange={(event) => setEditingDraft(event.target.value)}
                              onKeyDown={(event) => void handleEditKeyDown(event, msg)}
                              rows={Math.max(6, editingDraft.split('\n').length)}
                              className="min-h-[180px] w-full resize-y overflow-y-auto rounded-[28px] border border-white/[0.08] bg-[#e8e8e8] px-6 py-5 text-lg leading-8 text-black outline-none transition-colors focus:border-cyan-400/45"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={handleEditCancel}
                                disabled={savingEditId === msg.id}
                                className="rounded-xl border border-white/[0.08] px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.05] disabled:opacity-50"
                              >
                                {t('common.cancel')}
                              </button>
                              <button
                                onClick={() => handleEditSave(msg)}
                                disabled={savingEditId === msg.id || !editingDraft.trim()}
                                className="rounded-xl bg-[#101c3a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#13244a] disabled:opacity-40"
                              >
                                {savingEditId === msg.id ? t('common.saving') : t('common.save')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.streaming && !msg.content ? (
                              <div className="flex items-center gap-2 text-sm text-white/45">
                                <span className="inline-flex gap-1">
                                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/30" style={{ animationDelay: '0s' }} />
                                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/30" style={{ animationDelay: '0.15s' }} />
                                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/30" style={{ animationDelay: '0.3s' }} />
                                </span>
                                {t('common.preparingAnalysis')}
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap break-words text-sm leading-7">{msg.content}</div>
                            )}

                            {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                              <div className={`mt-3 flex flex-wrap gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.attachments.map((attachment) => (
                                  <div
                                    key={attachment.id}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/72"
                                  >
                                    <span className="font-medium text-white/84">{attachment.original_name}</span>
                                    <span className="text-white/35">{attachment.size_label}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {editingMessageId !== msg.id && !msg.streaming && (
                        <div
                          className={`mt-2 flex items-center gap-1 px-1 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 ${
                            msg.role === 'user' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <button
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/48 transition-colors hover:bg-white/[0.06] hover:text-white"
                            aria-label={t('common.copyMessage')}
                            title={copiedMessageId === msg.id ? t('common.copied') : t('common.copyMessage')}
                          >
                            {copiedMessageId === msg.id ? (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="m5 13 4 4L19 7" />
                              </svg>
                            ) : (
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            )}
                          </button>

                          {msg.role === 'user' && msg.conversationId && msg.messageIndex !== undefined && (
                            <button
                              onClick={() => handleEditStart(msg.id, msg.content)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/48 transition-colors hover:bg-white/[0.06] hover:text-white"
                              aria-label={t('common.editMessage')}
                              title={t('common.editMessage')}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {messages.length > 0 && (
          <div className="bg-[#090c12]/95 px-5 py-4 backdrop-blur">
            <div className="mx-auto w-full max-w-4xl">
              <Composer
                activeProvider={activeModel}
                selectedModel={selectedModel}
                selectedProviderHasKey={selectedProviderHasKey}
                modelMenuOpen={modelMenuOpen}
                sending={sending}
                uploadingAttachments={uploadingAttachments}
                input={input}
                attachments={attachments}
                attachmentError={attachmentError}
                inputRef={inputRef}
                onInputChange={setInput}
                onKeyDown={handleKeyDown}
                onSend={handleSend}
                onStop={handleStop}
                onAttachmentSelect={handleAttachmentSelect}
                onAttachmentRemove={removeAttachment}
                onToggleModelMenu={() => setModelMenuOpen((current) => !current)}
                onRequestCloseModelMenu={() => setModelMenuOpen(false)}
                onModelSelect={handleModelSelect}
              />
            </div>
          </div>
        )}
      </main>

      {providerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-3xl rounded-3xl border border-white/[0.08] bg-[#0d121b] p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t('common.providerKeys')}</h2>
                <p className="text-sm text-white/40">{t('common.providerKeysDescription')}</p>
              </div>
              <button
                onClick={() => setProviderModalOpen(false)}
                className="rounded-xl border border-white/[0.08] px-3 py-2 text-sm text-white/60 hover:bg-white/[0.05]"
              >
                {t('common.close')}
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {PROVIDERS.map((provider) => {
                const hasKey = shop?.provider_statuses?.[provider.key]?.has_api_key;
                return (
                  <div key={provider.key} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] font-bold">
                        {provider.icon}
                      </div>
                      <div>
                        <div className="font-semibold">{provider.label}</div>
                        <div className="text-xs text-white/35">{provider.company}</div>
                      </div>
                    </div>

                    <div className={`mb-3 text-xs ${hasKey ? 'text-emerald-300/80' : 'text-white/35'}`}>
                      {hasKey ? t('common.apiKeyConnected') : t('common.apiKeyMissing')}
                    </div>

                    <input
                      type="password"
                      value={providerInputs[provider.key]}
                      onChange={(event) => handleProviderInputChange(provider.key, event.target.value)}
                      placeholder={t('common.providerPlaceholder', { provider: provider.label })}
                      className="w-full rounded-xl border border-white/[0.08] bg-[#0a0e16] px-3 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-cyan-400/40"
                    />

                    <button
                      onClick={() => handleSaveProvider(provider.key)}
                      disabled={savingProvider === provider.key}
                      className="mt-3 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-700 px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {savingProvider === provider.key ? t('common.saving') : t('common.connectProvider', { provider: provider.label })}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {languageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-md rounded-[32px] border border-white/[0.08] bg-[#0d121b] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t('app.language')}</h2>
                <p className="text-sm text-white/40">{t('common.settings')}</p>
              </div>
              <button
                onClick={() => setLanguageModalOpen(false)}
                className="rounded-2xl border border-white/[0.08] px-3 py-2 text-sm text-white/60 hover:bg-white/[0.05]"
              >
                {t('common.close')}
              </button>
            </div>

            <div className="space-y-2">
              {SUPPORTED_LANGUAGES.map((language) => {
                const isActive = locale === language.code;
                return (
                  <button
                    key={language.code}
                    onClick={() => {
                      setLocale(language.code);
                      setLanguageModalOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-3xl border px-4 py-3 text-left text-[15px] transition-colors ${
                      isActive
                        ? 'border-cyan-400/40 bg-cyan-400/10 text-white'
                        : 'border-white/[0.06] bg-white/[0.02] text-white/82 hover:bg-white/[0.05]'
                    }`}
                  >
                    <span>{language.label}</span>
                    {isActive && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ComposerProps = {
  activeProvider: (typeof AI_MODELS)[number];
  selectedModel: AIModelKey;
  selectedProviderHasKey: boolean;
  modelMenuOpen: boolean;
  sending: boolean;
  uploadingAttachments: boolean;
  input: string;
  attachments: Attachment[];
  attachmentError: string | null;
  inputRef: RefObject<HTMLTextAreaElement>;
  onInputChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onSend: () => void;
  onStop: () => void;
  onAttachmentSelect: (files: FileList | null) => void;
  onAttachmentRemove: (attachmentId: string) => void | Promise<void>;
  onToggleModelMenu: () => void;
  onRequestCloseModelMenu: () => void;
  onModelSelect: (model: AIModelKey) => void;
};

function Composer({
  activeProvider,
  selectedModel,
  selectedProviderHasKey,
  modelMenuOpen,
  sending,
  uploadingAttachments,
  input,
  attachments,
  attachmentError,
  inputRef,
  onInputChange,
  onKeyDown,
  onSend,
  onStop,
  onAttachmentSelect,
  onAttachmentRemove,
  onToggleModelMenu,
  onRequestCloseModelMenu,
  onModelSelect,
}: ComposerProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    const viewportBound =
      typeof window === 'undefined' ? COMPOSER_MAX_TEXTAREA_HEIGHT : Math.floor(window.innerHeight * 0.26);
    const maxTextareaHeight = Math.min(COMPOSER_MAX_TEXTAREA_HEIGHT, viewportBound);
    const nextHeight = Math.min(textarea.scrollHeight, maxTextareaHeight);
    textarea.style.height = `${Math.max(nextHeight, 28)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxTextareaHeight ? 'auto' : 'hidden';
  }, [input, inputRef]);

  useEffect(() => {
    if (!modelMenuOpen) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target) || modelButtonRef.current?.contains(target)) {
        return;
      }

      onRequestCloseModelMenu();
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onRequestCloseModelMenu();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [modelMenuOpen, onRequestCloseModelMenu]);

  return (
    <div className="relative">
      {modelMenuOpen && (
        <div
          ref={menuRef}
          className="absolute bottom-[calc(100%+8px)] right-[120px] z-20 w-[240px] max-h-[230px] overflow-y-auto rounded-[24px] border border-white/[0.08] bg-[#15171d] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.42)]"
        >
          {AI_MODELS.map((model) => (
            <button
              key={model.key}
              onClick={() => onModelSelect(model.key)}
              className={`flex w-full items-center justify-between rounded-[18px] px-4 py-2.5 text-left text-[15px] transition-colors ${
                selectedModel === model.key ? 'bg-white/[0.06] text-white ring-1 ring-blue-400/50' : 'text-white/82 hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span>{model.label}</span>
                {model.badge && <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-xs text-white/70">{model.badge}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-[28px] border border-white/[0.10] bg-[#1a1c22] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.32)]">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.pdf,.csv,.docx,.txt,.zip"
          className="hidden"
          onChange={(event) => {
            onAttachmentSelect(event.target.files);
            event.currentTarget.value = '';
          }}
        />

        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <button
                key={attachment.id}
                onClick={() => onAttachmentRemove(attachment.id)}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-left text-xs text-white/78 transition-colors hover:bg-white/[0.08]"
                title={t('common.removeAttachment')}
              >
                <span className="truncate">{attachment.original_name}</span>
                <span className="text-white/38">{attachment.size_label}</span>
                <span className="text-white/55">x</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex min-h-[96px] flex-col">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={4000}
            disabled={sending || !selectedProviderHasKey}
            placeholder={
              selectedProviderHasKey
                ? t('common.askAboutStore')
                : t('common.connectApiFirst', { provider: activeProvider.label })
            }
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onKeyDown}
            className="composer-textarea max-h-[240px] min-h-[28px] w-full resize-none overflow-y-hidden bg-transparent py-1 pr-2 text-base leading-7 text-white placeholder-white/28 outline-none"
          />

          <div className="mt-4 flex shrink-0 items-center justify-between gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || uploadingAttachments}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-white/78 transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-45"
              aria-label={t('common.addFile')}
              title={t('common.addFile')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05 12.25 20.24a6 6 0 1 1-8.49-8.49l9.2-9.19a4 4 0 1 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.48-8.48" />
              </svg>
            </button>

            <div className="flex shrink-0 items-center gap-2">
              <button
                ref={modelButtonRef}
                onClick={onToggleModelMenu}
                className="flex h-[30px] items-center gap-2 rounded-full bg-[#3a3b45] px-4 text-base text-white transition-colors hover:bg-[#474954]"
              >
                <span>{activeProvider.label}</span>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 7.5L10 12.5L15 7.5" />
                </svg>
              </button>

              <button
                onClick={sending ? onStop : onSend}
                disabled={sending ? false : (!input.trim() && attachments.length === 0) || !selectedProviderHasKey || uploadingAttachments}
                className={`h-[30px] rounded-2xl px-6 text-base font-semibold text-white transition-colors disabled:cursor-not-allowed ${
                  sending
                    ? 'bg-[#6f1822] hover:bg-[#841d29]'
                    : 'bg-[#101c3a] hover:bg-[#13244a] disabled:opacity-35'
                }`}
              >
                {sending ? t('common.stop') : uploadingAttachments ? '...' : t('common.send')}
              </button>
            </div>
          </div>
        </div>

        {attachmentError && <div className="mt-3 text-xs text-amber-200/80">{attachmentError}</div>}
      </div>
    </div>
  );
}
