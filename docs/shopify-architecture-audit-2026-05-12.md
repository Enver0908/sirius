# Sirius Shopify Architecture Audit - 2026-05-12

Bu audit, `C:/Users/Dell/OneDrive/Masaustu/shopfy kurallar.pdf`, guncel Shopify
resmi dokumanlari ve mevcut kod tabani uzerinden yapildi. Amac: Shopify review
icin riskli alanlari kapatmak, eski development/mock izlerini temizlemek ve
deploy oncesi kalan insan-onayi gerektiren noktalari netlestirmek.

## Kaynaklar

- Local PDF: `C:/Users/Dell/OneDrive/Masaustu/shopfy kurallar.pdf`
- Shopify App Store requirements: https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- Shopify session tokens: https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
- Shopify webhooks: https://shopify.dev/docs/api/admin-rest/latest/resources/webhook
- OpenAI model docs: https://platform.openai.com/docs/models
- Claude model docs: https://docs.anthropic.com/en/docs/about-claude/models/all-models
- Gemini 3.1 Pro Preview docs: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview

## Uygulanan Duzeltmeler

- `app/uninstalled` webhook artik AI provider anahtarlarini siliyor, Shopify access/refresh tokenlarini NULL yapiyor, pending billing alanlarini temizliyor ve shop durumunu `cancelled` yapiyor.
- `shopify_access_token` kolonu nullable yapildi; uninstall sonrasi token temizligi DB constraint yuzunden patlamaz.
- `app_subscriptions/update` webhook route'u ve TOML subscription kayitlari eklendi; abonelik iptal/aktif/pending durumlari DB'ye yansiyor.
- OAuth callback artik zorunlu webhook kaydi basarisiz olursa sessiz devam etmiyor; kurulum guvenli sekilde fail ediyor.
- Shopify session token dogrulamasi sertlestirildi: `iss` ve `dest` HTTPS + `*.myshopify.com` olarak parse ediliyor ve ayni shop olmak zorunda.
- Development seed cache temizligi icin `008_uninstall_secret_cleanup.sql` eklendi.
- Development review store'lari icin eski AI test izlerini temizleyen `009_dev_store_trace_cleanup.sql` eklendi; AI credentials, conversations, attachments, tasks, token usage ve cache temizlenir, shop kurulumu korunur.
- Production guard artik HTTPS, dev tunnel, manual billing bypass, missing installed-shop token, development seed cache, development fallback conversations ve dev AI fallback modunu bloklar.
- Eski mock seed script'i ve `seed:mock-data` komutu kaldirildi.
- Review billing dokumanindaki eski `$12.99/month` fiyat `$6.99/month` olarak duzeltildi.
- `backend/.env.example` eski `SellyGUIDE/selliguide` kalintilarindan temizlendi.
- Backend `express-rate-limit` ve frontend `next/postcss` guncellendi; production audit sonucunda bilinen vulnerability kalmadi.

## Uyum Matrisi

| Alan | Durum | Kanit |
| --- | --- | --- |
| Embedded app | Uyumlu | `embedded = true`, App Bridge script `_document.tsx` icinde head'de yukleniyor. |
| Session token auth | Uyumlu | Frontend `window.shopify.idToken()` kullaniyor; backend JWT `aud`, `iss`, `dest` dogruluyor. |
| OAuth/install | Uyumlu, canli test gerekli | Callback HMAC/state kontrolu var; app Shopify Admin grant flow ile acildi. |
| Shopify Billing | Uyumlu, canli test gerekli | `appSubscriptionCreate` GraphQL Billing API kullaniyor, off-platform billing yok. |
| Billing lifecycle | Guclendirildi | Callback nonce/charge match var; `app_subscriptions/update` eklendi. |
| TLS/SSL | Uyumlu, canli dogrulandi | `https://app.siriusai.store` 200, HTTP 301 redirect ve HSTS var. |
| GraphQL Admin API | Uyumlu | Order/product/billing/webhook islemleri GraphQL uzerinden. REST Admin data endpoint eklenmedi. |
| Scopes | Makul/minimum | `read_orders`, `read_products`, `read_inventory`; AI analiz ve stok/satis raporlari icin gerekceli. |
| Mandatory privacy webhooks | Uyumlu | TOML compliance topics ve HMAC korumali `/api/webhooks/shopify/compliance` route'u var. |
| Data/privacy | Guclendirildi | Uninstall/shop redact cleanup, AI key encryption, no training beyanlari, development trace cleanup. |
| Pricing transparency | Uyumlu kod tarafinda | Kod ve review dokumani `$6.99/month`, 7-day trial. Dev Dashboard/listing canli kontrol edilmeli. |
| Provider model IDs | Uyumlu | GPT-5.4/GPT-5.5, Gemini 3.1 Pro Preview ve Claude Sonnet 4.6 resmi dokumanlarla uyumlu. |

## Kalan Canli Dogrulama Noktalari

- Shopify Dev Dashboard'da yeni app version tekrar release edilmeli; TOML webhook degisiklikleri ancak `shopify app deploy` sonrasinda kesinlesir.
- VPS'e yeni kod deploy edilmeli; migration 008 ve 009 production DB'de calismali.
- Deploy sonrasi DB'de `shop_ai_credentials`, development seed cache ve development fallback conversation sorgulari bos donmeli.
- App uninstall/reinstall canli test edilmeli; uninstall sonrasi AI key ve token alanlari temizlenmeli.
- Billing onay akisi canli test edilmeli; kullanilan store charge kabul edemiyorsa bu Shopify store/billing profili kaynakli olabilir.
- App Store listing, ekran goruntuleri, app icon ve pricing metni Dev Dashboard'da manuel kontrol edilmeli; koddan dogrulanamaz.
- Claude Opus 4.7 artik daha yeni bir model; Sirius su an Claude 4.6 ailesini destekliyor. Bu bir compliance sorunu degil, ama ileride urun karari olarak guncellenebilir.

## Tavsiye Edilen Sonraki Duzeltmeler

- Merchant'in kendi AI provider anahtarini UI uzerinden "disconnect/delete" edebilmesi eklenebilir. Uninstall/shop redact temizligi su an var; bu ekstra self-service gizlilik iyilestirmesi olur.
- Upload tarafinda extension + parser kontrolune ek olarak MIME/content sniffing eklenebilir.
- Production deploy pipeline'ina otomatik `npm audit`, frontend build ve DB cleanup verification komutlari eklenebilir.

## Guven Siniri

Kod, dokuman ve resmi kaynaklar uzerinden yapilabilen audit tamamlandi. Ancak "gercek anlamda %100" icin Shopify Dev Dashboard, canli billing kabul ekrani, canli webhook teslimati ve production DB sorgulari deploy sonrasi dogrulanmak zorunda. Bu nedenle mevcut durum: kod seviyesinde yuksek guven, production seviyesinde deploy sonrasi kontrol bekliyor.
