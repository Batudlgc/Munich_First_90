import { reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OUT_OF_SCOPE_RESPONSE } from '../../src/lib/scope';
import { CHANNELS } from '../../src/lib/channels';
import { ipBucket } from '../src/ip';
import { MAX_QUESTION_LENGTH } from '../src/limits';

// Upstream'e (Mistral) giden her isteği yakalayan sahte fetch. Testler
// gerçek ağa çıkmaz ve anahtar gerektirmez (APP.md §6).
type Captured = { url: string; headers: Headers; body: Record<string, unknown> };
let upstreamCalls: Captured[] = [];
let upstreamReply: () => Response;

function mistralReply(content: string, totalTokens = 1000): Response {
  return Response.json({
    choices: [{ message: { role: 'assistant', content } }],
    usage: { prompt_tokens: totalTokens - 100, completion_tokens: 100, total_tokens: totalTokens },
  });
}

beforeEach(() => {
  upstreamCalls = [];
  upstreamReply = () => mistralReply('For the Anmeldung, a Wohnungsgeberbestätigung is usually requested.');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    upstreamCalls.push({ url: request.url, headers: request.headers, body: await request.json() });
    return upstreamReply();
  });
});

// 0.22'den beri testler tek bir workerd örneğini paylaşıyor; sayaçlar
// (Durable Object depolaması) bir testten diğerine taşınmasın.
afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

let ipCounter = 0;
/** Her testte farklı bir IP: IP limiti testleri birbirini etkilemesin. */
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function ask(body: unknown, init: { ip?: string; origin?: string; method?: string; path?: string } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'CF-Connecting-IP': init.ip ?? freshIp(),
  };
  if (init.origin) headers.Origin = init.origin;
  return exports.default.fetch(`https://proxy.test${init.path ?? '/ask'}`, {
    method: init.method ?? 'POST',
    headers,
    body: init.method === 'GET' || init.method === 'OPTIONS' ? undefined : JSON.stringify(body),
  });
}

const IN_SCOPE = 'Which documents do I need for the Anmeldung?';

function usage() {
  return env.USAGE.get(env.USAGE.idFromName('global'));
}
const today = () => new Date().toISOString().slice(0, 10);

describe('POST /ask — başarılı akış', () => {
  it('kapsam içi soruyu modele iletir, cevap + kaynak adım döner', async () => {
    const response = await ask({ question: IN_SCOPE, lang: 'en' });
    expect(response.status).toBe(200);
    const body = await response.json<{ status: string; answer: string; source_step_ids: string[] }>();
    expect(body.status).toBe('answer');
    expect(body.answer).toContain('Wohnungsgeberbestätigung');
    expect(body.source_step_ids[0]).toBe('anmeldung');
    expect(upstreamCalls).toHaveLength(1);
  });

  it("modele yalnız eşleşen adımın içeriği, istenen dilde gider", async () => {
    await ask({ question: 'Anmeldung için hangi belgeler gerekiyor?', lang: 'tr' });
    const { url, body } = upstreamCalls[0];
    expect(url).toBe('https://api.eu.mistral.ai/v1/chat/completions');
    expect(body.model).toBe('mistral-small-2603');
    const [system, user] = body.messages as { role: string; content: string }[];
    expect(system.role).toBe('system');
    expect(system.content).toContain('"id":"anmeldung"');
    expect(system.content).toContain('Answer in Turkish');
    // Türkçe açıklama gidiyor, İngilizcesi gitmiyor (token maliyeti).
    expect(system.content).toContain('Kayda girecek her kişi için');
    expect(system.content).not.toContain('A valid ID card or passport');
    // İlgisiz adım gitmiyor.
    expect(system.content).not.toContain('"id":"rundfunkbeitrag"');
    expect(user).toEqual({ role: 'user', content: 'Anmeldung için hangi belgeler gerekiyor?' });
  });

  it('step_id verilirse eşleştirme yerine o adım kullanılır', async () => {
    const response = await ask({ question: 'Which documents are needed?', lang: 'de', step_id: 'rundfunkbeitrag' });
    const body = await response.json<{ source_step_ids: string[] }>();
    expect(body.source_step_ids).toEqual(['rundfunkbeitrag']);
    const system = (upstreamCalls[0].body.messages as { content: string }[])[0].content;
    expect(system).toContain('"id":"rundfunkbeitrag"');
    expect(system).toContain('Answer in German');
  });

  it('model NO_ANSWER derse cevap metni dönmez', async () => {
    upstreamReply = () => mistralReply('NO_ANSWER');
    const body = await (await ask({ question: IN_SCOPE, lang: 'en' })).json<Record<string, unknown>>();
    expect(body).toEqual({ status: 'no_answer', source_step_ids: expect.arrayContaining(['anmeldung']) });
  });
});

