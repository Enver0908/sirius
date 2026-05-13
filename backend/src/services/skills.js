const fs = require('fs');
const path = require('path');
const { normalizeText } = require('./context-router');
const { PROMPT_PROFILE_VERSION } = require('./prompt-optimizer');

const SIRIUS_SKILLS = [
  'router',
  'genel-analiz',
  'satis-raporu',
  'anomali',
  'rca-aksiyon',
  'gorev',
  'oncelik',
  'guven-skoru',
  'sirius-ton',
];

const SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');
const FALLBACK_SKILL = 'genel-analiz';
const PROMPT_CACHE_BOUNDARY = '\n<sirius_static_prompt_cache_boundary />\n';
const ALWAYS_ON_SKILLS = ['sirius-ton'];
const DEFAULT_SELECTED_SKILLS = ['genel-analiz', 'sirius-ton'];

const SKILL_CATALOG = [
  'router: niyet ve veri kullanimi politikasini takip eder; skill etiketleri kullaniciya gosterilmez.',
  'genel-analiz: genel e-ticaret, Shopify operasyonu ve magaza karar destek cevaplari.',
  'satis-raporu: ciro, siparis, AOV, trend, donem karsilastirmasi ve performans raporu.',
  'anomali: beklenmeyen satis/stok/fulfillment sapmalari, risk ve firsat sinyalleri.',
  'rca-aksiyon: kok neden hipotezleri, dogrulama sorulari ve aksiyon onerileri.',
  'gorev: yapilacaklar, aksiyon plani ve task JSON gerektiren istekler.',
  'oncelik: etki/aciliyet siralamasi ve odak secimi.',
  'guven-skoru: veri kalitesi, varsayimlar ve karar guveni.',
  'sirius-ton: premium, dogal, karar odakli danismanlik tonu.',
].join('\n');

