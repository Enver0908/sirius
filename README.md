# Sirius - Shopify Embedded AI Assistant

Sirius is an embedded Shopify application focused on sales analysis, anomaly detection, and AI-assisted operational guidance.

## Plan

- `sirius`: Merchant uses their own Claude, GPT, or Gemini key with the full Sirius skill pack enabled.

## Local development

```bash
cd sirius
docker compose up -d
```

Use a local `.env` at the repo root for Docker Compose. Keep it out of deploy archives and never copy it over the VPS `.env`.

## Shopify configs

- `shopify.app.toml`: production config for `https://app.siriusai.store`.
- `shopify.app.production.toml`: reference copy matching production.
- `shopify.app.dev.toml`: development-only config. Replace the placeholder URL with a fresh HTTPS dev tunnel before using it.

## Key features

- Multi-model chat with Claude, GPT, and Gemini
- Sidebar with new chat and conversation history
- Shopify-native billing
- GDPR webhook support
- Encrypted provider API key storage
