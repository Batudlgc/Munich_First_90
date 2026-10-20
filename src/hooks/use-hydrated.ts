import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Web statik derlemesinde (expo export) sayfa sunucuda varsayılan değerlerle
 * üretilir. Tarayıcı ilk çizimde localStorage'dan dil/damga/tanıtım okursa HTML
 * ile eşleşmez (React #418, hydration hatası). Bu kanca hydration çiziminde
 * false (sunucu anlık görüntüsü), hemen ardından true döner; depolamaya bağlı
 * değerler ancak true olunca okunur. Native'de sunucu çizimi yok: hep true.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => process.env.EXPO_OS !== 'web',
  );
}
