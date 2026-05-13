# Production Cutover Checklist

Current status on 2026-05-13:
- Public DNS resolves `app.siriusai.store` to `178.104.197.9`.
- HTTPS is live at `https://app.siriusai.store`.
- HTTP redirects to HTTPS.
- `shopify.app.toml` is the production source of truth and points to `https://app.siriusai.store`.
- `shopify.app.dev.toml` is development-only and must be given a fresh HTTPS tunnel URL before use.

Production deploy checks:
1. Verify the VPS `.env` uses `APP_URL=https://app.siriusai.store` and `NODE_ENV=production`.
2. Deploy code without overwriting the VPS `.env`.
3. Rebuild/restart `backend` and `frontend`.
4. Verify `curl -I https://app.siriusai.store/health` returns `200`.
5. Re-test embedded launch, data refresh, AI store-data answers, billing callback, and compliance webhooks when those paths are touched.

Important guardrail:
- Do not point production URLs at a dev tunnel.
- Do not copy a local `.env` over the VPS `.env`.
- Keep billing, auth callbacks, and webhooks on the stable HTTPS production domain for App Store review and merchant use.
