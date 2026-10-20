import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Testler gerçek Workers çalışma zamanında (workerd, yerel Miniflare) koşar.
// Upstream (Mistral) hiç çağrılmaz: testler global fetch'i sahte bir
// cevapla değiştirir, anahtar gerekmez (APP.md §6).
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { IP_HASH_SALT: 'test-salt' },
      },
    }),
  ],
});