describe('POST /ask — modele gitmeyen yollar', () => {
  it('kapsam dışı soru (RDG) modele gitmez, sabit metin döner', async () => {
    const response = await ask({ question: 'Bu durumda itiraz etmeli miyim?', lang: 'tr' });
    expect(await response.json()).toEqual({ status: 'out_of_scope', message: OUT_OF_SCOPE_RESPONSE.tr });
    expect(upstreamCalls).toHaveLength(0);
  });

  it('eşleşen adım yoksa modele gitmez', async () => {
    const response = await ask({ question: 'Which documents do I need to adopt a cat?', lang: 'en' });
    expect(await response.json()).toEqual({ status: 'no_match' });
    expect(upstreamCalls).toHaveLength(0);
  });

  it.each([
    ['gövde JSON değil', 'not json'],
    ['dil desteklenmiyor', { question: IN_SCOPE, lang: 'fr' }],
    ['soru boş', { question: '  ', lang: 'en' }],
    ['soru çok uzun', { question: 'x'.repeat(MAX_QUESTION_LENGTH + 1), lang: 'en' }],
    ['bilinmeyen step_id', { question: IN_SCOPE, lang: 'en', step_id: 'yok-boyle-adim' }],
  ])('geçersiz istek (%s) → 400', async (_name, body) => {
    const response = await ask(body);
    expect(response.status).toBe(400);
    expect(upstreamCalls).toHaveLength(0);
  });

  it('yanlış yol ve yöntem', async () => {
    expect((await ask(null, { path: '/' , method: 'GET' })).status).toBe(404);
    expect((await ask(null, { method: 'GET' })).status).toBe(405);
  });
});

