import { StyleSheet, View } from 'react-native';

import { StatusIcon } from '@/components/status-icon';
import { Border, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type NodeState = 'open' | 'next' | 'done' | 'locked';

/** Düğüm çapı. Zaman çizgisi rayı bu çapın ortasından geçer (bkz. NODE_CENTER). */
export const NODE_SIZE = 30;
export const NODE_CENTER = NODE_SIZE / 2;

/**
 * Zaman çizgisindeki adım düğümü — üç durum, üç ayrı biçim (yalnız renk değil,
 * WCAG 1.4.1): açık = mürekkep halka, tamamlandı = mavi dolu + onay işareti,
 * kilitli = kesikli gri halka, sıradaki = mavi halka + açık mavi iç (critique 7. tur:
 * "Sıradaki adım" kutusu ile zaman çizgisindeki satırı bağlanmıyordu).
 *
 * Dekoratiftir: durumu ekran okuyucuya satırın kendi etiketi söyler
 * ("Adres kaydı, tamamlandı"). Düğüm zemini sayfa zeminiyle aynı renkte dolu;
 * böylece arkasından geçen ray düğümün içinde görünmez.
 */
export function TimelineNode({ state }: { state: NodeState }) {
  const theme = useTheme();

  const look =
    state === 'done'
      ? { backgroundColor: theme.primary, borderColor: theme.primary }
      : state === 'locked'
        ? { backgroundColor: theme.background, borderColor: theme.lockedLine, borderStyle: 'dashed' as const }
        : state === 'next'
          ? { backgroundColor: theme.accentSoft, borderColor: theme.accent }
          : { backgroundColor: theme.background, borderColor: theme.line };

  return (
    <View style={[styles.node, look]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {state === 'done' && (
        <StatusIcon ios="checkmark" material="check" fallbackText="✓" size={16} color={theme.onPrimary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: Radius.pill,
    borderWidth: Border.node,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
