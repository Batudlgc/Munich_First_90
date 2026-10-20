import { defineConfig } from 'vitest/config';
import path from 'node:path';

// tsconfig.json'daki "paths" ile birebir aynı alias'lar:
// "@/*" -> "./src/*", "@/assets/*" -> "./assets/*".
// __DEV__ React Native'in global'i; Node'da tanımsız olduğu için burada
// sabit `true` olarak define edilir (steps.ts bunu console.warn için okuyor).
export default defineConfig({
  define: {
    __DEV__: true,
  },
  resolve: {
    alias: [
      // Metro, gerçek derlemede platform-uzantı kuralıyla (.web.ts) web'de
      // otomatik olarak bu dosyayı seçer (expo-sqlite'ın native modülü yerine
      // localStorage kullanan sürüm) — vitest bu kuralı bilmediği için burada
      // elle aynı yönlendirme yapılıyor. Aksi hâlde `@/lib/device-storage`'ı
      // (dolayısıyla language.tsx'i) import eden HER test dosyası,
      // expo-sqlite'ın Node'da çözülemeyen native modülüyle çöker.
      {
        find: '@/lib/device-storage',
        replacement: path.resolve(__dirname, './src/lib/device-storage.web.ts'),
      },
      { find: '@/assets', replacement: path.resolve(__dirname, './assets') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'proxy/eval/**/*.eval.ts'],
  },
});
