import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { gradientFill, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Damganın duruş açısı (dış katmanda, animasyonsuz). */
const TILT = '-8deg';

/**
 * Damganın iki hâli (toplantı 20.10: "daha göz alıcı, mavi gradyan; açıkta içi
 * dolu, açık ve koyu temada aynı ton olmasın" — logodaki gibi temaya göre değişir).
 * - Açık tema: içi dolu, logonun lacivert → kraliyet mavisi gradyanı, beyaz yazı.
 *   Beyaz yazı en açık uçta (#2C72CA) bile 4.6:1.
 * - Koyu tema: parlayan mavi çerçeve, içi yarı saydam mavi, açık mavi yazı;
 *   gece laciverti zeminde ışık gibi durur. Yazı zeminde 11:1'in üstünde.
 */
const LOOK = {
  light: {
    fill: 'linear-gradient(135deg, #0B234B 0%, #0051C2 55%, #2C72CA 100%)',
    border: 'transparent',
    inner: 'rgba(255, 255, 255, 0.55)',
    text: '#FFFFFF',
    shadow: '0px 10px 24px rgba(0, 81, 194, 0.35)',
  },
  dark: {
    fill: 'linear-gradient(135deg, rgba(61, 149, 255, 0.30) 0%, rgba(169, 207, 247, 0.10) 100%)',
    border: '#3D95FF',
    inner: 'rgba(169, 207, 247, 0.55)',
    text: '#DCEBFF',
    shadow: '0px 0px 28px rgba(61, 149, 255, 0.55)',
  },
} as const;



/**
 * "ERLEDIGT + tarih" damgası. Yazı her dilde Almanca kalır — damga uygulamanın
 * kimliği; anlamı ekran okuyucuya `accessibilityLabel` ile seçili dilde söylenir.
 *
 * İniş animasyonu (340 ms): yukarıdan büyük ve eğik başlar, kısa bir "basma" ile
 * oturur; oturduğu an etrafından bir halka yayılıp söner (mürekkep izi).
 *
 * 20.10 düzeltmesi (toplantı: "damga kayıyor"): eskiden Reanimated `entering`
 * (layout animasyonu) kullanılıyordu; web'de animasyon bitince dış kutunun
 * boyutu 0'a iniyordu → damga yerini kaybedip form kutusunun yazısının üstüne
 * biniyor, sayfa yenilenince yerine "zıplıyordu". Artık animasyon yalnız
 * transform/opacity değerleriyle (useAnimatedStyle); düzen (layout) hiç değişmez,
 * animasyonun bitişi ile yenilenmiş sayfa piksel piksel aynı.
 *
 * `animate` true ise iner; "Hareketi azalt" açıksa animasyon kurulmaz.
 */
export function Stamp({
  date,
  animate = false,
  delayMs = 0,
  accessibilityLabel,
}: {
  /** Biçimlenmiş tarih ("05.10.2026"); bilinmiyorsa satır çizilmez (uydurma tarih yok). */
  date?: string | null;
  animate?: boolean;
  /** Animasyon başlamadan önce bekleme (ör. sayfa önce yukarı kayarken). */
  delayMs?: number;
  accessibilityLabel: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const look = LOOK[scheme];
  const reduceMotion = useReducedMotion();
  const play = animate && !reduceMotion;

  // Başlangıç değerleri: oynatılacaksa görünmez/büyük; değilse doğrudan son hâl.
  const progress = useSharedValue(play ? 0 : 1);
  const ring = useSharedValue(0);

  useEffect(() => {
    if (!play) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withSequence(
        withTiming(0.6, { duration: 204, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 136, easing: Easing.out(Easing.quad) })
      )
    );
    ring.value = 0;
    ring.value = withDelay(delayMs + 200, withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
  }, [play, delayMs, progress, ring]);

  const faceStyle = useAnimatedStyle(() => {
    const p = progress.value;
    // 0 → 0.6: 1.9× ve −8° ekstra eğiklikten 0.94× ve +1°'ye (basma); 0.6 → 1: 1× ve 0°.
    const first = Math.min(p / 0.6, 1);
    const second = p > 0.6 ? (p - 0.6) / 0.4 : 0;
    const scale = p <= 0.6 ? 1.9 + (0.94 - 1.9) * first : 0.94 + 0.06 * second;
    const rotate = p <= 0.6 ? -8 + 9 * first : 1 - second;
    return {
      opacity: Math.min(first * 1.4, 1),
      transform: [{ rotate: `${rotate}deg` }, { scale }],
    };
  });

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 0.5 * (1 - ring.value),
    transform: [{ scale: 1 + 0.35 * ring.value }],
  }));

  return (
    // Dış katman: duruş açısı. Hiç animasyon almaz, boyutu içerikten gelir.
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={styles.stamp}>
      {play ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { borderColor: scheme === 'dark' ? '#3D95FF' : '#0051C2' }, ringStyle]}
        />
      ) : null}
      <Animated.View
        style={[
          styles.face,
          gradientFill(look.fill),
          { borderColor: look.border, boxShadow: look.shadow },
          faceStyle,
        ]}
      >
        <View style={[styles.inner, { borderColor: look.inner }]}>
          <ThemedText type="stamp" style={{ color: look.text }}>
            ERLEDIGT
          </ThemedText>
          {date ? (
            <ThemedText type="stampDate" style={{ color: look.text }}>
              {date}
            </ThemedText>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: {
    alignSelf: 'flex-start',
    transform: [{ rotate: TILT }],
  },
  face: {
    borderWidth: 2,
    borderRadius: Radius.md + Spacing.xxs,
    padding: Spacing.xs - 1,
  },
  inner: {
    borderWidth: 1.5,
    borderRadius: Radius.sm + Spacing.xxs,
    paddingHorizontal: Spacing.smd + Spacing.xxs,
    paddingTop: Spacing.xs + Spacing.xxs,
    paddingBottom: Spacing.xs,
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 3,
    borderRadius: Radius.md + Spacing.xxs,
  },
});
