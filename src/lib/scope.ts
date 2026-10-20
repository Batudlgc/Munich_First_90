/**
 * RDG kapsam kontrolü — "Sor" ekranı henüz yok, model henüz yok, ama bu
 * dosya ondan bağımsız çalışır (bkz. docs/research/sor-sekmesi-mimari.md
 * madde 5 ve CLAUDE.md "Hukuki kısıt (RDG)").
 *
 * Almanya'da RDG (Rechtsdienstleistungsgesetz), hukuk mesleği dışındakilerin
 * somut bir bireysel olaya hukuki değerlendirme yapmasını yasaklar. Bu
 * modülün tek işi: gelen soru metnini "prosedürel" (kapsam içi) mi yoksa
 * "bireysel hukuki değerlendirme isteyen" (kapsam dışı) mi diye ayırmak.
 *
 * Yöntem BİLİNÇLİ OLARAK basit: LLM yok, deterministik anahtar-ifade
 * eşleştirmesi. Kurallar veri olarak (isimlendirilmiş sabit listeler)
 * duruyor, tek bir dev regex'e sıkıştırılmadı — hem okunabilir hem de
 * yeni bir ifade eklemek tek satır.
 *
 * GÜVENLİK YÖNÜ (önemli): yanlış pozitif (kapsam içi bir soruyu yanlışlıkla
 * kapsam dışı saymak) yanlış negatiften (kapsam dışı bir soruyu içeri
 * almak) çok daha az tehlikelidir. Bu yüzden:
 *   1. Önce kapsam-dışı kuralları kontrol edilir; biri eşleşirse hemen
 *      kapsam dışı döner (kapsam-içi kelime de geçse fark etmez).
 *   2. Sonra kapsam-içi kuralları kontrol edilir.
 *   3. Hiçbir kural eşleşmezse soru kapsam İÇİ sayılır ve proxy'ye gider.
 *      Orada iki kat daha var: soru hiçbir adımla eşleşmezse model çağrılmaz
 *      (no_match), eşleşirse model yalnız adım verisini yeniden ifade eder ve
 *      sistem prompt'u bireysel değerlendirmeyi yasaklar.
 *
 * 13.10 DEĞİŞİKLİĞİ (S1): önceden 3. madde "şüphede kapsam dışı"ydı. Ölçüm:
 * gündelik dille yazılmış 50 prosedürel sorunun 30'u bu varsayılan yüzünden
 * reddediliyor ve kullanıcı "bireysel hukuki değerlendirme" mesajı görüyordu
 * ("anmeldung için ne lazım", "steuer id gelmedi"). B5'in 30 yasak sorusunun
 * 30'u açık kurallarla (1. madde) kesiliyor; hiçbiri varsayılana dayanmıyordu.
 * Kilit: src/lib/sor-erisim.test.ts ve proxy/eval/cases.ts.
 */

import type { Lang } from '@/lib/language';

export type ScopeVerdict = 'in_scope' | 'out_of_scope';

export type ScopeResult = {
  verdict: ScopeVerdict;
  /** Hangi kuralın tetiklendiğini açıklar — geliştirici içindir, kullanıcıya gösterilmez. */
  reason: string;
  /** Eşleşen anahtar ifade(ler). Kural hiç eşleşmediyse boş dizi. */
  matched: string[];
};

/**
 * Kapsam DIŞI kural grubu. Her grup, RDG'nin yasakladığı bir "bireysel
 * hukuki değerlendirme" türünü temsil eder (bkz. CLAUDE.md). Anahtar
 * ifadeler TR/EN/DE karışık; kullanıcı kitlesi üçünü de kullanıyor.
 */