describe('CORS', () => {
  it('izinli Origin yansıtılır, preflight 204', async () => {
    const preflight = await ask(null, { method: 'OPTIONS', origin: 'https://munichfirst90.com' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://munichfirst90.com');
    const response = await ask({ question: IN_SCOPE, lang: 'en' }, { origin: 'http://localhost:8081' });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
  });

  it('izinsiz Origin reddedilir, modele gidilmez', async () => {
    const response = await ask({ question: IN_SCOPE, lang: 'en' }, { origin: 'https://evil.example' });
    expect(response.status).toBe(403);
    expect(upstreamCalls).toHaveLength(0);
  });
});

describe('Limitler', () => {
  it('IP başına günlük limit aşılınca 429, modele gidilmez', async () => {
    const ip = freshIp();
    const limit = Number(env.DAILY_IP_LIMIT);
    for (let i = 0; i < limit; i++) {
      expect((await ask({ question: IN_SCOPE, lang: 'en' }, { ip })).status).toBe(200);
    }
    const blocked = await ask({ question: IN_SCOPE, lang: 'en' }, { ip });
    expect(blocked.status).toBe(429);
    expect(upstreamCalls).toHaveLength(limit);
    // Başka bir IP etkilenmez.
    expect((await ask({ question: IN_SCOPE, lang: 'en' })).status).toBe(200);
  });

  it('günlük token bütçesi dolunca 503, modele gidilmez', async () => {
    upstreamReply = () => mistralReply('ok', Number(env.DAILY_TOKEN_BUDGET));
    expect((await ask({ question: IN_SCOPE, lang: 'en' })).status).toBe(200);
    const blocked = await ask({ question: IN_SCOPE, lang: 'en' });
    expect(blocked.status).toBe(503);
    expect(await blocked.json()).toEqual({ error: 'budget_exhausted' });
    expect(upstreamCalls).toHaveLength(1);
  });
});

describe('Limit atlatma (denetim 28.10)', () => {
  const mutableEnv = env as { IP_HASH_SALT?: string; DAILY_TOKEN_BUDGET: string };

  it('ipBucket: IPv6 /64 tek istemci sayılır, IPv4 ve eşlenmiş IPv4 değişmez', () => {
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:DB8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:0db8:0001:0002:0:0:0:9')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipBucket('::1')).toBe('0:0:0:0::/64');
    expect(ipBucket('not-an-ip:')).toBe('not-an-ip:');
  });

  it('aynı IPv6 /64 içinden adres değiştirmek IP limitini aşmaz', async () => {
    const limit = Number(env.DAILY_IP_LIMIT);
    for (let i = 0; i < limit; i++) {
      const ip = `2001:db8:aaaa:bbbb::${(i + 1).toString(16)}`;
      expect((await ask({ question: IN_SCOPE, lang: 'en' }, { ip })).status).toBe(200);
    }
    expect((await ask({ question: IN_SCOPE, lang: 'en' }, { ip: '2001:db8:aaaa:bbbb:1:2:3:4' })).status).toBe(429);
    // Başka bir /64 etkilenmez.
    expect((await ask({ question: IN_SCOPE, lang: 'en' }, { ip: '2001:db8:aaaa:cccc::1' })).status).toBe(200);
  });

  it('eşzamanlı istekler günlük token bütçesini aşamaz (bütçe çağrıdan önce ayrılır)', async () => {
    mutableEnv.DAILY_TOKEN_BUDGET = '7000';
    try {
      upstreamReply = () => mistralReply('ok', 100);
      const responses = await Promise.all(Array.from({ length: 20 }, () => ask({ question: IN_SCOPE, lang: 'en' })));
      const ok = responses.filter((r) => r.status === 200).length;
      const blocked = responses.filter((r) => r.status === 503).length;
      expect(ok).toBe(upstreamCalls.length);
      expect(ok).toBeGreaterThan(0);
      expect(ok).toBeLessThan(20);
      expect(ok + blocked).toBe(20);
    } finally {
      mutableEnv.DAILY_TOKEN_BUDGET = '300000';
    }
  });

  it('upstream hata verirse ayrılan token geri verilir', async () => {
    upstreamReply = () => new Response('x', { status: 500 });
    expect((await ask({ question: IN_SCOPE, lang: 'en' })).status).toBe(502);
    expect((await usage().stats(today())).today.tokens).toBe(0);
  });

  it('başarılı çağrıda günlük token gerçek kullanıma eşitlenir', async () => {
    upstreamReply = () => mistralReply('ok', 1234);
    await ask({ question: IN_SCOPE, lang: 'en' });
    expect((await usage().stats(today())).today.tokens).toBe(1234);
  });

  it('IP_HASH_SALT tanımlı değilse /ask ve /event 500 verir, modele gidilmez', async () => {
    const salt = mutableEnv.IP_HASH_SALT;
    delete mutableEnv.IP_HASH_SALT;
    try {
      expect((await ask({ question: IN_SCOPE, lang: 'en' })).status).toBe(500);
      expect((await ask({ event: 'open' }, { path: '/event' })).status).toBe(500);
      expect(upstreamCalls).toHaveLength(0);
    } finally {
      mutableEnv.IP_HASH_SALT = salt;
    }
  });
});

describe('İstek gövdesi sınırı (413)', () => {
  const post = (path: string, body: BodyInit, extra: Record<string, string> = {}) =>
    exports.default.fetch(`https://proxy.test${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': freshIp(), ...extra },
      body,
    });
  const streamOf = (text: string) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(text);
        for (let i = 0; i < bytes.length; i += 1000) controller.enqueue(bytes.slice(i, i + 1000));
        controller.close();
      },
    });

  it('/ask: 4 KB üstü gövde 413, modele ve sayaçlara gidilmez', async () => {
    const response = await post('/ask', JSON.stringify({ question: IN_SCOPE, lang: 'en', pad: 'x'.repeat(5000) }));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'payload_too_large' });
    expect(upstreamCalls).toHaveLength(0);
    expect(await usage().stats(today())).toEqual({ totals: {}, today: { questions: 0, tokens: 0 } });
  });

  it('/event: 4 KB üstü gövde 413, ölçüm sayacı artmaz', async () => {
    const response = await post('/event', JSON.stringify({ event: 'open', pad: 'x'.repeat(5000) }));
    expect(response.status).toBe(413);
    expect((await usage().metrics()).days).toEqual([]);
  });

  it('Content-Length olmayan akış da sınırda kesilir', async () => {
    const huge = JSON.stringify({ question: IN_SCOPE, lang: 'en', pad: 'x'.repeat(50_000) });
    const response = await exports.default.fetch('https://proxy.test/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': freshIp() },
      body: streamOf(huge),
      // @ts-expect-error workerd akış gövdesinde duplex ister; DOM tipinde yok.
      duplex: 'half',
    });
    expect(response.status).toBe(413);
    expect(upstreamCalls).toHaveLength(0);
  });

  it('izinli en uzun soru (500 çok baytlı karakter) sınırın altında kalır', async () => {
    const body = JSON.stringify({ question: 'ü'.repeat(MAX_QUESTION_LENGTH), lang: 'de' });
    expect(new TextEncoder().encode(body).length).toBeLessThan(4096);
    expect((await post('/ask', body)).status).toBe(200);
  });

  it('geçersiz JSON hâlâ 400 (413 değil)', async () => {
    expect((await post('/ask', '{not json')).status).toBe(400);
    expect((await post('/event', '')).status).toBe(400);
  });
});

describe('Saklama: önceki günlerin IP özetleri (denetim 28.10)', () => {
  const OLD = '2000-01-01';
  const HASHED_TABLES = ['ip_daily', 'visit_daily', 'visit_channel'];

  async function seedOldRows() {
    await runInDurableObject(usage(), (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec('INSERT INTO ip_daily (day, ip_hash, count) VALUES (?, ?, 1)', OLD, 'h-old');
      sql.exec('INSERT INTO visit_daily (day, ip_hash, opened, completed, events) VALUES (?, ?, 1, 1, 1)', OLD, 'h-old');
      sql.exec('INSERT INTO visit_channel (day, ip_hash, channel) VALUES (?, ?, ?)', OLD, 'h-old', CHANNELS[0]);
      sql.exec('INSERT INTO ip_daily (day, ip_hash, count) VALUES (?, ?, 1)', today(), 'h-today');
    });
  }

  async function oldRowCounts() {
    return runInDurableObject(usage(), (_instance, state) =>
      HASHED_TABLES.map((table) => state.storage.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE day < ?`, today()).one().n),
    );
  }

  it('hiç istek gelmese de gece alarmı siler, bugünü bırakır ve kendini yeniden kurar', async () => {
    await seedOldRows();
    expect(await oldRowCounts()).toEqual([1, 1, 1]);

    expect(await runDurableObjectAlarm(usage())).toBe(true);

    expect(await oldRowCounts()).toEqual([0, 0, 0]);
    const after = await runInDurableObject(usage(), async (_instance, state) => ({
      todayRows: state.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM ip_daily WHERE day = ?', today()).one().n,
      nextAlarm: await state.storage.getAlarm(),
    }));
    expect(after.todayRows).toBe(1);
    expect(after.nextAlarm).toBeGreaterThan(Date.now());
  });

  it('/event isteği /ask tablolarının eski satırlarını da siler', async () => {
    await seedOldRows();
    expect((await ask({ event: 'open' }, { path: '/event' })).status).toBe(204);
    expect(await oldRowCounts()).toEqual([0, 0, 0]);
  });
});

