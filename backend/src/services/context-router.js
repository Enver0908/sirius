const MAX_FOCUS_CHARS = 260;

function buildRoutingContext(userMessage, previousMessages = []) {
  const current = classifyMessage(userMessage);
  const focus = findLastSubstantiveUserFocus(previousMessages);
  const followsStoreTopic = current.intent === 'followup' && focus?.intent === 'store_specific';
  const includeShopData = current.intent === 'store_specific' || followsStoreTopic;

  return {
    intent: current.intent,
    includeShopData,
    isFollowup: current.intent === 'followup',
    focus: focus
      ? {
          intent: focus.intent,
          message: truncate(focus.message, MAX_FOCUS_CHARS),
        }
      : null,
    reason: current.reason,
    dataPolicy: buildDataPolicy(current.intent, includeShopData, focus),
  };
}

function classifyMessage(message) {
  const normalized = normalizeText(message);

  if (!normalized) {
    return { intent: 'off_topic', reason: 'empty_message' };
  }

  if (isFollowup(normalized)) {
    return { intent: 'followup', reason: 'short_or_contextual_followup' };
  }

  if (isExplicitNonCommerceTopic(normalized)) {
    return { intent: 'off_topic', reason: 'user_explicitly_switched_away_from_commerce' };
  }

  if (isExplicitStoreSpecific(normalized) || isImplicitStoreMetricRequest(normalized)) {
    return { intent: 'store_specific', reason: 'user_asked_about_own_store_or_store_metrics' };
  }

  if (isMarketQuestion(normalized)) {
    return { intent: 'market_general', reason: 'market_or_competitor_question_without_own_store_reference' };
  }

  if (hasCommerceSignal(normalized)) {
    return { intent: 'commerce_general', reason: 'commerce_question_without_own_store_reference' };
  }

  return { intent: 'off_topic', reason: 'no_store_or_commerce_signal' };
}

function findLastSubstantiveUserFocus(previousMessages) {
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const message = previousMessages[index];
    if (!message || message.role !== 'user' || !message.content) {
      continue;
    }

    const classification = classifyMessage(message.content);
    if (classification.intent === 'followup') {
      continue;
    }

    return {
      intent: classification.intent,
      message: message.content,
      reason: classification.reason,
    };
  }

  return null;
}

function buildDataPolicy(intent, includeShopData, focus) {
  if (includeShopData) {
    if (intent === 'followup') {
      return 'Use shop data only as continuation of the previous store-specific topic. Do not introduce unrelated store metrics.';
    }

    return 'Use shop data because the user is asking about their own store, sales, products, stock, orders, or performance.';
  }

  if (intent === 'followup') {
    return focus
      ? 'Do not use shop data. Treat this as a follow-up to the last non-follow-up user topic and the immediately previous assistant answer.'
      : 'Do not use shop data. The follow-up target is unclear, so answer the immediate user request and ask a short clarification only if needed.';
  }

  if (intent === 'market_general') {
    return 'Do not use shop data. Answer as a general market, competitor, category, or trend question. Offer store-specific analysis only as an optional next step.';
  }

  if (intent === 'commerce_general') {
    return 'Do not use shop data. Answer as general e-commerce or Shopify guidance unless the user explicitly asks about their own store.';
  }

  return 'Do not use shop data. Answer the user directly as a general assistant while preserving Sirius tone.';
}

function isFollowup(normalized) {
  const words = normalized.split(/\s+/).filter(Boolean);
  const compact = normalized.replace(/\s+/g, ' ');

  if (/\b(ne alaka|alakasi ne|ne ilgisi var|bunun .*ne alakasi|bununla ne alakasi|stok ne alaka)\b/.test(compact)) {
    return true;
  }

  if (/\b(onu kastetmedim|bunu kastetmedim|yanlis anladin|yanlis anladiniz|hayir onu degil)\b/.test(compact)) {
    return true;
  }

  if (/\b(\d+\s*kelime|\d+\s*cumle|tek cumle|bir cumle|kisaca|daha kisa|ozetle|detaylandir|acikla|devam et)\b/.test(compact)) {
    return true;
  }

  if (words.length <= 5 && /^(neden|niye|nasil|hangisi|peki|tamam|devam|bunu|onu|sunlari|bunlari)\b/.test(compact)) {
    return true;
  }

  return false;
}