const OUT_OF_SCOPE_RULES: { id: string; keywords: string[] }[] = [
  {
    // "benim durumumda ne yapmalıyım" tarzı genel bireysel değerlendirme isteği
    id: 'personal_case_assessment',
    keywords: [
      'benim durumumda',
      'bu durumda',
      'in my case',
      'in my situation',
      'meiner situation',
      'meinem fall',
      'ne yapmalıyım',
      'was soll ich tun',
      'should i do',
    ],
  },
  {
    // ret sonrası itiraz/dava tavsiyesi — prosedürel süreç değil, hukuki yol seçimi
    id: 'rejection_appeal_legal_action',
    keywords: [
      'reddedilirse',
      'reddedilirsem',
      'if i get rejected',
      'if rejected',
      'wenn ich abgelehnt werde',
      'itiraz',
      'einspruch',
      'widerspruch',
      'should i appeal',
      'dava aç',
      'dava açmalı',
    ],
  },
  {
    // hangi vize/izin türünün kişiye uygun olduğu — başvuru stratejisi tavsiyesi
    id: 'visa_type_choice',
    keywords: ['hangi vizeye', 'which visa', 'welches visum', 'vize türü', 'visa type'],
  },
  {
    // kişinin kendi sözleşmesinin (kira/iş) yorumlanması, geçerlilik değerlendirmesi
    id: 'contract_interpretation',
    keywords: [
      'kira sözleşmemi',
      'iş sözleşmemdeki',
      'my employment contract',
      'my rental contract',
      'terminate my lease',
      'meinen mietvertrag',
      'meinen arbeitsvertrag',
    ],
  },
  {
    // Kündigung / fesih işlemine karşı hukuki yol
    id: 'termination_dispute',
    keywords: [
      'gegen die kündigung',
      'kündigung anfechten',
      'kündigung widersprechen',
      "kündigung'a itiraz",
      'fesih işlemine itiraz',
    ],
  },
  {
    // ceza/ihtarname sonrası kişisel sonuç ("ödemesem ne olur")
    id: 'fine_or_notice_consequence',
    keywords: [
      'cezasını ödemesem',
      'cezayı ödemesem',
      "if i don't pay the fine",
      'bußgeld nicht',
      'ihtarnameye nasıl',
      'ihtarname',
    ],
  },
  {
    // oturum izninin BİREYSEL olarak uzayıp uzamayacağı tahmini (CLAUDE.md: bu kısım kapsam dışı)
    id: 'residence_permit_personal_outcome',
    keywords: [
      'wird mein aufenthaltstitel verlängert',
      "aufenthaltstitel'im uzatılır",
      'aufenthaltstitel uzatılır mı',
      'will my residence permit be extended',
    ],
  },
  {
    // vergi beyannamesi — CLAUDE.md'de açıkça kapsam dışı
    id: 'tax_return',
    keywords: ['vergi beyannamesi', 'steuererklärung', 'tax return', 'einkommensteuererklärung'],
  },
  {
    // sınır dışı edilme riski/süreci — bireysel göçmenlik hukuku
    id: 'deportation',
    keywords: ['sınır dışı', 'deportation', 'abschiebung', 'deported'],
  },
  {
    // evlilik/aile birleşimi üzerinden bireysel oturum hakkı değerlendirmesi
    id: 'marriage_or_family_reunification_personal',
    keywords: [
      'familienzusammenführung',
      'aile birleşimi',
      'eşimi getirebilir',
      'evlenirsem oturum',
      'otomatik uzar mı',
    ],
  },
  {
    // borç / icra / ödeme emri — bireysel mali-hukuki sonuç
    id: 'debt_enforcement',
    keywords: ['icra', 'mahnbescheid', 'zwangsvollstreckung', 'haciz'],
  },
  {
    // kaza sonrası kusur/sorumluluk değerlendirmesi
    id: 'accident_liability',
    keywords: ['kaza sorumluluğu', 'am i liable', 'wer haftet', 'kimin kusuru'],
  },
  {
    // ev sahibiyle bireysel uyuşmazlık, ne yapması gerektiği tavsiyesi
    id: 'landlord_dispute_personal',
    keywords: ['haksız yere tahliye', 'ev sahibimin beni'],
  },
  {
    // B5: kişinin kendi durumu için hak/risk/sonuç/şans değerlendirmesi isteyen genel kalıplar
    id: 'personal_rights_risk_outcome',
    keywords: [
      // TR
      'hakkım var', 'hakkım yok', 'ceza kesilir', 'riske atar', 'edebilir miyim', 'yaparsam', 'çıkarsam',
      'sorun yaşar', 'yaşar mıyım', 'reddedilir', 'tazminat öder', 'malı mıyım', 'meli miyim', 'ne olur',
      'yasal olarak', 'yasal mı', 'şansım',
      // EN
      'am i allowed', 'legally', 'my chances', 'should i', 'is my landlord', 'can the ausländerbehörde',
      'is it safe for my', 'smarter choice', 'contest it', 'right to a', 'do i have a right', 'refuse to pay',
      'will i get', 'will i lose', 'could i be',
      // DE
      'darf mein vermieter', 'kann ich gegen', 'klagen', 'verliere ich', 'lohnt es sich', 'ist es für mein',
      'soll ich', 'sollte ich', 'muss ich mit', 'rechnen', 'recht auf', 'welche rechte', 'ablehnung',
    ],
  },
  {
    // S1 canlı testi (13.10): kapsam varsayılanı gevşeyince "bu benim için yeterli mi /
    // kabul edilir mi / bana uygulanır mı" soruları modele ulaştı ve model kişinin
    // durumunu değerlendirdi ("notların kötü olması reddedilmene yol açmaz"). Kişiye
    // özel uygunluk / sonuç sorusu: kural metni herkes için aynı, karar makamın.
    id: 'personal_eligibility_check',
    keywords: [
      // TR
      'kabul edilir mi', 'onaylanır mı', 'uygulanır mı', 'bana uyar mı', 'benim için yeterli',
      'benim durumum', 'acil sayılır mı', 'sayılır mıyım', 'uygun muyum',
      // EN
      'enough for me', 'okay for me', 'ok for me', 'apply to me', 'applies to me', 'am i eligible',
      'do i qualify', 'will it be accepted', 'will it be approved', 'be approved',
      // DE
      'für mich okay', 'für mich ok', 'reicht das für mich', 'gilt das für mich', 'bin ich berechtigt',
      'wird mein antrag',
    ],
  },
  {
    // Lansman (06.10): ret almış ya da dava düşünen kişinin sorusu — "ne yapabilirim"/"can I"
    // gibi kapsam-içi kalıplar bunları içeri almasın diye kapsam-içi kurallardan ÖNCE elenir.
    id: 'rejection_or_lawsuit_signal',
    keywords: [
      'reddedildi', 'red aldım', 'red geldi', 'abgelehnt', 'was rejected', 'got rejected', 'been rejected',
      'denied', 'sue ', 'lawsuit', 'verklagen', 'anwalt',
      // süresi dolmuş izin/vize + "kalabilir miyim / gitmeli miyim" — bireysel Ausländerrecht
      'expired', 'abgelaufen', 'süresi doldu', 'süresi geçti', 'vizem bitti', 'iznim bitti',
      'leave germany', 'overstay', 'illegal', 'kaçak',
    ],
  },
  {
    // B5: modeli rol yapmaya / talimatı yok saymaya iten istekler (prompt enjeksiyonu)
    id: 'role_play_or_instruction_override',
    keywords: [
      'ignore your previous', 'ignore all previous', 'ignore the previous', 'personal opinion', 'as my lawyer',
      'act as', 'pretend', 'ignoriere', 'tu so, als', 'als wärst du', 'mein anwalt',
      'önceki talimat', 'talimatları', 'sen artık', 'avukat',
    ],
  },
];

