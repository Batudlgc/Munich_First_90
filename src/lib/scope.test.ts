import { describe, expect, it } from 'vitest';

import { classifyQuestion, type ScopeVerdict } from './scope';

/**
 * Bu vakalar docs/research/rdg-yasak-sorular.md ile BİREBİR aynıdır.
 * Tek kaynak burada tutuluyor (dizi sabiti); markdown dosyası bunun
 * insan-okunur, gerekçeli açıklamasıdır — iki yerde ayrı ayrı yazılmadı.
 */
const TEST_CASES: { question: string; expected: ScopeVerdict }[] = [
  // --- Kapsam DIŞI (out_of_scope) — 26 vaka ---
  { question: 'Oturum izni başvurum reddedilirse ne yaparım?', expected: 'out_of_scope' },
  {
    question: 'Hangi vizeye başvurmalıyım, öğrenci vizesi mi yoksa dil kursu vizesi mi?',
    expected: 'out_of_scope',
  },
  { question: 'Kira sözleşmemi yorumlar mısın, feshedebilir miyim?', expected: 'out_of_scope' },
  { question: 'Rundfunkbeitrag cezasını ödemesem ne olur?', expected: 'out_of_scope' },
  {
    question: 'Wird mein Aufenthaltstitel verlängert, wenn ich das Studium wechsle?',
    expected: 'out_of_scope',
  },
  { question: "Aufenthaltstitel'im uzatılır mı?", expected: 'out_of_scope' },
  {
    question: 'Muss ich eine Steuererklärung machen und wie fülle ich sie aus?',
    expected: 'out_of_scope',
  },
  { question: 'Do I need to file a tax return as a working student?', expected: 'out_of_scope' },
  {
    question: 'Can you review my employment contract and tell me if this clause is legal?',
    expected: 'out_of_scope',
  },
  { question: 'İş sözleşmemdeki deneme süresi maddesi geçerli mi?', expected: 'out_of_scope' },
  {
    question: 'My landlord wants to terminate my lease, can they legally do that?',
    expected: 'out_of_scope',
  },
  { question: 'Wie kann ich gegen die Kündigung meiner Wohnung vorgehen?', expected: 'out_of_scope' },
  { question: 'Kann ich gegen den Steuerbescheid Einspruch einlegen?', expected: 'out_of_scope' },
  { question: 'İşyerimden gelen ihtarnameye nasıl cevap vermeliyim?', expected: 'out_of_scope' },
  {
    question: 'What happens if I get deported for missing the Anmeldung deadline?',
    expected: 'out_of_scope',
  },
  { question: 'Sınır dışı edilme riskim var mı, oturma izni süresi geçti?', expected: 'out_of_scope' },
  {
    question: 'Kann ich meine Frau im Rahmen der Familienzusammenführung nachholen?',
    expected: 'out_of_scope',
  },
  { question: 'Evlenirsem oturum iznim otomatik uzar mı?', expected: 'out_of_scope' },
  { question: 'Kredi kartı borcumu ödeyemezsem icra gelir mi?', expected: 'out_of_scope' },
  { question: 'Ich habe einen Mahnbescheid bekommen, muss ich zahlen?', expected: 'out_of_scope' },
  { question: 'I had a bike accident last week, am I liable for the damage?', expected: 'out_of_scope' },
  {
    question: 'Wer haftet, wenn ich mit dem Auto einen Unfall verursacht habe?',
    expected: 'out_of_scope',
  },
  { question: 'Should I appeal the rejection of my Aufenthaltstitel application?', expected: 'out_of_scope' },
  { question: 'Welches Visum passt am besten zu meiner Situation?', expected: 'out_of_scope' },
  {
    question:
      'Ev sahibimin beni haksız yere tahliye etmeye çalıştığını düşünüyorum, ne yapmalıyım?',
    expected: 'out_of_scope',
  },
  { question: 'Bu durumda dava açmalı mıyım?', expected: 'out_of_scope' },

  // --- Kapsam İÇİ (in_scope) — 12 vaka ---
  { question: 'Anmeldung için hangi belgeler gerekir?', expected: 'in_scope' },
  { question: 'Wie viel kostet der Rundfunkbeitrag im Monat?', expected: 'in_scope' },
  { question: 'How long does it take to receive the Steuer-ID?', expected: 'in_scope' },
  { question: 'Ummeldung için son tarih nedir?', expected: 'in_scope' },
  { question: 'Wo bekomme ich einen Termin für die Anmeldung?', expected: 'in_scope' },
  { question: 'Which documents do I need to open a bank account?', expected: 'in_scope' },
  { question: 'Krankenkasse için hangi kurum sorumlu?', expected: 'in_scope' },
  { question: 'Welche Unterlagen brauche ich für die Immatrikulation?', expected: 'in_scope' },
  { question: 'Where do I register my address in Munich?', expected: 'in_scope' },
  { question: 'SIM kart almak için ne gerekiyor?', expected: 'in_scope' },
  {
    question: 'Wie lange dauert die Bearbeitung des Aufenthaltstitels normalerweise?',
    expected: 'in_scope',
  },
  { question: 'Sperrkonto için asgari tutar ne kadar?', expected: 'in_scope' },
];