function isExplicitStoreSpecific(normalized) {
  return [
    /\b(benim|bizim|kendi)\s+(magazam|magazamin|magazamda|magazamdaki|dukkanim|shopify magazam|storeum|satisim|satislarim|satislarimi|cirom|siparislerim|siparislerimi|urunlerim|urunlerimi|stoklarim|stoklarimi|stokum|verim|verilerim|musterilerim|musterilerimi)\b/,
    /\b(magazam|magazamin|magazamda|magazamdaki|dukkanim|storeum|satislarim|satislarimi|satisim|cirom|siparislerim|siparislerimi|urunlerim|urunlerimi|stoklarim|stoklarimi|stokum|verilerim|verime|bende|bizde)\b/,
    /\b(verime gore|verilerime gore|magaza verime gore|shopify verilerime gore|satis verime gore|stok verime gore)\b/,
    /\b(bu magazada|su an magazam|suan magazam|magaza performansim|hangi urunum|hangi urunlerim|hangi urunlerimi)\b/,
    /\b(magazamdaki|magazamin icindeki|shopify magazamdaki)\b.*\b(urun|urunler|urunleri|stok|stoklar|listele|goster|gorebiliyor)\b/,
    /\b(urunlerim|urunlerimi|stoklarim|stoklarimi|siparislerim|siparislerimi|satislarim|satislarimi)\b.*\b(gorebiliyor|goruyor|goster|listele|say|ne durumda|analiz et|raporla)\b/,
    /\b(magazaya|storea|shopify magazama)\b.*\b(urun|urunler|urunleri|stok|stoklar)\b.*\b(yukledim|ekledim|koydum|olusturdum|girdim|gorebiliyor|goruyor|goster|listele)\b/,
    /\b(magazaya|storea|shopify magazama)\b.*\b(yukledigim|ekledigim|koydugum|olusturdugum|girdigim)\b.*\b(urun|urunler|urunleri|stok|stoklar|gorebiliyor|goruyor|goster|listele)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isImplicitStoreMetricRequest(normalized) {
  const hasGeneralScope = /\b(e ticarette|eticarette|shopifyda|shopify icin|genel olarak|piyasada|sektorde|rakipler|trend|gelecegi|gelecek|nasil olmali|nasil yapilir|nedir)\b/.test(normalized);
  if (hasGeneralScope) {
    return false;
  }

  return [
    /\b(bu hafta|bu ay|son \d+ gun|son hafta|son ay|su an|suan)\b.*\b(satis|ciro|siparis|stok|urun|performans|fulfillment)\b/,
    /\b(satislar|ciro|siparisler|stoklar|urunler|performans)\b.*\b(nasil gidiyor|ne durumda|analiz et|raporla|bak|yorumla|dusmus mu|artmis mi)\b/,
    /\b(hangi urun|hangi urunler|en cok satan|en iyi giden)\b.*\b(bende|bizde|suan|su an|bu hafta|bu ay|magazada)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isExplicitNonCommerceTopic(normalized) {
  return [
    /\b(e ticaret|eticaret|shopify|magaza)\b.*\b(degil|umrumda degil|kastetmiyorum)\b.*\b(mobil|yazilim|teknoloji|kariyer|uygulama gelistirme)\b/,
    /\b(mobil|yazilim|teknoloji|kariyer|uygulama gelistirme)\b.*\b(merak ediyorum|soruyorum|kastettim|hakkinda)\b.*\b(e ticaret|eticaret|shopify|magaza)\b.*\b(degil|haric)\b/,
  ].some((pattern) => pattern.test(normalized));
}

function isMarketQuestion(normalized) {
  return /\b(pazar|rakip|rekabet|kategori|trend|segment|persona|hedef kitle|konumlandirma|sektor|benchmark)\b/.test(normalized);
}

function hasCommerceSignal(normalized) {
  return /\b(e ticaret|eticaret|shopify|magaza|urun|stok|satis|siparis|iade|kargo|fulfillment|kampanya|reklam|sepet|conversion|donusum|fiyat|musteri|toptan|perakende|pazar|rakip|kategori|renk|beden|koleksiyon|tema|checkout)\b/.test(normalized);
}

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[\u00e7\u011f\u0131\u00f6\u015f\u00fc\u00e2\u00ee\u00fb]/g, (char) => TURKISH_CHAR_MAP[char] || char)
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TURKISH_CHAR_MAP = {
  '\u00e7': 'c',
  '\u011f': 'g',
  '\u0131': 'i',
  '\u00f6': 'o',
  '\u015f': 's',
  '\u00fc': 'u',
  '\u00e2': 'a',
  '\u00ee': 'i',
  '\u00fb': 'u',
};

function truncate(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

module.exports = {
  buildRoutingContext,
  classifyMessage,
  normalizeText,
};
