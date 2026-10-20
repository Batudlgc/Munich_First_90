import { afterEach, describe, expect, it, vi } from 'vitest';

import { getNextStep } from '@/lib/next-step';
import { getOrderedSteps, type Phase, type Step } from '@/lib/steps';

// Minimal sahte adım: yalnız seçimi etkileyen alanlar (id, faz, önkoşul,
// son tarih gün sayısı) testten teste değişir. `days` undefined verilirse
// adımın hiç süre kuralı yoktur (deadline_rule: null) — gerçek veride
// bankkonto gibi; null verilirse kural var ama gün sayısı yok (krankenkasse).
function makeStep(
  id: string,
  {
    phase = 'first_weeks',
    prerequisites = [],
    days,
  }: { phase?: Phase; prerequisites?: string[]; days?: number | null } = {}
): Step {
  return {
    id,
    city: 'munich',
    phase,
    official_title: `Amtlicher Titel ${id}`,
    official_title_check: { kind: 'verified', source: 'https://example.test' },
    title: { en: `Title ${id}`, tr: `Başlık ${id}`, de: `Titel ${id}` },
    summary: { en: '', tr: '', de: '' },
    authority: null,
    documents: [],
    deadline_rule: days === undefined ? null : { days, text: { en: 't', tr: 't', de: 't' } },
    common_mistakes: [],
    booking_url: null,
    appointment: {
      mode: 'no_appointment',
      walk_in: null,
      phone: null,
      slot_release: null,
      note: { en: 'n', tr: 'n', de: 'n' },
      sources: ['https://example.test'],
    },
    prerequisites,
    typical_duration_days: null,
    sources: ['https://example.test'],
    last_verified: null,
  };
}

