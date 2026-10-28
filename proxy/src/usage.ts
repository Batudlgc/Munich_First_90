import { DurableObject } from 'cloudflare:workers';

import type { Channel } from '../../src/lib/channels';

import type { Env } from './index';
import { HEAVY_CALLER_BUDGET_SHARE, HEAVY_CALLER_QUESTIONS } from './limits';

/**
 * Kullanım sayacı — tek (global) bir Durable Object, SQLite depolamalı.
 *
 * Neden Durable Object: IP başına günlük limit ve günlük token bütçesi
 * "say ve karşılaştır" işlemi; aynı anda gelen iki istek aynı sayacı
 * okuyup ikisi birden limiti aşmamalı. Durable Object tek iş parçacığında
 * çalışır ve SQLite çağrıları eşzamanlı (await yok) — yani bir metodun
 * gövdesi bölünmeden, atomik çalışır. KV bu garantiyi vermez.
 *
 * Ne saklanır (başka hiçbir şey saklanmaz, soru metni ASLA):
 * - ip_daily: (gün, IP'nin tuzlu SHA-256 özeti) → o günkü soru sayısı.
 *   Ham IP yazılmaz; önceki günlerin satırları silinir (bkz. `prune`).
 * - daily: gün → modele giden soru sayısı + harcanan token.
 * - totals: sonuç türü (answer / out_of_scope / no_match / ...) → toplam sayı.
 *   Kişisel veri içermez; C1 ölçüm bloğu buradan okur.
 * - visit_daily: (gün, IP'nin tuzlu özeti) → o gün "açıldı / adım tamamladı"
 *   bayrakları. Yalnız aynı gün içinde tekilleştirmek için; önceki günlerin
 *   satırları silinir (ip_daily ile aynı kural).
 * - metrics_daily: gün → günlük tekil ziyaretçi ve tekil "adım tamamlayan" sayısı.
 *   Kalıcı olan tek gün bazlı kayıt; içinde kimlik/özet yok, yalnız iki sayı.
 * - visit_channel: (gün, IP'nin tuzlu özeti) → o gün ilk görülen kanal etiketi.
 *   Yalnız aynı gün içinde "bu ziyaretçi-gün zaten bir kanala yazıldı mı" diye
 *   bakmak için; önceki günlerin satırları silinir. Yeni kimlik YOK:
 *   aynı günlük tuzlu özet kullanılır.
 * - channel_daily: (gün, kanal) → o kanaldan gelen ziyaretçi-gün sayısı. Kalıcı
 *   olan tek kanal kaydı; içinde kimlik/özet yok, yalnız gün × kanal toplamı.
 * - step_totals: adım id'si → "tamamlandı" işaretlenme sayısı (toplam).
 */
export type ReserveResult = { ok: true } | { ok: false; reason: 'ip_limit' | 'budget' };

