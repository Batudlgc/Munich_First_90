import { type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { StatusIcon } from '@/components/status-icon';
import { ThemedText } from '@/components/themed-text';
import { gradientFill, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Uygulamanın iki buton biçimi:
 * - `primary`: marka mavisi dolu — ekranın tek ana eylemi (randevu aç, izin ver, başla).
 * - `secondary`: mavi çerçeveli, içi boş (20.10; önce açık mavi dolgu) —
 *   damgalama, geri alma, vazgeçme. Devre dışı buton ise gri (`fill`) ve ikincil
 *   metin: ikisi aynı griyken etkin "damgala" butonu pasif sanılıyordu
 *   (yeniden critique 2026-10).
 *
 * critique 2026-10: ikincil buton önce mürekkep çerçeveliydi; her kap çerçeveli
 * olunca hiçbiri öne çıkmıyordu. Devre dışı buton önce %45 opaklıktı (beyaz
 * metin ~2.4:1, bozuk gibi görünüyordu); şimdi dolgu zemin + ikincil metin
 * (açık 4.80:1, koyu 6.04:1) — okunur ama açıkça pasif.
 *
 * Basılı durum yalnız opaklık değişimi; animasyon değil (uygulamadaki tek
 * animasyon damga anı). Devre dışı buton ekran okuyucuya "devre dışı" olarak
 * okunur; neden devre dışı olduğu `accessibilityHint` ile ve ekranda söylenmeli.
 */
export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  icon,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
  /** Etiketin sağında küçük ikon (ör. dış bağlantı). Yeni ad web'de status-icon.web.tsx'te olmalı. */
  icon?: { ios: SFSymbol; material: AndroidSymbol; fallback: string };
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Dış sayfa açan buton ekran okuyucuya bağlantı olarak duyurulur. */
  accessibilityRole?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  // accent / accentSoft: açık 5.91:1, koyu 6.11:1 (theme.ts token'larından ölçüldü).
  // Devre dışı: içi boş, ince çizgili (critique 10. tur: boş Sor ekranında tam
  // genişlik gri dolgu "bozuk" gibi okunuyordu). İkincil metin zeminde 5.44:1.
  // Toplantı 20.10: "Sıradaki adıma git" ile "Soru sor" yan yana iki ayrı renkte
  // (dolu mavi + açık mavi dolgu) garip duruyordu. Artık tek renk ailesi:
  // birincil = marka gradyanıyla dolu, ikincil = aynı mavinin çerçevesi, içi boş
  // (ikincil yazı zeminde: açık 6.81:1, koyu 5.97:1).
  const primary = variant === 'primary' && !disabled;
  const background = disabled || variant === 'secondary' ? 'transparent' : theme.primary;
  const color = disabled ? theme.textSecondary : variant === 'primary' ? theme.onPrimary : theme.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      // aria-*: web'de accessibilityState DOM'a yazılmıyor (language-switch.tsx).
      aria-disabled={disabled}
      aria-busy={busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background },
        primary && [gradientFill(theme.primaryGradient), styles.raised],
        variant === 'secondary' && !disabled && [styles.outline, { borderColor: theme.accent }],
        disabled && [styles.disabled, { borderColor: theme.rule }],
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.inner}>
        <ThemedText type="button" style={[styles.label, { color }]}>
          {label}
        </ThemedText>
        {icon ? (
          <StatusIcon ios={icon.ios} material={icon.material} fallbackText={icon.fallback} size={18} color={color} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TouchTarget + Spacing.sm + Spacing.xxs,
    paddingHorizontal: Spacing.mdl,
    paddingVertical: Spacing.smd,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  label: {
    textAlign: 'center',
    flexShrink: 1,
  },
  disabled: {
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  outline: {
    borderWidth: 1.5,
  },
  raised: {
    boxShadow: '0px 6px 16px rgba(0, 81, 194, 0.22)',
  },
  pressed: {
    opacity: 0.8,
  },
});
