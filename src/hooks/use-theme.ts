/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // react-native'in useColorScheme()'i sistem tercihi belirsizken null/
  // undefined döner ('unspecified' yalnızca react-native-windows'a özgü bir
  // değer, tip tanımında yer alsa da bu platformlarda hiç gelmez). İkisini
  // de light'a düşürüyoruz, yoksa Colors[null] = undefined olur ve her
  // theme.text/theme.background okuması çöker.
  const theme = scheme === 'light' || scheme === 'dark' ? scheme : 'light';

  return Colors[theme];
}
