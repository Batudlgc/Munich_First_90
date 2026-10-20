// Uygulamadaki `Lang` tipinin (src/lib/language.tsx) proxy kopyası. Yalnız
// src/lib/scope.ts'in tip importunu karşılar; bkz. tsconfig.json "paths".
// Uygulamaya dil eklenirse burası da güncellenmeli — test/scope.test.ts
// OUT_OF_SCOPE_RESPONSE anahtarlarını LANGS ile karşılaştırarak bunu yakalar.
export type Lang = 'tr' | 'en' | 'de';
export const LANGS: readonly Lang[] = ['en', 'tr', 'de'];
