// Proxy'nin görebildiği TEK içerik: uygulamanın kendi adım JSON'ları
// (src/data/steps/*.json). Aynı dosyalar paketlemede Worker'a gömülür; ayrı
// bir kopya yok, içerik tek yerde versiyonlanır (CLAUDE.md "Teknik kısıtlar").
// Workers'ta dosya sistemi olmadığı için her dosya tek tek import edilir;
// test/steps.test.ts klasördeki dosyalarla bu listenin aynı olduğunu denetler.
import type { Lang } from './lang';

import abmeldung from '../../src/data/steps/abmeldung.json';
import anmeldung from '../../src/data/steps/anmeldung.json';
import aufenthaltstitel from '../../src/data/steps/aufenthaltstitel.json';
import bankkonto from '../../src/data/steps/bankkonto.json';
import fiktionsbescheinigung from '../../src/data/steps/fiktionsbescheinigung.json';
import fuehrerscheinUmschreibung from '../../src/data/steps/fuehrerschein-umschreibung.json';
import haftpflichtversicherung from '../../src/data/steps/haftpflichtversicherung.json';
import immatrikulation from '../../src/data/steps/immatrikulation.json';
import krankenkasse from '../../src/data/steps/krankenkasse.json';
import rundfunkbeitrag from '../../src/data/steps/rundfunkbeitrag.json';
import schufa from '../../src/data/steps/schufa.json';
import semesterticket from '../../src/data/steps/semesterticket.json';
import simKarte from '../../src/data/steps/sim-karte.json';
import sperrkonto from '../../src/data/steps/sperrkonto.json';
import steuerId from '../../src/data/steps/steuer-id.json';
import ummeldung from '../../src/data/steps/ummeldung.json';
import werkstudentArbeitserlaubnis from '../../src/data/steps/werkstudent-arbeitserlaubnis.json';

type Localized = Record<Lang, string>;
type OfficialTerm = { official: string; plain: Localized };

/** Uygulamadaki `Step` tipinin (src/lib/steps.ts) proxy'nin kullandığı alt kümesi. */
export type ProxyStep = {
  id: string;
  official_title: string;
  title: Localized;
  summary: Localized;
  authority: OfficialTerm | null;
  documents: OfficialTerm[];
  deadline_rule: { days: number | null; text: Localized } | null;
  common_mistakes: Localized[];
  booking_url: string | null;
  sources: string[];
  /** Randevu bilgi katmanı (A4). Online kayıt, slot açılış saatleri, telefon, acil randevu burada. */
  appointment: {
    mode: 'appointment' | 'appointment_or_written' | 'application_first' | 'no_appointment';
    walk_in: boolean | null;
    phone: { number: string; hours: Localized | null } | null;
    slot_release: Localized | null;
    note: Localized | null;
    sources: string[];
  };
};

export const STEPS: ProxyStep[] = [
  anmeldung,
  steuerId,
  krankenkasse,
  bankkonto,
  rundfunkbeitrag,
  sperrkonto,
  immatrikulation,
  haftpflichtversicherung,
  aufenthaltstitel,
  fiktionsbescheinigung,
  werkstudentArbeitserlaubnis,
  schufa,
  fuehrerscheinUmschreibung,
  semesterticket,
  simKarte,
  ummeldung,
  abmeldung,
] as ProxyStep[];

/** Bir soruya en fazla kaç adımın içeriği modele verilir (token maliyeti). */
const MAX_MATCHED_STEPS = 2;

/**
 * Eşleştirmede anlam taşımayan kelimeler. Başlıklarda sık geçen fiiller
 * ("anmelden", "opening") burada: yoksa "Rundfunkbeitrag anmelden" başlığı
 * her "anmelden" geçen soruyu yakalardı.
 */
const STOPWORDS = new Set([
  'your', 'with', 'from', 'for', 'the', 'and', 'getting', 'opening', 'registering',
  'bei', 'des', 'der', 'die', 'das', 'und', 'für', 'eines', 'einer', 'oder', 'anmelden',
  'eröffnen', 'erhalten', 'beantragen', 'besorgen', 'ehemals', 'kaydı', 'alma', 'açma',
  'için', 'münchen', 'munich', 'münih',
]);

/** scope.ts ile aynı normalleştirme: Türkçe İ/I sorununu önleyip küçük harfe çevirir. */
export function normalize(text: string): string {
  return text.replace(/İ/g, 'i').replace(/I/g, 'i').toLocaleLowerCase('tr-TR');
}

/** Adımın id'si, resmi adı ve üç dildeki başlığından anahtar kelimeler çıkarır. */
function keywordsOf(step: ProxyStep): Set<string> {
  const text = [step.id.replace(/-/g, ' '), step.official_title, ...Object.values(step.title)].join(' ');
  const words = normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
  return new Set(words);
}

