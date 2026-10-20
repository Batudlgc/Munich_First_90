import { Pressable, StyleSheet, View } from 'react-native';

import { StatusIcon } from '@/components/status-icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/lib/language';

/**
 * Açılır-kapanır satır — uygulamadaki TEK biçim (critique 2026-10 8. tur):
 * etiket + aşağı bakan ok; açıkken ok yukarı döner. Önce dört ayrı biçim vardı
 * (sağ ok "başka sayfaya git" gibi okunuyordu, altı çizili bağlantılar,
 * başlık boyutu). Dokunma alanı 44pt; görsel boşluk eklemez (negatif dikey
 * kenar boşluğu).
 *
 * `aria-expanded`: iOS'ta accessibilityState.expanded olur, web'de de yazılır
 * (accessibilityState web'de DOM'a yazılmıyor).
 */
export function DisclosureRow({
  label,
  open,
  onToggle,
  heading = false,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  /** Bölüm başlığı boyutunda (Kaynaklar) ya da satır boyutunda. */
  heading?: boolean;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      aria-expanded={open}
      accessibilityLabel={label}
      accessibilityHint={t('a11y.toggleSection')}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <ThemedText type={heading ? 'heading' : 'labelBold'}>{label}</ThemedText>
      <View style={open && styles.flipped}>
        <StatusIcon
          ios="chevron.down"
          material="expand_more"
          fallbackText="▾"
          size={heading ? 22 : 18}
          color={theme.textSecondary}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    minHeight: TouchTarget,
    marginVertical: -Spacing.sm,
  },
  flipped: {
    transform: [{ rotate: '180deg' }],
  },
  pressed: {
    opacity: 0.6,
  },
});
