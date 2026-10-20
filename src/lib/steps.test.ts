import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getOrderedSteps,
  isStepUnlocked,
  getStepById,
  getPrerequisiteTitles,
  orderSteps,
  type Phase,
  type Step,
} from '@/lib/steps';

// Testlerde kullanılacak minimal sahte (fake) adım üretici. Şemadaki
// zorunlu alanları doldurur, sadece id/prerequisites/phase testten teste
// değişir. Varsayılan faz 'first_90_days': mevcut prerequisite-sıralama
// testlerinin çoğu tüm sahte adımları aynı fazda tutup yalnız topolojiyi
// ölçmek istiyor, phase'i sabit tutmak bunu bozmuyor.
function makeStep(id: string, prerequisites: string[] = [], phase: Phase = 'first_90_days'): Step {
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
    deadline_rule: null,
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isStepUnlocked', () => {
  it('prerequisites boş olan adım her zaman kilitsizdir', () => {
    const step = makeStep('a', []);
    expect(isStepUnlocked(step, new Set())).toBe(true);
  });

  it('tek önkoşulu tamamlanmış adım kilitsizdir', () => {
    const step = makeStep('b', ['a']);
    expect(isStepUnlocked(step, new Set(['a']))).toBe(true);
  });

  it('önkoşullardan biri eksikse adım kilitlidir', () => {
    const step = makeStep('c', ['a', 'b']);
    expect(isStepUnlocked(step, new Set(['a']))).toBe(false);
  });

  it('tamamlanmış sayılan bir önkoşul geri alınırsa adım tekrar kilitlenir', () => {
    const step = makeStep('d', ['a']);
    const completed = new Set(['a']);
    expect(isStepUnlocked(step, completed)).toBe(true);

    completed.delete('a');
    expect(isStepUnlocked(step, completed)).toBe(false);
  });

  it('var olmayan bir prerequisite id\'si varsa adım kilitli kalır (sessizce açılmaz)', () => {
    const step = makeStep('e', ['does-not-exist']);
    // Gerçek sistemde "does-not-exist" için hiçbir adım tamamlanamayacağı
    // için completedIds bu id'yi hiçbir zaman içermez - adım sonsuza dek
    // kilitli kalır, sessizce açılmaz.
    expect(isStepUnlocked(step, new Set())).toBe(false);
  });

  it('bilinmeyen prerequisite id\'si için __DEV__ altında console.warn basar', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const step = makeStep('f', ['does-not-exist']);
    isStepUnlocked(step, new Set());
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('bilinmeyen prerequisite'),
    );
  });
});

describe('getOrderedSteps (gerçek veri)', () => {
  it('her adım kendi önkoşullarından sonra gelir', () => {
    const ordered = getOrderedSteps();
    const indexById = new Map(ordered.map((step, index) => [step.id, index]));

    for (const step of ordered) {
      for (const dep of step.prerequisites) {
        const depIndex = indexById.get(dep);
        if (depIndex === undefined) continue; // bilinmeyen id, ayrı bir kaygı
        expect(depIndex).toBeLessThan(indexById.get(step.id)!);
      }
    }
  });

  it('dönen liste tüm adımları içerir ve tekrar eden adım yoktur', () => {
    const ordered = getOrderedSteps();
    const ids = ordered.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    // G4: ummeldung tek dosyaydı, ummeldung + abmeldung olarak ikiye ayrıldı.
    expect(ordered.length).toBe(17);
  });
});

