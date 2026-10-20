// Metro (React Native bundler), Node.js'in aksine dizin içeriğini çalışma
// zamanında dinamik olarak listeyemiyor (require.context Expo Router'a özgü
// ve burada gereksiz bir soyutlama olurdu) — bu yüzden src/data/steps/
// altındaki her JSON dosyası burada tek tek, adı ile import edilir.
// Doğrulama (sources zorunluluğu, döngü kontrolü) scripts/validate-steps.mjs
// tarafından ayrıca ve dinamik olarak (fs.readdirSync ile) yapılır.
import type { Lang } from '@/lib/language';

import anmeldung from '@/data/steps/anmeldung.json';
import steuerId from '@/data/steps/steuer-id.json';
import krankenkasse from '@/data/steps/krankenkasse.json';
import bankkonto from '@/data/steps/bankkonto.json';
import rundfunkbeitrag from '@/data/steps/rundfunkbeitrag.json';
import sperrkonto from '@/data/steps/sperrkonto.json';
import immatrikulation from '@/data/steps/immatrikulation.json';
import haftpflichtversicherung from '@/data/steps/haftpflichtversicherung.json';
import aufenthaltstitel from '@/data/steps/aufenthaltstitel.json';
import fiktionsbescheinigung from '@/data/steps/fiktionsbescheinigung.json';
import werkstudentArbeitserlaubnis from '@/data/steps/werkstudent-arbeitserlaubnis.json';
import schufa from '@/data/steps/schufa.json';
import fuehrerscheinUmschreibung from '@/data/steps/fuehrerschein-umschreibung.json';
import semesterticket from '@/data/steps/semesterticket.json';
import simKarte from '@/data/steps/sim-karte.json';
import ummeldung from '@/data/steps/ummeldung.json';
import abmeldung from '@/data/steps/abmeldung.json';

/**
 * Üç dilli açıklama metni. Anahtar kümesi language.tsx'teki `Lang` ile aynı
 * olmak ZORUNDA: dördüncü bir dil eklenirse bu tip kendiliğinden onu da
 * isteyecek ve eksik çeviriler derleme zamanında görünecek.
 */
export type Localized = Record<Lang, string>;

/**
 * Resmi terim + açıklama çifti. `official` Almanca kalır ve HİÇBİR DİLE
 * çevrilmez (öğrencinin Amt'ta söylemesi gereken kelime odur); `plain` o terimin
 * ne olduğunu anlatan, çevrilen katmandır. Bkz. src/data/steps.schema.json.
 */
export type OfficialTerm = {
  official: string;
  plain: Localized;
};

/**
 * Adımın zaman fazı — sıralamanın (bkz. `orderSteps`) birincil ekseni,
 * önkoşul topolojisinden bile önce gelir. Bkz. src/data/steps.schema.json.
 */
export type Phase = 'pre_arrival' | 'first_weeks' | 'first_90_days' | 'conditional';

/**
 * Fazların sıralamadaki ağırlığı. `conditional` bilerek en sona konur:
 * herkese gerekmediği için hiçbir zorunlu fazın önkoşulu OLAMAZ
 * (scripts/validate-steps.mjs bunu commit öncesi zaten denetliyor), ama
 * kendisi zorunlu fazlardan herhangi birine bağlı olabilir.
 */
export const PHASE_ORDER: Record<Phase, number> = {
  pre_arrival: 0,
  first_weeks: 1,
  first_90_days: 2,
  conditional: 3,
};

/**
 * Makama giriş yolu — randevu bilgi katmanı (A4). Anlamları
 * src/data/steps.schema.json'daki `appointment.mode` açıklamasında.
 */
export type AppointmentMode =
  | 'appointment'
  | 'appointment_or_written'
  | 'application_first'
  | 'no_appointment';

/**
 * Randevu bilgisi. Portal adresi burada değil, `Step.booking_url`'de.
 * `walk_in` null ise kaynak "randevusuz gelinebilir mi" sorusuna açık
 * cevap vermiyor demektir — ekranda "bilgi yok" diye değil, hiç gösterilmez.
 */
export type Appointment = {
  mode: AppointmentMode;
  walk_in: boolean | null;
  phone: { number: string; hours: Localized | null } | null;
  slot_release: Localized | null;
  note: Localized | null;
  sources: string[];
};

