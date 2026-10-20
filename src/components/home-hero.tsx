import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { BrandLockup } from '@/components/brand-lockup';
import { LanguageSwitch } from '@/components/language-switch';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { gradientFill, Gutter, MaxPageWidth, Spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/lib/language';

/**
 * Ana sayfa giriş bandı.
 *
 * Geri bildirim (08.10): "intro kısmı yok". Siteye linkten gelen biri önce ne
 * olduğunu görmeli: kime, ne işe yarar, neye güvenebilir. Referans:
 * study-in-germany.com (renkli bant + kısa açıklama). Masaüstünde bandın sağında
 * ilerleme kartı (`aside`), telefonda bant tek sütun ve ilerleme altında.
 */
export function HomeHero({
  onNext,
  aside,
  compact = false,
}: {
  /**
   * Telefonda geri dönen kullanıcı (en az bir adım damgalı): yalnız marka, başlık
   * ve "resmî değil" notu. Tanıtım metni ilk ziyarette işini yaptı; ikinci
   * ziyarette "Sıradaki adım"ı ilk ekrandan aşağı itiyordu (rapor 09.10, madde 4).
   * Masaüstünde etkisi yok: orada bant ilk ekranın yarısı bile değil.
   */
  compact?: boolean;
  /** Sıradaki adım yoksa (hepsi damgalı) buton çizilmez. */
  onNext: (() => void) | null;
  aside?: ReactNode;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useLanguage();
  const { wide } = useLayout();
  const short = compact && !wide;

  // Başlıkta "90 gün / 90 days / 90 Tage" marka gradyanıyla vurgulanır (web);
  // native'de düz marka mavisi. Bulunamazsa başlık olduğu gibi.
  const title = t('hero.title');
  const match = /90\s?\S+/.exec(title);
  const highlight: TextStyle =
    Platform.OS === 'web'
      ? ({
          backgroundImage: theme.titleGradient,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        } as TextStyle)
      : { color: theme.accent };

  return (
    <View style={[styles.band, { backgroundColor: theme.band }, gradientFill(theme.heroGlow)]}>
      <View style={[styles.inner, wide && styles.innerWide, short && styles.innerShort]}>
        <View style={[styles.text, wide && styles.textWide]}>
          {/* Telefonda marka + dil seçici bandın üstünde; masaüstünde site başlığında. */}
          {!wide ? (
            <View style={styles.topRow}>
              <BrandLockup />
              <LanguageSwitch />
            </View>
          ) : null}
          {short ? null : (
            <ThemedText type="eyebrow" themeColor="textSecondary">
              {t('hero.eyebrow')}
            </ThemedText>
          )}
          <ThemedText type={short ? 'title' : 'display'} accessibilityRole="header" aria-level={1}>
            {match ? (
              <>
                {title.slice(0, match.index)}
                <Text style={highlight}>{match[0]}</Text>
                {title.slice(match.index + match[0].length)}
              </>
            ) : (
              title
            )}
          </ThemedText>
          {short ? null : (
            <>
              {/* Toplantı 20.10: "11 adım · ücretsiz, üyelik yok · diller" rozetleri
                  kaldırıldı — "Instagram dolandırıcı sitesi" izlenimi veriyordu; adım
                  sayısı ilerlemede, diller sağ üstte zaten yazıyor. */}
              <ThemedText type="lead" style={styles.lead}>
                {t('hero.lead')}
              </ThemedText>
            </>
          )}
          {wide ? (
            <View style={styles.actions}>
              {onNext ? <PrimaryButton label={t('hero.cta')} onPress={onNext} style={styles.action} /> : null}
              <PrimaryButton
                variant="secondary"
                label={t('hero.ctaAsk')}
                onPress={() => router.push('/sor')}
                style={styles.action}
              />
            </View>
          ) : null}
          <ThemedText type="caption" themeColor="textSecondary">
            {t('hero.note')}
          </ThemedText>
        </View>
        {wide && aside ? <View style={styles.aside}>{aside}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    width: '100%',
  },
  inner: {
    width: '100%',
    maxWidth: MaxPageWidth + Gutter * 3,
    alignSelf: 'center',
    paddingHorizontal: Gutter,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  innerShort: {
    paddingBottom: Spacing.lg,
  },
  innerWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxl,
    paddingHorizontal: Gutter * 1.5,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
  },
  text: {
    gap: Spacing.md,
  },
  textWide: {
    flex: 1,
    maxWidth: 680,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  lead: {
    maxWidth: 640,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.smd,
    marginTop: Spacing.xs,
  },
  action: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.lg,
  },
  aside: {
    width: 380,
  },
});
