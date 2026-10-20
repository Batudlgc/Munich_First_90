import { useWindowDimensions } from 'react-native';

import { ThreeColBreakpoint, WideBreakpoint } from '@/constants/theme';
import { useHydrated } from '@/hooks/use-hydrated';

/**
 * Geniş ekran yerleşimi (yalnız web masaüstü).
 *
 * Geri bildirim (08.10): "ekranın sadece ortasını kullanma". 1024 px üstünde
 * sayfalar tek dar sütun yerine kolonlu yerleşime geçer; 1240 px üstünde üç
 * kolon (sol menü + içerik + sağ bilgi kolonu). iOS ve telefon web'i etkilenmez.
 *
 * Statik web derlemesinde sayfa sunucuda genişlik bilinmeden üretilir; ilk
 * (hydration) çizimde dar yerleşim döner ki HTML eşleşsin (React #418). Kök
 * layout hydration bitene kadar sayfayı düz bir örtüyle kapattığı için bu
 * geçiş görünmez.
 */
export function useLayout() {
  const { width } = useWindowDimensions();
  const hydrated = useHydrated();
  const web = process.env.EXPO_OS === 'web';
  const wide = web && hydrated && width >= WideBreakpoint;
  return { wide, threeCol: wide && width >= ThreeColBreakpoint, width };
}
