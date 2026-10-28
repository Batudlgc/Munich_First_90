/**
 * "Sor" ekranının LLM proxy'si — uygulamanın tek sunucu bileşeni (APP.md §4).
 *
 * Uçlar:
 *   POST /ask    gövde: { question, lang, step_id? }
 *   POST /event  gövde: { event: 'open' | 'step_done', step_id?, channel? } — anonim ölçüm (C1);
 *                `channel` yalnız open'da, src/lib/channels.ts beyaz listesine karşı doğrulanır
 *   GET  /stats  Bearer STATS_TOKEN — ölçüm özeti (yalnız Batu okur)
 * Akış (her adım başarısızsa modele HİÇ gidilmez):
 *   1. Doğrulama (dil, uzunluk, izinli Origin)
 *   2. Kapsam bekçisi — uygulamayla AYNI dosya: src/lib/scope.ts
 *   3. Adım eşleştirme — eşleşen adım yoksa cevap yok
 *   0. Hız sınırı — adres başına dakikada en fazla 100 istek (/ask + /event)
 *   4. Limit — IP başına günlük soru sayısı + günlük token bütçesi
 *   5. Model çağrısı — yalnız eşleşen adımın JSON'u + soru
 * Soru metni hiçbir yere yazılmaz, loglanmaz: kodda console çağrısı yok,
 * wrangler.jsonc'de observability kapalı. Saklanan tek şey sayaçlar (usage.ts).
 */
import { CHANNELS, parseChannel } from '../../src/lib/channels';
import { classifyQuestion, OUT_OF_SCOPE_RESPONSE } from '../../src/lib/scope';

import { readJsonBody, TOO_LARGE } from './body';
import { ipBucket } from './ip';
import { LANGS, type Lang } from './lang';
import { MAX_QUESTION_LENGTH, MIN_QUESTION_LENGTH } from './limits';
import { buildSystemPrompt, NO_ANSWER, stripUnknownUrls } from './prompt';
import { getStep, matchSteps, type ProxyStep } from './steps';
import { completeChat, estimateTokens, UpstreamError } from './upstream';
import type { UsageCounter } from './usage';

export { UsageCounter } from './usage';

export type Env = {
  USAGE: DurableObjectNamespace<UsageCounter>;
  /** Kaba sel freni (wrangler.jsonc `ratelimits`): Cloudflare konumu başına, yaklaşık. */
  RATE_LIMITER: RateLimit;
  LLM_BASE_URL: string;
  LLM_MODEL: string;
  /** Secret (`wrangler secret put LLM_API_KEY`). Repoda ve istemcide asla. */
  LLM_API_KEY?: string;
  /** Secret. IP özetlerini tahmin edilemez kılan tuz. */
  IP_HASH_SALT?: string;
  /** Secret (`wrangler secret put STATS_TOKEN`). Tanımlı değilse GET /stats kapalı (404). */
  STATS_TOKEN?: string;
  ALLOWED_ORIGINS: string;
  DAILY_IP_LIMIT: string;
  DAILY_TOKEN_BUDGET: string;
  MAX_OUTPUT_TOKENS: string;
  /** Bir IP özetinin günde en fazla kaç ölçüm olayı sayılacağı. */
  DAILY_EVENT_LIMIT: string;
};


export type AskResponse =
  | { status: 'answer'; answer: string; source_step_ids: string[] }
  | { status: 'no_answer'; source_step_ids: string[] }
  | { status: 'no_match' }
  | { status: 'out_of_scope'; message: string };

