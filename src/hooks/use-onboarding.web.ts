// Web derlemesinde use-onboarding.ts YERİNE bu dosya kullanılır (Metro
// platform-uzantı kuralı).
import { useHydrated } from '@/hooks/use-hydrated';

/**
 * Web'de tanıtım katmanı GÖSTERİLMEZ (08.10.2026, web yeniden tasarımı).
 *
 * Geri bildirim: "intro kısmı yok" — iki ekranlık katman siteyi tanıtmıyor,
 * yalnız erteliyordu. Onun yerine ana sayfanın üstünde kalıcı bir giriş bandı
 * var; dil tarayıcıdan gelir, değiştirici sayfa başlığında. iOS'ta tanıtım
 * aynen duruyor (use-onboarding.ts).
 *
 * `null` = hydration çizimi: RootLayout o ana kadar düz bir örtü gösterir
 * (depolamaya ve genişliğe bağlı değerler ilk karede yanlış görünmesin).
 */
export function useOnboarding() {
  const hydrated = useHydrated();
  const seen: boolean | null = hydrated ? true : null;
  return { seen, markSeen: () => {} };
}
