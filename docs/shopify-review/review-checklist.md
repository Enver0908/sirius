# Sirius - Review Checklist

- `docs/shopify-review/compliance-baseline.md` icindeki kurallar yeni release ile celismiyor.
- App name, icon ve listing metni Dev Dashboard ile uyumlu.
- Privacy Policy and Terms pages are live.
- Embedded app install flow works inside Shopify Admin.
- App Bridge script loads before other app scripts.
- Session token auth works without third-party cookie dependency.
- Billing flow supports upgrade and downgrade through Shopify approval.
- No off-platform billing or manual payment flow exists.
- Production guard blocks billing bypass, missing installed-shop tokens, development seed cache, development fallback conversations, dev AI fallback, and dev tunnel URLs.
- Chat supports Claude, GPT, and Gemini selection.
- Missing API key and provider quota errors are shown clearly.
- GDPR webhooks are registered and tested.
- GDPR webhook HMAC failures return 401, including malformed headers.
- Requested Shopify scopes still match documented necessity.
- Privacy Policy and Terms state that merchant/customer data is not used for AI/ML training or cross-merchant benchmarking without required written consent.
- Development seed data is absent from production/review stores unless explicitly labeled as demo data outside the submitted production app.
- App listing screenshots and icon do not contain pricing text.
- Reviewer credentials and emergency contact are ready.
