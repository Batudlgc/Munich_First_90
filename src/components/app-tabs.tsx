import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/lib/language';

/**
 * Üç sekme (onaylı taslak): Adımlar · Sor · Sözlük. iOS'ta yerel sekme
 * çubuğu; simgeler SF Symbols, seçili simge dolu biçim. Web karşılığı
 * app-tabs.web.tsx.
 */
export default function AppTabs() {
  const colors = useTheme();
  const { t } = useLanguage();

  return (
    <NativeTabs
      backgroundColor={colors.surface}
      tintColor={colors.accent}
      labelStyle={{ color: colors.textSecondary, selected: { color: colors.text } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('tabs.home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }}
          md="checklist"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="sor">
        <NativeTabs.Trigger.Label>{t('tabs.ask')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'questionmark.bubble', selected: 'questionmark.bubble.fill' }}
          md="contact_support"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>{t('tabs.glossary')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'character.book.closed', selected: 'character.book.closed.fill' }}
          md="menu_book"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