describe('Denetim run 2 (28.10): hız sınırı, bütçe payı, sayı doğrulama', () => {
  const mutableEnv = env as { DAILY_TOKEN_BUDGET: string; DAILY_IP_LIMIT?: string };

  it('aynı adresten dakikada 100 istekten sonrası 429 (gövde okunmadan); başka adres etkilenmez', async () => {
    const ip = freshIp();
    for (let i = 0; i < 100; i++) {
      expect((await ask({}, { ip, path: '/event' })).status).toBe(400);
    }
    const limited = await ask({ event: 'open' }, { ip, path: '/event' });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate_limited' });
    expect((await ask({ event: 'open' }, { path: '/event' })).status).toBe(204);
  });

  it('bugün çok soran adres bütçenin son payını tüketemez; az soran adres hâlâ sorabilir', async () => {
    mutableEnv.DAILY_TOKEN_BUDGET = '20000';
    try {
      upstreamReply = () => mistralReply('ok', 2000);
      const heavy = freshIp();
      let answered = 0;
      for (let i = 0; i < 20; i++) {
        const status = (await ask({ question: IN_SCOPE, lang: 'en' }, { ip: heavy })).status;
        if (status === 503) break;
        expect(status).toBe(200);
        answered += 1;
      }
      expect(answered).toBeGreaterThanOrEqual(5);
      expect((await usage().stats(today())).today.tokens).toBeLessThanOrEqual(14000);
      expect((await ask({ question: IN_SCOPE, lang: 'en' })).status).toBe(200);
    } finally {
      mutableEnv.DAILY_TOKEN_BUDGET = '300000';
    }
  });

  it('sağlayıcı negatif token bildirirse bütçe geri dolmaz', async () => {
    upstreamReply = () => mistralReply('ok', -50000);
    expect((await ask({ question: IN_SCOPE, lang: 'en' })).status).toBe(200);
    expect((await usage().stats(today())).today.tokens).toBe(0);
  });

  it('sayısal limit ayarı eksikse limit sessizce kapanmaz: 500, modele gidilmez', async () => {
    const saved = mutableEnv.DAILY_IP_LIMIT;
    delete mutableEnv.DAILY_IP_LIMIT;
    try {
      expect((await ask({ question: IN_SCOPE, lang: 'en' })).status).toBe(500);
      expect(upstreamCalls).toHaveLength(0);
    } finally {
      mutableEnv.DAILY_IP_LIMIT = saved;
    }
  });
});