const SIRIUS_CORE_PROMPT = [
  '<sirius_identity>',
  'Sen Sirius AI e-ticaret danismanisin.',
  'Shopify magaza verisini, e-ticaret operasyon bilgisini ve genel ticari muhakemeyi birlestirerek cevap verirsin.',
  'Amacin kullaniciyi dar skill sinirlerine hapsetmek degil, magaza sahibine daha iyi karar aldirmaktir.',
  '</sirius_identity>',
  '',
  '<operating_principles>',
  '1. Her cevapta once kullanicinin gercek niyetini takip et; konu degistirdiyse eski magaza baglamina donme.',
  '2. Magaza verisini yalnizca routing_context.includeShopData true ise kullan. E-ticaret kelimesi gecmesi tek basina magaza verisi kullanma izni degildir.',
  '3. routing_context.includeShopData false ise shop metriklerini, stok rakamlarini, urun adlarini veya eski magaza analizlerini cevaba tasima.',
  '4. Veri yoksa veya eksikse bunu net soyle, sonra makul varsayimlarla pratik bir sonraki adim oner.',
  '5. Shopify, urun, stok, siparis, fulfillment, iade, kampanya, fiyat, conversion, merchandising ve musteri deneyimi baglamlarini iyi kullan; ama sadece kullanicinin niyetiyle ilgiliyse.',
  '6. E-ticaret disi veya genel bilgi sorularinda dogrudan cevap ver. E-ticarete sadece kullanici isterse veya dogal/faydali bir bag varsa bagla.',
  '7. Kesin kanit yokken kesin neden uydurma; hipotezleri ve nasil dogrulanacagini belirt.',
  '8. shop_data_json icinde aggregate metrikler varsa once karar kalitesini artiran sinyalleri kullan: trend, stok riski, yavas donen stok, gelir yogunlasmasi, kanal kirilimi, sepet ve fulfillment metrikleri.',
  '9. uploaded_file_context varsa onu da aktif baglam olarak kullan; dosya metni, tablo ozeti, PDF notlari veya gorsel ekleri magaza verisiyle birlikte yorumlayabilirsin.',
  '10. Musteri-level veri isteme veya uydurma; aggregate magaza metrikleri yeterliyse onerilerini bu verilerden cikar.',
  '11. Dogal, profesyonel ve yardimci konus. Robotik yasak listeleri veya kapsam disi refleksiyle cevap verme.',
  '12. Kullanici kisa cevap isterse kisa kal; analiz isterse ozet, sinyal ve aksiyon akisini kullan.',
  '</operating_principles>',
  '',
  '<context_policy>',
  'routing_context.intent sinifi kullanicinin bu mesajdaki niyetini gosterir: store_specific, commerce_general, market_general, followup veya off_topic.',
  'store_specific: Kendi magazasi, satisi, stogu, siparisi, urunu veya performansi soruluyorsa shop_data_json kullan.',
  'commerce_general veya market_general: Genel e-ticaret, Shopify, pazar, kategori, rakip veya trend sorusudur; shop_data_json verilmemisse magaza verisi uydurma ya da eski veriyi geri cagirma.',
  'followup: Kisa takip sorulari en yakin onceki cevap ve routing_context.focus icindeki son ana konuya baglidir. "3 kelimeyle ozetle" gibi isteklerde son aktif konuyu ozetle.',
  'off_topic: Kullanici genel bir konu soruyorsa normal guclu bir asistan gibi cevap ver; e-ticarete zorla cekme.',
  'Kullanici belirsiz bir e-ticaret sorusu sorarsa genel cercevede cevap ver ve "istersen bunu kendi magaza verine gore de yorumlayabilirim" gibi hafif bir opsiyon sun.',
  '</context_policy>',
  '',
  '<response_experience>',
  'Kullanici deneyimi icin her cevap once net karar veya kisa sonuc ile baslamali.',
  'Basit sorularda 1-2 paragraf yeterlidir. Analiz sorularinda en fazla su akisi kullan: Kisa karar, Neden, Sonraki adim, gerekiyorsa Veri notu.',
  'Uzun liste veya rapor yazman gerekiyorsa ilk 5-7 satirda kullanicinin kararini kolaylastir; ayrintiyi sonra ver.',
  'Eksik veri icin kaba veri-yok kaliplari kullanma. Bunun yerine "Bu konuda net karar icin X verisi henuz gorunmuyor; bu yuzden onerim Y sinyallerine dayaniyor" de.',
  'Kullaniciyi panikleten alarm dili, ham sistem etiketi, rozet adi veya teknik parser ifadesi kullanma.',
  'Kritik veya riskli bir durum varsa bunu dogal dille "Dikkat edilmesi gereken sinyal" ya da "Veri notu" olarak anlat.',
  '</response_experience>',
  '',
  '<technical_contract>',
  'Cevapta [SKILL: ...] veya benzeri ham teknik etiket yazma.',
  'Gorev olusturma gerekiyorsa gorevleri once kullaniciya dogal dille anlat; sonra gerekiyorsa en sonda tasks JSON blogu ekle.',
  'Kullaniciya gorunen cevapta koseli parantezli seviye etiketi veya benzeri ham teknik etiket kullanma.',
  '</technical_contract>',
].join('\n');

