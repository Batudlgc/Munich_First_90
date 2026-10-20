/**
 * Sözlük sekmesinin saf mantığı: arama ve harf gruplaması. Ekran
 * (src/app/(tabs)/explore.tsx) yalnız sonucu çizer; burada React yok, bu
 * yüzden Node'da test edilebilir (glossary.test.ts).
 *
 * Veri src/data/glossary.json'da. ÖNCE açıklama yalnız Türkçeydi ve İngilizce
 * ile Almanca arayüzde de Türkçe görünüyordu; ŞİMDİ her terimin açıklaması
 * üç dilde (`Localized`), terimin kendisi resmi Almanca ad olarak çevrilmez.
 */
import glossaryData from '@/data/glossary.json';
import type { Lang } from '@/lib/language';
import type { Localized } from '@/lib/steps';

export type GlossaryEntry = {
  /** Resmi Almanca terim — hiçbir dile çevrilmez. */
  term: string;
  explanation: Localized;
};

export type GlossaryGroup = {
  /** Grubun baş harfi ("A", "S"). Ä gibi harfler temel harfin (A) altında. */
  letter: string;
  entries: GlossaryEntry[];
};

export const GLOSSARY: readonly GlossaryEntry[] = glossaryData;

/**
 * Arama için harf katlama. Kullanıcı "Wohnungsgeberbestatigung" ya da
 * "ausländer" yerine "auslander" yazdığında da bulsun; Türkçe klavyedeki
 * büyük İ ("İmmatrikulation") ve noktasız ı ("kaydı") da düz i sayılsın.
 *
 * `String.prototype.normalize('NFD')` yerine açık bir tablo kullanıldı: tablo
 * Hermes'te ve Node'da birebir aynı çalışır, hangi harfin neye katlandığı da
 * burada okunur. İ, küçük harfe çevrilmeden ÖNCE i olur — JS'te
 * 'İ'.toLowerCase() iki karakterlik "i̇" (i + birleşik nokta) döner.
 */
const FOLD: Record<string, string> = {
  ä: 'a',
  ö: 'o',
  ü: 'u',
  ß: 'ss',
  ı: 'i',
  ş: 's',
  ğ: 'g',
  ç: 'c',
  â: 'a',
  î: 'i',
  û: 'u',
  é: 'e',
  è: 'e',
  ê: 'e',
  à: 'a',
  á: 'a',
  í: 'i',
  ó: 'o',
  ú: 'u',
};

export function foldForSearch(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .replace(/ẞ/g, 'ss')
    .toLowerCase()
    .replace(/[äöüßışğçâîûéèêàáíóú]/g, (ch) => FOLD[ch] ?? ch);
}

/** Metni kelimelere böler (boşluk, tire, eğik çizgi, parantez, nokta…). */
function words(text: string): string[] {
  return foldForSearch(text).split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Sözlük araması — kelime BAŞINDAN eşleşir, kelimenin ortasından değil
 * (toplantı 20.10: "SS" yazınca "Niederlassungserlaubnis"in ortasındaki "ss"
 * bulunuyordu; "Kr" yazan Krankenkasse'yi arıyor).
 *
 * - Terimin kendisi ya da terimdeki bir kelime (ör. "Kreisverwaltungsreferat
 *   (KVR)" içindeki "KVR") aranan harflerle BAŞLIYORSA eşleşir.
 * - 3 harf ve üstünde, SEÇİLİ dildeki açıklamada bir kelime aranan harflerle
 *   başlıyorsa da eşleşir ("banka" → Sperrkonto). Kısa aramada açıklamaya
 *   bakılmaz: 1–2 harf açıklamada neredeyse her şeyi bulur.
 * - Diğer dillerin açıklaması aranmaz: ekranda görünmeyen bir metin yüzünden
 *   çıkan sonuç, kullanıcıya neden eşleştiğini göstermez.
 * - Terim eşleşmeleri önce, açıklama eşleşmeleri sonra gelir (gruplama
 *   alfabetik olduğu için sıra harf grubunun içinde korunur).
 * Boş arama her şeyi döner.
 */
export function filterGlossary(
  entries: readonly GlossaryEntry[],
  query: string,
  lang: Lang,
): GlossaryEntry[] {
  const needle = foldForSearch(query.trim()).replace(/[^a-z0-9]+/g, '');
  if (!needle) return [...entries];
  const inTerm = (entry: GlossaryEntry) =>
    foldForSearch(entry.term).replace(/[^a-z0-9]+/g, '').startsWith(needle) ||
    words(entry.term).some((w) => w.startsWith(needle));
  const inExplanation = (entry: GlossaryEntry) =>
    needle.length >= 3 && words(entry.explanation[lang]).some((w) => w.startsWith(needle));
  const termHits = entries.filter(inTerm);
  const explanationHits = entries.filter((entry) => !inTerm(entry) && inExplanation(entry));
  return [...termHits, ...explanationHits];
}

/**
 * Almanca alfabetik sıra (terimler Almanca) ve baş harfe göre gruplama.
 * Sıralama `localeCompare(…, 'de')`: Ä, A'nın yanında sıralanır. Grup harfi de
 * katlanmış harf — "Ärztekammer" gibi bir terim ayrı bir "Ä" grubu açmaz.
 */
export function groupByLetter(entries: readonly GlossaryEntry[]): GlossaryGroup[] {
  const sorted = [...entries].sort((a, b) => a.term.localeCompare(b.term, 'de'));
  const groups: GlossaryGroup[] = [];
  for (const entry of sorted) {
    const letter = foldForSearch(entry.term.charAt(0)).charAt(0).toUpperCase();
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) {
      last.entries.push(entry);
    } else {
      groups.push({ letter, entries: [entry] });
    }
  }
  return groups;
}