/**
 * Başlıkta geçmeyen ama sorularda sık görülen kelimeler, eş anlamlılar ve
 * gündelik ifadeler (TR/EN/DE). Hepsi küçük harfli, `normalize` sonrası metinle
 * karşılaştırılır. 3 harf ve kısaları ("tk", "sim", "tv", "o2") yalnız TAM
 * kelime olarak eşleşir; uzunları metin içinde geçmesi yeterli (Türkçe ekler:
 * "ehliyetimi" → "ehliyet").
 *
 * B5 (05.10): "einschreib" / "enroll". S1 (13.10): gündelik dille 50 sorunun
 * 20'si hiçbir adımla eşleşmiyor ya da yanlış adıma gidiyordu ("telefon hattı",
 * "radyo tv parası", "vergi numaram", "ehliyetimi"). Her ekleme
 * src/lib/sor-erisim.test.ts'teki bir soruyla kilitli.
 */
const ALIASES: Record<string, string[]> = {
  anmeldung: [
    // Toplantı 20.10: "Should I bring my passport to the Anmeldung appointment?"
    // Pasaport Anmeldung'un "Yanına al" listesinde; oturum izninde de var (ağırlık bölünür).
    'passport', 'pasaport', 'reisepass', 'register',
    'adres kayd', 'adresimi', 'adres bildir', 'ikametgah', 'ikametgâh', 'register my address',
    'address registration', 'register address', 'melde ich mich', 'meldebescheinigung', 'wohnungsgeber',
    'ev sahibinden', 'bürgerbüro', 'buergerbuero', 'kvr',
  ],
  ummeldung: [
    'ev değiştir', 'evimi değiştir', 'taşındım', 'taşınıyorum', 'umzug', 'umgezogen', 'moved within',
    'new flat', 'new apartment', 'yeni eve',
  ],
  abmeldung: [
    'leaving germany', 'leave germany', 'moving out of germany', 'wegzug', 'almanyadan', "almanya'dan",
    'ülkeden çık', 'ausreise', 'kesin dönüş',
  ],
  bankkonto: ['banka', 'bank account', 'girokonto', 'iban', 'konto eröffnen', 'hesap aç'],
  sperrkonto: ['bloke', 'blocked account', 'expatrio', 'fintiba', 'coracle'],
  krankenkasse: [
    'sağlık sigorta', 'saglik sigorta', 'health insurance', 'krankenversicherung', 'tk', 'aok', 'barmer',
    'dak', 'techniker', 'sigorta', 'insurance', 'versicherung',
  ],
  haftpflichtversicherung: ['haftpflicht', 'sorumluluk sigorta', 'liability', 'sigorta', 'insurance', 'versicherung'],
  'sim-karte': [
    'telefon', 'hattı', 'hat al', 'hat aç', 'phone', 'handy', 'mobilfunk', 'sim', 'prepaid', 'faturalı',
    'vodafone', 'telekom', 'o2', 'lebara', 'aldi talk',
  ],
  'steuer-id': ['vergi', 'tax id', 'tax number', 'steuernummer', 'steuer', 'identifikationsnummer', 'idnr'],
  aufenthaltstitel: [
    'passport', 'pasaport', 'reisepass',
    'oturum izn', 'ikamet izn', 'ikamet', 'residence permit', 'aufenthalt', 'ausländerbehörde',
    'auslaenderbehoerde', 'yabancılar daire', 'yabancilar daire', 'vize', 'visa', 'visum', 'zuwanderung',
  ],
  fiktionsbescheinigung: ['fiktion', 'geçici oturum', 'interim', 'vizem bit', 'vize bit', 'visa expir', 'permit expir'],
  rundfunkbeitrag: [
    'rundfunk', 'radyo', 'televizyon', 'tv', 'gez', 'beitragsservice', 'broadcast', 'tv tax', 'tv licen',
    'yayın ücret',
  ],
  semesterticket: [
    'mvv', 'mvg', 'bilet', 'ticket', 'toplu taşıma', 'ulaşım', 'public transport', 'semesterticket', 'metro',
    'u-bahn', 's-bahn',
  ],
  immatrikulation: [
    'einschreib', 'enroll', 'enrol', 'immatrikul', 'matrikel', 'üniversite kayd', 'universite kayd',
    'okul kayd', 'okula kayıt', 'student id', 'öğrenci kimli', 'öğrenci belgesi', 'studienbescheinigung',
    'semesterbeitrag', 'harç',
  ],
  'werkstudent-arbeitserlaubnis': [
    'çalış', 'calis', 'iş bul', 'work', 'job', 'arbeit', 'werkstudent', 'minijob', '140 gün', '140 days',
    '140 tage', 'part-time', 'part time', 'yarı zamanlı',
  ],
  'fuehrerschein-umschreibung': [
    'ehliyet', 'driving', 'driver', 'führerschein', 'fuhrerschein', 'fuehrerschein', 'araba kullan',
    'araç kullan', 'sürücü',
  ],
  schufa: ['kredi rapor', 'kredi not', 'credit report', 'credit score', 'bonität', 'bonitaet', 'ev ararken', 'wohnungssuche'],
};

