import { StyleSheet, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/lib/language';

/**
 * Logo + iki satırlık marka adı ("Munich / First 90"), marka PDF'indeki
 * başlık düzeni. Site başlığında (masaüstü) ve telefondaki giriş bandında.
 * Marka adı çevrilmez (her dilde "Munich First 90"); logo dekoratif, ad metin.
 */
export function BrandLockup({ size = 36, onDark = false }: { size?: number; onDark?: boolean }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const name = t('brand.name');
  const cut = name.indexOf(' ');
  return (
    <View style={styles.row}>
      <BrandLogo size={size} scheme={onDark ? 'dark' : undefined} />
      <ThemedText type="wordmark" style={onDark ? { color: theme.footerText } : undefined}>
        {cut > 0 ? `${name.slice(0, cut)}\n${name.slice(cut + 1)}` : name}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + Spacing.xxs,
  },
});
