import { Stack, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StateView } from '@/components/state-view';
import { ThemedView } from '@/components/themed-view';
import { WebHead } from '@/components/web-head';
import { Gutter, MaxContentWidth } from '@/constants/theme';
import { useLanguage } from '@/lib/language';

// Eşleşmeyen adres. Web'de önemli: Vercel bilinmeyen her URL'de bu ekranın
// export'unu (404.html) sunar. Expo'nun varsayılanı yalnız İngilizceydi ve
// yayında olmayan _sitemap'e bağlantı veriyordu.
export default function NotFoundScreen() {
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <WebHead title={t('notFound.title')} />
      <Stack.Screen options={{ title: t('notFound.title'), headerShown: false }} />
      <SafeAreaView style={[styles.container, styles.center]}>
        <StateView
          kind="empty"
          title={t('notFound.title')}
          body={t('notFound.body')}
          actionLabel={t('notFound.action')}
          onAction={() => router.replace('/')}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Gutter,
  },
});
