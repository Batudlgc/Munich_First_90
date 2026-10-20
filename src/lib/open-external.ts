import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';

/**
 * Dış adresi açar: native'de uygulama içi tarayıcı (kullanıcı Safari'ye
 * atılmaz — ExternalLink ile aynı davranış), web'de yeni sekme. Bağlantı
 * görünümünde olmayan yerlerden (buton) dış sayfa açmak için.
 */
export async function openExternal(url: string): Promise<void> {
  if (process.env.EXPO_OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await openBrowserAsync(url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
}
