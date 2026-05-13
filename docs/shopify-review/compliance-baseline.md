# Sirius - Shopify Compliance Baseline

Bu dokuman, `shopfy kurallar.pdf` icindeki Shopify App Store gereksinimlerini Sirius projesine uygulanabilir gelistirme kurallari olarak sabitler.

## 1. Isim ve marka standardi

- Uygulamanin disariya bakan adi `Sirius` olarak kullanilacak.
- Shopify Dev Dashboard, `shopify.app.toml`, App Store listing, privacy/terms sayfalari ve uygulama ici marka dili birbiriyle uyumlu kalacak.
- Eski `SellyGUIDE` adi sadece tarihi rapor, gecis notu veya ic klasor isimlerinde kalabilir; yeni merchant-facing metinlerde kullanilmayacak.

## 2. Sirius icin zorunlu Shopify kurallari

- Uygulama sadece Shopify uzerinden kurulur; UI icinde manuel `myshopify.com` girisi istenmez.
- OAuth ilk adimdir; merchant daha baska bir ekrana gecmeden Shopify yetkilendirmesi tamamlanir.
- Uygulama `embedded = true` olarak Shopify Admin icinde calisir.
- Auth icin session token kullanilir; uygulama temel calisma akisini third-party cookie veya local storage bagimliligina yaslamayiz.
- Shopify ile veri alisverisinde GraphQL Admin API kullanilir; yeni gelistirmelerde REST Admin API eklenmez.
- Tum ucretlendirme Shopify Billing uzerinden yapilir; harici odeme, manuel tahsilat veya Shopify disi abonelik akisi eklenmez.
- Scope talepleri minimum tutulur; yeni scope eklenecekse `docs/shopify-scopes.md` icine gerekcesi yazilir.
- Zorunlu webhooklar korunur: `app/uninstalled`, `customers/data_request`, `customers/redact`, `shop/redact`.
- Listing, onboarding ve uygulama ici metinlerde yalnizca dogru ve kanitlanabilir iddialar kullanilir.
- Fiyat bilgisi App Store listing gorsellerine veya uygulama logosuna tasinmaz.
- Merchant data, customer data, derived analytics ve conversation history AI/ML model egitimi veya cross-merchant benchmark icin kullanilmaz. Boyle bir program ancak Shopify sartlarinin gerektirdigi acik yazili izinlerle ayri tasarlanabilir.
- Development seed data production veya Shopify review ortaminda gercek magaza verisi gibi kullanilmaz.
- Production'da manuel billing bypass kabul edilmez; `active` abonelikler Shopify billing id ile dogrulanabilir olmalidir.
- Production/review ortaminda development fallback cevaplari, seed cache veya eski AI test credential izleri birakilmaz.

## 3. Bu repoda simdiden uyumlu olan alanlar

- `shopify.app.toml` dosyasinda uygulama adi `Sirius` ve uygulama embedded olarak tanimli.
- `frontend/pages/_document.tsx` App Bridge script'ini yukluyor.
- `frontend/pages/install.tsx` manuel kurulumun kapali oldugunu acikca belirtiyor.
- `backend/src/middleware/shopify-session.js` session token dogrulamasi yapiyor.
- `backend/src/services/shopify.js` ve `backend/src/services/billing.js` Shopify GraphQL kullaniyor.
- `backend/src/routes/billing.js` Shopify Billing akisini kullaniyor.
- `backend/src/routes/webhooks.js` GDPR ve uninstall webhooklarini isliyor.
- `frontend/pages/privacy-policy.tsx` ve `frontend/pages/terms-of-service.tsx` merchant-facing hukuki sayfalari sagliyor.
- `backend/src/services/production-guard.js` production ortaminda development seed cache, development fallback conversation, dev AI fallback, dev tunnel URL, missing installed-shop token ve billing id'siz active subscription durumlarini bloklar.

## 4. Gelistirme sirasinda dikkat edecegimiz riskli alanlar

- Yeni ozellik eklerken merchant'tan Shopify disinda shop domain istemeyecegiz.
- Yeni entegrasyonlar icin `read_all_orders` gibi hassas scope'lar gerekirse once gerekceyi yazip sonra ekleyecegiz.
- Musteri verisi veya order raw data saklama modeli degisirse privacy policy, retention mantigi ve GDPR webhook aksiyonlari birlikte guncellenecek.
- App Store listing metinleri, demo videosu ve ekran goruntulerinde "garantili gelir artisi" gibi abartili iddialar kullanilmayacak.
- Shopify review icin verilen test hesaplari, billing akisi ve reviewer notlari her release oncesi tekrar dogrulanacak.
- App Bridge sadece tek yerden, `shopify-api-key` meta tag'iyle ve sayfa scriptlerinden once yuklenir.
- Production loglarinda musteri id, order name gibi gereksiz merchant/customer detaylari redacted tutulur.

## 5. SellyGUIDE -> Sirius gecis notu

- Projenin ismi urun seviyesinde `Sirius` olarak yenilendi.
- Eski raporda gecen `SellyGUIDE` adlari tarihi baglamdir; bundan sonraki teknik ve urun dokumantasyonunda `Sirius` esas alinacaktir.
- Ic klasor adinin `selliguide` olmasi tek basina App Store sorunu degildir; kritik olan merchant-facing isim tutarliligidir.
