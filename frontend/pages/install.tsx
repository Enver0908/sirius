import { useI18n } from '../lib/i18n';

export default function InstallPage() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a14] p-6">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xl font-extrabold text-white">
            S
          </div>
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-2xl font-bold text-transparent">
            Sirius
          </span>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
          <h1 className="mb-2 text-center text-xl font-bold text-white">{t('common.welcome')}</h1>
          <p className="mb-6 text-center text-sm text-white/60">{t('common.legalInstall')}</p>

          <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
            <p className="text-center text-xs text-blue-300">{t('common.manualInstallBlocked')}</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-center text-[11px] text-white/15">{t('install.analystTagline')}</p>
          <div className="flex items-center gap-4 text-[11px] text-white/30">
            <a href="/privacy-policy" className="transition-colors hover:text-white/60">
              {t('common.privacyPolicy')}
            </a>
            <a href="/terms-of-service" className="transition-colors hover:text-white/60">
              {t('common.termsOfService')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