describe('orderSteps (saf fonksiyon, sahte veri)', () => {
  it('boş dizi için boş dizi döner', () => {
    expect(orderSteps([])).toEqual([]);
  });

  it('tek adım için o adımı döner', () => {
    const a = makeStep('a');
    expect(orderSteps([a])).toEqual([a]);
  });

  it('doğrusal zinciri önkoşul sırasına göre dizer', () => {
    const a = makeStep('a');
    const b = makeStep('b', ['a']);
    const c = makeStep('c', ['b']);
    // Kasıtlı olarak ters sırada veriliyor - fonksiyon yine de doğru sıraya
    // koymalı.
    const ordered = orderSteps([c, b, a]);
    expect(ordered.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('kendine bağlı adımı (A->A) sonsuz döngüye girmeden işler', () => {
    const a = makeStep('a', ['a']);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ordered = orderSteps([a]);
    expect(ordered.map((s) => s.id)).toEqual(['a']);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('A->B->A döngüsünü sonsuz döngüye girmeden işler', () => {
    const a = makeStep('a', ['b']);
    const b = makeStep('b', ['a']);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ordered = orderSteps([a, b]);
    // Döngü kırılır, her iki adım da tam olarak bir kez sonuçta yer alır.
    expect(new Set(ordered.map((s) => s.id))).toEqual(new Set(['a', 'b']));
    expect(ordered.length).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('döngüsel bağımlılık'));
  });

  it('var olmayan bir id\'ye bağlı adımı sessizce görmezden gelmez, uyarır ama çökmez', () => {
    const a = makeStep('a', ['does-not-exist']);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ordered = orderSteps([a]);
    expect(ordered.map((s) => s.id)).toEqual(['a']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bilinmeyen prerequisite'));
  });

  it('faz, önkoşul topolojisinden ÖNCE gelir: sırada geç faz erken önkoşulu geçemez', () => {
    // b'nin önkoşulu yok ama fazı first_90_days; a'nın önkoşulu yok ve fazı
    // pre_arrival. Saf topolojik sıralama girdi sırasını korurdu (b, a) —
    // ama faz birincil anahtar olduğu için a önce gelmeli.
    const b = makeStep('b', [], 'first_90_days');
    const a = makeStep('a', [], 'pre_arrival');
    const ordered = orderSteps([b, a]);
    expect(ordered.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('aynı fazdaki adımlar arasında önkoşul topolojisi ve girdi sırası korunur', () => {
    const x = makeStep('x', [], 'first_weeks');
    const y = makeStep('y', ['x'], 'first_weeks');
    const z = makeStep('z', [], 'first_weeks');
    // z, y, x sırasıyla verildi: topolojik geçiş x'i y'den önce getirir, z
    // önkoşulsuz olduğu için girdi konumunda (en başta) kalır.
    const ordered = orderSteps([z, y, x]);
    expect(ordered.map((s) => s.id)).toEqual(['z', 'x', 'y']);
  });

  it('conditional bir önkoşula bağlı zorunlu-faz adımı bile doğru fazında kalır (sıralama denetimi validate-steps.mjs\'de)', () => {
    // orderSteps kendisi bu ilişkiyi HATA saymaz (o denetim
    // scripts/validate-steps.mjs'de) — burada yalnız sıralamanın faz'a göre
    // çalıştığı doğrulanıyor: conditional adım, prerequisites'inde geçse
    // bile first_weeks'ten sonra gelir.
    const cond = makeStep('cond', [], 'conditional');
    const fw = makeStep('fw', [], 'first_weeks');
    const ordered = orderSteps([cond, fw]);
    expect(ordered.map((s) => s.id)).toEqual(['fw', 'cond']);
  });
});

describe('getStepById', () => {
  it('var olan id için adımı döner', () => {
    const step = getStepById('anmeldung');
    expect(step).toBeDefined();
    expect(step?.id).toBe('anmeldung');
  });

  it('var olmayan id için undefined döner', () => {
    expect(getStepById('does-not-exist')).toBeUndefined();
  });
});

describe('getPrerequisiteTitles', () => {
  it('bilinen id için SEÇİLİ DİLDEKİ kısa adı döner (resmi Almanca adı değil)', () => {
    const step = getStepById('anmeldung');
    expect(step).toBeDefined();
    expect(getPrerequisiteTitles(['anmeldung'], 'en')).toEqual([step!.title.en]);
    expect(getPrerequisiteTitles(['anmeldung'], 'de')).toEqual([step!.title.de]);
  });

  it('bilinmeyen id için id\'nin kendisini döner', () => {
    expect(getPrerequisiteTitles(['does-not-exist'], 'en')).toEqual(['does-not-exist']);
  });

  it('boş dizi için boş dizi döner', () => {
    expect(getPrerequisiteTitles([], 'en')).toEqual([]);
  });
});

describe('randevu katmanı (gerçek veri, A4)', () => {
  // Yüz yüze işlem yapan makamlar: bu adımlar "randevu yok" diye
  // işaretlenemez — işaretlenirse kullanıcı randevu aramayı bırakır.
  const IN_PERSON_AUTHORITY = /Bürgerbüro|Servicestelle für Zuwanderung|Ausländerbehörde|Führerscheinstelle/;

  it('yüz yüze makam adımları no_appointment olamaz', () => {
    for (const step of getOrderedSteps()) {
      if (step.authority && IN_PERSON_AUTHORITY.test(step.authority.official)) {
        expect(step.appointment.mode, step.id).not.toBe('no_appointment');
      }
    }
  });

  it('randevu gerektiren adımda portal ya da telefon, randevusuz adımda gerekçe var', () => {
    for (const step of getOrderedSteps()) {
      if (step.appointment.mode === 'no_appointment') {
        expect(step.appointment.note, step.id).not.toBeNull();
      } else {
        expect(step.booking_url ?? step.appointment.phone, step.id).not.toBeNull();
      }
    }
  });
});
