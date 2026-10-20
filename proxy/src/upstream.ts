/**
 * Model sağlayıcısına tek çağrı. Proxy'nin geri kalanı yalnız `completeChat`
 * arayüzünü bilir; sağlayıcı değişirse (APP.md §4: yedek Claude Haiku 4.5)
 * yalnız bu dosya değişir.
 *
 * Şu anki uygulama OpenAI uyumlu `/chat/completions` ucunu konuşur — Mistral
 * (`https://api.eu.mistral.ai/v1`) bu biçimi kullanıyor. Uç ve model
 * wrangler.jsonc'deki LLM_BASE_URL / LLM_MODEL değişkenlerinden gelir.
 */

export type UpstreamConfig = {
  baseUrl: string;
  model: string;
  /** Cloudflare secret'ı. Yoksa başlık eklenmez (bulut geliştirme ortamında
   *  ajan proxy'si ekler, APP.md §6 ve §9). */
  token: string | undefined;
  maxOutputTokens: number;
};

export type UpstreamResult = { text: string; totalTokens: number };

/** Sağlayıcı hatası. Mesaj asla soru metni veya anahtar içermez.
 *  `status`: sağlayıcının HTTP kodu (ağ hatası/zaman aşımında yok). Teşhis için
 *  istemciye döner (ör. 401 = anahtar, 429 = limit); gövde ayrıntısı dönmez. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 20_000;

export async function completeChat(
  config: UpstreamConfig,
  systemPrompt: string,
  question: string,
): Promise<UpstreamResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: config.maxOutputTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new UpstreamError('upstream unreachable or timed out');
  }

  if (!response.ok) throw new UpstreamError(`upstream status ${response.status}`, response.status);

  const body = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { total_tokens?: unknown };
  } | null;
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new UpstreamError('upstream response has no text');

  // Sağlayıcı kullanım bilgisi döndürmezse bütçe yine işlesin diye kaba tahmin
  // (~4 karakter/token + çıkış tavanı) — sayaçta sıfır görünmesinden iyidir.
  const totalTokens =
    typeof body?.usage?.total_tokens === 'number'
      ? body.usage.total_tokens
      : Math.ceil((systemPrompt.length + question.length) / 4) + config.maxOutputTokens;
  return { text: text.trim(), totalTokens };
}