type AskRequest = { question: string; lang: Lang; stepId: string | null };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (cors === null) return json({ error: 'origin_not_allowed' }, 403, {});

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(request.url).pathname;
    if (path === '/stats') return handleStats(request, env);
    if (path !== '/ask' && path !== '/event') return json({ error: 'not_found' }, 404, cors);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

    try {
      // Gövde okunmadan ve sayaca yazılmadan önce: modele gitmeyen yollar
      // (kapsam dışı, eşleşmeyen, /event) da sel gibi istekle doldurulamasın.
      // Anahtar ham IP değil, günlük tuzlu özet (gizlilik metniyle aynı kimlik).
      const day = new Date().toISOString().slice(0, 10);
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: await hashIp(ip, day, env.IP_HASH_SALT) });
      if (!success) return json({ error: 'rate_limited' }, 429, cors);

      return path === '/ask' ? await handleAsk(request, env, cors) : await handleEvent(request, env, cors);
    } catch {
      // Hata ayrıntısı bilerek yazılmıyor: istisna mesajı soru metnini taşıyabilir.
      return json({ error: 'internal' }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleAsk(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const raw = await readJsonBody(request);
  if (raw === TOO_LARGE) return json({ error: 'payload_too_large' }, 413, cors);
  const parsed = parseAsk(raw);
  if (!parsed) return json({ error: 'invalid_request' }, 400, cors);
  const { question, lang, stepId } = parsed;

  const usage = env.USAGE.get(env.USAGE.idFromName('global'));

  // 2. Kapsam bekçisi: bireysel hukuki değerlendirme isteyen soru modele gitmez.
  if (classifyQuestion(question).verdict === 'out_of_scope') {
    await usage.countOutcome('out_of_scope');
    return json({ status: 'out_of_scope', message: OUT_OF_SCOPE_RESPONSE[lang] } satisfies AskResponse, 200, cors);
  }

  // 3. Adım: istemci adım ekranından soruyorsa o adım, yoksa metinden eşleştirme.
  let steps: ProxyStep[];
  if (stepId !== null) {
    const step = getStep(stepId);
    if (!step) return json({ error: 'invalid_request' }, 400, cors);
    steps = [step];
  } else {
    steps = matchSteps(question);
  }
  if (steps.length === 0) {
    await usage.countOutcome('no_match');
    return json({ status: 'no_match' } satisfies AskResponse, 200, cors);
  }

  // 4. Limit. Token bütçesi çağrıdan ÖNCE tahmini tutarla ayrılır (eşzamanlı
  // istekler bütçeyi aşamasın); çağrı bitince gerçek kullanıma göre düzeltilir.
  const maxOutputTokens = positiveNumber(env.MAX_OUTPUT_TOKENS);
  const systemPrompt = buildSystemPrompt(steps, lang);
  const estimate = estimateTokens(systemPrompt, question, maxOutputTokens);
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const reservation = await usage.reserve(
    day,
    await hashIp(ip, day, env.IP_HASH_SALT),
    positiveNumber(env.DAILY_IP_LIMIT),
    positiveNumber(env.DAILY_TOKEN_BUDGET),
    estimate,
  );
  if (!reservation.ok) {
    await usage.countOutcome(reservation.reason);
    return reservation.reason === 'ip_limit'
      ? json({ error: 'rate_limited' }, 429, cors)
      : json({ error: 'budget_exhausted' }, 503, cors);
  }

  // 5. Model.
  let result;
  try {
    result = await completeChat(
      {
        baseUrl: env.LLM_BASE_URL,
        model: env.LLM_MODEL,
        token: env.LLM_API_KEY,
        maxOutputTokens,
      },
      systemPrompt,
      question,
    );
  } catch (error) {
    await usage.addTokens(day, -estimate); // çağrı tamamlanmadı: ayrılan token geri verilir
    if (!(error instanceof UpstreamError)) throw error;
    await usage.countOutcome('upstream_error');
    return json({ error: 'upstream_error', upstream_status: error.status ?? null }, 502, cors);
  }
  await usage.addTokens(day, result.totalTokens - estimate);

  const source_step_ids = steps.map((step) => step.id);
  if (result.text.includes(NO_ANSWER)) {
    await usage.countOutcome('no_answer');
    return json({ status: 'no_answer', source_step_ids } satisfies AskResponse, 200, cors);
  }
  await usage.countOutcome('answer');
  return json({ status: 'answer', answer: stripUnknownUrls(result.text, steps), source_step_ids } satisfies AskResponse, 200, cors);
}

/**
 * Anonim ölçüm olayı. Gövdede kimlik yok; yalnız olay adı ve (adım tamamlandıysa)
 * adım id'si. Geçerli olay her zaman 204 döner (limit aşımı dahil) — istemci
 * ölçümün sonucunu bilmek zorunda değil ve sayacı yoklayamaz. `channel` yok/geçersizse
 * (eski istemciler dahil) olay etiketsiz sayılır.
 */
async function handleEvent(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const body = await readJsonBody(request);
  if (body === TOO_LARGE) return json({ error: 'payload_too_large' }, 413, cors);
  if (typeof body !== 'object' || body === null) return json({ error: 'invalid_request' }, 400, cors);
  const { event, step_id, channel } = body as Record<string, unknown>;
  if (event !== 'open' && event !== 'step_done') return json({ error: 'invalid_request' }, 400, cors);
  if (event === 'step_done' && (typeof step_id !== 'string' || !getStep(step_id))) {
    return json({ error: 'invalid_request' }, 400, cors);
  }

  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const usage = env.USAGE.get(env.USAGE.idFromName('global'));
  await usage.recordEvent(
    day,
    await hashIp(ip, day, env.IP_HASH_SALT),
    event,
    event === 'step_done' ? (step_id as string) : null,
    positiveNumber(env.DAILY_EVENT_LIMIT),
    // Geçersiz/eksik etiket isteği reddetmez, yalnız etiketsiz sayılır; step_done'daki etiket yok sayılır.
    event === 'open' ? parseChannel(channel) : null,
  );
  return new Response(null, { status: 204, headers: cors });
}

/** Ölçüm özeti — yalnız STATS_TOKEN'ı bilen okur. Tarayıcıdan (Origin'li) çağrılmaz. */
async function handleStats(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, {});
  if (!env.STATS_TOKEN) return json({ error: 'not_found' }, 404, {});
  const supplied = request.headers.get('Authorization') ?? '';
  if (!(await sameSecret(supplied, `Bearer ${env.STATS_TOKEN}`))) return json({ error: 'unauthorized' }, 401, {});

  const day = new Date().toISOString().slice(0, 10);
  const usage = env.USAGE.get(env.USAGE.idFromName('global'));
  const [questions, metrics] = await Promise.all([usage.stats(day), usage.metrics()]);

  // Kanal toplamları: izinli her kanal görünür (0 dahil); `unlabeled` = etiketsiz ziyaretçi-gün
  // (doğrudan giriş, eski istemci, geçersiz etiket). Günlük ve dönem toplamlarında
  // sum(channels) = visitors.
  const labels = [...CHANNELS, 'unlabeled'] as const;
  const channels: Record<string, number> = Object.fromEntries(labels.map((label) => [label, 0]));
  const days = metrics.days.map((d) => {
    const labeled = Object.values(d.channels).reduce((sum, n) => sum + n, 0);
    const dayChannels = { ...d.channels, ...(d.visitors - labeled > 0 ? { unlabeled: d.visitors - labeled } : {}) };
    for (const [label, n] of Object.entries(dayChannels)) channels[label] = (channels[label] ?? 0) + n;
    return { ...d, channels: dayChannels };
  });
  // questions_total: modele ulaşan sorular (answer + no_answer). Bunlar IP limiti
  // ve bütçeyle sınırlı; kapsam dışı / eşleşmeyen sorular modele gitmediği için
  // tek adresten sınırsız şişirilebilirdi (denetim 28.10). Eski tanım
  // (yanıt dönen her soru) `questions_all`'da. Ayrıntı: `questions`.
  const toModel = ['answer', 'no_answer'];
  const answered = [...toModel, 'no_match', 'out_of_scope'];
  return json(
    {
      // Günler arası tekilleştirme yok (günlük değişen özet): ziyaretçi-gün,
      // tekil kullanıcının YAKLAŞIK göstergesidir — ortak IP (kampüs/mobil NAT)
      // eksik, aynı kişinin farklı ağları fazla sayar. Günler UTC.
      period: days.length > 0 ? { from: days[0].day, to: days[days.length - 1].day, days: days.length } : null,
      visitor_days: days.reduce((sum, d) => sum + d.visitors, 0),
      completer_days: days.reduce((sum, d) => sum + d.completers, 0),
      questions_total: toModel.reduce((sum, key) => sum + (questions.totals[key] ?? 0), 0),
      questions_all: answered.reduce((sum, key) => sum + (questions.totals[key] ?? 0), 0),
      channels,
      days,
      step_done: metrics.step_done,
      questions: questions.totals,
      today: questions.today,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
}

/** Sabit süreli karşılaştırma: iki dizgenin SHA-256 özetlerini bayt bayt karşılaştırır. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const xa = new Uint8Array(da);
  const xb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ xb[i];
  return diff === 0;
}

function parseAsk(body: unknown): AskRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const { question, lang, step_id } = body as Record<string, unknown>;
  if (typeof question !== 'string' || typeof lang !== 'string') return null;
  if (!LANGS.includes(lang as Lang)) return null;
  const trimmed = question.trim();
  if (trimmed.length < MIN_QUESTION_LENGTH || trimmed.length > MAX_QUESTION_LENGTH) return null;
  if (step_id !== undefined && step_id !== null && typeof step_id !== 'string') return null;
  return { question: trimmed, lang: lang as Lang, stepId: step_id ?? null };
}

/**
 * CORS: tarayıcıdan yalnız izinli Origin'ler (web sürümü + yerel geliştirme).
 * Origin başlığı yoksa istek tarayıcıdan gelmiyordur (iOS uygulaması) — izin
 * verilir; kötüye kullanıma karşı asıl koruma IP limiti ve token bütçesi.
 * İzinsiz Origin için null döner.
 */
function corsHeaders(request: Request, env: Env): Record<string, string> | null {
  const origin = request.headers.get('Origin');
  if (origin === null) return {};
  const allowed = env.ALLOWED_ORIGINS.split(',').map((entry) => entry.trim());
  if (!allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Ham IP yerine günlük değişen, tuzlu SHA-256 özeti saklanır. Tuz yoksa
 * (secret unutulmuşsa) özet IP uzayını taramakla çözülebilirdi: açık hata verilir.
 */
async function hashIp(ip: string, day: string, salt: string | undefined): Promise<string> {
  if (!salt) throw new Error('IP_HASH_SALT is not configured');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${day}:${ipBucket(ip)}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** wrangler.jsonc'deki sayısal limit. Eksik/bozuksa limit sessizce kapanmasın: hata (500). */
function positiveNumber(value: string | undefined): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error('numeric limit variable is not configured');
  return number;
}

function json(body: unknown, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
