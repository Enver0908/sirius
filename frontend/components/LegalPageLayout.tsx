import Head from 'next/head';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useI18n } from '../lib/i18n';

type LegalPageLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export default function LegalPageLayout({
  title,
  description,
  children,
}: LegalPageLayoutProps) {
  const { t } = useI18n();
  return (
    <>
      <Head>
        <title>{title} | Sirius</title>
        <meta name="description" content={description} />
      </Head>

      <main className="min-h-screen bg-[#0a0a14] text-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
          <header className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-extrabold text-white">
                S
              </div>
              <div>
                <div className="text-sm uppercase tracking-[0.28em] text-white/35">Sirius</div>
                <h1 className="text-3xl font-bold text-white">{title}</h1>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-white/65">{description}</p>
          </header>

          <article className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8 text-sm leading-7 text-white/80">
            {children}
          </article>

          <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-5 text-xs text-white/35">
            <div>{t('app.forMerchants')}</div>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/privacy-policy" className="transition-colors hover:text-white/70">
                {t('common.privacyPolicy')}
              </Link>
              <Link href="/terms-of-service" className="transition-colors hover:text-white/70">
                {t('common.termsOfService')}
              </Link>
            </div>
          </footer>
        </div>
      </main>
    </>
  );
}
