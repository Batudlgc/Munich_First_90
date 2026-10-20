import { type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { StatusIcon } from '@/components/status-icon';
import { ThemedText } from '@/components/themed-text';
import { Border, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type StateKind = 'empty' | 'error' | 'offline';

const ICONS: Record<StateKind, { ios: SFSymbol; material: AndroidSymbol; fallback: string }> = {
  empty: { ios: 'tray', material: 'inbox', fallback: '—' },
  error: { ios: 'exclamationmark.circle', material: 'error', fallback: '!' },
  offline: { ios: 'wifi.slash', material: 'wifi_off', fallback: '!' },
};

/**
 * Boş / hata / çevrimdışı durumlarının tek ortak sunumu: kesikli çerçeveli
 * bir form kutusu (doldurulmamış alan gibi), içinde simge, başlık, açıklama
 * ve varsa tek bir eylem.
 *
 * Hata kırmızı DEĞİL: kırmızı (`due`) yalnız son tarih için ayrıldı. Hatanın
 * anlamını simge ve metin taşır.
 *
 * 'loading' durumu yok: adım içeriği pakete gömülü, tamamlanan adımlar senkron
 * okunuyor. Gerçek tek bekleme (Sor ekranı) kendi satırında gösteriliyor.
 */
export function StateView({
  kind,
  title,
  body,
  actionLabel,
  onAction,
}: {
  kind: StateKind;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  const icon = ICONS[kind];

  return (
    <View
      style={[styles.box, { borderColor: theme.lockedLine }]}
      accessibilityRole={kind === 'empty' ? 'summary' : 'alert'}
    >
      <StatusIcon
        ios={icon.ios}
        material={icon.material}
        fallbackText={icon.fallback}
        size={28}
        color={theme.textSecondary}
      />
      <ThemedText type="heading" style={styles.center}>
        {title}
      </ThemedText>
      <ThemedText type="body" themeColor="textSecondary" style={styles.center}>
        {body}
      </ThemedText>
      {actionLabel && onAction && (
        <PrimaryButton label={actionLabel} onPress={onAction} style={styles.action} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.mdl,
    borderWidth: Border.box,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
  },
  center: {
    textAlign: 'center',
  },
  action: {
    marginTop: Spacing.sm,
    alignSelf: 'stretch',
  },
});