export class UsageCounter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS ip_daily (day TEXT, ip_hash TEXT, count INTEGER, PRIMARY KEY (day, ip_hash));
      CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, questions INTEGER, tokens INTEGER);
      CREATE TABLE IF NOT EXISTS totals (outcome TEXT PRIMARY KEY, count INTEGER);
      CREATE TABLE IF NOT EXISTS visit_daily (day TEXT, ip_hash TEXT, opened INTEGER, completed INTEGER, events INTEGER, PRIMARY KEY (day, ip_hash));
      CREATE TABLE IF NOT EXISTS metrics_daily (day TEXT PRIMARY KEY, visitors INTEGER, completers INTEGER);
      CREATE TABLE IF NOT EXISTS visit_channel (day TEXT, ip_hash TEXT, channel TEXT, PRIMARY KEY (day, ip_hash));
      CREATE TABLE IF NOT EXISTS channel_daily (day TEXT, channel TEXT, visitors INTEGER, PRIMARY KEY (day, channel));
      CREATE TABLE IF NOT EXISTS step_totals (step_id TEXT PRIMARY KEY, count INTEGER);
    `);
    // Gece silme alarmı yoksa kur (uyanınca kurucu alarm'dan önce çalışır; var olanı ezme).
    void ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.getAlarm()) === null) await ctx.storage.setAlarm(nextUtcMidnight());
    });
  }

  /**
   * Önceki günlerin IP özetli satırlarını siler. Her istekte ve her gece UTC
   * yarısında (alarm) çalışır: gizlilik metni "ertesi gün silinir" diyor;
   * yalnız istekte silinseydi, o uca istek gelmeyen günlerde satırlar kalırdı
   * (denetim 28.10). `<` (`<>` değil): gün dönümünde geç kalan eski günlü
   * bir istek yeni günün satırlarını silmesin.
   */
  private prune(day: string): void {
    const sql = this.ctx.storage.sql;
    for (const table of ['ip_daily', 'daily', 'visit_daily', 'visit_channel']) {
      sql.exec(`DELETE FROM ${table} WHERE day < ?`, day);
    }
  }

  async alarm(): Promise<void> {
    this.prune(new Date().toISOString().slice(0, 10));
    await this.ctx.storage.setAlarm(nextUtcMidnight());
  }

  /**
   * Modele gitmeden önce yer ayırır: IP limiti aşılmamışsa ve `estimate`
   * token'lık çağrı günlük bütçeye sığıyorsa sayaçları artırır (tahmini token
   * dahil) ve ok döner. Bugün çok soran adres için bütçe tavanı daha düşüktür
   * (limits.ts `HEAVY_CALLER_*`).
   * Aşılmışsa hiçbir şeyi artırmaz. Çağrı bitince fark
   * `addTokens(day, gerçek - estimate)` ile düzeltilir; çağrı hata verirse
   * `addTokens(day, -estimate)` ile geri verilir.
   */
  reserve(day: string, ipHash: string, ipLimit: number, tokenBudget: number, estimate: number): ReserveResult {
    const sql = this.ctx.storage.sql;
    this.prune(day);

    const ipRow = sql.exec<{ count: number }>('SELECT count FROM ip_daily WHERE day = ? AND ip_hash = ?', day, ipHash).toArray()[0];
    const asked = ipRow?.count ?? 0;
    if (asked >= ipLimit) return { ok: false, reason: 'ip_limit' };

    const dayRow = sql.exec<{ tokens: number }>('SELECT COALESCE(tokens, 0) AS tokens FROM daily WHERE day = ?', day).toArray()[0];
    const ceiling = asked >= HEAVY_CALLER_QUESTIONS ? Math.floor(tokenBudget * HEAVY_CALLER_BUDGET_SHARE) : tokenBudget;
    if ((dayRow?.tokens ?? 0) + estimate > ceiling) return { ok: false, reason: 'budget' };

    sql.exec(
      `INSERT INTO ip_daily (day, ip_hash, count) VALUES (?, ?, 1)
       ON CONFLICT (day, ip_hash) DO UPDATE SET count = count + 1`,
      day,
      ipHash,
    );
    sql.exec(
      `INSERT INTO daily (day, questions, tokens) VALUES (?, 1, ?)
       ON CONFLICT (day) DO UPDATE SET questions = questions + 1, tokens = tokens + excluded.tokens`,
      day,
      estimate,
    );
    return { ok: true };
  }

  /** Günlük bütçeye token farkı yazar (gerçek − ayrılan; çağrı hata verirse −ayrılan). */
  addTokens(day: string, tokens: number): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO daily (day, questions, tokens) VALUES (?, 0, ?)
       ON CONFLICT (day) DO UPDATE SET tokens = tokens + excluded.tokens`,
      day,
      tokens,
    );
  }

  /** İsteğin sonucunu toplam sayaca ekler. */
  countOutcome(outcome: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO totals (outcome, count) VALUES (?, 1)
       ON CONFLICT (outcome) DO UPDATE SET count = count + 1`,
      outcome,
    );
  }

  /** Toplamlar + bugünün sayıları (C1 ve testler için; kişisel veri yok). */
  stats(day: string): { totals: Record<string, number>; today: { questions: number; tokens: number } } {
    const sql = this.ctx.storage.sql;
    const totals: Record<string, number> = {};
    for (const row of sql.exec<{ outcome: string; count: number }>('SELECT outcome, count FROM totals')) {
      totals[row.outcome] = row.count;
    }
    const dayRow = sql.exec<{ questions: number; tokens: number }>('SELECT questions, tokens FROM daily WHERE day = ?', day).toArray()[0];
    return { totals, today: { questions: dayRow?.questions ?? 0, tokens: dayRow?.tokens ?? 0 } };
  }

  /**
   * Anonim ölçüm olayı (C1). `open`: uygulama oturumu açıldı. `step_done`:
   * kullanıcı bir adımı "tamamlandı" işaretledi. Aynı IP özeti aynı gün için
   * ziyaretçiyi ve "adım tamamlayanı" en fazla BİR kez sayar; gün içi toplam
   * olay sayısı `eventLimit`'i aşarsa olay sessizce yok sayılır (sayaç
   * şişirmeye karşı). Günler arası tekilleştirme yok: özet her gün değişir,
   * bu bilinçli — toplam "ziyaretçi-gün" tekil kullanıcının yaklaşık göstergesidir
   * (ortak IP eksik, aynı kişinin farklı ağ/günleri fazla sayar; L2).
   *
   * `channel` (yalnız `open` ile, doğrulanmış etiket): bir ziyaretçi-gün en
   * fazla BİR kanala yazılır — o gün ilk görülen etiket kazanır; etiketsiz
   * başlayan ziyaretçi-gün sonradan etiket görürse o an yazılır. Böylece kanal
   * toplamları ziyaretçi-gün toplamını aşmaz. Olay limiti kanal için de geçerli.
   */
  recordEvent(
    day: string,
    ipHash: string,
    event: 'open' | 'step_done',
    stepId: string | null,
    eventLimit: number,
    channel: Channel | null = null,
  ): void {
    const sql = this.ctx.storage.sql;
    this.prune(day);

    const row = sql
      .exec<{ opened: number; completed: number; events: number }>(
        'SELECT opened, completed, events FROM visit_daily WHERE day = ? AND ip_hash = ?',
        day,
        ipHash,
      )
      .toArray()[0] ?? { opened: 0, completed: 0, events: 0 };
    if (row.events >= eventLimit) return;

    const opened = 1;
    const completed = event === 'step_done' ? 1 : row.completed;
    sql.exec(
      `INSERT INTO visit_daily (day, ip_hash, opened, completed, events) VALUES (?, ?, ?, ?, 1)
       ON CONFLICT (day, ip_hash) DO UPDATE SET opened = ?, completed = ?, events = events + 1`,
      day,
      ipHash,
      opened,
      completed,
      opened,
      completed,
    );
    const newVisitor = row.opened === 0 ? 1 : 0;
    const newCompleter = row.completed === 0 && completed === 1 ? 1 : 0;
    sql.exec(
      `INSERT INTO metrics_daily (day, visitors, completers) VALUES (?, ?, ?)
       ON CONFLICT (day) DO UPDATE SET visitors = visitors + excluded.visitors, completers = completers + excluded.completers`,
      day,
      newVisitor,
      newCompleter,
    );
    if (channel !== null) {
      const labeled = sql.exec('SELECT 1 FROM visit_channel WHERE day = ? AND ip_hash = ?', day, ipHash).toArray().length > 0;
      if (!labeled) {
        sql.exec('INSERT INTO visit_channel (day, ip_hash, channel) VALUES (?, ?, ?)', day, ipHash, channel);
        sql.exec(
          `INSERT INTO channel_daily (day, channel, visitors) VALUES (?, ?, 1)
           ON CONFLICT (day, channel) DO UPDATE SET visitors = visitors + 1`,
          day,
          channel,
        );
      }
    }
    if (event === 'step_done' && stepId !== null) {
      sql.exec(
        `INSERT INTO step_totals (step_id, count) VALUES (?, 1)
         ON CONFLICT (step_id) DO UPDATE SET count = count + 1`,
        stepId,
      );
    }
  }

  /** Ölçüm özeti (GET /stats): gün bazlı sayılar (kanal dağılımıyla) + adım toplamları. Kimlik yok. */
  metrics(): {
    days: { day: string; visitors: number; completers: number; channels: Record<string, number> }[];
    step_done: Record<string, number>;
  } {
    const sql = this.ctx.storage.sql;
    const byDay = new Map<string, Record<string, number>>();
    for (const row of sql.exec<{ day: string; channel: string; visitors: number }>('SELECT day, channel, visitors FROM channel_daily')) {
      byDay.set(row.day, { ...byDay.get(row.day), [row.channel]: row.visitors });
    }
    const days = sql
      .exec<{ day: string; visitors: number; completers: number }>('SELECT day, visitors, completers FROM metrics_daily ORDER BY day')
      .toArray()
      .map((row) => ({ ...row, channels: byDay.get(row.day) ?? {} }));
    const step_done: Record<string, number> = {};
    for (const row of sql.exec<{ step_id: string; count: number }>('SELECT step_id, count FROM step_totals')) {
      step_done[row.step_id] = row.count;
    }
    return { days, step_done };
  }
}

/** Bir sonraki UTC gece yarısı (+30 sn pay), epoch milisaniye. */
function nextUtcMidnight(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 30);
}
