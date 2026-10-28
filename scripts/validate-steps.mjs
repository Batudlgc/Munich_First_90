#!/usr/bin/env node
// src/data/steps/*.json dosyalarının her birini src/data/steps.schema.json
// şemasına ve TASKS.md T1'de tanımlı iş kurallarına göre doğrular:
//   - şema uyumu (required / type / additionalProperties / minItems / pattern,
//     $ref çözümlemesi dahil)
//   - her adımın sources[] alanı en az 1 URL içermeli (şemadan: minItems)
//   - prerequisites[] içindeki her id, tanımlı bir adıma işaret etmeli
//   - adımlar arasında döngüsel bağımlılık olmamalı
//   - RANDEVU KATMANI (A4): appointment.mode "no_appointment" ise note
//     (gerekçe) dolu; diğer modlarda booking_url ya da appointment.phone dolu
//   - URL KURALI: booking_url ve tüm sources[] https:// olmalı; hiçbir metin
//     http://, javascript:, data: gibi şemalı adres içeremez
//   - ÜÇ DİL KURALI: her çeviri nesnesinde en/tr/de ÜÇÜ DE dolu olmalı; biri
//     boşsa HATA. Gerekçe: eksik çeviri ekranda boş bir bölüm olarak görünür,
//     kullanıcı bunu "bilgi yok" sanar.
//
// Ayrıca iki tür UYARI basar (hata DEĞİL, çıkış kodunu etkilemez):
//   1. İÇERİK TAZELİĞİ: last_verified 90 günden eskiyse veya hiç yoksa. Gerekçe:
//      prosedür verisi bayatlar — ücret değişir, form taşınır, Amt sayfası
//      yeniden yapılanır. Bayat veri bu üründe en pahalı hata türü, ama
//      derlemeyi durdurmaya da değmez.
//   2. KATMAN KURALI: official_title, authority.official ve documents[].official
//      alanları resmi ALMANCA terim olmalı (öğrencinin Amt'ta söyleyeceği
//      kelime). Bu alanlarda İngilizce/Türkçe metin sezilirse uyarı basar.
//      Sezgisel bir kontroldür, bu yüzden hata değil uyarıdır.
//
// Her adım kendi dosyasında durur (T6: çok dosyalı veri katmanı) — bu script
// dizindeki tüm .json dosyalarını okuyup tek bir listeye birleştirir.
//
// Kullanım: node scripts/validate-steps.mjs [--allow-blank-translations]
// Çıkış kodu 0 + "N/N valid" satırı: tüm adımlar geçerli.
// Çıkış kodu 1: en az bir adımda hata var, hatalar stderr'e yazılır.
//
// --allow-blank-translations: boş çeviri alanlarını hatadan uyarıya indirir.
// YALNIZCA geçiş penceresi içindir: şema göçü (scripts/migrate-steps.mjs)
// alanları bilerek boş bırakır, içerik fazı onları doldurur. O faz bittikten
// sonra bayraksız çalıştırma temiz olmak ZORUNDA — bayrak kalıcı bir kaçış
// yolu değildir.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STEPS_DIR = path.join(__dirname, '..', 'src', 'data', 'steps');
const STALE_AFTER_DAYS = 90;
// Zaman ekseni sırası — sıralamanın (steps.ts) ve bu kontrolün ortak kaynağı.
// "conditional" en sona konur: herkese gerekmediği için hiçbir zorunlu fazın
// önkoşulu OLAMAZ (bkz. aşağıdaki faz-sırası kontrolü), ama kendisi zorunlu
// fazlardan herhangi birine bağlı olabilir.
const PHASE_ORDER = { pre_arrival: 0, first_weeks: 1, first_90_days: 2, conditional: 3 };
const SCHEMA_PATH = path.join(__dirname, '..', 'src', 'data', 'steps.schema.json');

const allowBlankTranslations = process.argv.includes('--allow-blank-translations');

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

// src/data/steps/ altındaki her .json dosyasını okuyup tek bir diziye
// birleştirir. Dosya adı ile içindeki "id" alanı tutarlı olmak zorunda değil
// (id doğrulaması aşağıda ayrıca yapılıyor) ama pratikte aynı olmalı.
function loadStepsFromDir(dirPath) {
  const files = readdirSync(dirPath)
    .filter((name) => name.endsWith('.json'))
    .sort();
  return files.map((name) => loadJson(path.join(dirPath, name)));
}

