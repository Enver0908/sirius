const cron = require('node-cron');
const db = require('../db/client');
const { fetchAllShopData, calculateDaysOfStock } = require('./shopify');

/**
 * Cron Job'ları başlatır.
 * index.js'den sunucu ayağa kalktıktan sonra çağrılır.
 */
function startCronJobs() {
  console.log('⏰ Cron job\'lar başlatılıyor...');

  // ── Her 4 saatte: Tüm mağazaların verisini çek ──
  // Dakika 0'da çalışır: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
  cron.schedule('0 */4 * * *', async () => {
    console.log('🔄 Zamanlanmış veri güncelleme başladı...');
    await refreshAllShops();
  });

  // ── Her gün 03:00'te: Stok günü hesapla ──
  cron.schedule('0 3 * * *', async () => {
    console.log('📊 Stok günü hesaplama başladı...');
    await recalculateAllStock();
  });

  console.log('✅ Cron job\'lar aktif:');
  console.log('   📦 Veri güncelleme: Her 4 saatte');
  console.log('   📊 Stok hesaplama:  Her gün 03:00');
}

/**
 * Tüm aktif mağazaların Shopify verilerini yeniler.
 * Trial süresi dolmuş ve cancelled olanları atlar.
 */
async function refreshAllShops() {
  try {
    const result = await db.query(
      `SELECT id, shopify_domain, shopify_access_token
       FROM shops
       WHERE billing_status IN ('active', 'trial')
         AND (billing_status = 'active' OR trial_ends_at > NOW())`
    );

    const shops = result.rows;
    console.log(`📦 ${shops.length} mağaza güncelleniyor...`);

    for (const shop of shops) {
      try {
        await fetchAllShopData(shop.id, shop.shopify_domain, shop.shopify_access_token);
      } catch (err) {
        console.error(`❌ Veri güncelleme başarısız [${shop.shopify_domain}]:`, err.message);
      }

      // Shopify rate limit'e takılmamak için 1s bekle
      await _sleep(1000);
    }

    console.log('✅ Veri güncelleme tamamlandı');
  } catch (err) {
    console.error('❌ refreshAllShops hatası:', err.message);
  }
}

/**
 * Tüm aktif mağazalar için stok günü hesaplar.
 */
async function recalculateAllStock() {
  try {
    const result = await db.query(
      `SELECT id FROM shops
       WHERE billing_status IN ('active', 'trial')
         AND (billing_status = 'active' OR trial_ends_at > NOW())`
    );

    for (const shop of result.rows) {
      try {
        await calculateDaysOfStock(shop.id);
      } catch (err) {
        console.error(`❌ Stok hesaplama başarısız [${shop.id}]:`, err.message);
      }
    }

    console.log('✅ Stok günü hesaplama tamamlandı');
  } catch (err) {
    console.error('❌ recalculateAllStock hatası:', err.message);
  }
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startCronJobs, refreshAllShops, recalculateAllStock };
