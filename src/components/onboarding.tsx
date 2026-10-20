import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormBox, FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { StatusIcon } from '@/components/status-icon';
import { ThemedText } from '@/components/themed-text';
import { Border, Gutter, MaxContentWidth, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LANGS, LANG_NAMES, useLanguage, type Lang } from '@/lib/language';
import { getOrderedSteps } from '@/lib/steps';

/**
 * Adım sayısı metne yazılmaz, içerikten okunur: src/data/steps'e adım
 * eklenir ya da çıkarılırsa tanıtım eski sayıyı söylemeye devam etmez.
 */
// critique 2026-10: önce tüm adımlar (17) yazıyordu, ana ekran sayacı ise
// yalnız zorunluları (11) sayıyor; ikisi çelişiyordu.
const ALL_STEPS = getOrderedSteps();
const REQUIRED_COUNT = ALL_STEPS.filter((step) => step.phase !== 'conditional').length;
const OPTIONAL_COUNT = ALL_STEPS.length - REQUIRED_COUNT;
const PAGE_COUNT = 2;

/**
 * İlk açılışta bir kez gösterilen iki sayfa; sonra doğrudan ana ekran.
 *
 * ÖNCE: üç sayfa (ne işe yarar / veri nerede / hukuki tavsiye değil) ve her
 * sayfada "Atla". Atla, hukuki tavsiye uyarısını da atlatıyordu; ikinci sayfa
 * ise "sunucu yok, takip yok" diyordu — LLM proxy'si ve anonim ölçüm (APP.md
 * §4, C1) geldiğinden beri doğru değil.
 * ŞİMDİ: (1) ne olduğu — üç olgu bir form kutusunda, RDG sınırı dahil;
 * (2) dil seçimi. "Atla" yok: iki sayfa zaten iki dokunuş, ve kullanıcı
 * uygulamaya girmeden "prosedür anlatır, hukuki tavsiye vermez" satırını
 * görmeli (CLAUDE.md, Hukuki kısıt).
 *
 * Kullanıcıdan hiçbir kişisel bilgi (ad, geliş tarihi, vize türü…) istenmez.
 * Saklanan tek şey "görüldü" bayrağıdır (use-onboarding) ve dil seçilirse
 * seçilen dil (language.tsx).
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { t, lang, setLang } = useLanguage();
  const [page, setPage] = useState(0);
  const overlayRef = useRef<View>(null);

  // Web: katman açıkken arkadaki ekran klavyeyle de erişilmez olsun. aria-modal
  // yalnız ekran okuyucuyu durduruyor; Tab tuşu arkadaki ana ekranın
  // bağlantılarına geçiyordu (A5'te ölçüldü). Katmanın kardeşlerine `inert`
  // verilir, katman kapanınca geri alınır. iOS'ta karşılığı aria-modal yeterli.
  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') return;
    const node = overlayRef.current as unknown as HTMLElement | null;
    const siblings = [...(node?.parentElement?.children ?? [])].filter((el) => el !== node);
    siblings.forEach((el) => el.setAttribute('inert', ''));
    return () => siblings.forEach((el) => el.removeAttribute('inert'));
  }, []);

  const titleOf = (p: number) => t(p === 0 ? 'onboarding.title' : 'onboarding.languageTitle');
  const title = titleOf(page);

  const goTo = (next: number) => {
    setPage(next);
    // Alttaki düğme yerinde kalır, yalnız etiketi değişir; ekran okuyucunun
    // odağı da onda kalır. Yeni sayfanın geldiği başlığıyla duyurulur.
    AccessibilityInfo.announceForAccessibility(titleOf(next));
  };

  return (
    // Katman, arkasındaki ana ekranın üstünü kapatır; aria-modal (iOS'ta
    // accessibilityViewIsModal) ekran okuyucunun arkadaki ekrana kaymasını önler.
    <View
      ref={overlayRef}
      style={[styles.overlay, { backgroundColor: theme.background }]}
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.column, styles.topBar]}>
          {page === 1 && (
            <Pressable
              onPress={() => goTo(0)}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.back')}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <View style={[styles.backCircle, { borderColor: theme.line }]}>
                <StatusIcon ios="chevron.left" material="chevron_left" fallbackText="‹" size={20} color={theme.text} />
              </View>
            </Pressable>
          )}
          {/* Sayfa göstergesi: ana ekrandaki ilerleme çentikleriyle aynı dil — dolu çentik = geçilen/bulunulan sayfa.
              Değer aria-* ile veriliyor: react-native-web accessibilityValue'yu DOM'a yazmıyor (ölçüldü,
              aria-valuenow boş kalıyordu); aria-* hem web'de hem iOS'ta okunur. */}
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t('onboarding.a11y.progress')}
            aria-valuemin={1}
            aria-valuemax={PAGE_COUNT}
            aria-valuenow={page + 1}
            aria-valuetext={`${page + 1} / ${PAGE_COUNT}`}
            style={styles.notches}
          >
            {Array.from({ length: PAGE_COUNT }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.notch,
                  i <= page ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line },
                ]}
              />
            ))}
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={[styles.column, styles.content]}>
          <ThemedText type="display" accessibilityRole="header">
            {title}
          </ThemedText>

          {page === 0 ? (
            <>
              <ThemedText type="body" themeColor="textSecondary">
                {t('onboarding.intro')}
              </ThemedText>
              <FormBox style={styles.box}>
                <FormField
                  label={t('onboarding.stepsLabel')}
                  value={t('onboarding.stepsValue').replace('{count}', String(REQUIRED_COUNT))}
                >
                  <ThemedText type="label" themeColor="textSecondary">
                    {t('onboarding.stepsNote').replace('{optional}', String(OPTIONAL_COUNT))}
                  </ThemedText>
                </FormField>
                <FormField label={t('onboarding.accountLabel')} value={t('onboarding.accountValue')}>
                  <ThemedText type="label" themeColor="textSecondary">
                    {t('onboarding.accountNote')}
                  </ThemedText>
                </FormField>
                <FormField label={t('onboarding.scopeLabel')} value={t('onboarding.scopeValue')}>
                  <ThemedText type="label" themeColor="textSecondary">
                    {t('onboarding.scopeNote')}
                  </ThemedText>
                </FormField>
              </FormBox>
            </>
          ) : (
            <>
              <ThemedText type="body" themeColor="textSecondary">
                {t('onboarding.languageIntro')}
              </ThemedText>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={t('onboarding.languageTitle')}
                style={styles.box}
              >
                <FormBox>
                  {LANGS.map((option) => (
                    <LanguageOption
                      key={option}
                      option={option}
                      selected={option === lang}
                      onSelect={() => setLang(option)}
                    />
                  ))}
                </FormBox>
              </View>
              <ThemedText type="label" themeColor="textSecondary">
                {t('onboarding.languageLater')}
              </ThemedText>
            </>
          )}
        </ScrollView>

        <View style={[styles.column, styles.footer]}>
          <PrimaryButton
            label={page === 0 ? t('onboarding.next') : t('onboarding.start')}
            onPress={page === 0 ? () => goTo(1) : onDone}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * Dil seçeneği: formdaki "uygun olanı işaretleyin" kutusu. Dil kendi adıyla
 * yazılır (English, Türkçe, Deutsch) — arayüz dilini bilmeyen de kendi dilini
 * bulur. Seçili satır yalnız renkle değil, mavi dolu kutu + onay işaretiyle
 * belli (WCAG 1.4.1); ekran okuyucuya radio + checked olarak okunur.
 * `aria-checked` (accessibilityState değil): react-native-web accessibilityState'i
 * DOM'a yazmıyor, web'de seçili dil okunmuyordu (ölçüldü); aria-checked iOS'ta da geçerli.
 */