describe('Denetim run 2 (PR 61\'den): yapılandırma ve gece yarısı', () => {
  const mutableEnv = env as unknown as Record<string, string | undefined>;

  it.each([
    ['DAILY_IP_LIMIT', 'ask'],
    ['DAILY_TOKEN_BUDGET', 'ask'],
    ['MAX_OUTPUT_TOKENS', 'ask'],
    ['DAILY_EVENT_LIMIT', 'event'],
  ] as const)('%s eksik, boş ya da sayı değilse istek 500 verir; koruma sessizce kapanmaz', async (name, endpoint) => {
    const original = mutableEnv[name];
    try {
      for (const bad of [undefined, '', 'abc', '-5']) {
        if (bad === undefined) delete mutableEnv[name];
        else mutableEnv[name] = bad;
        const response =
          endpoint === 'ask'
            ? await ask({ question: IN_SCOPE, lang: 'en' })
            : await ask({ event: 'open' }, { path: '/event' });
        expect(response.status).toBe(500);
      }
      expect(upstreamCalls).toHaveLength(0);
      expect((await usage().stats(today())).today).toEqual({ questions: 0, tokens: 0 });
    } finally {
      mutableEnv[name] = original;
    }
  });

  it('eski güne ait geç gelen istek bugünün satırlarını silmez (gece yarısı yarışı)', async () => {
    await usage().reserve(today(), 'new-hash', 20, 300000, 100);
    // Günü Worker'da eski hesaplanmış, Durable Object'e sonradan ulaşan istek.
    await usage().reserve('2020-01-01', 'late-hash', 20, 300000, 100);
    expect((await usage().stats(today())).today).toEqual({ questions: 1, tokens: 100 });
  });
});