const PROVIDER_PROMPT_ADAPTERS = {
  chatgpt: [
    '<provider_adapter provider="chatgpt">',
    'Bu model direkt, talimat odakli ve iyi yapilandirilmis mesajlarda en iyi calisir.',
    'Cevapta once sonucu ver, sonra kisa kanitlar ve uygulanabilir aksiyonlar ekle; gereksiz uzun giris yapma.',
    'JSON task blogu gerekiyorsa sadece en sonda, gecerli JSON olarak ver.',
    'Cevaba ham skill etiketi ekleme.',
    'routing_context.dataPolicy kuralini takip et; shop_data_json yoksa magaza metriklerine donme.',
    'Gorunen cevapta ham uyari/kritik markerlari kullanma; riskleri dogal danisman diliyle anlat.',
    '</provider_adapter>',
  ].join('\n'),
  claude: [
    '<provider_adapter provider="claude">',
    'Bu model uzun baglami ve XML benzeri bolumleri iyi takip eder.',
    'Sistem bolumleri arasindaki onceligi koru: once Sirius kimligi, sonra plan, sonra aktif skill tanimlari.',
    'Analizde once kisa sentez yap, sonra gerekirse hipotezleri ve belirsizlikleri ayir.',
    'Cevaba ham skill etiketi ekleme.',
    'Kullaniciya uzun muhakeme dokme; karar, sinyal ve aksiyon ayrimini temiz tut.',
    'routing_context.dataPolicy kuralini takip et; shop_data_json yoksa magaza metriklerine donme.',
    'Gorunen cevapta ham uyari/kritik markerlari kullanma; riskleri dogal danisman diliyle anlat.',
    '</provider_adapter>',
  ].join('\n'),
  gemini: [
    '<provider_adapter provider="gemini">',
    'Bu model acik format beklentisi ve net cikti kontratiyla daha tutarli calisir.',
    'Cevaplarda basliklari sade tut, veriye dayali noktalar ile aksiyonlari karistirma.',
    'Belirsizlik varsa "Veri notu" veya "Kontrol edilmesi gereken nokta" olarak kisa belirt.',
    'Cevaba ham skill etiketi ekleme.',
    'routing_context.dataPolicy kuralini takip et; shop_data_json yoksa magaza metriklerine donme.',
    'Gorunen cevapta ham uyari/kritik markerlari kullanma; riskleri dogal danisman diliyle anlat.',
    '</provider_adapter>',
  ].join('\n'),
};

function loadSkillsFromFiles(planType, selectedSkills = SIRIUS_SKILLS) {
  const allowedSkills = new Set(SIRIUS_SKILLS);
  const skillList = [...new Set(selectedSkills)].filter((skillName) => allowedSkills.has(skillName));
  const sections = [];

  for (const skillName of skillList) {
    const filePath = path.join(SKILLS_DIR, `${skillName}.skill`);

    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`Skill file not found: ${skillName}.skill`);
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8').trim();
      sections.push(`## ${skillName}\n\n${content}`);
    } catch (err) {
      console.error(`Skill could not be read: ${skillName}.skill`, err.message);

      if (skillName !== FALLBACK_SKILL) {
        const fallbackContent = _loadFallbackSkill();
        if (fallbackContent && !sections.some((section) => section.startsWith(`## ${FALLBACK_SKILL}`))) {
          sections.push(fallbackContent);
        }
      }
    }
  }

  if (sections.length === 0) {
    const fallbackContent = _loadFallbackSkill();
    if (fallbackContent) {
      sections.push(fallbackContent);
    }
  }

  return sections.join('\n\n---\n\n');
}

function selectSkillsForPrompt({ routingContext, userMessage = '', attachmentKinds = [] } = {}) {
  const normalized = normalizeText(userMessage);
  const skills = new Set(DEFAULT_SELECTED_SKILLS);

  for (const skillName of ALWAYS_ON_SKILLS) {
    skills.add(skillName);
  }

  if (routingContext?.intent === 'off_topic') {
    return ['sirius-ton'];
  }

  if (routingContext?.intent === 'market_general' || routingContext?.intent === 'commerce_general') {
    if (/\b(plan|adim adim|to do|todo|gorev|ne yapmaliyim|aksiyon)\b/.test(normalized)) {
      skills.add('gorev');
      skills.add('oncelik');
    }
    return finalizeSkillSelection(skills);
  }

  if (routingContext?.includeShopData) {
    if (/\b(satis|ciro|siparis|rapor|performans|aov|sepet|gelir|hafta|ay|trend)\b/.test(normalized)) {
      skills.add('satis-raporu');
    }

    if (/\b(stok|envanter|inventory|stock|tedarik|bitiyor|reorder|dusuk stok)\b/.test(normalized)) {
      skills.add('anomali');
      skills.add('oncelik');
    }

    if (/\b(anomali|risk|problem|neden|niye|dustu|yukseldi|kotu gidiyor|ne oldu|sapma)\b/.test(normalized)) {
      skills.add('anomali');
      skills.add('rca-aksiyon');
      skills.add('guven-skoru');
    }

    if (/\b(plan|adim adim|to do|todo|gorev|ne yapmaliyim|aksiyon|yapilacak)\b/.test(normalized)) {
      skills.add('gorev');
      skills.add('oncelik');
    }

    if (attachmentKinds.length > 0) {
      skills.add('guven-skoru');
    }

    return finalizeSkillSelection(skills);
  }

  if (attachmentKinds.length > 0) {
    skills.add('guven-skoru');
  }

  return finalizeSkillSelection(skills);
}

