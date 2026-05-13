# Sirius Handoff - 2026-05-13

This file is the current handoff for continuing Sirius work in a new Codex chat.

## Project identity

- Project name: `Sirius`
- Shopify app handle: `sirius-store-assistant`
- Production app URL: `https://app.siriusai.store`
- Active dev store: `sirius-se8mmhcq.myshopify.com`
- Workspace path: `C:\Users\Dell\OneDrive\Masaüstü\ide\sirius`
- VPS app path: `/opt/sirius-main`

## Non-negotiable rule

All past and future changes must remain compliant with the Shopify rules source reviewed from:

- `C:\Users\Dell\OneDrive\Masaüstü\shopfy kurallar.pdf`
- [shopify-compliance-guardrails.md](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/docs/shopify-compliance-guardrails.md)

Treat this as the standing product and technical guardrail.

## Current architecture

- Frontend: Next.js
- Backend: Express
- Database: PostgreSQL
- Local runtime: Docker Compose
- Production runtime: Docker Compose for `postgres/backend/frontend`, host nginx for `80/443`

Important Shopify constraints already implemented:

- Embedded app flow
- App Bridge session token auth
- OAuth with state + HMAC validation
- Shopify Billing API recurring subscription flow
- GraphQL Admin API for store data sync
- GDPR/compliance webhooks

## Production status as of 2026-05-13

These checks were completed successfully:

- `shopify app deploy --allow-updates --version sirius-review-2026-05-13 --message "Production review configuration"`
- `https://app.siriusai.store/health` returns `200`
- HTTP redirects to HTTPS
- App HTML responds with Shopify-safe `Content-Security-Policy` containing:
  - `frame-ancestors https://*.myshopify.com https://admin.shopify.com;`
- Protected endpoints return `401` without Shopify session token
- VPS deploy completed with:
  - `docker compose up -d --build postgres backend frontend`
- Production DB guard passed:
  - `npm run verify:production`
- Multi-tenant DB integrity passed:
  - `npm run verify:multitenant`

## Local status as of 2026-05-13

These were verified locally:

- Backend test passed:
  - `npm run test:context-routing`
- Frontend production build passed:
  - `npm run build`
- Backend production dependency audit passed
- Frontend production dependency audit passed
- Local Docker services healthy:
  - `sirius-db`
  - `sirius-backend`
  - `sirius-frontend`
  - `sirius-proxy`

## Latest technical work completed

### 1. Production verification tooling

Added backend scripts:

- `npm run verify:production`
- `npm run verify:multitenant`

Files:

- [verify-production-readiness.js](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/backend/scripts/verify-production-readiness.js)
- [verify-multitenant-integrity.js](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/backend/scripts/verify-multitenant-integrity.js)

What they verify:

- production-safe environment
- migrations applied
- no manual billing bypass
- installed shops have Shopify tokens
- no development seed cache
- no development fallback conversations
- required webhook routes configured
- no duplicate shop domains
- no duplicate API keys per shop/provider
- no raw-looking API keys
- no cross-shop attachment/conversation linkage
- no malformed attachment storage namespaces
- no duplicate shop cache rows
- no orphan task/token/conversation rows

### 2. Data sync hardening for many merchants

Data refresh / store sync was improved in [shopify.js](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/backend/src/services/shopify.js).

Changes:

- same-shop concurrent syncs are deduplicated in-memory with `activeShopSyncs`
- 30-day orders are fetched once
- 7-day orders are derived locally from the 30-day result

Why:

- avoids duplicate Shopify API load
- reduces risk when manual refresh and chat-triggered auto-sync overlap for the same shop
- better starting point for scaling to more merchants

### 3. Sync throughput hardening

Added operational protection in [shopify.js](C:/Users/Dell/OneDrive/MasaÃ¼stÃ¼/ide/sirius/backend/src/services/shopify.js):

- Shopify GraphQL calls now retry transient failures with backoff:
  - HTTP 429
  - HTTP 5xx
  - timeout / transient network errors
  - throttling-style GraphQL errors
- store data sync now has a global in-process concurrency cap:
  - default: `SHOPIFY_SYNC_MAX_CONCURRENCY=3`
- store data sync now has a shop-level cooldown:
  - default: `SHOPIFY_SYNC_COOLDOWN_MS=300000`
  - fresh cache is reused instead of pulling Shopify again

Why:

