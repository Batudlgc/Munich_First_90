import { Image } from 'expo-image';

import mark from '@/constants/brand-mark.json';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Marka işareti ("90"), iOS/Android sürümü. react-native-svg bağımlılığı yok:
 * scripts/make-icon.mjs aynı geometriden (brand-mark.json) iki PNG üretir,
 * burada temaya göre biri gösterilir. Web karşılığı brand-logo.web.tsx (SVG).
 * Dekoratif: yanında marka adı yazılı.
 */
const SOURCES = {
  light: require('@/assets/images/brand-mark.png'),
  dark: require('@/assets/images/brand-mark-dark.png'),
  lightTile: require('@/assets/images/icon.png'),
  darkTile: require('@/assets/images/icon-dark.png'),
};

export function BrandLogo({
  size = 32,
  tile = false,
  scheme: forced,
}: {
  size?: number;
  tile?: boolean;
  /** Temadan bağımsız sabit sürüm (ör. her temada koyu olan alt bilgi bandında 'dark'). */
  scheme?: 'light' | 'dark';
}) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const scheme = forced ?? system;
  const source = tile ? SOURCES[`${scheme}Tile`] : SOURCES[scheme];
  const width = tile ? size : (size * mark.width) / mark.height;
  return (
    <Image
      source={source}
      style={{ width, height: size, borderRadius: tile ? size * 0.224 : 0 }}
      contentFit="contain"
      accessible={false}
    />
  );
}
