/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    NEXT_PUBLIC_SHOPIFY_API_KEY:
      process.env.NEXT_PUBLIC_SHOPIFY_API_KEY || process.env.SHOPIFY_API_KEY || '',
    NEXT_PUBLIC_SHOPIFY_APP_HANDLE:
      process.env.NEXT_PUBLIC_SHOPIFY_APP_HANDLE || process.env.SHOPIFY_APP_HANDLE || '',
  },
};

module.exports = nextConfig;