- reduces Shopify API pressure during cron + manual refresh + chat-triggered auto-sync bursts
- prevents many merchants from forcing unlimited simultaneous syncs in one backend process
- keeps merchant-visible cached data stable when it is already fresh

### 4. AI token usage optimization

Added backend-only token reduction for OpenAI, Claude, and Gemini without changing public API or chat history behavior.

Changes:

- static Sirius prompt prefix is versioned as `sirius_prompt_v1`
- full skill files are no longer sent on every request; a compact catalog stays in the static prefix and only relevant skill details are appended
- Shopify context is compact, null-pruned, and routed by intent
- attachment context uses shorter extracted text by default, while explicit full-file analysis keeps the wider context
- OpenAI receives `prompt_cache_key` and supported retention hints
- Claude receives cache-control on the static system prefix
- Gemini prompt order is kept implicit-cache friendly
- token usage now records cached input tokens, cache creation tokens, prompt profile, context profile, and finish reason
- intent-aware output token caps are used, with one non-stream retry at the full cap if a provider stops because of length

Verification:

- `npm run test:token-optimization`
- `npm run test:context-routing`
- `npm run verify:multitenant`
- Docker backend rebuild + health check passed

## Current DB / tenant isolation conclusion

The current code and production data do not show a tenant-isolation problem for:

- API keys
- conversations
- attachments
- cache rows
- tasks
- token usage

Conclusion reached in the previous chat:

- There is no evidence that 100 merchants would see each other's chat history or API key records.
- The remaining scale risk is operational capacity, not tenant data mixing.

## Current data refresh conclusion

Current state:

- No evidence of cross-shop mixing during data refresh
- Same-shop sync duplication was reduced with the recent `activeShopSyncs` change
- The remaining risk for 100 merchants is:
  - Shopify API rate limits
  - sync duration on large stores
  - aggregate load from cron + manual refresh + chat-triggered sync

This is now more of a throughput/queueing concern than a DB correctness concern.

## Shopify app config in use

Primary file:

- [shopify.app.production.toml](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/shopify.app.production.toml)

Important values:

- `application_url = "https://app.siriusai.store"`
- scopes:
  - `read_orders`
  - `read_products`
  - `read_inventory`
- auth callback:
  - `https://app.siriusai.store/api/auth/shopify/callback`
- webhook URLs point to production domain

## Files worth reading first in a new chat

- [shopify-compliance-guardrails.md](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/docs/shopify-compliance-guardrails.md)
- [production-release-runbook.md](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/docs/shopify-review/production-release-runbook.md)
- [shopify-architecture-audit-2026-05-12.md](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/docs/shopify-architecture-audit-2026-05-12.md)
- [shopify.js](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/backend/src/services/shopify.js)
- [shops.js](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/backend/src/routes/shops.js)
- [chat.js](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/backend/src/routes/chat.js)

## Remaining work

The project is technically close to submission-ready. Remaining items are mostly manual or operational:

1. Shopify Admin smoke test
- install/reinstall
- billing approve/decline
- data refresh
- AI store-data answer
- PDF/CSV/image upload readback
- edit/regenerate flow

2. App Store review package
- listing text
- screenshots
- demo screencast
- test credentials
- emergency contact
- final language selection in listing

3. Optional next hardening
- add merchant-facing delete/disconnect for saved AI keys
- add MIME/content sniffing for uploads

## Useful commands

Local:

```bash
cd backend
npm run test:context-routing
npm run verify:production
npm run verify:multitenant

cd ../frontend
npm run build

cd ..
docker compose ps
```

VPS:

```bash
cd /opt/sirius-main
docker compose up -d --build postgres backend frontend
docker compose exec backend npm run verify:production
docker compose exec backend npm run verify:multitenant
curl -I https://app.siriusai.store/health
```

Shopify release:

```bash
shopify app deploy --allow-updates --version sirius-review-2026-05-13 --message "Production review configuration"
```

## Suggested prompt for the next Codex chat

Read [codex-handoff-2026-05-13-latest.md](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/docs/codex-handoff-2026-05-13-latest.md) and continue Sirius from there. Treat [shopify-compliance-guardrails.md](C:/Users/Dell/OneDrive/Masaüstü/ide/sirius/docs/shopify-compliance-guardrails.md) and `shopfy kurallar.pdf` as hard constraints. The app has already passed production readiness and multi-tenant integrity checks on 2026-05-13. Continue from the remaining manual Shopify Admin smoke tests and App Store submission tasks, or the next technical hardening item if requested.
