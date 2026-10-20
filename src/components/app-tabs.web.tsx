import { type AndroidSymbol } from 'expo-symbols';
import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SiteHeader } from '@/components/site-header';
import { StatusIcon } from '@/components/status-icon';
import { ThemedText } from '@/components/themed-text';
import { Border, MaxContentWidth, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/lib/language';

/**
 * Web sekme çubuğu — iOS'taki yerel çubukla aynı yerde, altta.
 *
 * ÖNCE: üstte yüzen (position: absolute) bir hap vardı; her ekran onun
 * arkasında kalmasın diye web'e özel üst boşluk taşıyordu. ŞİMDİ çubuk akışın
 * içinde, TabSlot'un altında duruyor: içerik kendiliğinden çubuğun üstünde
 * biter, ekranlarda web'e özel boşluk gerekmez.
 */
export default function AppTabs() {
  const { t } = useLanguage();
  // Masaüstünde (geniş web) sekmeler üstteki site başlığında; alttaki çubuk
  // gizlenir ama TabList ağaçta kalır (expo-router/ui rotaları onunla tanır).
  const { wide } = useLayout();

  return (
    <Tabs style={styles.tabs}>
      {wide ? <SiteHeader /> : null}
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <CustomTabList style={wide ? styles.hidden : undefined}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="checklist">{t('tabs.home')}</TabButton>
          </TabTrigger>
          <TabTrigger name="sor" href="/sor" asChild>
            <TabButton icon="contact_support">{t('tabs.ask')}</TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton icon="menu_book">{t('tabs.glossary')}</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

function TabButton({
  children,
  isFocused,
  icon,
  ...props
}: TabTriggerSlotProps & { icon: AndroidSymbol }) {
  const theme = useTheme();
  const color = isFocused ? theme.text : theme.textSecondary;
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      aria-selected={isFocused}
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}
    >
      {/* Seçili sekme yalnız renkle değil, üstündeki mavi çentikle de belli (WCAG 1.4.1). */}
      <View style={[styles.indicator, isFocused && { backgroundColor: theme.accent }]} />
      <StatusIcon ios="circle" material={icon} fallbackText="•" size={22} color={color} />
      <ThemedText type="labelBold" style={{ color }}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

function CustomTabList(props: TabListProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      {...props}
      style={[
        styles.bar,
        { backgroundColor: theme.surface, borderTopColor: theme.rule, paddingBottom: insets.bottom },
        props.style,
      ]}
    >
      <View style={styles.inner}>{props.children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flex: 1,
  },
  slot: {
    flex: 1,
  },
  bar: {
    // critique 2026-10: önce 1.5pt mürekkep; 3pt'lik mavi gösterge onun üstüne
    // binip kaymış görünüyordu. İnce ayraçta gösterge çizgiden ayrı okunur.
    borderTopWidth: Border.hairline,
  },
  inner: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  tabButton: {
    flex: 1,
    minHeight: TouchTarget + Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xxs,
    paddingBottom: Spacing.xs,
  },
  indicator: {
    // Çizginin altında, tam yuvarlak hap: üst ayraca binince kesik görünüyordu
    // (critique 9. tur).
    position: 'absolute',
    top: Spacing.xs,
    width: Spacing.xl,
    height: Spacing.xs - 1,
    borderRadius: Radius.pill,
  },
  pressed: {
    opacity: 0.7,
  },
  hidden: {
    display: 'none',
  },
});
