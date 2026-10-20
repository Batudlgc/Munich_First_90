import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, Typography, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Uygulamadaki tüm metin buradan geçer. Ölçek constants/theme.ts'teki
 * Typography'den gelir — burada da, ekranlarda da elle fontSize yazılmaz.
 */
export type TextType = keyof typeof Typography | 'code';

export type ThemedTextProps = TextProps & {
  type?: TextType;
  themeColor?: ThemeColor;
};

/**
 * Büyük başlıklar Dynamic Type'ta sınırsız büyürse (42pt × 3) tek kelime bir
 * satıra sığmıyor; başlıklar 1.4 katında durur. Gövde metni sınırsız büyür —
 * okunması gereken metin odur.
 */
const MAX_SCALE: Partial<Record<TextType, number>> = {
  display: 1.4,
  title: 1.4,
  subtitle: 1.4,
  tally: 1.4,
  wordmark: 1.3,
  // Damga döndürülmüş, çerçeveli bir grafik; büyürse çerçeveden taşar.
  stamp: 1.2,
  stampDate: 1.2,
};

export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  // 'link' kendi rengini temadan alır (accent); diğerleri themeColor
  // verilmediyse birincil metin rengini kullanır.
  const color = themeColor ? theme[themeColor] : type === 'link' ? theme.accent : theme.text;

  return (
    <Text
      maxFontSizeMultiplier={MAX_SCALE[type]}
      style={[
        // flexShrink olmadan bir Text, esnek (flex) bir kutunun içindeyken
        // uzun tek satırı satır atlamak yerine kutunun dışına taşırabiliyor.
        styles.base,
        typeStyles[type],
        { color },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    flexShrink: 1,
  },
});

const typeStyles = StyleSheet.create({
  ...Typography,
  link: { ...Typography.link, textDecorationLine: 'underline' },
  code: { ...Typography.caption, fontFamily: Fonts.mono },
});
