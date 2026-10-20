// Web derlemesinde device-storage.ts YERİNE bu dosya kullanılır (Metro
// platform-uzantı kuralı — use-completed-steps.web.ts ile aynı desen).
// Neden ayrı: expo-sqlite'ın web katmanı burada da geçerli olan aynı
// nedenle (bkz. use-completed-steps.web.ts) kullanılmıyor; localStorage.
export function getDeviceItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setDeviceItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage kapalı/dolu olabilir (gizli sekme vb.) — sessizce yok say.
  }
}

export function removeDeviceItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // localStorage kapalı olabilir — sessizce yok say.
  }
}
