/**
 * "Sor" ekranının proxy istemcisi (APP.md §4, B3).
 *
 * Tek iş: soruyu LLM proxy'sine (proxy/src/index.ts, POST /ask) göndermek ve
 * yanıtı ekranın gösterebileceği tek bir tipe çevirmek. API anahtarı burada
 * YOK ve olamaz — anahtar yalnız proxy'nin Cloudflare secret'ında durur.
 *
 * Proxy adresi derleme zamanında `EXPO_PUBLIC_ASK_URL` ortam değişkeninden
 * gelir (ör. https://pratik-proxy.<hesap>.workers.dev). Expo, `EXPO_PUBLIC_`
 * ile başlayan değişkenleri pakete METİN OLARAK gömer; bu yüzden buraya gizli
 * bir şey yazılmaz ve değişkene `process.env.EXPO_PUBLIC_ASK_URL` biçiminde,
 * noktalı ve sabit adla erişilir (değişkene atayıp dinamik okumak gömmeyi bozar).
 * Tanımlı değilse ekran "henüz bağlı değil" der, hiçbir istek gitmez.
 */
import { hasAiConsent } from '@/lib/ai-consent';
import { classifyQuestion, OUT_OF_SCOPE_RESPONSE } from '@/lib/scope';
import type { Lang } from '@/lib/language';

/** Proxy'deki sınırla aynı (proxy/src/index.ts MAX_QUESTION_LENGTH). */
export const MAX_QUESTION_LENGTH = 500;
export const MIN_QUESTION_LENGTH = 3;
const TIMEOUT_MS = 20_000;

export type AskError =
  /** Kullanıcı Sor özelliğine izin vermedi (B4) — hiçbir istek gitmez. */
  | 'no_consent'
  /** EXPO_PUBLIC_ASK_URL tanımlı değil — özellik bu derlemede kapalı. */
  | 'not_configured'
  /** Bağlantı kurulamadı (çevrimdışı, DNS, CORS). */
  | 'network'
  | 'timeout'
  /** IP başına günlük soru limiti doldu (429). */
  | 'rate_limited'
  /** Günlük token bütçesi bitti ya da model yanıt vermedi (503/502/500). */
  | 'unavailable'
  /** Soru reddedildi (400) ya da proxy beklenmeyen bir yanıt döndü. */
  | 'invalid';

/**
 * Proxy'nin `AskResponse` tipiyle aynı dört durum + istemci tarafı hata.
 * Kopya bilinçli: kök tsconfig proxy/ klasörünü (Workers tipleri) derlemiyor.
 */
export type AskResult =
  | { status: 'answer'; answer: string; source_step_ids: string[] }
  | { status: 'no_answer'; source_step_ids: string[] }
  | { status: 'no_match' }
  | { status: 'out_of_scope'; message: string }
  | { status: 'error'; error: AskError };

export type AskOptions = {
  /**
   * İzin verildi mi. Verilmezse cihazdaki kayıttan okunur (ai-consent.ts).
   * Testler için açık; ekran bunu geçmez, kapı burada kendiliğinden çalışır.
   */
  consent?: boolean;
  /** Proxy kök adresi. Verilmezse EXPO_PUBLIC_ASK_URL. Testler için açık. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** Soru metni şifresiz gitmesin: yalnız https (yerel geliştirme için localhost http'ye izin). */
export function isSafeAskUrl(url: string): boolean {
  return /^https:\/\//i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

export function getAskBaseUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_ASK_URL?.trim().replace(/\/+$/, '');
  return url && isSafeAskUrl(url) ? url : null;
}

export async function askQuestion(
  question: string,
  lang: Lang,
  stepId: string | null,
  options: AskOptions = {},
): Promise<AskResult> {
  // İzin kapısı (B4, Apple 5.1.2(i)): izin yoksa soru hiçbir biçimde
  // işlenmez, ağa hiçbir istek çıkmaz. Kontrol ekranda değil burada, çünkü
  // proxy'ye giden tek yol bu fonksiyon.
  if (!(options.consent ?? hasAiConsent())) return { status: 'error', error: 'no_consent' };

  const trimmed = question.trim();
  if (trimmed.length < MIN_QUESTION_LENGTH || trimmed.length > MAX_QUESTION_LENGTH) {
    return { status: 'error', error: 'invalid' };
  }

  // Kapsam bekçisi istemcide de çalışır (APP.md §4): bireysel hukuki
  // değerlendirme isteyen soru cihazdan hiç çıkmaz. Proxy aynı kontrolü
  // tekrar yapar — istemciye güvenmez.
  if (classifyQuestion(trimmed).verdict === 'out_of_scope') {
    return { status: 'out_of_scope', message: OUT_OF_SCOPE_RESPONSE[lang] };
  }

  const baseUrl = options.baseUrl ?? getAskBaseUrl();
  if (!baseUrl) return { status: 'error', error: 'not_configured' };

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: trimmed, lang, step_id: stepId }),
      signal: controller.signal,
    });
  } catch {
    return { status: 'error', error: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) return { status: 'error', error: 'rate_limited' };
  if (response.status >= 500) return { status: 'error', error: 'unavailable' };
  if (!response.ok) return { status: 'error', error: 'invalid' };

  const body: unknown = await response.json().catch(() => null);
  return parseAskResponse(body) ?? { status: 'error', error: 'invalid' };
}

/** Proxy yanıtını denetler; beklenen biçimde değilse null. */
export function parseAskResponse(body: unknown): AskResult | null {
  if (typeof body !== 'object' || body === null) return null;
  const { status, answer, message, source_step_ids } = body as Record<string, unknown>;
  const ids =
    Array.isArray(source_step_ids) && source_step_ids.every((id) => typeof id === 'string')
      ? (source_step_ids as string[])
      : null;

  switch (status) {
    case 'answer':
      return typeof answer === 'string' && ids ? { status, answer, source_step_ids: ids } : null;
    case 'no_answer':
      return ids ? { status, source_step_ids: ids } : null;
    case 'no_match':
      return { status };
    case 'out_of_scope':
      return typeof message === 'string' ? { status, message } : null;
    default:
      return null;
  }
}
