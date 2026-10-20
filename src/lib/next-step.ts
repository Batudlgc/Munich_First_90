import { PHASE_ORDER, isStepUnlocked, type Step } from '@/lib/steps';

/**
 * Ana ekrandaki "Sıradaki adım" kutusunun seçimi: önkoşulları açık,
 * tamamlanmamış, son tarihi en yakın zorunlu adım.
 *
 * Saf fonksiyon — gerçek adım verisine değil, verilen diziye bakar; bu yüzden
 * testlerde sahte adım dizileriyle çağrılabilir. Ekran ona
 * `getOrderedSteps()` çıktısını (zaman çizgisi sırası) verir.
 *
 * Adaylar: `conditional` OLMAYAN (herkese gerekmeyen bir adım "sıradaki"
 * olarak önerilirse ihtiyacı olmayan biri onu yapması gerektiğini sanar),
 * kilidi açık ve tamamlanmamış adımlar.
 *
 * Sıralama, dört kademe:
 * 0. Varış sinyali (Batu, 06.10.2026): `first_weeks` fazından HERHANGİ bir
 *    adım tamamlandıysa kullanıcı Münih'te demektir; açık `pre_arrival`
 *    adımları sıralamada SONA düşer (gizlenmez, zaman çizgisinde durur).
 *    ÖNCE: Anmeldung damgalanınca kutu "Bloke hesap açma"ya geri dönüyordu
 *    (critique 2026-10).
 * 1. `deadline_rule.days` küçükten büyüğe. Sayısı olmayan adım (null ya da
 *    hiç kural yok) en sona — son tarihi olmayan bir iş, olan bir işin önüne
 *    geçmesin. NOT: `days` adımdan adıma aynı anlamda değil (Semesterticket'ta
 *    10 = "ayın 10'u"); burada yalnız "acele ölçüsü" olarak sıralamaya girer,
 *    ekranda gün sayısı olarak gösterilmez (bkz. format.ts firstSentence).
 * 2. Eşitlikte faz sırası (PHASE_ORDER): erken fazdaki adım önce.
 * 3. Eşitlikte verilen dizideki sıra — zaman çizgisinde üstte duran önce.
 *
 * Aday yoksa (zorunlu adımların hepsi tamam ya da kalanların hepsi kilitli)
 * `null` döner; ekran o zaman "hepsi damgalandı" durumunu gösterir.
 */
export function getNextStep(steps: Step[], completedIds: ReadonlySet<string>): Step | null {
  const candidates = steps
    .map((step, index) => ({ step, index }))
    .filter(
      ({ step }) =>
        step.phase !== 'conditional' && !completedIds.has(step.id) && isStepUnlocked(step, completedIds)
    );

  const arrived = steps.some((step) => step.phase === 'first_weeks' && completedIds.has(step.id));
  const late = (step: Step) => (arrived && step.phase === 'pre_arrival' ? 1 : 0);

  candidates.sort(
    (a, b) =>
      late(a.step) - late(b.step) ||
      urgency(a.step) - urgency(b.step) ||
      PHASE_ORDER[a.step.phase] - PHASE_ORDER[b.step.phase] ||
      a.index - b.index
  );

  return candidates[0]?.step ?? null;
}

/**
 * Son tarihsiz adımın "acele ölçüsü": Infinity yerine en büyük güvenli tam
 * sayı. Infinity - Infinity = NaN verir; karşılaştırıcıdaki `||` zinciri NaN'ı
 * da bir sonraki kademeye düşürür ama bu tesadüfe dayanırdı. Böyle iki
 * son tarihsiz adımın farkı açıkça 0.
 */
function urgency(step: Step): number {
  return step.deadline_rule?.days ?? Number.MAX_SAFE_INTEGER;
}