function finalizeSkillSelection(skills) {
  const ordered = SIRIUS_SKILLS.filter((skillName) => skills.has(skillName));
  return ordered.length > 0 ? ordered : DEFAULT_SELECTED_SKILLS;
}

function _loadFallbackSkill() {
  const fallbackPath = path.join(SKILLS_DIR, `${FALLBACK_SKILL}.skill`);
  try {
    const content = fs.readFileSync(fallbackPath, 'utf-8').trim();
    return `## ${FALLBACK_SKILL}\n\n${content}`;
  } catch (err) {
    console.error('Fallback skill could not be read:', err.message);
    return null;
  }
}

async function buildSystemPrompt(shopId, db, options = {}) {
  let planType = 'sirius';
  const provider = options.provider || null;
  const model = options.model || null;
  const responseLanguage = options.responseLanguage || null;
  const selectedSkills = selectSkillsForPrompt({
    routingContext: options.routingContext,
    userMessage: options.userMessage,
    attachmentKinds: options.attachmentKinds || [],
  });

  try {
    const result = await db.query('SELECT plan FROM shops WHERE id = $1', [shopId]);
    if (result.rows.length > 0) {
      planType = result.rows[0].plan || 'sirius';
    }
  } catch (err) {
    console.error('Shop plan could not be loaded:', err.message);
  }

  const skillsPrompt = loadSkillsFromFiles(planType, selectedSkills);
  const staticHeader = [
    SIRIUS_CORE_PROMPT,
    '',
    '<skill_catalog>',
    SKILL_CATALOG,
    '</skill_catalog>',
    '',
    '<prompt_profile>',
    `version: ${PROMPT_PROFILE_VERSION}`,
    'Static instructions and the skill catalog are intentionally stable to improve provider prompt caching.',
    '</prompt_profile>',
  ].join('\n');

  const header = [
    staticHeader,
    PROMPT_CACHE_BOUNDARY,
    '',
    '<plan_context>',
    `Bu magazanin plani: ${planType.toUpperCase()}`,
    `Aktif skill sayisi: ${selectedSkills.length}`,
    `Bu istek icin detayli skill'ler: ${selectedSkills.join(', ')}`,
    provider ? `Secili AI provider: ${provider}` : null,
    model ? `Secili AI model: ${model}` : null,
    responseLanguage ? `Tum kullaniciya gorunen cevaplari su dilde ver: ${responseLanguage}.` : null,
    'Bu plan Sirius Pro: gelismis anomali, kok neden, gorev, oncelik ve guven katmanlari aktif.',
    '</plan_context>',
    '',
    '<active_skill_definitions>',
    'Asagidaki skill tanimlari yetenek modulleridir. Bunlari cevabi zenginlestirmek icin kullan; dar ve mekanik davranma.',
    '',
  ].join('\n');

  const adapterPrompt = buildProviderAdapterPrompt(provider);

  return {
    text: `${header}${skillsPrompt}\n</active_skill_definitions>${adapterPrompt}`,
    profile: {
      version: PROMPT_PROFILE_VERSION,
      selected_skills: selectedSkills,
      skill_count: selectedSkills.length,
      provider,
      model,
    },
  };
}

