const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  PROMPT_CACHE_BOUNDARY,
  buildSystemPrompt,
  selectSkillsForPrompt,
} = require('../src/services/skills');
const {
  selectShopContextForPrompt,
  stableCompactStringify,
} = require('../src/services/prompt-optimizer');
const {
  buildAttachmentContextPayload,
  getAttachmentPromptTextLimit,
} = require('../src/services/attachments');

const fakeDb = {
  async query() {
    return { rows: [{ plan: 'sirius' }] };
  },
};

async function run() {
  const salesSkills = selectSkillsForPrompt({
    routingContext: { intent: 'store_specific', includeShopData: true },
    userMessage: 'bu hafta satis raporu nasil',
  });
  assert(salesSkills.includes('satis-raporu'));
  assert(salesSkills.includes('genel-analiz'));
  assert(salesSkills.length < 9);

  const offTopicSkills = selectSkillsForPrompt({
    routingContext: { intent: 'off_topic', includeShopData: false },
    userMessage: 'mobil uygulama gelistirme nedir',
  });
  assert.deepStrictEqual(offTopicSkills, ['sirius-ton']);

  const prompt = await buildSystemPrompt('shop-1', fakeDb, {
    provider: 'chatgpt',
    model: 'gpt-5.4',
    routingContext: { intent: 'store_specific', includeShopData: true },
    userMessage: 'stok risklerimi analiz et',
  });
  assert.strictEqual(prompt.profile.version, 'sirius_prompt_v1');
  assert(prompt.profile.selected_skills.includes('anomali'));
  assert(prompt.text.includes(PROMPT_CACHE_BOUNDARY));
  assert(!prompt.profile.selected_skills.includes('router'));

  const shopContext = {
    shop_summary: { currency: 'USD' },
    sales_7d: { total_revenue: 1000, order_count: 20, top_products: [{ title: 'A' }] },
    sales_30d: { total_revenue: 4000, order_count: 80, top_products: [{ title: 'A' }] },
    top_products: [{ title: 'A' }],
    stock_alerts: [{ title: 'A', days_remaining: 3 }],
    product_insights: { slow_moving_products: [{ title: 'B' }] },
    active_anomalies: [{ title: 'Revenue concentration' }],
  };
  const selectedSalesContext = selectShopContextForPrompt(
    shopContext,
    { intent: 'store_specific', includeShopData: true },
    'satis performansim nasil'
  );
  assert(selectedSalesContext.sales_7d);
  assert(selectedSalesContext.sales_30d);
  assert(!selectedSalesContext.product_insights);

  const noShopContext = selectShopContextForPrompt(
    shopContext,
    { intent: 'commerce_general', includeShopData: false },
    'Shopifyda iade politikasi nasil olmali'
  );
  assert.strictEqual(noShopContext, null);

  const compact = stableCompactStringify({ b: null, a: { z: 1, y: [] } });
  assert.strictEqual(compact, '{"a":{"z":1}}');

  const longText = 'x'.repeat(10000);
  const compactAttachment = buildAttachmentContextPayload([
    {
      id: '1',
      original_name: 'report.pdf',
      attachment_kind: 'pdf',
      mime_type: 'application/pdf',
      size_bytes: 100,
      structured_summary: { page_count: 3 },
      extracted_text: longText,
    },
  ], { userMessage: 'bu dosyaya bak' });
  assert(compactAttachment[0].extracted_text.length < longText.length);
  assert.strictEqual(getAttachmentPromptTextLimit('dosyanin tamami detayli analiz et'), 12000);

  const chatSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'chat.js'), 'utf8');
  assert(chatSource.includes('storedMessages.slice(-10)'));
  assert(chatSource.includes('trimmedMessages.slice(-10)'));

  console.log('Token optimization tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
