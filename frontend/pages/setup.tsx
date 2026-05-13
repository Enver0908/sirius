import { useState } from 'react';
import { useRouter } from 'next/router';
import { useShopStore } from '../store/index';
import { getPlans } from '../lib/plans';
import { useI18n } from '../lib/i18n';
import { AI_MODELS, getProviderForModel, type AIModelKey } from '../lib/providers';

function navigateToExternalUrl(url: string) {
  if (typeof window !== 'undefined') {
    if (window.top && window.top !== window.self) {
      window.top.location.href = url;
    } else {
      window.location.href = url;
    }
  }
}

export default function SetupPage() {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState<'sirius'>('sirius');
  const [selectedModel, setSelectedModel] = useState<AIModelKey>('gpt-5.4');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { saveAIKey, selectAIModel, subscribePlan } = useShopStore();
  const plans = getPlans(t);

  const handleFinish = async () => {
    if (!selectedModel) {
      setError(t('setup.selectModelError'));
      return;
    }

    if (!apiKey.trim() || apiKey.trim().length < 10) {
      setError(t('setup.invalidApiKey'));
      return;
    }

    setSaving(true);
    setError('');

    const keyResult = await saveAIKey(getProviderForModel(selectedModel), apiKey.trim());
    if (!keyResult.success) {
      setSaving(false);
      setError(keyResult.error || t('setup.apiKeySaveFailed'));
      return;
    }

    const modelResult = await selectAIModel(selectedModel);
    if (!modelResult.success) {
      setSaving(false);
      setError(modelResult.error || t('setup.modelSaveFailed'));
      return;
    }

    const billingResult = await subscribePlan(selectedPlan);
    setSaving(false);

    if (billingResult.success && billingResult.confirmation_url) {
      navigateToExternalUrl(billingResult.confirmation_url);
      return;
    }

    if (billingResult.success) {
      router.push('/dashboard');
      return;
    }

    setError(billingResult.error || t('setup.billingFailed'));
  };

  return (
    <div className="min-h-screen bg-[#090b12] flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-700 flex items-center justify-center text-lg font-extrabold text-white">
            S
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">
            Sirius
          </span>
        </div>

        <div className="flex items-center justify-center gap-3 mb-10">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold ${step === 1 ? 'bg-cyan-400/15 text-cyan-300' : 'bg-white/[0.03] text-white/30'}`}>
            <span className="w-5 h-5 rounded-full bg-cyan-400/20 flex items-center justify-center text-[10px]">1</span>
            {t('setup.stepPlan')}
          </div>
          <div className="w-8 h-px bg-white/10" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold ${step === 2 ? 'bg-cyan-400/15 text-cyan-300' : 'bg-white/[0.03] text-white/30'}`}>
            <span className="w-5 h-5 rounded-full bg-cyan-400/20 flex items-center justify-center text-[10px]">2</span>
            {t('setup.stepModel')}
          </div>
        </div>

        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold text-white text-center mb-6">{t('setup.activatePlan')}</h2>
            <div className="grid grid-cols-1 gap-4 mb-8">
              {plans.map((plan) => (
                <button
                  key={plan.key}
                  onClick={() => setSelectedPlan(plan.key)}
                  className={`relative text-left p-6 rounded-2xl border transition-all ${
                    selectedPlan === plan.key
                      ? 'border-cyan-400/50 bg-cyan-400/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
                  }`}
                >
                  {plan.recommended && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-cyan-500 to-blue-700 text-white uppercase tracking-wider">
                      {t('setup.recommended')}
                    </span>
                  )}
                  <h3 className="text-base font-bold text-white mb-1">{plan.name}</h3>
                  <div className="text-2xl font-extrabold text-white mb-1">
                    {plan.price}
                    <span className="text-sm font-normal text-white/30">{t('setup.perMonth')}</span>
                  </div>
                  <p className="text-xs text-white/40 mb-4">{plan.desc}</p>

                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="text-xs text-white/60 flex items-center gap-2">
                        <span className="text-emerald-400">+</span> {feature}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-700 text-white font-semibold text-sm hover:-translate-y-0.5 transition-all"
            >
              {t('setup.continue')}
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold text-white text-center mb-2">{t('setup.connectModel')}</h2>
            <p className="text-xs text-white/40 text-center mb-6">
              {t('setup.supportedModels')}
            </p>

            <div className="grid gap-3 mb-6 md:grid-cols-2 xl:grid-cols-3">
              {AI_MODELS.map((model) => (
                <button
                  key={model.key}
                  onClick={() => setSelectedModel(model.key)}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    selectedModel === model.key
                      ? 'border-cyan-400/50 bg-cyan-400/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl bg-white/[0.08] flex items-center justify-center text-sm font-bold mb-3">
                    {model.icon}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-white">{model.label}</div>
                    {model.badge && (
                      <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-white/70">
                        {model.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-white/25 mb-1">{model.company}</div>
                  <div className="text-[11px] text-white/40">{model.desc}</div>
                </button>
              ))}
            </div>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-white/50 mb-2 uppercase tracking-wider">{t('setup.apiKey')}</label>
              <input
                type="password"
                placeholder={`${AI_MODELS.find((model) => model.key === selectedModel)?.company} ${t('setup.apiKey')}`}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm font-mono placeholder-white/15 outline-none focus:border-cyan-400/50 transition-colors"
              />
            </div>

            {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3.5 rounded-xl border border-white/[0.08] text-white/50 text-sm font-medium hover:bg-white/[0.03] transition-all"
              >
                {t('common.back')}
              </button>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-700 text-white font-semibold text-sm disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('setup.finish')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