function getSystemPromptText(systemPrompt) {
  if (typeof systemPrompt === 'string') {
    return systemPrompt;
  }

  return systemPrompt?.text || '';
}

function getSystemPromptProfile(systemPrompt) {
  if (!systemPrompt || typeof systemPrompt !== 'object') {
    return {};
  }

  return systemPrompt.profile || {};
}

function buildProviderAdapterPrompt(provider) {
  if (!provider || !PROVIDER_PROMPT_ADAPTERS[provider]) {
    return '';
  }

  return `\n\n${PROVIDER_PROMPT_ADAPTERS[provider]}`;
}

function parseTasksFromResponse(aiResponse) {
  if (!aiResponse || typeof aiResponse !== 'string') {
    return null;
  }

  const codeBlockMatch = aiResponse.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    const parsed = _tryParseTasksJSON(codeBlockMatch[1].trim());
    if (parsed) {
      return parsed;
    }
  }

  const rawMatch = aiResponse.match(/\{\s*"tasks"\s*:\s*\[[\s\S]*?\]\s*\}/);
  if (rawMatch) {
    return _tryParseTasksJSON(rawMatch[0]);
  }

  return null;
}

function _tryParseTasksJSON(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    if (!data || !Array.isArray(data.tasks)) {
      return null;
    }

    const validTasks = data.tasks.filter((task) => task.title && typeof task.title === 'string');
    if (validTasks.length === 0) {
      return null;
    }

    return {
      tasks: validTasks.map((task) => ({
        title: task.title,
        description: task.description || '',
        priority_score: _clampScore(task.priority_score),
        confidence_score: _clampScore(task.confidence_score),
        estimated_minutes: typeof task.estimated_minutes === 'number' ? task.estimated_minutes : null,
        impact: task.impact || '',
        source_skill: typeof task.source_skill === 'string' ? task.source_skill : '',
      })),
    };
  } catch {
    return null;
  }
}

function parseAnomaliesFromResponse(aiResponse) {
  if (!aiResponse || typeof aiResponse !== 'string') {
    return [];
  }

  const lines = aiResponse.split('\n');
  const anomalies = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let level = null;
    const upper = trimmed.toUpperCase();
    if (trimmed.includes('🔴') || upper.includes('[KRITIK]') || upper.includes('[CRITICAL]')) {
      level = 'critical';
    } else if (trimmed.includes('🟡') || upper.includes('[UYARI]') || upper.includes('[WARNING]')) {
      level = 'warning';
    }

    if (!level) {
      continue;
    }

    const cleaned = _cleanAnomalyLine(trimmed);
    const parts = cleaned.split(/[.!?:—–-]\s*/);
    const title = parts[0] || cleaned;
    const description = parts.length > 1 ? parts.slice(1).join('. ').trim() : '';

    anomalies.push({
      level,
      title,
      description,
      confidence_score: level === 'critical' ? 85 : 65,
    });
  }

  return anomalies;
}

function _cleanAnomalyLine(line) {
  return line
    .replace(/\[KRITIK\]|\[CRITICAL\]|\[UYARI\]|\[WARNING\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function _clampScore(val) {
  if (typeof val !== 'number' || Number.isNaN(val)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(val)));
}

function getAvailableSkills(planType) {
  return [...SIRIUS_SKILLS];
}

module.exports = {
  PROMPT_CACHE_BOUNDARY,
  SIRIUS_SKILLS,
  PROVIDER_PROMPT_ADAPTERS,
  loadSkillsFromFiles,
  buildSystemPrompt,
  buildProviderAdapterPrompt,
  getSystemPromptProfile,
  getSystemPromptText,
  parseTasksFromResponse,
  parseAnomaliesFromResponse,
  selectSkillsForPrompt,
  getAvailableSkills,
};
