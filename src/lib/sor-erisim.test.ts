/**
 * Sor ekranı erişim testi (S1, 13.10): gündelik dille yazılmış soruların
 * modele ULAŞIP ulaşmadığını ölçer. Deterministik: model çağrılmaz.
 *
 * Neden: B5'in 30 "gerçek" sorusu düzgün yazılmıştı ve 30/30 geçiyordu, ama
 * arkadaşların yazdığı türden sorularda 50'nin yalnız 10'u modele gidiyordu:
 * 30'u kapsam bekçisinin "şüphede reddet" varsayılanına, 9'u başlık-kelimesi
 * eşleştirmesine takılıyordu. Bu dosya o gerilemeyi kilitler:
 *   1. Her gündelik soru kapsam içi sayılır ve beklenen adımlardan birine eşleşir.
 *   2. B5'in 30 yasak sorusu AÇIK kurallarla kesilmeye devam eder (varsayılana
 *      dayanmaz); kapsam varsayılanı gevşetildiği için bu şart.
 *   3. B5'in 30 gerçek sorusu beklenen adıma eşleşmeye devam eder.
 *
 * Yeni bir gerçek kullanıcı sorusu gelince buraya eklenir.
 */
import { describe, expect, it } from 'vitest';

import { classifyQuestion } from '@/lib/scope';

import { DAILY, FORBIDDEN, KNOWN_OUT, REAL } from '../../proxy/eval/cases';
import { matchSteps } from '../../proxy/src/steps';

describe('gündelik sorular modele ulaşır', () => {
  it.each(DAILY.filter(([q]) => !KNOWN_OUT.includes(q)))('"%s"', (question, expected) => {
    expect(classifyQuestion(question).verdict).toBe('in_scope');
    const matched = matchSteps(question).map((step) => step.id);
    expect(matched.some((id) => expected.includes(id)), `eşleşen: ${matched.join(',') || '-'}`).toBe(true);
  });

  it('bilinçli kesilenler açık kuralla kesilir', () => {
    for (const question of KNOWN_OUT) {
      const result = classifyQuestion(question);
      expect(result.verdict).toBe('out_of_scope');
      expect(result.reason).not.toMatch(/^no_rule/);
    }
  });
});

describe('B5 setleri korunur', () => {
  it.each(FORBIDDEN.map((c) => [c.id, c.q] as const))('%s yasak soru açık kuralla kesilir', (_id, question) => {
    const result = classifyQuestion(question);
    expect(result.verdict).toBe('out_of_scope');
    expect(result.reason).not.toMatch(/^no_rule/);
  });

  it.each(REAL.map((c) => [c.id, c.q, c.step] as const))('%s gerçek soru beklenen adıma eşleşir', (_id, question, expected) => {
    expect(classifyQuestion(question).verdict).toBe('in_scope');
    const matched = matchSteps(question).map((step) => step.id);
    expect(matched.some((id) => expected.includes(id)), `eşleşen: ${matched.join(',') || '-'}`).toBe(true);
  });
});

// S1 canlı testi (13.10): kişiye özel uygunluk/sonuç soruları modele ulaşıp kişinin
// durumunu değerlendiriyordu. Bunlar açık kuralla kesilir; genel "yeterli mi" soruları değil.
describe('kişiye özel uygunluk soruları kesilir', () => {
  it.each([
    'Notlarım kötü, oturum izni uzatmam kabul edilir mi?',
    'My Sperrkonto only has 9000 euro, is that enough for me?',
    'Ich arbeite 25 Stunden pro Woche als Werkstudent, ist das für mich okay?',
    'BAföG almıyorum, Rundfunkbeitrag muafiyeti bana uygulanır mı?',
  ])('"%s"', (question) => {
    const result = classifyQuestion(question);
    expect(result.verdict).toBe('out_of_scope');
    expect(result.reason).toBe('personal_eligibility_check');
  });

  it('genel "yeterli mi" sorusu kapsam içi kalır', () => {
    expect(classifyQuestion('hat almak için pasaport yeterli mi').verdict).toBe('in_scope');
  });
});

// Toplantı 20.10 (marka + kullanılabilirlik testi): sayfada yazan bilgiyi soran
// sorular kesiliyor ya da eşleşmiyordu.
describe('toplantı 20.10: sayfada yazan sorular modele ulaşır', () => {
  it.each([
    ['Should I bring my passport to the Anmeldung appointment?', ['anmeldung']],
    ['Should I bring my passport to the unmeldung appointment?', ['anmeldung', 'ummeldung']],
    ['Anmeldung randevusuna pasaportumu götürmeli miyim?', ['anmeldung']],
    ['Soll ich zur Anmeldung meinen Reisepass mitbringen?', ['anmeldung']],
    ['How much is a SIM card?', ['sim-karte']],
    ['What do I need for registering my address?', ['anmeldung']],
  ])('"%s"', (question, expected) => {
    expect(classifyQuestion(question).verdict).toBe('in_scope');
    const matched = matchSteps(question).map((step) => step.id);
    expect(matched.some((id) => expected.includes(id)), `eşleşen: ${matched.join(',') || '-'}`).toBe(true);
  });

  it('getirme fiili, gerçek hukuki soruyu içeri almaz', () => {
    // "should i" + başka bir kapsam dışı kalıp: yine kesilir.
    expect(classifyQuestion('Should I bring a lawyer and contest it?').verdict).toBe('out_of_scope');
    expect(classifyQuestion('Should I appeal the rejection?').verdict).toBe('out_of_scope');
    expect(classifyQuestion('Sollte ich klagen?').verdict).toBe('out_of_scope');
  });
});
