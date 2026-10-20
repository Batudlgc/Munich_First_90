import { Children, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Border, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Resmi form başlığı: mürekkep çerçeveli kâğıt kutu, içinde ince ayraçlarla
 * bölünmüş alanlar ("Resmi adı", "Makam", "Süre", "Randevu").
 *
 * Ayraçlar alanların kendisinde değil burada çiziliyor: her çocuk bir sarmalayıcıya
 * konur ve İLKİ HARİÇ hepsine üst çizgi eklenir. Böylece koşullu alanlar
 * (`{step.authority && <FormField …/>}`) eksik olduğunda başta ya da sonda
 * fazladan çizgi kalmaz. `Children.toArray` null/false çocukları zaten atar.
 */
export function FormBox({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: theme.surface, borderColor: theme.line }, style]}>
      {Children.toArray(children).map((child, i) => (
        <View
          key={i}
          style={i > 0 && [styles.rowRule, { borderTopColor: theme.rule }]}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

/** Kutu içinde yan yana iki (ya da daha çok) alan; aralarında dikey ayraç. */
export function FormRow({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      {Children.toArray(children).map((child, i) => (
        <View
          key={i}
          style={[styles.cell, i > 0 && [styles.cellRule, { borderLeftColor: theme.rule }]]}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * Tek alan: küçük etiket + değer. Değer resmi bir terim ya da kısa bir bilgi
 * olduğu için dar başlık fontuyla (term) yazılır. `tone="due"` yalnız son
 * tarih için. Ekran okuyucu alanı tek parça okur: "Makam: Bürgerbüro".
 * `children` verilirse değerin altına eklenir (ör. açıklama satırı, bağlantı).
 */
export function FormField({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value?: string;
  tone?: 'due';
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <View accessible={!!value} accessibilityLabel={value ? `${label}: ${value}` : undefined}>
        <ThemedText type="caption" themeColor="textSecondary">
          {label}
        </ThemedText>
        {value ? (
          <ThemedText type="term" style={tone === 'due' && { color: theme.due }}>
            {value}
          </ThemedText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: Border.box,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  rowRule: {
    borderTopWidth: Border.hairline,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  cellRule: {
    borderLeftWidth: Border.hairline,
  },
  field: {
    paddingHorizontal: Spacing.smd,
    paddingVertical: Spacing.smd - Spacing.xxs,
    gap: Spacing.xxs,
  },
});
