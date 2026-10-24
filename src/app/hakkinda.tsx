import { Stack } from 'expo-router';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebHead } from '@/components/web-head';
import { Border, gradientFill, Gutter, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { privacyPolicy, type PolicySection } from '@/data/privacy-policy';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { LANG_NAMES, useLanguage, type Lang } from '@/lib/language';

// Impressum statik sayfa (public/impressum.html); web'de aynı site, native'de canlı adres.
const IMPRESSUM_URL = Platform.OS === 'web' ? '/impressum' : 'https://munichfirst90.com/impressum';

function PolicyBlock({ lang, sections }: { lang: Lang; sections: PolicySection[] }) {
  const theme = useTheme();
  return (
    <View style={styles.block}>
      <ThemedText type="heading" accessibilityRole="header" aria-level={2}>
        {LANG_NAMES[lang]}
      </ThemedText>
      {sections.map((section) => (
        <View key={section.title} style={[styles.section, { borderTopColor: theme.rule }]}>
          <ThemedText type="labelBold" themeColor="textSecondary">
            {section.title}
          </ThemedText>
          <ThemedText type="body">{section.body}</ThemedText>
        </View>
      ))}
    </View>
  );
}

/**
 * "Hakkında ve Gizlilik" ekranı: gizlilik politikasının (EN + DE + TR,
 * kaynak public/privacy.html) uygulama içi sürümü. Sözlük ekranındaki
 * bağlantıdan açılan itilen (push) bir ekran.
 *
 * Üç dil de gösterilir (hukuki metin, hepsi aynı ağırlıkta); seçili dil EN
 * ÜSTTE — önceden her zaman İngilizce başlıyordu, Türkçe okuyan sayfanın
 * sonuna kaydırmak zorundaydı.
 */
export default function AboutScreen() {
  const theme = useTheme();
  const { t, lang } = useLanguage();
  const { wide } = useLayout();
  const order: Lang[] = [lang, ...(['en', 'de', 'tr'] as const).filter((l) => l !== lang)];

  return (
    <ThemedView style={styles.container}>
      <WebHead title={t('about.title')} />
      {/* Geniş ekranda yerel başlık yerine site başlığı ve sekmeler. */}
      {wide ? <SiteHeader /> : null}
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: t('about.title'), headerShown: !wide }} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={[styles.content, wide && styles.contentWide]}>
          {wide ? (
            <ThemedText type="display" accessibilityRole="header" aria-level={1}>
              {t('about.title')}
            </ThemedText>
          ) : null}
          {/* Sitenin hikâyesi en üstte (toplantı 20.10: "Bu site ne?" metni
              İngilizceden çevrilmiş gibiydi; samimi, birinci ağızdan, doğal dille). */}
          <View style={[styles.story, { backgroundColor: theme.surface }, gradientFill(theme.heroGlow)]}>
            <BrandLogo size={44} />
            <ThemedText type="title" accessibilityRole="header" aria-level={2}>
              {t('about.storyTitle')}
            </ThemedText>
            <ThemedText type="lead">{t('about.story1')}</ThemedText>
            <ThemedText type="body">{t('about.story2')}</ThemedText>
            <ThemedText type="body" themeColor="textSecondary">
              {t('about.story3')}
            </ThemedText>
          </View>
          <ThemedText type="label" themeColor="textSecondary">
            {t('about.notice')}
          </ThemedText>
          <Pressable
            onPress={() => Linking.openURL(IMPRESSUM_URL)}
            accessibilityRole="link"
            style={styles.link}>
            <ThemedText type="link">{t('legal.impressumLink')}</ThemedText>
          </Pressable>
          {order.map((l) => (
            <PolicyBlock key={l} lang={l} sections={privacyPolicy[l]} />
          ))}
          </View>
          <SiteFooter />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Gutter,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
  },
  contentWide: {
    maxWidth: 760,
    paddingTop: Spacing.xl,
  },
  story: {
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg + Spacing.xs,
  },
  block: {
    gap: Spacing.smd,
  },
  link: {
    minHeight: 44,
    justifyContent: 'center',
  },
  section: {
    gap: Spacing.xs,
    paddingTop: Spacing.smd,
    borderTopWidth: Border.hairline,
  },
});