/**
 * Kapsam İÇİ kural grubu. Bunlar saf prosedürel sorular: hangi belge,
 * ne kadar süre, ne kadar ücret, nereden randevu, hangi kurum. Kişiye
 * özel değerlendirme İÇERMEYEN, herkes için aynı cevabı olan sorular.
 */
const IN_SCOPE_RULES: { id: string; keywords: string[] }[] = [
  {
    id: 'documents_needed',
    keywords: ['hangi belgeler', 'which documents', 'welche unterlagen', 'ne gerekiyor'],
  },
  {
    id: 'cost_or_fee',
    keywords: ['wie viel kostet', 'ne kadar'],
  },
  {
    id: 'duration_or_processing_time',
    keywords: ['how long does it take', 'wie lange dauert', 'ne kadar sürede'],
  },
  {
    id: 'deadline_or_legal_period',
    keywords: ['son tarih', 'deadline', 'frist'],
  },
  {
    id: 'appointment_booking',
    keywords: ['wo bekomme ich einen termin', 'nereden randevu', 'where do i register', 'randevu nasıl'],
  },
  {
    id: 'responsible_authority',
    keywords: ['hangi kurum', 'which office', 'welches amt', 'kim sorumlu'],
  },
  {
    // B5: herkes için aynı cevabı olan genel bilgi soru kalıpları (belge, süre, yer, kurum, tanım).
    // Bireysel işaretler yukarıdaki kurallarda önce elenir; burası yalnız onlardan sonra çalışır.
    id: 'general_information_question',
    keywords: [
      // EN
      'what do i need', 'what documents', 'what is a ', 'what is the', 'what does', 'what counts', 'how long',
      'how many days', 'how much', 'how does', 'how do i', 'when do i have to', 'who is', 'which office',
      'where do i', 'where can i', 'cutoff', "why can't i",
      // DE
      'welche dokumente', 'welche frist', 'wie lange', 'was kostet', 'bis wann muss', 'wo muss', 'wer ist',
      'was ist', 'wie viele', 'reicht eine', 'zählt ', 'wann muss',
      // TR
      'hangi belge', 'kaç gün', 'kaç ay', 'nereden', 'nereye', 'nedir', 'ne zaman', 'gerekir mi', 'zorunlu mu',
      'nasıl yapılıyor', 'nasıl alınır', 'nasıl yapılır', 'ne yapılır', 'ayrı mı', 'sipariş veriyorum',
    ],
  },
  {
    // Lansman (06.10): bir işlemin MÜMKÜN olup olmadığını ya da bir şeyin GEREKİP gerekmediğini
    // soran genel kalıplar ("online yapılabilir mi", "pasaport lazım mı", "do I need", "kann man").
    // Cevap herkes için aynıdır ve adım içeriğinde durur. 06.10 ölçümü: bu kalıplar olmadan
    // 20 doğal prosedürel sorunun 9'u yanlışlıkla reddediliyordu.
    id: 'procedural_possibility_or_requirement',
    keywords: [
      // TR
      'yapılabilir mi', 'yapabilir miyim', 'yapılır mı', 'alınabilir mi', 'alabilir miyim',
      'açabilir miyim', 'lazım mı', 'şart mı', 'gerekli mi', 'gerekiyor mu', 'mümkün mü',
      'zorunda mıyım', 'randevu bulam', 'randevusu bulam', 'ne işe yarar',
      // EN
      'is it possible to', 'can i do', 'can i register', 'can i apply', 'can i book', 'can i open',
      'can i get', 'do i need', 'do i have to', 'mandatory', 'required', "can't find an appointment",
      'no appointment',
      // DE
      'kann man', 'muss man', 'brauche ich', 'braucht man', 'pflicht', 'notwendig', 'erforderlich',
      'keinen termin', 'termin finden',
    ],
  },
];

