# Sirius - Shopify Scope Gerekceleri

Bu dokuman, Sirius uygulamasinin istedigi Shopify OAuth scope'larini ve neden gerekli olduklarini aciklar.

- `read_orders`: siparis ve satis analizi icin gereklidir.
- `read_products`: urun performansi ve katalog baglami icin gereklidir.
- `read_inventory`: stok sinyalleri ve envanter riski analizi icin gereklidir.

## Scope artirmadan uretilen aggregate metrikler

Sirius, Shopify App Store scope minimization kuralina uymak icin yeni veri sinifi istemeden mevcut izinli veriden karar odakli metrikler turetir.

- Urun ve varyant bazli gelir/adet trendi
- Son donem ve onceki donem satis degisimi
- Kanal bazli siparis ve ciro kirilimi
- Sepet basina urun adedi ve cok urunlu siparis orani
- Indirim, iade ve iptal oranlari
- Gelirin ilk urunlerde yogunlasma orani
- Stok devir hizi, sell-through, yavas donen stok ve dead stock riski
- Dusuk stok + yuksek talep oncelik skoru

Bu metrikler customer-level veri, cross-merchant benchmark veya yeni OAuth scope gerektirmez.
