import { Storage } from 'expo-sqlite/kv-store';
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'onboarding_seen';

/**
 * Tanıtım ekranlarının daha önce gösterilip gösterilmediğini cihazda saklar.
 * Tamamlanan adımlarla aynı desen (bkz. use-completed-steps.ts): native'de
 * expo-sqlite/kv-store, web'de localStorage (use-onboarding.web.ts).
 * Sunucuya hiçbir şey gitmez.
 */
function readSeen(): boolean {
  try {
    return Storage.getItemSync(STORAGE_KEY) === 'true';
  } catch {
    // Okunamıyorsa tanıtımı GÖSTERMEK daha güvenli: kullanıcıya ikinci kez
    // üç ekran göstermek, hiç göstermemekten daha ucuz bir hata.
    return false;
  }
}

export function useOnboarding() {
  const [seen, setSeen] = useState<boolean>(() => readSeen());

  const markSeen = useCallback(() => {
    try {
      Storage.setItemSync(STORAGE_KEY, 'true');
    } catch {
      // Yazılamazsa tanıtım bir sonraki açılışta tekrar görünür; uygulamayı
      // çökertmesine gerek yok.
    }
    setSeen(true);
  }, []);

  return { seen, markSeen };
}
