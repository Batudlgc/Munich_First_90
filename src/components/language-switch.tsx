import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LANGS, LANG_LABELS, LANG_NAMES, useLanguage } from '@/lib/language';

/**
 * TR / EN / DE seçici — tonal ray (`fill`) üstünde seçili dil (`toggleOn`:
 * açık temada beyaz parça, koyu temada dolu mavi — marka PDF'i, 20.10). Ana ekranda ve ilk açılışta aynı bileşen.
 *
 * critique 2026-10: önce mürekkep çerçeveli, seçili hücre mürekkeple doluydu;
 * ana ekranın en ağır öğesi dil seçiciydi ve koyu temada seçili hücre (adaçayı)
 * devre dışı gibi görünüyordu. Seçili parça şimdi hem renk hem kalınlık hem
 * gölgeyle ayrılıyor; tek başına renge dayanmıyor.
 *
 * Her hücre 44×44 dokunma alanı: görsel ile dokunma alanı aynı kutu, böylece
 * web denetimi (scripts/shot.mjs) ve VoiceOver aynı sınırı görür.
 */
export function LanguageSwitch() {
  const theme = useTheme();
  const { lang, setLang, t } = useLanguage();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('a11y.languageToggle')}
      style={[styles.group, { backgroundColor: theme.fill }]}
    >
      {LANGS.map((option) => {
        const selected = option === lang;
        return (
          <Pressable
            key={option}
            onPress={() => setLang(option)}
            accessibilityRole="radio"
            // aria-checked, accessibilityState değil: react-native-web 0.21
            // accessibilityState'i DOM'a yazmıyor (ölçüldü: aria-checked yoktu);
            // aria-* iOS'ta da okunur.
            aria-checked={selected}
            accessibilityLabel={LANG_NAMES[option]}
            style={({ pressed }) => [
              styles.cell,
              selected && [styles.selected, { backgroundColor: theme.toggleOn }],
              pressed && !selected && styles.pressed,
            ]}
          >
            <ThemedText type={selected ? 'labelBold' : 'label'} style={{ color: selected ? theme.onToggleOn : theme.textSecondary }}>
              {LANG_LABELS[option]}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: Radius.sm + Spacing.xxs,
    padding: Spacing.xxs,
  },
  cell: {
    // Her hücre tam 44×44 dokunma alanı; ray 2pt iç boşlukla bunu çevreler.
    minWidth: TouchTarget,
    minHeight: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
  },
  selected: {
    boxShadow: '0px 1px 3px rgba(26, 34, 51, 0.16)',
  },
  pressed: {
    opacity: 0.6,
  },
});