/**
 * Soru metnini karşılaştırma için sadeleştirir: küçük harfe çevirir ve
 * Türkçe büyük İ/I harflerinin JS'in varsayılan (Türkçe olmayan)
 * toLowerCase()'de bozulmasını (İ -> "i̇" birleşik karakter) önler.
 * Önce İ/I'yı düzeltip SONRA 'tr-TR' locale'iyle küçültüyoruz ki
 * "ı/i/ş/ğ/ö/ü/ç" doğru eşleşsin.
 */
function normalize(question: string): string {
  return question.replace(/İ/g, 'i').replace(/I/g, 'i').toLocaleLowerCase('tr-TR');
}

/**
 * "Yanıma ne götürmeliyim?" türü sorular (toplantı 20.10): "should I bring my
 * passport to the Anmeldung appointment?" genel kalıp "should i" yüzünden
 * hukuki değerlendirme sayılıp kesiliyordu; oysa soru adım sayfasında yazan
 * "Yanına al" listesini soruyor. Yalnız modal kalıp ("should i", "meli miyim",
 * "soll ich"…) + GETİRME/GÖTÜRME fiili birlikteyse ve başka hiçbir kapsam dışı
 * kural tetiklenmiyorsa soru belge sorusu sayılır.
 */
const MODAL_ONLY = new Set(['should i', 'meli miyim', 'malı mıyım', 'soll ich', 'sollte ich']);
const BRING_VERBS = [
  'bring', 'take with', 'take my', 'carry', 'have with me', 'prepare',
  'götür', 'getir', 'yanıma al', 'yanımda', 'hazırla', 'götürmeli', 'getirmeli',
  'mitbring', 'mitnehm', 'dabei', 'vorbereiten',
];

