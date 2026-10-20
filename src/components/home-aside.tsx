import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { SideCard } from '@/components/side-card';
import { StatusIcon } from '@/components/status-icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { firstSentence } from '@/lib/format';
import { useLanguage } from '@/lib/language';
import { openExternal } from '@/lib/open-external';
import { getOrderedSteps } from '@/lib/steps';

/**
 * Ana sayfanın yan bilgi kartları (masaüstünde sağ kolon, telefonda sayfa sonu).
 *
 * Hepsi adım verisinden TÜRETİLİR — yeni olgu yazılmaz (APP.md §6): yasal süreler
 * `deadline_rule`dan, resmî siteler `sources`tan sayılarak.
 */

const steps = getOrderedSteps();

/** Gün sayılı yasal süresi olan adımlar (ana ekrandaki kırmızı kuralla aynı). */
const deadlineSteps = steps.filter((step) => step.deadline_rule && step.deadline_rule.days !== null);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Kaynaklarda en sık geçen alan adları: kaç farklı adımda kaynak olduğu sayılır.
 * Bağlantı, o alan adındaki ilk kaynak sayfasına gider (alan adının kökü değil:
 * kök sayfanın varlığı doğrulanmadı, kaynak sayfalar check-links ile doğrulanıyor).
 */
const topSites: { host: string; url: string; count: number }[] = (() => {
  const byHost = new Map<string, { url: string; steps: Set<string> }>();
  for (const step of steps) {
    for (const url of [...step.sources, ...step.appointment.sources]) {
      const host = hostOf(url);
      if (!host) continue;
      const entry = byHost.get(host) ?? { url, steps: new Set<string>() };
      entry.steps.add(step.id);
      byHost.set(host, entry);
    }
  }
  return [...byHost.entries()]
    .map(([host, { url, steps: ids }]) => ({ host, url, count: ids.size }))
    .filter((site) => site.count >= 2)
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host))
    .slice(0, 5);
})();

function Row({
  onPress,
  title,
  detail,
  detailTone,
  external = false,
  accessibilityLabel,
}: {
  onPress: () => void;
  title: string;
  detail?: string | null;
  detailTone?: 'due';
  external?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed, hovered }) => [
        styles.row,
        (hovered || pressed) && { backgroundColor: theme.fill },
      ]}
    >
      <View style={styles.rowText}>
        <ThemedText type="labelBold">{title}</ThemedText>
        {detail ? (
          <ThemedText
            type="label"
            themeColor={detailTone ? undefined : 'textSecondary'}
            style={detailTone === 'due' ? { color: theme.due } : undefined}
          >
            {detail}
          </ThemedText>
        ) : null}
      </View>
      <StatusIcon
        ios={external ? 'arrow.up.right' : 'chevron.right'}
        material={external ? 'open_in_new' : 'chevron_right'}
        fallbackText={external ? '↗' : '›'}
        size={16}
        color={theme.textSecondary}
      />
    </Pressable>
  );
}

export function DeadlinesCard() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  if (deadlineSteps.length === 0) return null;
  return (
    <SideCard title={t('aside.deadlinesTitle')}>
      <View>
        {deadlineSteps.map((step) => (
          <Row
            key={step.id}
            title={step.title[lang]}
            detail={step.deadline_rule ? firstSentence(step.deadline_rule.text[lang]) : null}
            detailTone="due"
            onPress={() => router.push(`/adim/${step.id}` as Href)}
          />
        ))}
      </View>
    </SideCard>
  );
}

export function SitesCard() {
  const { t } = useLanguage();
  if (topSites.length === 0) return null;
  return (
    <SideCard title={t('aside.sitesTitle')}>
      <View>
        {topSites.map((site) => (
          <Row
            key={site.host}
            title={site.host}
            detail={t('aside.sitesNote').replace('{n}', String(site.count))}
            external
            onPress={() => void openExternal(site.url)}
          />
        ))}
      </View>
    </SideCard>
  );
}

export function AboutCard() {
  const router = useRouter();
  const { t } = useLanguage();
  const theme = useTheme();
  return (
    <SideCard title={t('aside.aboutTitle')}>
      <ThemedText type="label" themeColor="textSecondary">
        {t('aside.aboutBody')}
      </ThemedText>
      <Pressable onPress={() => router.push('/hakkinda')} accessibilityRole="link" style={styles.inlineLink}>
        <ThemedText type="link" style={{ color: theme.accent }}>
          {t('aside.aboutLink')}
        </ThemedText>
      </Pressable>
    </SideCard>
  );
}

export function AskCard() {
  const router = useRouter();
  const { t } = useLanguage();
  const theme = useTheme();
  return (
    <SideCard title={t('aside.askTitle')} style={{ backgroundColor: theme.accentSoft }}>
      <ThemedText type="label" themeColor="textSecondary">
        {t('aside.askBody')}
      </ThemedText>
      <Pressable onPress={() => router.push('/sor')} accessibilityRole="link" style={styles.inlineLink}>
        <ThemedText type="link" style={{ color: theme.accent }}>
          {t('hero.ctaAsk')}
        </ThemedText>
      </Pressable>
    </SideCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginHorizontal: -Spacing.sm,
    borderRadius: Radius.sm,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xxs,
  },
  inlineLink: {
    alignSelf: 'flex-start',
    minHeight: TouchTarget,
    justifyContent: 'center',
  },
});
