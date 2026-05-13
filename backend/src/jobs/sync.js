const cron = require('node-cron');
const db = require('../db/client');
const { syncShopData } = require('../services/shopify');

/**
 * Tüm aktif mağazaların Shopify verilerini senkronize eder.
 * Expired trial ve cancelled olanları atlar.
 */
async function syncAllShops() {
  console.log('🔄 [CRON] Toplu veri senkronizasyonu başladı...');

  try {
    const result = await db.query(
      `SELECT id, shopify_domain
       FROM shops
       WHERE billing_status IN ('active', 'trial')
         AND (billing_status = 'active' OR trial_ends_at > NOW())`
    );

    const shops = result.rows;
    console.log(`📦 [CRON] ${shops.length} aktif mağaza bulundu`);

    let successCount = 0;
    let failCount = 0;

    for (const shop of shops) {
      try {
        await syncShopData(shop.id, db);
        successCount++;
      } catch (err) {
        failCount++;
        console.error(`❌ [CRON] Sync başarısız [${shop.shopify_domain}]:`, err.message);
      }

      // Shopify API rate limit'e takılmamak için mağazalar arası 2s bekle
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log(`✅ [CRON] Sync tamamlandı — Başarılı: ${successCount}, Başarısız: ${failCount}`);
  } catch (err) {
    console.error('❌ [CRON] syncAllShops genel hata:', err.message);
  }
}

/**
 * Cron job'ları başlatır.
 * - Her 4 saatte bir: Tüm mağaza verilerini sync et
 *   Çalışma saatleri: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
 */
function startSyncJobs() {
  // Her 4 saatte çalış
  cron.schedule('0 */4 * * *', async () => {
    await syncAllShops();
  });

  console.log('⏰ [CRON] Sync job aktif — Her 4 saatte çalışacak');
}

module.exports = { syncAllShops, startSyncJobs };
