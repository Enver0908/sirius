const assert = require('assert');
const { buildRoutingContext, classifyMessage } = require('../src/services/context-router');

const directCases = [
  ['magazamin satislari bu hafta nasil', 'store_specific'],
  ['mağazamın satışları bu hafta nasıl', 'store_specific'],
  ['benim magaza verime gore pazar analizi yap', 'store_specific'],
  ['benim mağaza verime göre pazar analizi yap', 'store_specific'],
  ['pazar analizi istiyorum', 'market_general'],
  ['Shopifyda iade politikasi nasil olmali', 'commerce_general'],
  ['Shopifyda iade politikası nasıl olmalı', 'commerce_general'],
  ['elbise satmak istiyorum hangi renk daha alici bulur', 'commerce_general'],
  ['mobil uygulama gelistirmenin gelecegi nedir', 'off_topic'],
  ['bana 3 kelime ile ozetle', 'followup'],
  ['stok ne alaka', 'followup'],
  ['magazaya urun yukledim gorebiliyor musun', 'store_specific'],
  ['urunlerimi gorebiliyor musun', 'store_specific'],
  ['Shopify magazamdaki urunleri listele', 'store_specific'],
  ['magazaya nasil urun yuklerim', 'commerce_general'],
];

for (const [message, expectedIntent] of directCases) {
  const actual = classifyMessage(message);
  assert.strictEqual(
    actual.intent,
    expectedIntent,
    `"${message}" expected ${expectedIntent}, got ${actual.intent}`
  );
}

const mobileConversation = [
  { role: 'user', content: 'pazar analizi istiyorum' },
  { role: 'assistant', content: 'Genel pazar acisindan moda kategorisinde talep...' },
  { role: 'user', content: 'yazilimin gelecegi hakkinda ne dusunuyorsun' },
  { role: 'assistant', content: 'Yazilimin gelecegi daha cok sistem kurma ve AI destekli uretim...' },
  { role: 'user', content: 'e ticaret acisindan degil mobil uygulama gelistirmeyi merak ediyorum' },
  { role: 'assistant', content: 'Mobil uygulama gelistirme bitmiyor; urun, hiz ve deneyim onemli...' },
];

const mobileSummary = buildRoutingContext('bana 3 kelime ile ozetle', mobileConversation);
assert.strictEqual(mobileSummary.intent, 'followup');
assert.strictEqual(mobileSummary.includeShopData, false);
assert.strictEqual(mobileSummary.focus.intent, 'off_topic');

const storeConversation = [
  { role: 'user', content: 'magazamin satislari bu hafta nasil' },
  { role: 'assistant', content: 'Bu hafta satislar guclu ama stok riski var...' },
];

const storeSummary = buildRoutingContext('3 kelime ile ozetle', storeConversation);
assert.strictEqual(storeSummary.intent, 'followup');
assert.strictEqual(storeSummary.includeShopData, true);
assert.strictEqual(storeSummary.focus.intent, 'store_specific');

const generalCommerce = buildRoutingContext('Shopifyda iade politikasi nasil olmali', []);
assert.strictEqual(generalCommerce.includeShopData, false);

console.log('Context routing tests passed.');
