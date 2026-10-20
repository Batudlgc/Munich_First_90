import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { ThemedText } from '@/components/themed-text';

/**
 * Tek bir ikon bileşeni, üç platformda da gerçek ikonla:
 *   iOS      -> SF Symbol (`ios`)
 *   Android  -> Material Symbol (`material`)
 *   web      -> Material Symbol (aynı ad, expo-symbols font olarak yükler)
 * Sembol hiç çözülemezse `fallbackText` metnine düşer.
 *
 * Emoji kullanılmıyor: emoji platformdan platforma farklı çiziliyor, tema
 * rengini almıyor ve ekran okuyucuda ("kilit emojisi") gürültü yaratıyor.
 * İkonlar dekoratiftir — anlamı taşıyan etiket her zaman yanındaki metindedir
 * veya kapsayıcının accessibilityLabel'ındadır.
 */
export function StatusIcon({
  ios,
  material,
  fallbackText,
  size = 20,
  color,
}: {
  ios: SFSymbol;
  material: AndroidSymbol;
  fallbackText: string;
  size?: number;
  color: ColorValue;
}) {
  return (
    <SymbolView
      name={{ ios, android: material, web: material }}
      size={size}
      tintColor={color}
      accessibilityElementsHidden
      importantForAccessibility="no"
      fallback={
        <View style={[styles.fallback, { width: size, height: size }]}>
          <ThemedText type="labelBold" style={{ color, fontSize: size * 0.75, lineHeight: size }}>
            {fallbackText}
          </ThemedText>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