describe('Upstream hatası ve gizlilik', () => {
  it('upstream hata verirse 502; yalnız HTTP kodu döner, gövde ayrıntısı dönmez', async () => {
    upstreamReply = () => new Response('upstream detail', { status: 401 });
    const response = await ask({ question: IN_SCOPE, lang: 'en' });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upstream_error', upstream_status: 401 });
  });

  it('anahtar secret olarak tanımlı değilse Authorization başlığı eklenmez', async () => {
    await ask({ question: IN_SCOPE, lang: 'en' });
    expect(upstreamCalls[0].headers.has('Authorization')).toBe(false);
  });

  it("secret tanımlıysa Authorization: Bearer olarak eklenir", async () => {
    const mutableEnv = env as { LLM_API_KEY?: string };
    mutableEnv.LLM_API_KEY = 'test-token';
    try {
      await ask({ question: IN_SCOPE, lang: 'en' });
    } finally {
      delete mutableEnv.LLM_API_KEY;
    }
    expect(upstreamCalls[0].headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('hiçbir istek konsola yazı yazmaz (soru loglanmaz)', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    await ask({ question: IN_SCOPE, lang: 'en' });
    await ask({ question: 'Bu durumda itiraz etmeli miyim?', lang: 'tr' });
    upstreamReply = () => new Response('x', { status: 500 });
    await ask({ question: IN_SCOPE, lang: 'en' });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('sayaçlar yalnız sonuç türünü ve günlük toplamları tutar, soru metnini değil', async () => {
    const secretQuestion = 'Which documents do I need for the Anmeldung? marker-7f3a';
    await ask({ question: secretQuestion, lang: 'en' });
    const stats = await usage().stats(today());
    expect(stats.totals.answer).toBeGreaterThan(0);
    expect(stats.today.questions).toBeGreaterThan(0);
    expect(JSON.stringify(stats)).not.toContain('marker-7f3a');
  });
});

describe('POST /event — anonim ölçüm (C1)', () => {
  const event = (body: unknown, init: { ip?: string; origin?: string } = {}) => ask(body, { ...init, path: '/event' });
  const stats = (token?: string, init: { origin?: string } = {}) => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (init.origin) headers.Origin = init.origin;
    return exports.default.fetch('https://proxy.test/stats', { headers });
  };
  const withToken = async (fn: () => Promise<void>) => {
    const mutableEnv = env as { STATS_TOKEN?: string };
    mutableEnv.STATS_TOKEN = 'stats-test';
    try {
      await fn();
    } finally {
      delete mutableEnv.STATS_TOKEN;
    }
  };

  it('open ve step_done 204 döner; aynı IP aynı gün tek ziyaretçi ve tek tamamlayan sayılır', async () => {
    const ip = freshIp();
    expect((await event({ event: 'open' }, { ip })).status).toBe(204);
    expect((await event({ event: 'open' }, { ip })).status).toBe(204);
    expect((await event({ event: 'step_done', step_id: 'anmeldung' }, { ip })).status).toBe(204);
    expect((await event({ event: 'step_done', step_id: 'bankkonto' }, { ip })).status).toBe(204);
    const metrics = await usage().metrics();
    expect(metrics.days).toEqual([{ day: today(), visitors: 1, completers: 1, channels: {} }]);
    // Adım toplamı olay başına artar (kim olduğu bilinmez).
    expect(metrics.step_done).toEqual({ anmeldung: 1, bankkonto: 1 });
  });

  it('farklı IP farklı ziyaretçi; yalnız open gönderen tamamlayan sayılmaz', async () => {
    await event({ event: 'open' });
    await event({ event: 'open' });
    await event({ event: 'step_done', step_id: 'anmeldung' });
    expect((await usage().metrics()).days).toEqual([{ day: today(), visitors: 3, completers: 1, channels: {} }]);
  });

  it('günlük olay limiti aşılınca sayaç artmaz ama yanıt yine 204', async () => {
    const ip = freshIp();
    const limit = Number(env.DAILY_EVENT_LIMIT);
    for (let i = 0; i < limit + 5; i++) {
      expect((await event({ event: 'step_done', step_id: 'anmeldung' }, { ip })).status).toBe(204);
    }
    expect((await usage().metrics()).step_done.anmeldung).toBe(limit);
  });

  it.each([
    ['gövde JSON değil', 'not json'],
    ['bilinmeyen olay', { event: 'pageview' }],
    ['step_done adımsız', { event: 'step_done' }],
    ['step_done bilinmeyen adım', { event: 'step_done', step_id: 'yok-boyle-adim' }],
  ])('geçersiz olay (%s) → 400, sayaç değişmez', async (_name, body) => {
    expect((await event(body)).status).toBe(400);
    expect((await usage().metrics()).days).toEqual([]);
  });

  it('izinsiz Origin 403; izinli Origin için CORS başlığı döner', async () => {
    expect((await event({ event: 'open' }, { origin: 'https://evil.example' })).status).toBe(403);
    const ok = await event({ event: 'open' }, { origin: 'https://munichfirst90.com' });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://munichfirst90.com');
  });

  it('GET /event → 405', async () => {
    expect((await ask(null, { path: '/event', method: 'GET' })).status).toBe(405);
  });

  it('GET /stats: token tanımlı değilse 404, yanlış/eksik token 401, doğru token özet', async () => {
    expect((await stats('stats-test')).status).toBe(404);
    await withToken(async () => {
      expect((await stats()).status).toBe(401);
      expect((await stats('yanlis')).status).toBe(401);
      expect((await stats('stats-test', { origin: 'https://evil.example' })).status).toBe(403);

      await event({ event: 'open' });
      await event({ event: 'step_done', step_id: 'anmeldung' });
      await ask({ question: IN_SCOPE, lang: 'en' });
      const response = await stats('stats-test');
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const body = await response.json<Record<string, unknown>>();
      // Ayrı IP'ler: open+step_done farklı isteklerden → 2 ziyaretçi-gün, 1 tamamlayan-gün.
      expect(body).toMatchObject({
        visitor_days: 2,
        completer_days: 1,
        step_done: { anmeldung: 1 },
        questions: { answer: 1 },
      });
    });
  });

  it('ölçüm depolaması ham IP, soru ya da kimlik içermez', async () => {
    const ip = '198.51.100.77';
    await event({ event: 'step_done', step_id: 'anmeldung' }, { ip });
    const dump = JSON.stringify(await usage().metrics());
    expect(dump).not.toContain(ip);
    expect(Object.keys(JSON.parse(dump)).sort()).toEqual(['days', 'step_done']);
  });

  it('ölçüm olayı konsola yazmaz', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    await event({ event: 'open' });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('Kanal etiketi (L2) — POST /event channel, GET /stats kırılımı', () => {
  const event = (body: unknown, init: { ip?: string } = {}) => ask(body, { ...init, path: '/event' });
  const readStats = async () => {
    const mutableEnv = env as { STATS_TOKEN?: string };
    mutableEnv.STATS_TOKEN = 'stats-test';
    try {
      const response = await exports.default.fetch('https://proxy.test/stats', { headers: { Authorization: 'Bearer stats-test' } });
      expect(response.status).toBe(200);
      return await response.json<{
        period: { from: string; to: string; days: number } | null;
        visitor_days: number;
        completer_days: number;
        questions_total: number;
        questions_all: number;
        channels: Record<string, number>;
        days: { day: string; visitors: number; completers: number; channels: Record<string, number> }[];
      }>();
    } finally {
      delete mutableEnv.STATS_TOKEN;
    }
  };

  it('geçerli etiket: open 204, kanal sayacı artar', async () => {
    expect((await event({ event: 'open', channel: 'tr-wa' })).status).toBe(204);
    expect((await usage().metrics()).days).toEqual([{ day: today(), visitors: 1, completers: 0, channels: { 'tr-wa': 1 } }]);
  });

  it.each(CHANNELS)('izinli her etiket (%s) kabul edilir', async (channel) => {
    await event({ event: 'open', channel });
    expect((await usage().metrics()).days[0].channels).toEqual({ [channel]: 1 });
  });

  it.each([
    ['bilinmeyen etiket', 'whatsapp'],
    ['boş dize', ''],
    ['sayı', 7],
    ['nesne', { a: 1 }],
    ['çok uzun / enjeksiyon', 'tr-wa<script>'.repeat(50)],
  ])('geçersiz etiket (%s): istek reddedilmez, etiketsiz sayılır', async (_name, channel) => {
    expect((await event({ event: 'open', channel })).status).toBe(204);
    expect((await usage().metrics()).days).toEqual([{ day: today(), visitors: 1, completers: 0, channels: {} }]);
  });

  it('geriye uyum: channel alanı olmayan eski istemci olayı çalışır', async () => {
    expect((await event({ event: 'open' })).status).toBe(204);
    expect((await event({ event: 'step_done', step_id: 'anmeldung' })).status).toBe(204);
    const stats = await readStats();
    expect(stats.visitor_days).toBe(2);
    expect(stats.channels.unlabeled).toBe(2);
  });

  it('günlük tekilleştirme: aynı IP aynı gün aynı kanalı bir kez sayar', async () => {
    const ip = freshIp();
    await event({ event: 'open', channel: 'esn' }, { ip });
    await event({ event: 'open', channel: 'esn' }, { ip });
    await event({ event: 'open', channel: 'esn' }, { ip: freshIp() });
    const [day] = (await usage().metrics()).days;
    expect(day).toMatchObject({ visitors: 2, channels: { esn: 2 } });
  });

  it('bir ziyaretçi-gün tek kanala yazılır: ilk etiket kazanır, kanal toplamı ziyaretçiyi aşmaz', async () => {
    const ip = freshIp();
    await event({ event: 'open', channel: 'fb' }, { ip });
    await event({ event: 'open', channel: 'reddit' }, { ip });
    const [day] = (await usage().metrics()).days;
    expect(day).toMatchObject({ visitors: 1, channels: { fb: 1 } });
  });

  it('etiketsiz başlayan ziyaretçi-gün sonradan etiket görürse o an kanala yazılır; ziyaretçi ikilenmez', async () => {
    const ip = freshIp();
    await event({ event: 'open' }, { ip });
    await event({ event: 'open', channel: 'qr' }, { ip });
    const [day] = (await usage().metrics()).days;
    expect(day).toMatchObject({ visitors: 1, channels: { qr: 1 } });
  });

  it('step_done üzerindeki channel yok sayılır', async () => {
    await event({ event: 'step_done', step_id: 'anmeldung', channel: 'mail' });
    const [day] = (await usage().metrics()).days;
    expect(day).toMatchObject({ visitors: 1, completers: 1, channels: {} });
  });

  it('olay limiti kanal için de geçerli: limit dolmuş IP etiketi sayamaz', async () => {
    const ip = freshIp();
    const limit = Number(env.DAILY_EVENT_LIMIT);
    for (let i = 0; i < limit; i++) await event({ event: 'step_done', step_id: 'anmeldung' }, { ip });
    expect((await event({ event: 'open', channel: 'dm' }, { ip })).status).toBe(204);
    expect((await usage().metrics()).days[0].channels).toEqual({});
  });

  it('kanal depolaması ham IP içermez', async () => {
    const ip = '198.51.100.88';
    await event({ event: 'open', channel: 'linkedin' }, { ip });
    expect(JSON.stringify(await usage().metrics())).not.toContain(ip);
  });

  it('GET /stats biçimi: dönem, toplamlar, her izinli kanal (0 dahil), unlabeled, gün kırılımı, Sor sayısı', async () => {
    await event({ event: 'open', channel: 'tr-wa' });
    await event({ event: 'open', channel: 'tr-wa' });
    await event({ event: 'open', channel: 'esn' });
    await event({ event: 'open' });
    await event({ event: 'step_done', step_id: 'anmeldung', channel: 'tr-wa' });
    await ask({ question: IN_SCOPE, lang: 'en' });
    await ask({ question: IN_SCOPE, lang: 'en' });
    const stats = await readStats();
    expect(stats.period).toEqual({ from: today(), to: today(), days: 1 });
    expect(stats.visitor_days).toBe(5);
    expect(stats.completer_days).toBe(1);
    expect(stats.questions_total).toBe(2);
    expect(Object.keys(stats.channels).sort()).toEqual([...CHANNELS, 'unlabeled'].sort());
    expect(stats.channels).toMatchObject({ 'tr-wa': 2, esn: 1, fb: 0, unlabeled: 2 });
    expect(Object.values(stats.channels).reduce((a, b) => a + b, 0)).toBe(stats.visitor_days);
    expect(stats.days).toEqual([
      { day: today(), visitors: 5, completers: 1, channels: { 'tr-wa': 2, esn: 1, unlabeled: 2 } },
    ]);
  });

  it('questions_total yalnız modele ulaşan soruları sayar; kapsam dışı ve eşleşmeyen questions_all\'da', async () => {
    const ip = freshIp();
    for (let i = 0; i < 3; i++) await ask({ question: 'Should I appeal my rejected residence permit?', lang: 'en' }, { ip });
    await ask({ question: 'What is the weather like today?', lang: 'en' }, { ip });
    await ask({ question: IN_SCOPE, lang: 'en' }, { ip });
    const stats = await readStats();
    expect(stats.questions_total).toBe(1);
    expect(stats.questions_all).toBe(5);
  });

  it('GET /stats boşken: period null, tüm sayılar 0', async () => {
    const stats = await readStats();
    expect(stats.period).toBeNull();
    expect(stats.visitor_days).toBe(0);
    expect(stats.questions_total).toBe(0);
    expect(stats.days).toEqual([]);
  });
});

describe('ana modül export listesi', () => {
  // Workers ana modülün her değer export'unu giriş noktası sayar; düz bir sabit
  // export'u Worker'ı açılmaz yapar ("Incorrect type for map entry"). B3'te
  // `wrangler dev` ile yakalandı; vitest havuzu ve `deploy --dry-run` yakalamıyor.
  it('yalnız default handler ve Durable Object sınıfı', async () => {
    const mod = await import('../src/index');
    expect(Object.keys(mod).sort()).toEqual(['UsageCounter', 'default']);
  });
});

describe('Cevaptaki URL temizliği', () => {
  it('adım verisinde olmayan URL cevaptan silinir, olan kalır', async () => {
    const { stripUnknownUrls } = await import('../src/prompt');
    const { getStep } = await import('../src/steps');
    const step = getStep('anmeldung')!;
    const real = step.booking_url!;
    const bent = real.replace('buergerservice', 'bürgerservice');
    expect(stripUnknownUrls(`Randevu linki: ${bent}`, [step])).toBe('Randevu linki:');
    expect(stripUnknownUrls(`Link: ${real}.`, [step])).toBe(`Link: ${real}.`);
  });
});