function typeMatches(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'number') return typeof value === 'number';
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  return false;
}

function checkType(value, typeSpec) {
  const types = Array.isArray(typeSpec) ? typeSpec : [typeSpec];
  return types.some((t) => typeMatches(value, t));
}

/** "#/definitions/localizedText" -> şemadaki gerçek alt-şema. */
function resolveRef(spec, schema) {
  if (!spec || !spec.$ref) return spec;
  const segments = spec.$ref.replace(/^#\//, '').split('/');
  let node = schema;
  for (const segment of segments) node = node?.[segment];
  return node ?? spec;
}

/**
 * Bir değeri verilen alt-şemaya göre özyinelemeli (recursive) doğrular.
 * `at` alanın yolu ("documents[1].plain") — hata mesajı nerede olduğunu söylesin.
 * Tam bir JSON Schema motoru DEĞİL: bu projenin şemasında gerçekten kullanılan
 * anahtarları (type, required, properties, additionalProperties, items,
 * minItems, pattern, $ref, anyOf) destekler. Harici bir doğrulama paketi kurmamak
 * bilinçli (CLAUDE.md: yeni bağımlılık eklenmiyor).
 */
function validateValue(value, rawSpec, schema, at, errors) {
  const spec = resolveRef(rawSpec, schema);
  if (!spec) return;

  // anyOf: dallardan biri hatasız geçerse değer geçerlidir. Şemada yalnız
  // "çeviri nesnesi ya da null" için kullanılıyor ($ref + null birleşimi).
  if (spec.anyOf) {
    const passes = spec.anyOf.some((branch) => {
      const branchErrors = [];
      validateValue(value, branch, schema, at, branchErrors);
      return branchErrors.length === 0;
    });
    if (!passes) errors.push(`"${at}" alanı izin verilen biçimlerin hiçbirine uymuyor`);
    return;
  }

  if (spec.type && !checkType(value, spec.type)) {
    errors.push(`"${at}" alanının tipi yanlış (beklenen: ${spec.type})`);
    return;
  }

  // null kabul edilen bir alan null ise iç kurallar uygulanmaz.
  if (value === null) return;

  if (typeof value === 'string' && spec.pattern && !new RegExp(spec.pattern).test(value)) {
    errors.push(`"${at}" alanı beklenen biçimde değil (${spec.pattern})`);
  }

  if (spec.enum && !spec.enum.includes(value)) {
    errors.push(`"${at}" alanı izin verilen değerlerden biri olmalı (${spec.enum.join(', ')})`);
  }

  if (Array.isArray(value)) {
    if (spec.minItems && value.length < spec.minItems) {
      errors.push(`"${at}" en az ${spec.minItems} öğe içermeli (kaynak zorunluluğu)`);
    }
    if (spec.items) {
      value.forEach((item, index) => {
        validateValue(item, spec.items, schema, `${at}[${index}]`, errors);
      });
    }
    return;
  }

  if (typeMatches(value, 'object')) {
    for (const field of spec.required ?? []) {
      if (!(field in value)) errors.push(`"${at}.${field}" alanı eksik`);
    }
    if (spec.additionalProperties === false && spec.properties) {
      for (const key of Object.keys(value)) {
        if (!(key in spec.properties)) errors.push(`"${at}.${key}" şemada tanımlı değil`);
      }
    }
    for (const [field, fieldSpec] of Object.entries(spec.properties ?? {})) {
      if (!(field in value)) continue;
      validateValue(value[field], fieldSpec, schema, at ? `${at}.${field}` : field, errors);
    }
  }
}

function validateAgainstSchema(step, schema, errors) {
  const itemSchema = schema.items;
  for (const field of itemSchema.required) {
    if (!(field in step)) errors.push(`"${field}" alanı eksik`);
  }
  if (itemSchema.additionalProperties === false) {
    for (const key of Object.keys(step)) {
      if (!(key in itemSchema.properties)) errors.push(`"${key}" şemada tanımlı değil`);
    }
  }
  for (const [field, fieldSpec] of Object.entries(itemSchema.properties)) {
    if (!(field in step)) continue;
    validateValue(step[field], fieldSpec, schema, field, errors);
  }
}

/**
 * Adımın içindeki her çeviri nesnesini ({ en, tr, de }) yolu ile birlikte
 * gezer. Şemadan $ref'i takip etmek yerine yapıyı doğrudan dolaşıyoruz —
 * çeviri nesnesi "en/tr/de anahtarlarına sahip düz nesne" olarak tanınabiliyor
 * ve bu, şema büyüdükçe de kendiliğinden çalışıyor.
 */
function collectTranslations(value, at, found) {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTranslations(item, `${at}[${index}]`, found));
    return;
  }
  const keys = Object.keys(value);
  const isLocalized = ['en', 'tr', 'de'].every((lang) => keys.includes(lang));
  if (isLocalized) {
    found.push({ at, value });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    collectTranslations(child, at ? `${at}.${key}` : key, found);
  }
}

