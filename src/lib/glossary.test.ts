import { describe, expect, it } from 'vitest';

import {
  filterGlossary,
  foldForSearch,
  GLOSSARY,
  groupByLetter,
  type GlossaryEntry,
} from '@/lib/glossary';
import { LANGS } from '@/lib/language';

const entry = (term: string, tr: string, en = '', de = ''): GlossaryEntry => ({
  term,
  explanation: { tr, en, de },
});

describe('foldForSearch', () => {
  it('Almanca harfleri düz harfe katlar', () => {
    expect(foldForSearch('Wohnungsgeberbestätigung')).toBe('wohnungsgeberbestatigung');
    expect(foldForSearch('Führerschein-Umschreibung')).toBe('fuhrerschein-umschreibung');
    expect(foldForSearch('Ausländerbehörde')).toBe('auslanderbehorde');
  });

  it('ß ve büyük ẞ "ss" olur', () => {
    expect(foldForSearch('Straße')).toBe('strasse');
    expect(foldForSearch('STRAẞE')).toBe('strasse');
  });

  it('Türkçe harfleri düz harfe katlar; İ ve ı düz i olur', () => {
    expect(foldForSearch('İkamet')).toBe('ikamet');
    expect(foldForSearch('kaydı')).toBe('kaydi');
    expect(foldForSearch('ŞĞÇ şğç')).toBe('sgc sgc');
  });

  it('büyük/küçük harf duyarsız', () => {
    expect(foldForSearch('SCHUFA')).toBe(foldForSearch('schufa'));
  });
});

describe('filterGlossary', () => {
  const entries = [
    entry('Anmeldung', 'Adres kaydı işlemi.', 'Address registration.', 'Adresse anmelden.'),
    entry('Sperrkonto', 'Bloke banka hesabı.', 'Blocked bank account.', 'Gesperrtes Bankkonto.'),
    entry('Wohnungsgeberbestätigung', 'Ev sahibinin onayı.', 'Landlord confirmation.', 'Bestätigung vom Vermieter.'),
  ];

  it('boş ya da yalnız boşluk arama hepsini döner', () => {
    expect(filterGlossary(entries, '', 'tr')).toHaveLength(3);
    expect(filterGlossary(entries, '   ', 'tr')).toHaveLength(3);
  });

  it('terimin başından, aksan ve harf duyarsız arar', () => {
    expect(filterGlossary(entries, 'WOHNUNGSGEBERBESTATIGUNG', 'en').map((e) => e.term)).toEqual([
      'Wohnungsgeberbestätigung',
    ]);
    expect(filterGlossary(entries, 'sp', 'en').map((e) => e.term)).toEqual(['Sperrkonto']);
  });

  it('kelimenin ORTASINDAN eşleşmez (toplantı 20.10: "SS")', () => {
    const more = [...entries, entry('Niederlassungserlaubnis', 'Süresiz oturum izni.'), entry('Krankenkasse', 'Sağlık sigortası kurumu.')];
    expect(filterGlossary(more, 'ss', 'tr')).toEqual([]);
    expect(filterGlossary(more, 'bestatigung', 'en')).toEqual([]);
    expect(filterGlossary(more, 'kr', 'tr').map((e) => e.term)).toEqual(['Krankenkasse']);
  });

  it('terimdeki her kelimenin başından da eşleşir', () => {
    const more = [entry('Kreisverwaltungsreferat (KVR)', 'Şehrin idare dairesi.')];
    expect(filterGlossary(more, 'kvr', 'tr')).toHaveLength(1);
  });

  it('1–2 harfte açıklamaya bakmaz', () => {
    expect(filterGlossary(entries, 'ba', 'tr')).toEqual([]);
  });

  it('seçili dildeki açıklamada arar', () => {
    expect(filterGlossary(entries, 'banka', 'tr').map((e) => e.term)).toEqual(['Sperrkonto']);
    expect(filterGlossary(entries, 'kayd', 'tr').map((e) => e.term)).toEqual(['Anmeldung']);
  });

  it('başka dilin açıklamasında aramaz', () => {
    // "banka" yalnız TR açıklamada geçiyor; EN seçiliyken eşleşmemeli.
    expect(filterGlossary(entries, 'banka', 'en')).toEqual([]);
  });

  it('eşleşme yoksa boş liste', () => {
    expect(filterGlossary(entries, 'xyz', 'de')).toEqual([]);
  });
});

describe('groupByLetter', () => {
  it('Almanca alfabetik sıralar ve baş harfe göre gruplar', () => {
    const groups = groupByLetter([
      entry('Steuernummer', ''),
      entry('Abmeldung', ''),
      entry('Bürgerbüro', ''),
      entry('Anmeldung', ''),
      entry('SCHUFA', ''),
    ]);
    expect(groups.map((g) => g.letter)).toEqual(['A', 'B', 'S']);
    expect(groups[0].entries.map((e) => e.term)).toEqual(['Abmeldung', 'Anmeldung']);
    expect(groups[2].entries.map((e) => e.term)).toEqual(['SCHUFA', 'Steuernummer']);
  });

  it('Ä ile başlayan terim ayrı grup açmaz, A grubuna girer', () => {
    const groups = groupByLetter([entry('Ärztekammer', ''), entry('Anmeldung', ''), entry('Bürgerbüro', '')]);
    expect(groups.map((g) => g.letter)).toEqual(['A', 'B']);
    expect(groups[0].entries.map((e) => e.term)).toEqual(['Anmeldung', 'Ärztekammer']);
  });

  it('boş listede grup yok', () => {
    expect(groupByLetter([])).toEqual([]);
  });
});

describe('glossary.json', () => {
  it('her terimin açıklaması üç dilde de dolu', () => {
    expect(GLOSSARY.length).toBeGreaterThan(0);
    for (const item of GLOSSARY) {
      expect(item.term.trim().length).toBeGreaterThan(0);
      for (const lang of LANGS) {
        expect(item.explanation[lang]?.trim().length ?? 0, `${item.term} / ${lang}`).toBeGreaterThan(0);
      }
    }
  });

  it('terimler tekil', () => {
    const terms = GLOSSARY.map((item) => item.term);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('gerçek veride her terim tam bir gruba düşer', () => {
    const grouped = groupByLetter(GLOSSARY).flatMap((g) => g.entries);
    expect(grouped).toHaveLength(GLOSSARY.length);
  });
});