export type Step = {
  id: string;
  city: string;
  phase: Phase;
  /** İşlemin resmi Almanca adı — randevu sisteminde aranacak, Amt'ta söylenecek ad. */
  official_title: string;
  /**
   * official_title kaynakta doğrulanmış resmî bir terim mi? `descriptive` ise
   * arayüzde Almanca alt satır / "Resmi adı" alanı gösterilmez (şema açıklaması).
   */
  official_title_check: { kind: 'verified' | 'descriptive' | 'unverified'; source: string | null };
  /** Listede ve gezinme başlığında görünen kısa, insan okunur ad. */
  title: Localized;
  /** Adımın ne olduğunu bir-iki cümlede anlatan giriş. */
  summary: Localized;
  authority: OfficialTerm | null;
  documents: OfficialTerm[];
  deadline_rule: { days: number | null; text: Localized } | null;
  common_mistakes: Localized[];
  booking_url: string | null;
  appointment: Appointment;
  prerequisites: string[];
  typical_duration_days: number | null;
  sources: string[];
  last_verified: string | null;
};

const steps: Step[] = [
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
] as Step[];

/**
 * Verilen adım dizisini üç kademeli anahtarla sıralayan saf (pure) fonksiyon
 * — modül seviyesindeki gerçek `steps` dizisine bağımlı değil, bu yüzden
 * testlerde sahte (fake) adım dizileriyle (döngü, bilinmeyen id, vb.)
 * doğrudan çağrılabilir. Sıra: önce `phase` (PHASE_ORDER), sonra önkoşul
 * topolojisi, sonra mevcut (dizideki) sıra.
 *
 * Önce topolojik sıralama yapılır (aşağıdaki DFS), sonra bu sonuç `phase`'e
 * göre KARARLI (stable) sort'tan geçirilir. Bu sıra bilinçli: kararlı sort,
 * aynı fazdaki adımlar arasında topolojik sıralamanın kurduğu göreli düzeni
 * (dolayısıyla mevcut diziyi de) korur. Ayrıca validate-steps.mjs "bir
 * adımın önkoşulu kendisinden sonraki bir fazda olamaz" kuralını commit
 * öncesi zaten denetlediği için (depOrder <= stepOrder garantisi), faz'a göre
 * sıralamak hiçbir önkoşulu kendi bağımlısından sonraya düşürmez.
 */
export function orderSteps(inputSteps: Step[]): Step[] {
  const byId = new Map(inputSteps.map((step) => [step.id, step]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: Step[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      // scripts/validate-steps.mjs normalde döngüsel bağımlılığı build/commit
      // öncesi yakalar, ama bu script bir CI'a bağlı değil - burada da uyarı
      // vermek, kaçırılmış bir döngüyü sessizce yanlış sıralamak yerine
      // geliştirici konsolunda görünür yapar.
      if (__DEV__) {
        console.warn(`[steps] döngüsel bağımlılık: "${id}" kendi zincirinde tekrar ediyor.`);
      }
      return;
    }
    const step = byId.get(id);
    if (!step) {
      if (__DEV__) {
        console.warn(`[steps] bilinmeyen prerequisite id'si: "${id}" (yazım hatası olabilir).`);
      }
      return;
    }
    visiting.add(id);
    for (const dep of step.prerequisites) {
      visit(dep);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(step);
  }

  for (const step of inputSteps) {
    visit(step.id);
  }

  // Array.prototype.sort ECMA-262'den beri (Node/V8 dahil) kararlıdır: eşit
  // anahtarlı öğeler girdi sırasını korur — bu yüzden `ordered`'ın topolojik
  // sırası, aynı fazdaki adımlar arasında burada bozulmaz.
  return [...ordered].sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]);
}

/**
 * steps.json'u bağımlılık sırasına göre sıralar (gerçek veri üzerinde).
 * Sıralama mantığının kendisi için bkz. `orderSteps`.
 */
export function getOrderedSteps(): Step[] {
  return orderSteps(steps);
}

/** Bir adım, tüm prerequisites'i tamamlanmış id kümesinde varsa kilitsizdir. */
export function isStepUnlocked(step: Step, completedIds: ReadonlySet<string>): boolean {
  return step.prerequisites.every((dep) => {
    if (__DEV__ && !getStepById(dep)) {
      // Bilinmeyen id: adım sessizce sonsuza dek kilitli kalırdı, en azından
      // geliştirme sırasında görünür olsun.
      console.warn(`[steps] bilinmeyen prerequisite id'si: "${dep}" (yazım hatası olabilir).`);
    }
    return completedIds.has(dep);
  });
}

/** id'ye göre tek bir adımı bulur (adım detay ekranı için). */
export function getStepById(id: string): Step | undefined {
  return steps.find((step) => step.id === id);
}

/**
 * Ön koşul id'lerini ("anmeldung") kullanıcıya gösterilecek adım adlarına
 * çevirir — resmi Almanca ad değil, seçili dildeki kısa ad. steps.json'da
 * olmayan bir id gelirse id'nin kendisi döner, böylece ekran boş kalmaz.
 */
export function getPrerequisiteTitles(prerequisiteIds: string[], lang: Lang): string[] {
  return prerequisiteIds.map((id) => getStepById(id)?.title[lang] ?? id);
}
