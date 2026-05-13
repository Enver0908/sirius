# Sirius - Billing Test Flow

Sirius, Shopify'nin native recurring application charge akislarini kullanir.

| Plan | Price | Trial | Notes |
| --- | --- | --- | --- |
| Sirius Pro | $6.99/month | 7 days | Full Sirius skill pack with merchant keys |

Temel akis:

1. `POST /api/billing/subscribe`
2. Shopify approval page
3. `GET /api/billing/callback`
4. Plan state update in `shops`
