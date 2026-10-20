import { Storage } from 'expo-sqlite/kv-store';

/**
 * En basit senkron anahtar-değer okuma/yazma — use-completed-steps.ts'in
 * kullandığı AYNI depolama katmanı (expo-sqlite/kv-store native, localStorage
 * web — bkz. device-storage.web.ts), ama tamamlanan adım kümesine özel
 * olmayan, tek değerlik tercihler için (ör. seçili dil). Hata durumunda
 * sessizce null/no-op döner: bir tercih ayarının okunamaması uygulamayı
 * çökertmemeli, en kötü ihtimalle varsayılana düşer.
 */
export function getDeviceItem(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

export function setDeviceItem(key: string, value: string): void {
  try {
    Storage.setItemSync(key, value);
  } catch {
    // Yazma hatası (ör. disk dolu) uygulamayı çökertmemeli.
  }
}

export function removeDeviceItem(key: string): void {
  try {
    Storage.removeItemSync(key);
  } catch {
    // Silinemezse değer kalır; çağıran taraf yine de durumunu günceller.
  }
}
