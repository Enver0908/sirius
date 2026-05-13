import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useI18n } from '../lib/i18n';

const SHOP_DOMAIN_REGEX = /^[a-zA-Z0-9-]+\.myshopify\.com$/;

export default function IndexPage() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const shop = params.get('shop') || '';
    const host = params.get('host') || '';

    if (shop && SHOP_DOMAIN_REGEX.test(shop) && !host) {
      window.location.href = `/api/auth/shopify/install?shop=${encodeURIComponent(shop)}`;
      return;
    }

    if (host) {
      router.replace({
        pathname: '/dashboard',
        query: Object.fromEntries(params.entries()),
      });
      return;
    }

    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a14]">
      <div className="mb-6 flex h-12 w-12 animate-pulse items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xl font-extrabold text-white">
        S
      </div>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      <p className="mt-4 text-sm text-white/50">{t('app.redirecting')}</p>
    </div>
  );
}
