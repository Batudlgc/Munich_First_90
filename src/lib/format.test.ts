import { describe, expect, it } from 'vitest';

import { firstSentence, formatStampDate } from '@/lib/format';

describe('formatStampDate', () => {
  it('gün ve ayı iki haneye tamamlar', () => {
    expect(formatStampDate(new Date(2026, 9, 5))).toBe('05.10.2026');
  });
  it('iki haneli gün ve ay olduğu gibi kalır', () => {
    expect(formatStampDate(new Date(2026, 11, 31))).toBe('31.12.2026');
  });
});

describe('firstSentence', () => {
  it('ilk cümleyi döner', () => {
    expect(firstSentence('Für die Anmeldung gelten 14 Tage ab dem Einzug. Grundlage ist das BMG.')).toBe(
      'Für die Anmeldung gelten 14 Tage ab dem Einzug.'
    );
  });
  it('rakamdan sonraki noktada bölmez (Almanca sıra sayısı)', () => {
    expect(
      firstSentence('Für Bestellung und Kündigung gilt derselbe Stichtag: der 10. Kalendertag des Monats. Wer ihn verpasst, wartet.')
    ).toBe('Für Bestellung und Kündigung gilt derselbe Stichtag: der 10. Kalendertag des Monats.');
  });
  it('küçük harfle süren kısaltmada bölmez', () => {
    expect(firstSentence('Die Datenkopie (Art. 15 DSGVO) kommt nach einem Monat. Danach mehr.')).toBe(
      'Die Datenkopie (Art. 15 DSGVO) kommt nach einem Monat.'
    );
  });
  it('tek cümlelik metni olduğu gibi döner', () => {
    expect(firstSentence('Deadlines vary by university.')).toBe('Deadlines vary by university.');
  });
  it('noktasız metni olduğu gibi döner', () => {
    expect(firstSentence('Ohne Punkt')).toBe('Ohne Punkt');
  });
});
