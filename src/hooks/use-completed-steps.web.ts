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
  parseDates,
  markDone,
  toggleDone,
  toIsoDay,
  type Completion,
  type CompletionDates,
} from '@/lib/completion';

import { useHydrated } from '@/hooks/use-hydrated';

const STORAGE_KEY = 'completed_steps';

// Web derlemesinde use-completed-steps.ts YERİNE bu dosya kullanılır (Metro
// platform-uzantı kuralı: aynı ada .web.ts eklenince web için o dosya seçilir
// — src/components/animated-icon.web.tsx ile aynı desen).
//
// Neden ayrı: expo-sqlite'ın web (wasm) katmanı SharedArrayBuffer + bir Worker
// gerektiriyor ve resmi Expo dokümanına göre bu destek "alpha" — bu projede
// gerçekten denendi, worker hiçbir zaman yanıt vermiyor ve
// "Sync operation timeout" hatasıyla ana ekranı çökertiyor (React error #520).
// Web bu uygulamanın hedef platformu değil (sadece geliştirme/ekran görüntüsü
// amaçlı), bu yüzden burada basit ve senkron olan `localStorage` kullanılıyor;
// iOS/Android tarafı (use-completed-steps.ts) hiç değişmedi, hâlâ
// expo-sqlite/kv-store kullanıyor. Context/Provider şekli iki dosyada aynı;
// damga tarihi mantığı da ortak (lib/completion.ts).
function readCompletedIds(): { ids: Set<string>; error: boolean } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ids: new Set(), error: false };
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    return { ids: new Set(ids), error: false };
  } catch {
    return { ids: new Set(), error: true };
  }
}

function readCompletedDates(): CompletionDates {
  try {
    return parseDates(window.localStorage.getItem(DATES_STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeCompletion(state: Completion) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.ids]));
    window.localStorage.setItem(DATES_STORAGE_KEY, JSON.stringify(state.dates));
  } catch {
    // localStorage kapalı/dolu olabilir (gizli sekme vb.) — sessizce yok say,
    // bu ekran görüntüsü/geliştirme amaçlı web derlemesinde kritik değil.
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

export function CompletedStepsProvider({ children }: { children: ReactNode }) {
  // Kayıt hydration'dan SONRA okunur: sunucu HTML'i boş ilerlemeyle üretilir,
  // ilk istemci çizimi de boş olmalı (React #418). `changed` bu oturumda
  // damgalama yapıldıysa dolu; değilse depolamadaki durum gösterilir.
  const hydrated = useHydrated();
  const stored = useMemo(
    () => (hydrated ? readCompletedIds() : { ids: new Set<string>(), error: false }),
    [hydrated],
  );
  const storedDates = useMemo(() => (hydrated ? readCompletedDates() : {}), [hydrated]);
  const [changed, setState] = useState<Completion | null>(null);
  const state = useMemo<Completion>(
    () => changed ?? { ids: stored.ids, dates: storedDates },
    [changed, stored, storedDates],
  );
  const storageError = stored.error;

  const toggleStep = useCallback((id: string) => {
    setState((prev) => {
      const base = prev ?? { ids: readCompletedIds().ids, dates: readCompletedDates() };
      const next = toggleDone(base, id, toIsoDay(new Date()));
      writeCompletion(next);
      return next;
    });
  }, []);

  const restoreStep = useCallback((id: string, day: string) => {
    setState((prev) => {
      const base = prev ?? { ids: readCompletedIds().ids, dates: readCompletedDates() };
      const next = markDone(base, id, day);
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
