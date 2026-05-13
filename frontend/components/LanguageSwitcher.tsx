import { SUPPORTED_LANGUAGES, useI18n } from '../lib/i18n';

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#11141b]/90 px-3 py-2 text-xs text-white/75 shadow-lg backdrop-blur">
      <span className="text-white/45">{t('app.language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as typeof locale)}
        className="bg-transparent text-sm text-white outline-none"
        aria-label={t('app.language')}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code} className="bg-[#11141b] text-white">
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}
