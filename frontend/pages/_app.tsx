import '../styles/globals.css';
import '@shopify/polaris/build/esm/styles.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { AppProvider } from '@shopify/polaris';
import { LanguageProvider, useI18n } from '../lib/i18n';

function AppFrame({ Component, pageProps }: AppProps) {
  const { polarisLocale, t } = useI18n();

  return (
    <>
      <Head>
        <title>{t('app.title')}</title>
        <meta name="description" content={t('app.description')} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <AppProvider i18n={polarisLocale}>
        <Component {...pageProps} />
      </AppProvider>
    </>
  );
}

export default function App(props: AppProps) {
  return (
    <LanguageProvider>
      <AppFrame {...props} />
    </LanguageProvider>
  );
}
