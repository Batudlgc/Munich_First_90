/**
 * İstek gövdesi sınırı. `request.json()` gövdenin tamamını belleğe alır; sınır
 * olmadan büyük bir gövde Worker'ı ve (mantık çalışmadan önce) CPU'yu boşa
 * harcatırdı. Soru en fazla 500 karakter (UTF-8'de ≤ 2 KB) + birkaç alan:
 * 4 KB ile geçerli her istek sığar.
 */
export const MAX_BODY_BYTES = 4096;

/** Gövde sınırı aştı. `null` (okunamayan JSON) ile karışmasın diye ayrı değer. */
export const TOO_LARGE = Symbol('too_large');

/**
 * Gövdeyi en fazla `maxBytes` bayt okuyup JSON'a çevirir. Önce Content-Length'e
 * bakar (hızlı ret); başlık yoksa ya da yalan söylüyorsa akışı sayarak okur ve
 * sınır aşılınca keser. JSON geçersiz/boşsa `null` döner (çağıran 400 verir).
 */
export async function readJsonBody(request: Request, maxBytes: number = MAX_BODY_BYTES): Promise<unknown | typeof TOO_LARGE> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) return TOO_LARGE;
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return TOO_LARGE;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