// --- URL şeması kuralı: yalnız https:// ----------------------------------------
const HTTPS_URL = /^https:\/\/\S+$/i;
/** Metnin herhangi bir yerinde düz http:// adresi. */
const INSECURE_URL_IN_TEXT = /\bhttp:\/\//i;
/** Metin bir betik/veri/yerel şemayla başlıyor (javascript:, data:, mailto: ...). */
const DANGEROUS_SCHEME = /^\s*(?:javascript|data|vbscript|file|ftp|blob|mailto|tel|sms):/i;
/** "şema://" ile başlayan her metin (ör. ftp://, ws://). https:// ayrıca kabul edilir. */
const OTHER_SCHEME_URL = /^\s*[a-z][a-z0-9+.-]*:\/\//i;

/** Adımdaki her metin değerini yolu ile toplar (çeviri nesneleri ve diziler dahil). */
function collectStrings(value, at, found) {
  if (typeof value === 'string') {
    found.push({ at, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${at}[${index}]`, found));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) collectStrings(child, at ? `${at}.${key}` : key, found);
  }
}

// --- Katman kuralı sezgisi: "official" alanları Almanca kalmalı ---------------
// Tam bir dil tanıma değil, ucuz bir kontrol. ö/ü/ç harfleri hem Almanca hem
// Türkçe'de var, bu yüzden ayırt edici değil; ı/ğ/ş yalnızca Türkçe'de var.
const TURKISH_ONLY_CHARS = /[ışğİŞĞı]/;
const TURKISH_WORDS =
  /\b(için|gerekli|gerekmez|belge|belgesi|sadece|değil|yoluyla|ile|olarak|kimlik|başvuru|sonra|önce)\b/i;
const ENGLISH_WORDS = /\b(the|your|you|required|and|with|for|from|proof|of|card|number)\b/i;
const GERMAN_WORDS =
  /\b(der|die|das|des|dem|den|und|oder|für|mit|bei|nach|vom|zur|zum|ein|eine|einer|Nachweis|Bestätigung|Ausweis|Bescheinigung|Antrag|Anmeldung|gültiger?|gültige)\b/i;

function looksNonGerman(text) {
  if (!text || typeof text !== 'string') return false;
  if (TURKISH_ONLY_CHARS.test(text)) return true;
  if (TURKISH_WORDS.test(text)) return true;
  if (ENGLISH_WORDS.test(text) && !GERMAN_WORDS.test(text)) return true;
  return false;
}

// DFS ile döngü arar. Bulursa döngüyü oluşturan id zincirini döner, yoksa null.
function findCycle(steps) {
  const byId = new Map(steps.filter((s) => s.id).map((s) => [s.id, s]));
  const UNVISITED = 0;
  const VISITING = 1;
  const DONE = 2;
  const state = new Map();

  function visit(id, chain) {
    const status = state.get(id) ?? UNVISITED;
    if (status === DONE) return null;
    if (status === VISITING) return [...chain, id];

    state.set(id, VISITING);
    const step = byId.get(id);
    if (step && Array.isArray(step.prerequisites)) {
      for (const dep of step.prerequisites) {
        const cycle = visit(dep, [...chain, id]);
        if (cycle) return cycle;
      }
    }
    state.set(id, DONE);
    return null;
  }

  for (const step of steps) {
    if (!step.id) continue;
    const cycle = visit(step.id, []);
    if (cycle) return cycle;
  }
  return null;
}

function main() {
  const schema = loadJson(SCHEMA_PATH);
  const steps = loadStepsFromDir(STEPS_DIR);

  if (!Array.isArray(steps)) {
    console.error('HATA: src/data/steps/ içindeki dosyalar bir dizi oluşturmalı');
    process.exit(1);
  }

  const errorsByStep = new Map();
  const addError = (key, msg) => {
    if (!errorsByStep.has(key)) errorsByStep.set(key, []);
    errorsByStep.get(key).push(msg);
  };

  const blankWarnings = [];
  const layerWarnings = [];

  const idCounts = new Map();
  for (const step of steps) {
    if (step && step.id) {
      idCounts.set(step.id, (idCounts.get(step.id) ?? 0) + 1);
    }
  }
  const knownIds = new Set(idCounts.keys());
  const byId = new Map(steps.filter((s) => s && s.id).map((s) => [s.id, s]));

  steps.forEach((step, index) => {
    const key = step && step.id ? step.id : `#${index}`;
    const schemaErrors = [];
    validateAgainstSchema(step ?? {}, schema, schemaErrors);
    schemaErrors.forEach((msg) => addError(key, msg));

    if (step && step.id && idCounts.get(step.id) > 1) {
      addError(key, 'id tekrar ediyor');
    }

    if (step && Array.isArray(step.prerequisites)) {
      for (const dep of step.prerequisites) {
        if (!knownIds.has(dep)) {
          addError(key, `prerequisites içindeki "${dep}" id'si tanımlı değil`);
          continue;
        }
        // Faz-sırası kuralı: bir adımın önkoşulu kendisinden SONRAKİ bir fazda
        // olamaz (ör. first_weeks adımı first_90_days adımına bağlıysa hata).
        // Bilinmeyen/geçersiz faz değeri burada sessizce atlanır — şema
        // denetimi (enum) o hatayı zaten ayrıca raporlar.
        const depStep = byId.get(dep);
        const stepOrder = PHASE_ORDER[step.phase];
        const depOrder = depStep && PHASE_ORDER[depStep.phase];
        if (stepOrder !== undefined && depOrder !== undefined && depOrder > stepOrder) {
          addError(
            key,
            `önkoşulu "${dep}" (faz: ${depStep.phase}) kendisinden (faz: ${step.phase}) sonraki bir fazda olamaz`
          );
        }
      }
    }

    // Randevu katmanı kuralları (A4). Şema biçimi zaten denetliyor; burada
    // alanlar arası tutarlılık: "randevu yok" diyen adım nedenini söylemeli,
    // "randevu var" diyen adım kullanıcıya bir giriş kapısı (portal ya da
    // telefon) göstermeli — yoksa ekranda boş, işe yaramaz bir bölüm çıkar.
    const appt = step?.appointment;
    if (appt && typeof appt === 'object') {
      if (appt.mode === 'no_appointment' && !appt.note) {
        addError(key, 'appointment.mode "no_appointment" iken appointment.note gerekçe olarak dolu olmalı');
      }
      if (appt.mode && appt.mode !== 'no_appointment' && !step.booking_url && !appt.phone) {
        addError(key, `appointment.mode "${appt.mode}" iken booking_url ya da appointment.phone dolu olmalı`);
      }
    }

    // Üç dil kuralı.
    const translations = [];
    collectTranslations(step ?? {}, '', translations);
    for (const { at, value } of translations) {
      const missing = ['en', 'tr', 'de'].filter(
        (lang) => typeof value[lang] !== 'string' || value[lang].trim() === ''
      );
      if (missing.length === 0) continue;
      const msg = `"${at}" çevirisi eksik: ${missing.join(', ')} boş`;
      if (allowBlankTranslations) blankWarnings.push(`[${key}] ${msg}`);
      else addError(key, msg);
    }

    // URL şeması kuralı: adım verisindeki her bağlantı https:// olmalı. Bu alanlar
    // ExternalLink/openExternal ile cihazda açılır; http:// ya da javascript:/data:
    // gibi şemalar kaynak güncellemesinde sızarsa kullanıcı güvensiz adrese gider.
    if (step) {
      const urlFields = [['booking_url', step.booking_url]];
      (step.sources ?? []).forEach((url, i) => urlFields.push([`sources[${i}]`, url]));
      (step.appointment?.sources ?? []).forEach((url, i) => urlFields.push([`appointment.sources[${i}]`, url]));
      urlFields.push(['official_title_check.source', step.official_title_check?.source]);
      for (const [at, url] of urlFields) {
        if (typeof url === 'string' && !HTTPS_URL.test(url)) {
          addError(key, `"${at}" https:// ile başlayan bir adres olmalı: "${url.slice(0, 70)}"`);
        }
      }
      const strings = [];
      collectStrings(step, '', strings);
      for (const { at, text } of strings) {
        if (INSECURE_URL_IN_TEXT.test(text) || DANGEROUS_SCHEME.test(text) || (OTHER_SCHEME_URL.test(text) && !HTTPS_URL.test(text))) {
          addError(key, `"${at}" https:// dışı bir adres içeriyor: "${text.slice(0, 70)}"`);
        }
      }
    }

    // Katman kuralı: resmi terimler Almanca kalmalı.
    if (step) {
      const officialFields = [['official_title', step.official_title]];
      if (step.authority) officialFields.push(['authority.official', step.authority.official]);
      (step.documents ?? []).forEach((doc, i) => {
        officialFields.push([`documents[${i}].official`, doc?.official]);
      });
      for (const [at, text] of officialFields) {
        if (looksNonGerman(text)) {
          layerWarnings.push(`[${key}] "${at}" Almanca görünmüyor: "${String(text).slice(0, 70)}…"`);
        }
      }
    }
  });

  // Resmî ad denetimi (Batu, 06.10.2026): verified ise kaynak adımın kendi
  // kaynaklarından biri olmalı; unverified olanlar her koşuda listelenir.
  const officialWarnings = [];
  for (const step of steps) {
    const check = step?.official_title_check;
    if (!check) continue;
    const own = [...(step.sources ?? []), ...(step.appointment?.sources ?? [])];
    if (check.kind === 'verified' && !own.includes(check.source)) {
      addError(step.id, `official_title_check.source adımın kaynaklarında yok: ${check.source}`);
    }
    if (check.kind !== 'verified' && check.source !== null) {
      addError(step.id, `official_title_check.source yalnız "verified" için doldurulur`);
    }
    if (check.kind === 'unverified') {
      officialWarnings.push(`[${step.id}] official_title kaynakta birebir doğrulanmadı: "${step.official_title}"`);
    }
  }

  // İçerik tazeliği — uyarı, hata değil.
  const freshnessWarnings = [];
  const today = new Date();
  for (const step of steps) {
    if (!step || !step.id) continue;
    if (!step.last_verified) {
      freshnessWarnings.push(`[${step.id}] last_verified boş — kaynakları hiç doğrulanmadı`);
      continue;
    }
    const verified = new Date(step.last_verified);
    if (Number.isNaN(verified.getTime())) {
      freshnessWarnings.push(`[${step.id}] last_verified okunamadı: "${step.last_verified}"`);
      continue;
    }
    const ageDays = Math.floor((today - verified) / 86400000);
    if (ageDays > STALE_AFTER_DAYS) {
      freshnessWarnings.push(
        `[${step.id}] last_verified ${ageDays} gün önce (${step.last_verified}) — tazelenmeli`
      );
    }
  }

  const cycle = findCycle(steps);
  if (cycle) {
    for (const id of new Set(cycle)) {
      addError(id, `döngüsel bağımlılığa dahil: ${cycle.join(' -> ')}`);
    }
  }

  const total = steps.length;
  const invalidCount = errorsByStep.size;
  const validCount = total - invalidCount;

  if (invalidCount > 0) {
    console.error('Hatalar:');
    for (const [key, msgs] of errorsByStep) {
      for (const msg of msgs) {
        console.error(`  [${key}] ${msg}`);
      }
    }
  }

  if (blankWarnings.length > 0) {
    console.log(
      `Boş çeviriler (--allow-blank-translations ile hatadan indirildi) — ${blankWarnings.length} alan:`
    );
    for (const w of blankWarnings) console.log(`  ${w}`);
  }

  if (layerWarnings.length > 0) {
    console.log('Uyarılar (katman kuralı: "official" alanları Almanca kalmalı) — hata değil:');
    for (const w of layerWarnings) console.log(`  ${w}`);
  }

  if (officialWarnings.length > 0) {
    console.log('Uyarılar (resmî ad kaynakta doğrulanmadı — içerik tahminle değiştirilmez) — hata değil:');
    for (const w of officialWarnings) console.log(`  ${w}`);
  }

  if (freshnessWarnings.length > 0) {
    console.log(`Uyarılar (içerik tazeliği, ${STALE_AFTER_DAYS} gün eşiği) — hata değil:`);
    for (const w of freshnessWarnings) console.log(`  ${w}`);
  }

  console.log(`${validCount}/${total} valid`);
  process.exit(invalidCount > 0 ? 1 : 0);
}

main();
