import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Yan kolon kartı: başlık + içerik, açık yüzey üstünde, çerçevesiz.
 * Geri bildirim (08.10): "biraz daha bilgi ekle ekranın yanlarına". Masaüstünde
 * sağ kolonda, telefonda sayfanın sonunda aynı kartlar.
 */
export function SideCard({
  title,
  children,
  style,
}: {
  title: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }, style]}>
      <ThemedText type="heading" accessibilityRole="header" aria-level={2}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.mdl,
    borderRadius: Radius.lg,
    gap: Spacing.smd,
  },
});
