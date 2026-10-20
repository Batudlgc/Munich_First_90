/**
 * Uygulama içi değerlendirme isteği (App Store puanı) — UI v2, A8.
 *
 * SÖZLEŞME (çağıran taraf için)
 * - Çağrı yeri: bir adım "tamamlandı" olarak DAMGALANDIĞI an (damgayı
 *   kaldırırken değil), yeni tamamlanan adım sayısıyla:
 *     maybeRequestReview(completedIds.size)
 *   Sonucu beklemeye gerek yok (`void maybeRequestReview(...)`); hiçbir
 *   koşulda fırlatmaz, arayüzü bekletmez.
 * - Yalnız iOS. Yalnız tamamlanan adım sayısı >= 3 iken. Cihaz başına BİR KEZ:
 *   istek gittikten sonra cihazda `review_requested` bayrağı yazılır, bir daha
 *   sorulmaz (damga kaldırılıp yeniden basılsa da).
 * - Apple'ın kendi penceresi açılır (SKStoreReviewController). Önüne kendi
 *   sorumuzu koymuyoruz — Apple ve Expo yönergesi: "Don't ask the user any
 *   questions before or while presenting the rating button". Pencerenin
 *   gerçekten görünüp görünmeyeceğine iOS karar verir (yılda en çok 3 kez).
 * - Damga anı uygulamanın tek animasyonu (340 ms, stamp.tsx). Pencere onun
 *   üstüne binmesin diye istek REVIEW_DELAY_MS sonra gider.
 *
 * KARARLAR
 * - `isAvailableAsync()` false ise bayrak YAZILMAZ. iOS'ta false yalnız
 *   TestFlight kurulumunda döner (expo-store-review, StoreReviewModule.swift →
 *   isRunningFromTestFlight). Orada bayrak yazsaydık, aynı cihazda TestFlight'tan
 *   App Store sürümüne geçen kullanıcıya (veri korunur, paket kimliği aynı) bir
 *   daha hiç sorulmazdı.
 * - `requestReview()` hata verirse de bayrak yazılmaz (ör. uygulama o an arka
 *   plandaysa pencere açılacak sahne yok); bir sonraki damgada yeniden denenir.
 * - Aynı anda iki damga (3. ve 4. adım art arda) iki istek doğurmasın: istek
 *   sürerken gelen çağrı hiçbir şey yapmaz.
 *
 * GİZLİLİK: bayrak ölçüm DEĞİL — sunucuya gitmez, sayılmaz, kimlik değil;
 * yalnız "bir daha sorma" hatırlatıcısı. metrics.ts'teki "cihaza ölçüm amaçlı
 * bir şey yazma" kuralıyla çelişmez. Gerekçe: docs/store/privacy-labels.md.
 */
import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';

import { getDeviceItem, setDeviceItem } from '@/lib/device-storage';

export const REVIEW_FLAG_KEY = 'review_requested';
export const REVIEW_MIN_COMPLETED = 3;
/** Damga animasyonu (340 ms) + kullanıcının sonucu görmesi için kısa bir an. */
export const REVIEW_DELAY_MS = 1200;

/** Testte Node'da çalışabilmek için dışarıdan verilebilen bağımlılıklar. */
export type ReviewDeps = {
  platform: string;
  isAvailableAsync: () => Promise<boolean>;
  requestReview: () => Promise<void>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  wait: (ms: number) => Promise<void>;
};

const defaultDeps: ReviewDeps = {
  platform: Platform.OS,
  isAvailableAsync: StoreReview.isAvailableAsync,
  requestReview: StoreReview.requestReview,
  getItem: getDeviceItem,
  setItem: setDeviceItem,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

let inFlight = false;

/**
 * Koşullar tutuyorsa sistemin değerlendirme penceresini bir kez ister.
 * Dönüş: istek gönderildiyse true (test ve teşhis için; çağıranın
 * kullanması gerekmez).
 */
export async function maybeRequestReview(
  completedCount: number,
  deps: Partial<ReviewDeps> = {}
): Promise<boolean> {
  const d = { ...defaultDeps, ...deps };
  if (d.platform !== 'ios') return false;
  if (completedCount < REVIEW_MIN_COMPLETED) return false;
  if (inFlight) return false;
  inFlight = true;
  try {
    if (d.getItem(REVIEW_FLAG_KEY)) return false;
    if (!(await d.isAvailableAsync())) return false;
    await d.wait(REVIEW_DELAY_MS);
    await d.requestReview();
    d.setItem(REVIEW_FLAG_KEY, 'true');
    return true;
  } catch {
    // Değerlendirme isteği uygulamanın asıl işi değil: hata sessizce yutulur.
    return false;
  } finally {
    inFlight = false;
  }
}
