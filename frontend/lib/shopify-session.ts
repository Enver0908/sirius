/**
 * @file shopify-session.ts
 * App Bridge uzerinden Shopify Session Token almak icin yardimci modul.
 */

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
    };
  }
}

async function waitForShopifyGlobal(timeoutMs = 2500): Promise<Window['shopify'] | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (window.shopify && typeof window.shopify.idToken === 'function') {
      return window.shopify;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }

  return null;
}

export async function getSessionToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const shopify = await waitForShopifyGlobal();
    if (shopify?.idToken) {
      return await shopify.idToken();
    }
  } catch (err) {
    console.error('Shopify session token alinamadi:', err);
  }

  return null;
}
