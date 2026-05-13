# Sirius - Production Release Runbook

Use this runbook before submitting Sirius to Shopify App Store review.

## 1. Local gate

Run from `C:\Users\Dell\OneDrive\Masaustu\ide\sirius`:

```bash
cd backend && npm run test:context-routing && npm audit --omit=dev
cd ../frontend && npm run build && npm audit --omit=dev
```

Expected:
- context routing passes
- frontend build passes
- backend and frontend audits report zero production vulnerabilities

## 2. Deploy web app to VPS

Do not copy the local `.env` to the VPS.

```bash
cd /opt/sirius-main
cp .env /root/sirius-env-backup-$(date +%Y%m%d-%H%M%S)
tar -xzf /opt/sirius-deploy.tar.gz -C /opt/sirius-main --strip-components=1
docker compose up -d --build postgres backend frontend
```

Production uses host-level nginx for ports 80 and 443. Do not start the Docker `nginx` service on the VPS unless host nginx has been intentionally stopped.

## 3. Verify production backend and DB

```bash
cd /opt/sirius-main
docker compose ps
docker compose logs --tail 80 backend
docker compose exec backend npm run verify:production
docker compose exec backend npm run verify:multitenant
curl -I https://app.siriusai.store
curl -I https://app.siriusai.store/health
```

Expected:
- backend and frontend are running
- production readiness checks pass
- multi-tenant integrity checks pass
- HTTPS returns 200
- `/health` returns 200
- HTTP redirects to HTTPS

## 4. Release Shopify app config

Run locally from the repo root after the web app is live:

```bash
shopify app deploy --allow-updates --version sirius-review-2026-05-13 --message "Production review configuration"
```

Expected:
- app URL is `https://app.siriusai.store`
- auth callback uses `https://app.siriusai.store/api/auth/shopify/callback`
- scopes are `read_orders,read_products,read_inventory`
- required privacy webhooks point to `https://app.siriusai.store/api/webhooks/shopify/compliance`

## 5. Manual Shopify Admin smoke test

Test in Chrome incognito from Shopify Admin:

- install or reinstall app
- approve billing
- decline billing and confirm the app degrades safely
- refresh data
- ask AI about store data
- upload PDF, CSV, and image attachments
- confirm AI can use uploaded file contents
- delete a conversation
- edit a user message and regenerate

## 6. App Store review package

Before submission:

- listing price says `$6.99/month` with 7-day trial
- screenshots do not contain pricing text, reviews, testimonials, or unsupported performance claims
- selected listing languages are only the languages fully supported by the app
- test credentials are functional
- demo screencast shows install, billing, API key setup, data refresh, chat, and file upload
- emergency developer contact is present
