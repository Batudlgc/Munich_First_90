/**
 * "Sor" özelliği için açık izin (Apple 5.1.2(i), GDPR md. 6(1)(a)) — B4.
 *
 * İzin yalnız cihazda durur (device-storage: native'de expo-sqlite/kv-store,
 * web'de localStorage). Sunucuya "izin verdi" diye bir kayıt gitmez.
 *
 * Saklanan değer izin metninin SÜRÜMÜDÜR, "true" değil. İzin ekranında
 * söylenen bir şey değişirse (ör. B5'te model sağlayıcısı Mistral yerine
 * başka biri olursa, ya da gönderilen veri değişirse) `ask.consent.*`
 * metinleriyle (language.tsx) birlikte CONSENT_VERSION artırılır; eski
 * sürüme verilmiş izin geçersiz sayılır ve ekran yeniden sorar.
 */
import { getDeviceItem, removeDeviceItem, setDeviceItem } from '@/lib/device-storage';

export const CONSENT_VERSION = '2';
const STORAGE_KEY = 'ai_consent_version';

export function hasAiConsent(): boolean {
  return getDeviceItem(STORAGE_KEY) === CONSENT_VERSION;
}

export function grantAiConsent(): void {
  setDeviceItem(STORAGE_KEY, CONSENT_VERSION);
}

export function revokeAiConsent(): void {
  removeDeviceItem(STORAGE_KEY);
}
