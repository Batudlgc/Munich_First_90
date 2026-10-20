import { useRouter, type Href } from 'expo-router';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { BrandLockup } from '@/components/brand-lockup';
import { StatusIcon } from '@/components/status-icon';
import { ThemedText } from '@/components/themed-text';
import { gradientFill, Gutter, MaxPageWidth, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage, type StringKey } from '@/lib/language';

/** İletişim adresi — Impressum ve gizlilik metniyle aynı (zaten herkese açık). */
const CONTACT_EMAIL = 'dalliagacbatu@gmail.com';
// Statik sayfalar web'de aynı sitede; iOS'ta canlı adres.
const SITE = Platform.OS === 'web' ? '' : 'https://munichfirst90.com';

const NAV: { href: Href; label: StringKey }[] = [
  { href: '/', label: 'tabs.home' },
  { href: '/sor', label: 'tabs.ask' },
  { href: '/explore', label: 'tabs.glossary' },
  { href: '/hakkinda', label: 'tabs.about' },
];
const LEGAL: { path: string; label: StringKey }[] = [
  { path: '/impressum', label: 'footer.impressum' },
  { path: '/privacy', label: 'footer.privacy' },
  { path: '/support', label: 'footer.support' },
];

/**
 * Sayfa sonundaki koyu alt bilgi bandı (toplantı 20.10: "her sayfanın en altında
 * Kontakt; koyu bir banner, site adı, kısa tanıtım, iletişim — 'Bizimle çalışmak
 * ister misiniz?'"). Her iki temada koyu. Sor ekranında YOK (orada sayfanın sonu
 * soru kutusu).
 *
 * "Bizimle çalış" bir form değil, e-posta bağlantısı: başvuru verisi toplayan bir
 * form, sunucu + gizlilik metni değişikliği demek (hesap yok / veri cihazda kuralı).
 * Gönüllü katkı çağrısı olarak yazıldı; iş ilanı vaat etmez.
 */
export function SiteFooter() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useLanguage();
  const { wide } = useLayout();

  const mail = (subject: string) =>
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`);

  const linkText = { color: theme.footerMuted };

  return (
    <View
      role="contentinfo"
      style={[styles.band, { backgroundColor: theme.footerBg }, gradientFill(theme.footerGlow)]}
    >
      <View style={[styles.inner, wide && styles.innerWide]}>
        <View style={[styles.top, wide && styles.topWide]}>
          <View style={[styles.brandCol, wide && styles.brandColWide]}>
            <BrandLockup size={40} onDark />
            <ThemedText type="body" style={{ color: theme.footerMuted }}>
              {t('footer.tagline')}
            </ThemedText>

            {/* "Bizimle çalış" kartı */}
            <View style={[styles.join, { borderColor: theme.footerRule }]}>
              <ThemedText type="heading" style={{ color: theme.footerText }}>
                {t('footer.joinTitle')}
              </ThemedText>
              <ThemedText type="label" style={{ color: theme.footerMuted }}>
                {t('footer.joinBody')}
              </ThemedText>
              <Pressable
                onPress={() => void mail(t('footer.joinSubject'))}
                accessibilityRole="link"
                style={({ pressed }) => [styles.joinButton, gradientFill(theme.primaryGradient), pressed && styles.pressed]}
              >
                <ThemedText type="button" style={{ color: theme.onPrimary }}>
                  {t('footer.joinCta')}
                </ThemedText>
                <StatusIcon ios="arrow.right" material="arrow_forward" fallbackText="→" size={18} color={theme.onPrimary} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.cols, wide && styles.colsWide]}>
            <View style={styles.col}>
              <ThemedText type="eyebrow" style={{ color: theme.footerText }}>
                {t('footer.navTitle').toLocaleUpperCase()}
              </ThemedText>
              {NAV.map((item) => (
                <Pressable key={item.label} onPress={() => router.push(item.href)} accessibilityRole="link" style={styles.link}>
                  <ThemedText type="label" style={linkText}>
                    {t(item.label)}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <View style={styles.col}>
              <ThemedText type="eyebrow" style={{ color: theme.footerText }}>
                {t('footer.legalTitle').toLocaleUpperCase()}
              </ThemedText>
              {LEGAL.map((item) => (
                <Pressable
                  key={item.path}
                  onPress={() => void Linking.openURL(`${SITE}${item.path}`)}
                  accessibilityRole="link"
                  style={styles.link}
                >
                  <ThemedText type="label" style={linkText}>
                    {t(item.label)}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
            <View style={[styles.col, styles.contactCol]}>
              <ThemedText type="eyebrow" style={{ color: theme.footerText }}>
                {t('footer.contactTitle').toLocaleUpperCase()}
              </ThemedText>
              <ThemedText type="label" style={{ color: theme.footerMuted }}>
                {t('footer.contactBody')}
              </ThemedText>
              <Pressable
                onPress={() => void mail('Munich First 90')}
                accessibilityRole="link"
                accessibilityLabel={`${t('footer.contactCta')}: ${CONTACT_EMAIL}`}
                style={styles.link}
              >
                <ThemedText type="labelBold" style={{ color: theme.footerAccent }}>
                  {CONTACT_EMAIL}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={[styles.bottom, { borderTopColor: theme.footerRule }]}>
          <ThemedText type="caption" style={{ color: theme.footerMuted }}>
            {`© ${new Date().getFullYear()} Munich First 90 · ${t('footer.note')}`}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    width: '100%',
    marginTop: Spacing.xxl,
  },
  inner: {
    width: '100%',
    maxWidth: MaxPageWidth + Gutter * 3,
    alignSelf: 'center',
    paddingHorizontal: Gutter,
    paddingTop: Spacing.xl + Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.xl,
  },
  innerWide: {
    paddingHorizontal: Gutter * 1.5,
    paddingTop: Spacing.xxl,
  },
  top: {
    gap: Spacing.xl,
  },
  topWide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.xxl,
  },
  brandCol: {
    gap: Spacing.md,
  },
  brandColWide: {
    flex: 1,
    maxWidth: 460,
  },
  join: {
    marginTop: Spacing.sm,
    padding: Spacing.mdl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  joinButton: {
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.mdl,
    borderRadius: Radius.lg,
  },
  cols: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.xl,
    rowGap: Spacing.lg,
  },
  colsWide: {
    flexWrap: 'nowrap',
    gap: Spacing.xxl,
  },
  col: {
    gap: Spacing.xs,
    minWidth: 120,
  },
  contactCol: {
    maxWidth: 260,
  },
  link: {
    minHeight: TouchTarget,
    justifyContent: 'center',
  },
  bottom: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
  },
  pressed: {
    opacity: 0.8,
  },
});
