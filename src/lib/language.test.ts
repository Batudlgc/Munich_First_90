import { describe, it, expect, vi, afterEach } from 'vitest';

import { detectDeviceLang, LANGS, LANG_LABELS, LANG_NAMES, type Lang } from '@/lib/language';

/**
 * `detectDeviceLang` yeni paket kurmadan (expo-localization YOK) cihaz dilini
 * `Intl.DateTimeFormat().resolvedOptions().locale` üzerinden okuyor. Bu testler
 * o okumanın döndürdüğü etiketi taklit ederek eşlemeyi doğruluyor — asıl risk
 * "de-AT" gibi bölgeli etiketlerin ve okunamayan bir Intl'in yanlış dile
 * düşmesi.
 */
function withLocale(locale: string | null, run: () => void) {
  const original = Intl.DateTimeFormat;
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((() => {
    if (locale === null) throw new Error('Intl kullanılamıyor');
    return { resolvedOptions: () => ({ locale }) };
  }) as unknown as typeof Intl.DateTimeFormat);
  try {
    run();
  } finally {
    Intl.DateTimeFormat = original;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('detectDeviceLang', () => {
  const cases: [string, Lang][] = [
    ['tr', 'tr'],
    ['tr-TR', 'tr'],
    ['de', 'de'],
    ['de-DE', 'de'],
    // Avusturya/İsviçre Almancası da Almanca'ya düşer.
    ['de-AT', 'de'],
    ['de_CH', 'de'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    // Desteklenmeyen dil Türkçe'ye değil İngilizce'ye düşer: hedef kitlenin
    // ortak dili İngilizce.
    ['fr-FR', 'en'],
    ['ar', 'en'],
    ['zh-Hans-CN', 'en'],
    // Büyük harfli etiket de tanınmalı.
    ['TR-tr', 'tr'],
  ];

  for (const [locale, expected] of cases) {
    it(`"${locale}" -> ${expected}`, () => {
      withLocale(locale, () => {
        expect(detectDeviceLang()).toBe(expected);
      });
    });
  }

  it('Intl okunamazsa en döner (çökmez)', () => {
    withLocale(null, () => {
      expect(detectDeviceLang()).toBe('en');
    });
  });
});

describe('dil listesi ve etiketler', () => {
  it('üç dil tanımlı', () => {
    expect([...LANGS]).toEqual(['en', 'tr', 'de']);
  });

  it('her dilin bir kısa etiketi ve bir kendi-dilinde adı var', () => {
    for (const lang of LANGS) {
      expect(LANG_LABELS[lang]).toMatch(/^[A-Z]{2}$/);
      expect(LANG_NAMES[lang].length).toBeGreaterThan(0);
    }
  });
});