describe('classifyQuestion', () => {
  it.each(TEST_CASES)('"$question" -> $expected', ({ question, expected }) => {
    const result = classifyQuestion(question);
    expect(result.verdict).toBe(expected);
  });

  it('kapsam dışı sonuçta hangi kuralın tetiklendiğini (reason) belirtir', () => {
    const result = classifyQuestion('Hangi vizeye başvurmalıyım?');
    expect(result.verdict).toBe('out_of_scope');
    expect(result.reason).toBeTruthy();
    expect(result.matched.length).toBeGreaterThan(0);
  });

  it('hiçbir kural eşleşmezse kapsam içi sayar (S1, 13.10); adım eşleşmesi proxy\'de', () => {
    const result = classifyQuestion('asdkjaslkdj qwoieuqwoe zzz');
    expect(result.verdict).toBe('in_scope');
    expect(result.reason).toBe('no_rule_matched_default_in_scope');
  });
});

// Lansman (06.10): bekçi B5'in 30 sorusuna göre ayarlanmıştı ve doğal prosedürel
// soruların yarıya yakınını reddediyordu. Bu vakalar o gerilemeyi kilitler.
describe('lansman: mümkün mü / gerekli mi soruları', () => {
  const inScope = [
    'Anmeldung online yapılabilir mi?',
    "Anmeldung'u online yapabilir miyim?",
    'Can I do the Anmeldung online?',
    'Kann man die Anmeldung online machen?',
    'Rundfunkbeitrag ödemek zorunda mıyım?',
    'Bankkonto açmak için Anmeldung şart mı?',
    'SIM kart almak için pasaport lazım mı?',
    'Is a Haftpflicht mandatory?',
    'Do I need a Steuer-ID to work?',
    'Brauche ich eine Haftpflichtversicherung?',
    'Anmeldung randevusu bulamıyorum',
    'Ich finde keinen Termin für die Anmeldung',
  ];
  const outOfScope = [
    'Oturum iznim reddedildi, ne yapabilirim?',
    'My residence permit was rejected, can I do something?',
    'Mein Antrag wurde abgelehnt, kann man da was machen?',
    'Can I sue my landlord for the deposit?',
    'Visa expired last week, do I need to leave Germany?',
    'Mein Visum ist abgelaufen, muss man ausreisen?',
    'Brauche ich einen Anwalt für meinen Aufenthaltstitel?',
  ];
  it.each(inScope)('kapsam içi: %s', (q) => {
    expect(classifyQuestion(q).verdict).toBe('in_scope');
  });
  it.each(outOfScope)('kapsam dışı: %s', (q) => {
    expect(classifyQuestion(q).verdict).toBe('out_of_scope');
  });
});
