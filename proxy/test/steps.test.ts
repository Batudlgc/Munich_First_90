/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

import { OUT_OF_SCOPE_RESPONSE } from '../../src/lib/scope';
import { LANGS } from '../src/lang';
import { buildSystemPrompt } from '../src/prompt';
import { getStep, matchSteps, STEPS, stepForPrompt } from '../src/steps';

describe('adım listesi', () => {
  it('src/data/steps/ altındaki her JSON proxy listesinde var (ve fazlası yok)', () => {
    // import.meta.glob yalnız test derlemesinde (Vite) çalışır; Worker
    // paketinde elle import listesi kullanılıyor (src/steps.ts).
    const files = Object.keys(import.meta.glob('../../src/data/steps/*.json'));
    const ids = files.map((file) => file.split('/').pop()!.replace('.json', ''));
    expect(STEPS.map((step) => step.id).sort()).toEqual(ids.sort());
  });

  it("proxy'nin dil listesi kapsam metniyle (uygulamanın Lang tipi) aynı", () => {
    expect(Object.keys(OUT_OF_SCOPE_RESPONSE).sort()).toEqual([...LANGS].sort());
  });
});

describe('matchSteps', () => {
  it.each([
    ['Which documents do I need for the Anmeldung?', 'anmeldung'],
    ['Sperrkonto için hangi belgeler gerekiyor?', 'sperrkonto'],
    ['Wie lange dauert der Rundfunkbeitrag?', 'rundfunkbeitrag'],
    ['How long does it take to get the Steuer-ID?', 'steuer-id'],
    ['Führerschein umschreiben: welche Unterlagen?', 'fuehrerschein-umschreibung'],
    ['SCHUFA raporu nereden randevu?', 'schufa'],
    ['Aufenthaltserlaubnis için hangi belgeler?', 'aufenthaltstitel'],
  ])('"%s" → %s', (question, id) => {
    expect(matchSteps(question)[0]?.id).toBe(id);
  });

  it('en fazla iki adım döner', () => {
    expect(matchSteps('Anmeldung Ummeldung Abmeldung Sperrkonto').length).toBeLessThanOrEqual(2);
  });

  it('ilgisiz soruda boş', () => {
    expect(matchSteps('What is the weather like tomorrow?')).toEqual([]);
  });
});

// 06.10: randevu katmanı (A4) modele gitmiyordu → model online kaydı "yapılamaz" dedi.
describe('stepForPrompt: randevu katmanı modele gider', () => {
  it('anmeldung: online kayıt notu, slot açılışı ve telefon istenen dilde', () => {
    const anmeldung = getStep('anmeldung')!;
    const tr = stepForPrompt(anmeldung, 'tr');
    expect(tr.appointment.note).toContain('randevusuz');
    expect(tr.appointment.slot_release).toBeTruthy();
    expect(tr.appointment.phone?.number).toBeTruthy();
    const en = JSON.stringify(stepForPrompt(anmeldung, 'en'));
    expect(en).toContain('without an appointment');
    expect(en).not.toContain('randevusuz');
  });
  it('sistem prompt’u appointment alanını adıyla anar', () => {
    expect(buildSystemPrompt([getStep('anmeldung')!], 'de')).toContain('appointment');
  });
});
