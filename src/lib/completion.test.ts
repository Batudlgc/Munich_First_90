import { afterEach, describe, expect, it } from 'vitest';

import {
  completedAt,
  markDone,
  markUndone,
  parseDates,
  parseIsoDay,
  toggleDone,
  toIsoDay,
  type Completion,
} from '@/lib/completion';
import { formatStampDate } from '@/lib/format';

const empty: Completion = { ids: new Set(), dates: {} };

describe('parseDates — bozuk veriye dayanıklı', () => {
  it('boş ya da yok → boş nesne', () => {
    expect(parseDates(null)).toEqual({});
    expect(parseDates('')).toEqual({});
  });
  it('JSON değil → boş nesne (hata fırlatmaz)', () => {
    expect(parseDates('{bozuk')).toEqual({});
  });
  it('nesne olmayan JSON → boş nesne', () => {
    expect(parseDates('null')).toEqual({});
    expect(parseDates('[]')).toEqual({});
    expect(parseDates('["anmeldung"]')).toEqual({});
    expect(parseDates('"2026-10-05"')).toEqual({});
    expect(parseDates('42')).toEqual({});
  });
  it('geçerli günler kalır, geçersiz değerler atılır', () => {
    const raw = JSON.stringify({
      anmeldung: '2026-10-05',
      bankkonto: 5,
      krankenkasse: 'dün',
      sperrkonto: '2026-02-30',
      steuer: '2026-10-05T10:00:00Z',
    });
    expect(parseDates(raw)).toEqual({ anmeldung: '2026-10-05' });
  });
});

describe('markDone / markUndone / toggleDone', () => {
  it('damgala: id ve bugünün tarihi eklenir', () => {
    const next = markDone(empty, 'anmeldung', '2026-10-05');
    expect([...next.ids]).toEqual(['anmeldung']);
    expect(next.dates).toEqual({ anmeldung: '2026-10-05' });
  });
  it('girdiyi değiştirmez (React state için yeni nesne)', () => {
    const state: Completion = { ids: new Set(['a']), dates: { a: '2026-09-01' } };
    markDone(state, 'b', '2026-10-05');
    markUndone(state, 'a');
    expect([...state.ids]).toEqual(['a']);
    expect(state.dates).toEqual({ a: '2026-09-01' });
  });
  it('kaldır: id ve tarih birlikte silinir', () => {
    const state = markDone(empty, 'anmeldung', '2026-10-05');
    const next = markUndone(state, 'anmeldung');
    expect(next.ids.size).toBe(0);
    expect(next.dates).toEqual({});
  });
  it('artık kalmış eski tarih yeniden damgalanınca bugüne döner', () => {
    const stale: Completion = { ids: new Set(), dates: { anmeldung: '2026-01-01' } };
    expect(markDone(stale, 'anmeldung', '2026-10-05').dates.anmeldung).toBe('2026-10-05');
  });
  it('toggle iki kez → başa döner', () => {
    const once = toggleDone(empty, 'anmeldung', '2026-10-05');
    expect(completedAt(once, 'anmeldung')).toBe('2026-10-05');
    const twice = toggleDone(once, 'anmeldung', '2026-10-06');
    expect(twice.ids.has('anmeldung')).toBe(false);
    expect(twice.dates).toEqual({});
  });
});

describe('completedAt', () => {
  it('tarihsiz eski kayıt → null (uydurma tarih yok)', () => {
    const legacy: Completion = { ids: new Set(['anmeldung']), dates: {} };
    expect(completedAt(legacy, 'anmeldung')).toBeNull();
  });
  it('tamamlanmamış adımın artık tarihi gösterilmez', () => {
    const stale: Completion = { ids: new Set(), dates: { anmeldung: '2026-10-05' } };
    expect(completedAt(stale, 'anmeldung')).toBeNull();
  });
});

describe('yerel gün (saat dilimi kayması yok)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('toIsoDay yerel günü yazar', () => {
    expect(toIsoDay(new Date(2026, 9, 5, 0, 30))).toBe('2026-10-05');
    expect(toIsoDay(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
  });

  it('parseIsoDay geçersiz günde null döner', () => {
    expect(parseIsoDay('2026-02-30')).toBeNull();
    expect(parseIsoDay('2026-13-01')).toBeNull();
    expect(parseIsoDay('05.10.2026')).toBeNull();
    expect(parseIsoDay('')).toBeNull();
  });

  // UTC'nin batısında `new Date('YYYY-MM-DD')` bir önceki güne düşer; yerel
  // kurulum düşmez. İlk beklenti, saat dilimi değişikliğinin gerçekten
  // uygulandığını (tuzağın var olduğunu) gösterir.
  for (const tz of ['America/New_York', 'Europe/Berlin', 'Pacific/Auckland']) {
    it(`${tz}: damga tarihi kaydedilen günle aynı`, () => {
      process.env.TZ = tz;
      if (tz === 'America/New_York') expect(new Date('2026-10-05').getDate()).toBe(4);
      const date = parseIsoDay('2026-10-05');
      expect(date && formatStampDate(date)).toBe('05.10.2026');
      expect(toIsoDay(new Date(2026, 9, 5, 0, 30))).toBe('2026-10-05');
    });
  }
});
