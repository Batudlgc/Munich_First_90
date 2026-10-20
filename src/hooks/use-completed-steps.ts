import { Storage } from 'expo-sqlite/kv-store';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  completedAt as completedAtOf,
  DATES_STORAGE_KEY,
  markDone,
  parseDates,
  toggleDone,
  toIsoDay,
  type Completion,
  type CompletionDates,
} from '@/lib/completion';

const STORAGE_KEY = 'completed_steps';

function readCompletedIds(): { ids: Set<string>; error: boolean } {
  try {
    const raw = Storage.getItemSync(STORAGE_KEY);
    if (!raw) return { ids: new Set(), error: false };
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    return { ids: new Set(ids), error: false };
  } catch {
    // getItemSync ilk soğuk açılışta (store henüz hazır değilken) veya
    // JSON.parse bozuk veride hata fırlatabilir - ekranı çökertmek yerine
    // boş kümeyle başlanır.
    return { ids: new Set(), error: true };
  }
}

/**
 * Damga tarihleri ikincil bilgi: okunamazsa hata bayrağı kalkmaz, damga
 * tarihsiz çizilir (parseDates bozuk veriye dayanıklı, bkz. lib/completion.ts).
 */
function readCompletedDates(): CompletionDates {
  try {
    return parseDates(Storage.getItemSync(DATES_STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeCompletion(state: Completion) {
  try {
    Storage.setItemSync(STORAGE_KEY, JSON.stringify([...state.ids]));
    Storage.setItemSync(DATES_STORAGE_KEY, JSON.stringify(state.dates));
  } catch {
    // Yazma hatası (ör. disk dolu) uygulamayı çökertmemeli; kullanıcı bir
    // sonraki dokunuşta tekrar dener.
  }
}

type CompletedStepsContextValue = {
  completedIds: ReadonlySet<string>;
  /** Damgala / damgayı kaldır. Damgalarken bugünün tarihi de saklanır. */
  toggleStep: (id: string) => void;
  /**
   * Kaldırılan damgayı ESKİ tarihiyle geri koyar ("Geri al"). toggleStep
   * yeniden damgalarken bugünün tarihini yazardı; geri almada asıl tarih kalır.
   */
  restoreStep: (id: string, day: string) => void;
  /**
   * Damganın vurulduğu gün ('YYYY-MM-DD', yerel). Tamamlanmamış adımda ya da
   * tarih saklanmaya başlamadan önce damgalanmış adımda null.
   */
  completedAt: (id: string) => string | null;
  /**
   * Kayıtlı ilerleme okunamadı (bozuk veri, depolama erişilemedi). Eskiden bu
   * durum sessizce yutuluyor ve kullanıcı ilerlemesini kaybetmiş gibi boş bir
   * liste görüyordu. Artık ekran bunu açıkça söyleyebiliyor.
   */
  storageError: boolean;
};

const CompletedStepsContext = createContext<CompletedStepsContextValue | undefined>(undefined);

/**
 * Tamamlanan adım id'lerini cihazda (expo-sqlite/kv-store) saklar, TEK bir
 * paylaşılan state olarak (React Context). Önceden bu düz bir hook'tu: her
 * ekran (ana ekran, adım detay ekranı) kendi useState'iyle storage'ı ayrı
 * ayrı okuyordu - biri diğerini güncelleyince öbürü bunu görmüyordu (örn.
 * adım detayında tamamlandı işaretle, geri dön, ana ekrandaki ilerleme
 * çubuğu tam yeniden başlatmaya kadar eskiyi gösteriyordu). Kök layout'ta
 * TEK bir CompletedStepsProvider var, her iki ekran da aynı context'i
 * okuyor/yazıyor (bkz. src/app/_layout.tsx).
 *
 * ÖNCE yalnız id kümesi tutuluyordu. ŞİMDİ id'ler ve damga tarihleri TEK bir
 * state nesnesinde (Completion): ikisi ayrı useState olsaydı birinin
 * güncellemesi içinden ötekini set etmek gerekirdi. Tarih mantığı saf
 * fonksiyonlarda (lib/completion.ts); burada yalnız okuma/yazma var. Ana
 * ekrandan damgalanan adımın tarihi de böylece aynı yoldan yazılır.
 *
 * Bu dosya native (.ts), web karşılığı use-completed-steps.web.ts (Metro
 * platform-uzantı kuralı - farklı storage backend, aynı Context/Provider
 * şekli). JSX yerine createElement kullanılıyor: .ts uzantısı JSX
 * ayrıştırmıyor, dosyayı .tsx'e çevirmek eski dosyayı silmeyi gerektirirdi
 * ki bu ortamda izin sistemi buna izin vermedi.
 */
export function CompletedStepsProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(() => readCompletedIds());
  const [state, setState] = useState<Completion>(() => ({
    ids: initial.ids,
    dates: readCompletedDates(),
  }));
  const storageError = initial.error;

  const toggleStep = useCallback((id: string) => {
    setState((prev) => {
      const next = toggleDone(prev, id, toIsoDay(new Date()));
      writeCompletion(next);
      return next;
    });
  }, []);

  const restoreStep = useCallback((id: string, day: string) => {
    setState((prev) => {
      const next = markDone(prev, id, day);
      writeCompletion(next);
      return next;
    });
  }, []);

  const completedAt = useCallback((id: string) => completedAtOf(state, id), [state]);

  const value = useMemo<CompletedStepsContextValue>(
    () => ({ completedIds: state.ids, toggleStep, restoreStep, completedAt, storageError }),
    [state.ids, toggleStep, restoreStep, completedAt, storageError]
  );

  return createElement(CompletedStepsContext.Provider, { value }, children);
}

export function useCompletedSteps(): CompletedStepsContextValue {
  const context = useContext(CompletedStepsContext);
  if (!context) {
    throw new Error('useCompletedSteps, CompletedStepsProvider içinde kullanılmalı');
  }
  return context;
}