const ids = (step: Step | null) => step?.id ?? null;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getNextStep (sahte veri)', () => {
  it('first_weeks adımı tamamlanınca açık pre_arrival adımları sona düşer', () => {
    const steps = [
      makeStep('sperr', { phase: 'pre_arrival' }),
      makeStep('anm', { days: 14 }),
      makeStep('bank'),
    ];
    // Henüz varış sinyali yok: faz sırası geçerli, ama son tarihli adım önce.
    expect(ids(getNextStep(steps, new Set()))).toBe('anm');
    // Anmeldung tamam → pre_arrival sona; sıradaki first_weeks adımı.
    expect(ids(getNextStep(steps, new Set(['anm'])))).toBe('bank');
    // Gizlenmez: başka aday kalmayınca pre_arrival yine önerilir.
    expect(ids(getNextStep(steps, new Set(['anm', 'bank'])))).toBe('sperr');
  });

  it('pre_arrival tamamlanması varış sinyali sayılmaz', () => {
    const steps = [makeStep('sperr', { phase: 'pre_arrival' }), makeStep('haft', { phase: 'pre_arrival' }), makeStep('bank')];
    expect(ids(getNextStep(steps, new Set(['sperr'])))).toBe('haft');
  });

  it('hiçbir şey tamamlanmamışken son tarihi en yakın adımı seçer', () => {
    const steps = [
      makeStep('a', { days: null }),
      makeStep('b', { days: 30 }),
      makeStep('c', { days: 14 }),
      makeStep('d'),
    ];
    expect(ids(getNextStep(steps, new Set()))).toBe('c');
  });

  it('kilitli adım, son tarihi daha yakın olsa da atlanır', () => {
    // isStepUnlocked sahte önkoşul id'si için __DEV__ uyarısı basıyor; test
    // çıktısını kirletmesin.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const steps = [
      makeStep('base', { days: null }),
      makeStep('urgent', { days: 3, prerequisites: ['base'] }),
      makeStep('later', { days: 30 }),
    ];
    expect(ids(getNextStep(steps, new Set()))).toBe('later');
    // Önkoşul tamamlanınca kilit açılır ve öne geçer.
    expect(ids(getNextStep(steps, new Set(['base'])))).toBe('urgent');
  });

  it('conditional adım hiç seçilmez, son tarihi en yakın olsa bile', () => {
    const steps = [
      makeStep('cond', { phase: 'conditional', days: 1 }),
      makeStep('mand', { days: 90 }),
    ];
    expect(ids(getNextStep(steps, new Set()))).toBe('mand');
  });

  it('gün sayısı olmayan adım (null ya da kural yok) son tarihli adımların arkasına düşer', () => {
    const steps = [
      makeStep('none', {}),
      makeStep('nullDays', { days: null }),
      makeStep('ninety', { days: 90 }),
    ];
    expect(ids(getNextStep(steps, new Set()))).toBe('ninety');
    // Son tarihli adım bitince, son tarihsizler arasında dizi sırası geçerli.
    expect(ids(getNextStep(steps, new Set(['ninety'])))).toBe('none');
  });

  it('eşit son tarihte erken faz önce gelir, dizide sonra dursa bile', () => {
    const steps = [
      makeStep('late', { phase: 'first_90_days', days: 14 }),
      makeStep('early', { phase: 'pre_arrival', days: 14 }),
    ];
    expect(ids(getNextStep(steps, new Set()))).toBe('early');
  });

  it('eşit son tarih ve aynı fazda verilen dizideki sıra korunur', () => {
    const steps = [makeStep('first', { days: 14 }), makeStep('second', { days: 14 })];
    expect(ids(getNextStep(steps, new Set()))).toBe('first');
    expect(ids(getNextStep([...steps].reverse(), new Set()))).toBe('second');
  });

  it('tamamlanmış adım seçilmez', () => {
    const steps = [makeStep('done', { days: 1 }), makeStep('open', { days: 30 })];
    expect(ids(getNextStep(steps, new Set(['done'])))).toBe('open');
  });

  it('zorunlu adımların hepsi tamamsa null döner (conditional açık kalsa da)', () => {
    const steps = [
      makeStep('a', { days: 14 }),
      makeStep('b'),
      makeStep('cond', { phase: 'conditional', days: 14 }),
    ];
    expect(getNextStep(steps, new Set(['a', 'b']))).toBeNull();
  });

  it('boş dizi için null döner', () => {
    expect(getNextStep([], new Set())).toBeNull();
  });
});

describe('getNextStep (gerçek veri, zaman çizgisi sırası)', () => {
  it('ilk açılışta Anmeldung seçilir (14 günlük yasal süre, önkoşulsuz)', () => {
    expect(ids(getNextStep(getOrderedSteps(), new Set()))).toBe('anmeldung');
  });

  it('taslaktaki ara durumda (3 adım damgalı) yine Anmeldung seçilir', () => {
    const done = new Set(['sperrkonto', 'haftpflichtversicherung', 'krankenkasse']);
    expect(ids(getNextStep(getOrderedSteps(), done))).toBe('anmeldung');
  });

  it('seçilen adım hiçbir zaman conditional, kilitli ya da tamamlanmış değildir', () => {
    // Zaman çizgisini baştan sona tek tek damgalayarak ilerle: her turda
    // seçilen adım geçerli bir aday olmalı; sonunda null'a ulaşılmalı.
    const ordered = getOrderedSteps();
    const done = new Set<string>();
    const mandatoryCount = ordered.filter((step) => step.phase !== 'conditional').length;
    for (let turn = 0; turn < mandatoryCount; turn++) {
      const next = getNextStep(ordered, done);
      expect(next, `tur ${turn}`).not.toBeNull();
      expect(next!.phase).not.toBe('conditional');
      expect(done.has(next!.id)).toBe(false);
      expect(next!.prerequisites.every((dep) => done.has(dep))).toBe(true);
      done.add(next!.id);
    }
    expect(getNextStep(ordered, done)).toBeNull();
  });
});