const KEYWORDS = new Map(
  STEPS.map((step) => [step.id, new Set([...keywordsOf(step), ...(ALIASES[step.id] ?? [])])]),
);

/** Bütün adımların tek kelimelik anahtar kelimeleri (yazım hatası denetimi için). */
const KNOWN_WORDS = new Set([...KEYWORDS.values()].flatMap((words) => [...words].filter((w) => !w.includes(' '))));

/**
 * Bir kelime kaç adımda geçiyorsa ağırlığı o kadar düşer (1/adım sayısı).
 * "anmeldung" hem anmeldung hem ummeldung başlığında geçer; "wohnsitzes"
 * gibi ortak kelimeler tek bir adımı öne çıkarmasın diye.
 */
const WEIGHTS = new Map<string, number>();
for (const words of KEYWORDS.values()) {
  for (const word of words) WEIGHTS.set(word, (WEIGHTS.get(word) ?? 0) + 1);
}

/** Sorunun kelimeleri (harf/rakam dizileri). */
function tokensOf(normalized: string): string[] {
  return normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/** İki kelime arasında en fazla bir harf farkı var mı (ekleme, silme, değiştirme)? */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Anahtar kelime soruda geçiyor mu?
 * - 3 harf ve kısası: yalnız tam kelime ("tk", "sim", "tv").
 * - Diğerleri: metin içinde geçmesi yeterli ("sperrkontodaki" ⊃ "sperrkonto").
 * - Başlıktan gelen 6+ harfli kelimelerde ek farkı: soru kelimesiyle en az
 *   6 harflik ortak önek ("sigorta" ~ "sigortası", "üniversite" ~ "üniversiteye").
 * - 7+ harfli tek kelimelerde bir harflik yazım hatası (toplantı 20.10:
 *   "unmeldung" hiçbir adımla eşleşmiyordu; artık Anmeldung ve Ummeldung).
 */
function keywordHit(keyword: string, normalized: string, tokens: string[]): boolean {
  if (keyword.length <= 3) return tokens.includes(keyword);
  if (normalized.includes(keyword)) return true;
  if (keyword.length < 6 || keyword.includes(' ')) return false;
  if (tokens.some((token) => token.length >= 5 && commonPrefixLength(token, keyword) >= 6)) return true;
  // Soru kelimesi zaten başka bir adımın gerçek anahtar kelimesiyse yazım hatası
  // sayılmaz: "anmeldung" ile "abmeldung" de tek harf farklı.
  return keyword.length >= 7 && tokens.some((token) => !KNOWN_WORDS.has(token) && withinOneEdit(token, keyword));
}

export function getStep(id: string): ProxyStep | undefined {
  return STEPS.find((step) => step.id === id);
}

/**
 * Soruyla ilgili adımları bulur. Deterministik, LLM'siz: sorunun metninde
 * adımın anahtar kelimeleri geçiyor mu. Eşleşme yoksa boş dizi döner ve
 * proxy modele HİÇ gitmez (APP.md §4: "Eşleşen adım yoksa cevap yok").
 */
export function matchSteps(question: string): ProxyStep[] {
  const normalized = normalize(question);
  const tokens = tokensOf(normalized);
  const scored = STEPS.map((step) => {
    let score = 0;
    for (const word of KEYWORDS.get(step.id) ?? []) {
      if (keywordHit(word, normalized, tokens)) score += 1 / (WEIGHTS.get(word) ?? 1);
    }
    return { step, score };
  }).filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_MATCHED_STEPS).map((entry) => entry.step);
}

/**
 * Modele verilecek adım görünümü: yalnız istenen dil + çevrilmeyen resmi
 * terimler. Üç dili birden göndermek token maliyetini üçe katlardı.
 */
export function stepForPrompt(step: ProxyStep, lang: Lang) {
  return {
    id: step.id,
    official_title: step.official_title,
    title: step.title[lang],
    summary: step.summary[lang],
    authority: step.authority && { official: step.authority.official, plain: step.authority.plain[lang] },
    documents: step.documents.map((doc) => ({ official: doc.official, plain: doc.plain[lang] })),
    deadline: step.deadline_rule && { days: step.deadline_rule.days, text: step.deadline_rule.text[lang] },
    common_mistakes: step.common_mistakes.map((mistake) => mistake[lang]),
    booking_url: step.booking_url,
    sources: step.sources,
    // 06.10: A4'ün randevu katmanı modele hiç gitmiyordu; model "online kayıt yapılamaz" diye
    // içerikle çelişen cevap verdi. walk_in null ise gönderilmez (kaynak söylemiyor demek).
    appointment: {
      mode: step.appointment.mode,
      ...(step.appointment.walk_in === null ? {} : { walk_in: step.appointment.walk_in }),
      phone: step.appointment.phone && {
        number: step.appointment.phone.number,
        hours: step.appointment.phone.hours?.[lang] ?? null,
      },
      slot_release: step.appointment.slot_release?.[lang] ?? null,
      note: step.appointment.note?.[lang] ?? null,
      sources: step.appointment.sources,
    },
  };
}
