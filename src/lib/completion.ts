/**
 * Tamamlanma (damga) durumu — saf mantık.
 *
 * NEDEN tarih saklanıyor: damga "ERLEDIGT + tarih" yazıyor. Tarih saklanmasaydı
 * ekran her açılışta "bugün"ü basardı; bir hafta önce damgalanan adım bugün
 * damgalanmış gibi görünürdü — damga yalan söylerdi. Bu yüzden tamamlanan id'lerin
 * (`completed_steps`) yanına damganın vurulduğu gün ayrı bir anahtarda tutulur:
 * `completed_dates` = `{ [id]: 'YYYY-MM-DD' }`. Veri cihazda kalır, sunucuya gitmez.
 *
 * Eski kullanıcı (id var, tarih yok — bu anahtar eklenmeden önce damgalanmış):
 * tarih uydurulmaz, damga tarihsiz çizilir.
 *
 * Bu dosya React'e ve depolamaya bağlı değil; iki hook (use-completed-steps.ts
 * native, .web.ts web) bunu çağırır, testler doğrudan çağırır.
 */

/** Damga tarihi: yerel takvim günü, 'YYYY-MM-DD'. */
export type CompletionDates = Readonly<Record<string, string>>;

export type Completion = {
  ids: ReadonlySet<string>;
  dates: CompletionDates;
};

export const DATES_STORAGE_KEY = 'completed_dates';

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Date → 'YYYY-MM-DD', YEREL takvim gününe göre.
 * `toISOString()` KULLANILMAZ: UTC'ye çevirir; Münih'te gece 00:30'da damgalanan
 * adım bir önceki güne yazılırdı.
 */
export function toIsoDay(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/**
 * 'YYYY-MM-DD' → yerel gece yarısındaki Date (formatStampDate için).
 * `new Date('2026-10-05')` KULLANILMAZ: ISO gün metnini UTC gece yarısı sayar;
 * UTC'nin batısındaki bir cihazda (ör. New York) bu 4 Ekim akşamına düşer ve
 * damga bir gün önceyi gösterirdi. Geçersiz gün (2026-02-30) null döner.
 */
export function parseIsoDay(iso: string): Date | null {
  const match = ISO_DAY.exec(iso);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // Date taşmayı sessizce düzeltir (30 Şubat → 2 Mart); geri okuyup yakalıyoruz.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/**
 * Depodaki ham metni okur; asla hata fırlatmaz. Bozuk JSON, dizi, sayı ya da
 * geçersiz gün içeren kayıt atılır — tarih ikincil bilgi, okunamazsa damga
 * tarihsiz çizilir; ilerleme (id listesi) bundan etkilenmez.
 */
export function parseDates(raw: string | null): CompletionDates {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const dates: Record<string, string> = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (typeof value === 'string' && parseIsoDay(value)) dates[id] = value;
  }
  return dates;
}

/** Damgala: id eklenir, tarih `today` olur (eski, artık kalmış tarih varsa üzerine yazılır). */
export function markDone(state: Completion, id: string, today: string): Completion {
  const ids = new Set(state.ids);
  ids.add(id);
  return { ids, dates: { ...state.dates, [id]: today } };
}

/** Damgayı kaldır: id ve tarihi birlikte silinir. */
export function markUndone(state: Completion, id: string): Completion {
  const ids = new Set(state.ids);
  ids.delete(id);
  const dates = { ...state.dates };
  delete dates[id];
  return { ids, dates };
}

export function toggleDone(state: Completion, id: string, today: string): Completion {
  return state.ids.has(id) ? markUndone(state, id) : markDone(state, id, today);
}

/**
 * Adımın damga günü. Tamamlanmamış adımın artık kalmış tarihi (ör. yazma
 * yarıda kaldıysa) gösterilmez; tarihsiz tamamlanmış adım null döner.
 */
export function completedAt(state: Completion, id: string): string | null {
  return state.ids.has(id) ? (state.dates[id] ?? null) : null;
}