export function classifyQuestion(question: string): ScopeResult {
  const normalized = normalize(question);

  const outHits = OUT_OF_SCOPE_RULES.map((rule) => ({
    rule,
    matched: rule.keywords.filter((keyword) => normalized.includes(keyword)),
  })).filter((hit) => hit.matched.length > 0);

  const onlyModal =
    outHits.length === 1 &&
    outHits[0].rule.id === 'personal_rights_risk_outcome' &&
    outHits[0].matched.every((keyword) => MODAL_ONLY.has(keyword));
  if (onlyModal && BRING_VERBS.some((verb) => normalized.includes(verb))) {
    return { verdict: 'in_scope', reason: 'documents_to_bring', matched: outHits[0].matched };
  }

  if (outHits.length > 0) {
    return { verdict: 'out_of_scope', reason: outHits[0].rule.id, matched: outHits[0].matched };
  }

  for (const rule of IN_SCOPE_RULES) {
    const matched = rule.keywords.filter((keyword) => normalized.includes(keyword));
    if (matched.length > 0) {
      return { verdict: 'in_scope', reason: rule.id, matched };
    }
  }

  // Hiçbir kural tetiklenmedi: bilinen bir "bireysel hukuki değerlendirme"
  // kalıbı yok. Soru proxy'ye gider; adım eşleşmezse orada no_match döner ve
  // kullanıcı "adımın adını geçir" ipucunu görür, hukuki ret mesajını değil.
  return { verdict: 'in_scope', reason: 'no_rule_matched_default_in_scope', matched: [] };
}

/**
 * Kapsam dışı bulunan bir soruya gösterilecek sabit metin. Kullanıcıyı
 * suçlamaz, "şunu yapmalısın" demez; resmî mercie veya hukuki danışmanlığa
 * nötr biçimde yönlendirir. Uygulamanın üç arayüz diliyle (src/lib/language.tsx
 * içindeki `Lang`) aynı anahtarları taşır — bu yüzden yeni bir dil eklendiğinde
 * bu metnin eksik kalması derleme zamanında görünür.
 */
export const OUT_OF_SCOPE_RESPONSE: Record<Lang, string> = {
  en: 'This question asks for an individual legal assessment, which this app cannot provide. For guidance on your specific situation, please contact the responsible authority directly or a qualified legal advisor (for example a Rechtsanwalt, or a recognized counseling service such as the Studierendenwerk or a Migrationsberatung).',
  tr: 'Bu soru bireysel bir hukuki değerlendirme gerektiriyor; uygulama bunu yapamaz. Kişiye özel durum için yetkili makama ya da yetkin bir hukuki danışma yerine başvurulabilir (örneğin bir Rechtsanwalt veya Studierendenwerk, Migrationsberatung gibi tanınmış bir danışma merkezi).',
  de: 'Diese Frage verlangt eine individuelle rechtliche Einschätzung, die diese App nicht leisten kann. Für eine Auskunft zu deiner Situation wende dich bitte direkt an die zuständige Behörde oder an eine qualifizierte rechtliche Beratungsstelle (zum Beispiel einen Rechtsanwalt oder eine anerkannte Beratungsstelle wie das Studierendenwerk oder eine Migrationsberatung).',
} as const;
