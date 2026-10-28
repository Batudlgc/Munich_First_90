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
  // Bazı testler 60-100 istek atar (olay limiti, hız sınırı); her istek hız
  // sınırından da geçtiği için yavaş CI makinesinde varsayılan 5 sn yetmedi ve
  // yarıda kalan test sonraki testin sayaçlarını bozdu (28.10).
  test: { testTimeout: 30_000 },
});
