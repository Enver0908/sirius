# Shopify Compliance Guardrails

Source reviewed on 2026-05-11:
- `C:/Users/Dell/OneDrive/Masaüstü/shopfy kurallar.pdf`

This file is the working guardrail for all Sirius changes. If a proposed feature conflicts with any rule below, do not implement it as-is.

## Core rules for Sirius

1. Embedded auth must rely on Shopify session tokens and OAuth.
- Do not build flows that depend on third-party cookies to function.
- Do not place any pre-auth product UI before OAuth completes.

2. The app must remain a consistent embedded Shopify Admin experience.
- Keep primary workflows inside the embedded app.
- Do not move core merchant actions to disconnected external pages unless Shopify requires it.

3. Production must use valid HTTPS everywhere.
- Do not switch Shopify production URLs until TLS is live and valid.
- App URLs, auth callbacks, billing callbacks, and webhook URLs must all resolve over HTTPS.

4. Billing must stay inside Shopify-approved billing flows.
- Use Shopify Billing API or Shopify App Pricing only.
- Do not add off-platform payment or subscription collection flows.
- Any paid plan change must remain merchant-visible and reversible.

5. Access scopes must stay minimal.
- Only request scopes required for actual shipped functionality.
- Any new scope request must be justified against a concrete feature.

6. Store data must be accurate and not misleading.
- Do not fabricate metrics, reports, insights, reviews, or urgency signals.
- AI output must not be presented as verified store fact unless backed by real store or uploaded data.

7. Shopify checkout must never be bypassed.
- Do not create flows that route buyers to non-Shopify checkout for Sirius functionality.

8. Privacy and compliance webhooks must keep working.
- Preserve and re-test compliance webhook handling on changes affecting auth, routing, storage, or deploy.
- `customers/data_request`, `customers/redact`, and `shop/redact` must stay functional.

9. Data sync and merchant-visible data must stay consistent.
- If we sync or cache Shopify data, it must remain consistent with what the merchant sees in Shopify.
- Any cached insight should degrade safely when data is stale or incomplete.

10. App listing and in-app claims must remain factual.
- No guarantees, fake statistics, or unsupported performance claims in UI copy or listing copy.

## Sirius-specific implementation policy

- Favor GraphQL Admin API patterns for new Shopify integrations.
- Do not add features that require unnecessary customer personal data.
- Do not store or expose merchant data beyond what the feature actually needs.
- Any AI feature must clearly operate on merchant-authorized store data or uploaded files.
- Any new deploy or domain change must be checked against embedded launch, OAuth, billing, and webhook compliance before rollout.

## Pre-merge check for every change

Before considering a task complete, verify:
- embedded flow still works
- OAuth/session flow still works
- no new unnecessary scopes were introduced
- billing still uses Shopify-native flow only
- HTTPS/domain assumptions are valid for the target environment
- no misleading UI or AI claim was introduced
- compliance webhooks and data deletion expectations remain intact
