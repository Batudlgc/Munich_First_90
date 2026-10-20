import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusIcon } from '@/components/status-icon';
import { SiteFooter } from '@/components/site-footer';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebHead } from '@/components/web-head';
import {
  Border,
  BottomTabInset,
  Gutter,
  MaxContentWidth,
  MaxPageWidth,
  Radius,
  Spacing,
  TouchTarget,
  Typography,
} from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { filterGlossary, GLOSSARY, groupByLetter } from '@/lib/glossary';
import { useLanguage } from '@/lib/language';

/** Arama kutusundaki büyütecin boyu; metnin sol boşluğu buna göre. */
const SEARCH_ICON = 20;

/**
 * Sözlük sekmesi: uygulamada geçen Almanca bürokrasi terimleri (adım
 * verilerinde zaten kullanılanlar — bkz. src/data/steps/*.json) ve seçili
 * dilde sade açıklamaları. Yalnız tanım; RDG kısıtı gereği prosedürel,
 * betimleyici dil (bireysel tavsiye değil).
 *
 * UI v2: kart yığını yerine bir sicil defteri gibi — harf başlıkları, altında
 * ince ayraçlarla ayrılmış satırlar. Üstte arama: terimde ve seçili dildeki
 * açıklamada, aksan duyarsız (mantık src/lib/glossary.ts).
 */
export default function GlossaryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { wide } = useLayout();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => groupByLetter(filterGlossary(GLOSSARY, query, lang)), [query, lang]);

  return (
    <ThemedView style={styles.container}>
      <WebHead title={t('glossary.title')} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={[styles.content, wide && styles.contentWide]}>
          <View style={[styles.header, wide && styles.narrowBlock]}>
            <ThemedText type="display" accessibilityRole="header">
              {t('glossary.title')}
            </ThemedText>
            <ThemedText type="body" themeColor="textSecondary">
              {t('glossary.subtitle')}
            </ThemedText>
          </View>

          {/* Çerçeve giriş kutusunun KENDİSİNDE; büyüteç ve temizle düğmesi
              onun üstüne konumlanır. Böylece web'de klavye odak halkası
              (global.css :focus-visible) kutunun tamamını çevreler, içte
              ikinci bir dikdörtgen çizmez. */}
          <View style={wide && styles.narrowBlock}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              accessibilityLabel={t('glossary.searchLabel')}
              placeholder={t('glossary.searchPlaceholder')}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={[
                styles.searchInput,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.line },
                query.length > 0 && styles.searchInputWithClear,
              ]}
            />
            <View style={styles.searchIcon}>
              <StatusIcon
                ios="magnifyingglass"
                material="search"
                fallbackText=""
                size={SEARCH_ICON}
                color={theme.textSecondary}
              />
            </View>
            {query.length > 0 && (
              <Pressable
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel={t('glossary.clearSearch')}
                style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
              >
                <StatusIcon ios="xmark" material="close" fallbackText="×" size={20} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>

          {groups.length === 0 ? (
            <View style={styles.empty} accessibilityLiveRegion="polite">
              <ThemedText type="bodyBold">{t('glossary.noResults')}</ThemedText>
              <ThemedText type="label" themeColor="textSecondary">
                {t('glossary.noResultsHint')}
              </ThemedText>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.letter}>
                {/* Harf ikincil mürekkep renginde: mavi bu uygulamada eylem ve
                    durum rengi (damga, birincil buton, bağlantı); dizin harfi
                    ise yalnız yön bulmak için, okunacak olan terimin kendisi. */}
                <View style={[styles.letterRow, { borderBottomColor: theme.line }]}>
                  <ThemedText type="heading" themeColor="textSecondary" accessibilityRole="header">
                    {group.letter}
                  </ThemedText>
                </View>
                {/* Geniş ekranda terimler kart ızgarası (geri bildirim: "ekranın
                    sadece ortasını kullanma"); telefonda çizgili liste. */}
                <View style={wide && styles.grid}>
                  {group.entries.map((entry, i) => (
                    <View
                      key={entry.term}
                      style={
                        wide
                          ? [styles.card, { backgroundColor: theme.surface }]
                          : [styles.entry, i > 0 && [styles.entryRule, { borderTopColor: theme.rule }]]
                      }
                    >
                      <ThemedText type="term">{entry.term}</ThemedText>
                      <ThemedText type="label" themeColor="textSecondary">
                        {entry.explanation[lang]}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}

          <Pressable
            onPress={() => router.push('/hakkinda')}
            accessibilityRole="link"
            style={({ pressed }) => [styles.aboutLink, { borderTopColor: theme.rule }, pressed && styles.pressed]}
          >
            <ThemedText type="link">{t('glossary.aboutLink')}</ThemedText>
          </Pressable>
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
  safeArea: {
    // alignItems: 'center' BURAYA KONMAZ — bkz. (tabs)/index.tsx'teki açıklama.
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: BottomTabInset,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Gutter,
    paddingTop: Spacing.lg,
    gap: Spacing.lg,
  },
  header: {
    gap: Spacing.sm,
  },
  contentWide: {
    maxWidth: MaxPageWidth + Gutter * 3,
    paddingHorizontal: Gutter * 1.5,
    paddingTop: Spacing.xl,
  },
  narrowBlock: {
    maxWidth: MaxContentWidth,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
  card: {
    // Üç sütun (gap payı düşülmüş).
    width: '31.5%',
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  searchInput: {
    ...Typography.body,
    minHeight: TouchTarget + Spacing.xs,
    borderWidth: Border.box,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    // Metin büyütecin sağından başlar.
    paddingLeft: Spacing.smd + SEARCH_ICON + Spacing.sm,
    paddingRight: Spacing.smd,
  },
  searchInputWithClear: {
    // Temizle düğmesinin altına metin girmesin.
    paddingRight: TouchTarget,
  },
  searchIcon: {
    position: 'absolute',
    left: Spacing.smd,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    // Büyüteç dokunmayı yutmasın; dokunuş alttaki giriş kutusuna gitsin.
    pointerEvents: 'none',
  },
  clearButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  empty: {
    gap: Spacing.xs,
  },
  letterRow: {
    borderBottomWidth: Border.box,
    paddingBottom: Spacing.xs,
  },
  entry: {
    gap: Spacing.xxs,
    paddingVertical: Spacing.smd,
  },
  entryRule: {
    borderTopWidth: Border.hairline,
  },
  aboutLink: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    alignSelf: 'stretch',
    borderTopWidth: Border.hairline,
    paddingTop: Spacing.sm,
  },
});
