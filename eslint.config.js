// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // proxy/vitest.config.ts yalnız proxy/node_modules'taki paketleri import eder;
    // kök CI proxy bağımlılıklarını kurmaz.
    // dist-web: web export çıktısı (derlenmiş paket), lint'lenmez.
    // .claude/**: paralel ajanların yerel çalışma kopyaları (worktree, .gitignore'da).
    ignores: [".claude/**", "dist/*", "dist-web/**", "proxy/node_modules/**", "proxy/vitest.config.ts"],
  },
  {
    // Cloudflare Worker (proxy/): `cloudflare:*` modülleri Workers çalışma
    // zamanının yerleşik modülleri, diskte dosyası yok.
    files: ["proxy/**/*.ts"],
    rules: {
      "import/no-unresolved": ["error", { ignore: ["^cloudflare:"] }],
    },
  }
]);