function LanguageOption({ option, selected, onSelect }: { option: Lang; selected: boolean; onSelect: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      aria-checked={selected}
      accessibilityLabel={LANG_NAMES[option]}
      style={({ pressed }) => [
        styles.option,
        selected && { backgroundColor: theme.accentSoft },
        pressed && !selected && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.mark,
          selected ? { backgroundColor: theme.primary, borderColor: theme.primary } : { borderColor: theme.line },
        ]}
      >
        {selected && <StatusIcon ios="checkmark" material="check" fallbackText="✓" size={16} color={theme.onPrimary} />}
      </View>
      <ThemedText type="heading">{LANG_NAMES[option]}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // Kök yerleşimde her şeyin (sekmeler dahil) üstünde tam ekran bir katman.
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10,
  },
  safeArea: {
    flex: 1,
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Gutter,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TouchTarget,
    marginTop: Spacing.sm,
  },
  back: {
    minWidth: TouchTarget,
    minHeight: TouchTarget,
    justifyContent: 'center',
  },
  backCircle: {
    width: TouchTarget - Spacing.sm,
    height: TouchTarget - Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: Border.box,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notches: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginLeft: 'auto',
  },
  notch: {
    width: Spacing.lg,
    height: Spacing.sm + Spacing.xxs,
    borderWidth: Border.box,
    // Taslaktaki çentik köşesi (2): Radius.xs (4) 10pt yükseklikte çentiği hapa çeviriyordu.
    borderRadius: Radius.xs / 2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: Spacing.smd,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  box: {
    marginTop: Spacing.sm,
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.smd,
    minHeight: TouchTarget + Spacing.smd,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  mark: {
    width: Spacing.lg,
    height: Spacing.lg,
    borderRadius: Radius.xs,
    borderWidth: Border.box,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingTop: Spacing.smd,
    paddingBottom: Spacing.md,
  },
  pressed: {
    opacity: 0.6,
  },
});
