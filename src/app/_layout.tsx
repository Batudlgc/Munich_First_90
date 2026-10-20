import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Onboarding } from '@/components/onboarding';
import { WebHead } from '@/components/web-head';
import { Colors, FontFamily } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CompletedStepsProvider } from '@/hooks/use-completed-steps';
import { useOnboarding } from '@/hooks/use-onboarding';
import { LanguageProvider } from '@/lib/language';
import { trackOpen } from '@/lib/metrics';

SplashScreen.preventAutoHideAsync();

/**
 * Gezinme çubuğu (adım sayfası dışındaki itilen ekranlar) ve ekran geçiş
 * zemini de form kâğıdı renginde olsun; varsayılan beyaz/siyah değil.
 * Başlık yazısı Figtree.
 */
function navigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.background,
      card: c.background,
      text: c.text,
      border: c.rule,
    },
    fonts: {
      regular: { fontFamily: FontFamily.body400, fontWeight: 'normal' },
      medium: { fontFamily: FontFamily.body500, fontWeight: 'normal' },
      bold: { fontFamily: FontFamily.head700, fontWeight: 'normal' },
      heavy: { fontFamily: FontFamily.head800, fontWeight: 'normal' },
    },
  };
}

// Sekmeler (tabs) tek başına bir Stack (üstüne ekran "iten" navigasyon) içinde
// değildi, bu yüzden adım detay sayfasına router.push ile gidilemiyordu —
// gidecek bir yer yoktu, sessizce hiçbir şey olmuyordu. Kök layout artık bir
// Stack: (tabs) grubu ana ekran, adim/[id] onun üstüne itilen ekran.
export default function RootLayout() {
  const colorScheme = useColorScheme();
  // Fontlar yüklenene kadar splash ekranı kalır; sistem fontuyla bir kare
  // çizip sonra Figtree'ye "zıplamasın". Yükleme hata verirse uygulama yine
  // açılır (theme.ts'teki yedek aile zinciriyle) — font yüzünden kilitlenmez.
  // Anahtarlar theme.ts FontFamily adlarıyla birebir aynı olmak zorunda.
  //
  // Dosyalar repoda (assets/fonts, OFL lisanslı), @expo-google-fonts paketinden
  // değil: paketten yüklenen font web export'ta /assets/node_modules/... yoluna
  // düşüyor; o yolun statik barındırıcıda (Vercel) servis edildiği bu ortamdan
  // doğrulanamadı. Repodaki dosya /assets/assets/fonts/... altına çıkar.
  const [fontsLoaded, fontError] = useFonts({
    // Figtree (OFL, assets/fonts/Figtree-OFL.txt). Google Fonts'taki değişken
    // fonttan sabit ağırlıklar fontTools ile çıkarıldı (SDK 57'de aile başına tek ağırlık).
    Figtree_400Regular: require('@/assets/fonts/Figtree-Regular.ttf'),
    Figtree_500Medium: require('@/assets/fonts/Figtree-Medium.ttf'),
    Figtree_600SemiBold: require('@/assets/fonts/Figtree-SemiBold.ttf'),
    Figtree_700Bold: require('@/assets/fonts/Figtree-Bold.ttf'),
    Figtree_800ExtraBold: require('@/assets/fonts/Figtree-ExtraBold.ttf'),
  });
  // Tanıtım ekranları bir route DEĞİL, en üstte duran bir katman: route
  // olsaydı ilk açılışta yönlendirme ile ana ekran arasında yarış oluşuyor ve
  // kullanıcı bir an ana ekranı görüp sonra tanıtıma atılıyordu.
  const { seen, markSeen } = useOnboarding();
  // Anonim ölçüm (C1): oturum başına tek `open` olayı; cihazda bir şey saklanmaz.
  useEffect(() => trackOpen(), []);
  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <LanguageProvider>
      <CompletedStepsProvider>
        <ThemeProvider value={navigationTheme(colorScheme === 'dark' ? 'dark' : 'light')}>
          <WebHead />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="adim/[id]" options={{ headerShown: true }} />
            <Stack.Screen name="hakkinda" options={{ headerShown: true }} />
          </Stack>
          {/* Web: tanıtımın görülüp görülmediği hydration'dan sonra okunur
              (seen === null). O ana kadar sayfa zemini renginde düz bir örtü:
              varsayılan dil/boş ilerleme bir kare bile görünmesin. */}
          {seen === null ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: Colors[colorScheme === 'dark' ? 'dark' : 'light'].background }]}
            />
          ) : (
            !seen && <Onboarding onDone={markSeen} />
          )}
        </ThemeProvider>
      </CompletedStepsProvider>
    </LanguageProvider>
  );
}
