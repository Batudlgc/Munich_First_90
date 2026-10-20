import { usePathname, useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BrandLockup } from '@/components/brand-lockup';
import { LanguageSwitch } from '@/components/language-switch';
import { ThemedText } from '@/components/themed-text';
import { Border, Gutter, MaxPageWidth, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage, type StringKey } from '@/lib/language';

/**
 * Geniş ekran (web masaüstü) site başlığı: marka + sekmeler + dil seçici.
 *
 * Geri bildirim (08.10): "sekmeler ekleyebilirsin". Masaüstünde alttaki sekme
 * çubuğu (telefon kalıbı) yerine üstte sekmeler. Adım sayfası ve Hakkında da
 * bu başlığı gösterir; telefonda ve iOS'ta kullanılmaz.
 */
const TABS: { href: Href; match: (path: string) => boolean; label: StringKey }[] = [
  { href: '/', match: (p) => p === '/' || p.startsWith('/adim'), label: 'tabs.home' },
  { href: '/sor', match: (p) => p.startsWith('/sor'), label: 'tabs.ask' },
  { href: '/explore', match: (p) => p.startsWith('/explore'), label: 'tabs.glossary' },
  { href: '/hakkinda', match: (p) => p.startsWith('/hakkinda'), label: 'tabs.about' },
];

export function SiteHeader() {
  const theme = useTheme();
  const { t } = useLanguage();
  const path = usePathname();
  const router = useRouter();

  return (
    <View
      style={[styles.bar, { backgroundColor: theme.background, borderBottomColor: theme.rule }]}
      role="banner"
    >
      <View style={styles.inner}>
        {/* Link asChild Pressable'ın stil fonksiyonunu düşürüyordu (sekmeler
            stilsiz çıktı, ekran görüntüsüyle görüldü); router.push + href. */}
        <Pressable
          onPress={() => router.push('/')}
          accessibilityRole="link"
          accessibilityLabel={t('brand.name')}
          style={styles.brand}
        >
          {/* Marka işareti + iki satırlık ad (marka PDF'i, 20.10). */}
          <BrandLockup size={38} />
        </Pressable>

        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((tab) => {
            const active = tab.match(path);
            return (
                <Pressable
                  key={tab.label}
                  onPress={() => router.push(tab.href)}
                  accessibilityRole="tab"
                  aria-selected={active}
                  style={({ hovered, pressed }) => [
                    styles.tab,
                    (hovered || pressed) && !active && { backgroundColor: theme.surface },
                    active && { backgroundColor: theme.accentSoft },
                  ]}
                >
                  <ThemedText type="labelBold" style={{ color: active ? theme.accent : theme.text }}>
                    {t(tab.label)}
                  </ThemedText>
                </Pressable>
            );
          })}
        </View>

        <LanguageSwitch />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: Border.hairline,
    // Sayfa kayarken başlık üstte kalır (web).
    position: 'sticky' as 'relative',
    top: 0,
    zIndex: 10,
  },
  inner: {
    width: '100%',
    maxWidth: MaxPageWidth + Gutter * 2,
    alignSelf: 'center',
    paddingHorizontal: Gutter * 1.5,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.smd,
    minHeight: TouchTarget,
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  tab: {
    minHeight: TouchTarget - Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    justifyContent: 'center',
  },
});
