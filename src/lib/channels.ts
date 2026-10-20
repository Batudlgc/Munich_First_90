/**
 * Dağıtım kanalı etiketleri (APP.md C2 / L2) — izinli etiketlerin TEK listesi.
 *
 * Link `https://munichfirst90.com/?k=tr-wa` biçiminde paylaşılır. İstemci
 * (metrics.ts) etiketi yalnız `open` olayına ekler; proxy (proxy/src) aynı
 * listeyle tekrar doğrular. Listede olmayan değer = etiket yok (istek reddedilmez).
 *
 * Bu dosya saf TypeScript olmalı (import yok): proxy da bunu doğrudan içe aktarır.
 * Yeni kanal = buraya bir satır + proxy deploy; başka yerde liste yok.
 */
export const CHANNELS = ['tr-wa', 'tr-tg', 'esn', 'fb', 'reddit', 'linkedin', 'mail', 'dm', 'qr', 'danisman', 'ios'] as const;

export type Channel = (typeof CHANNELS)[number];

/** Beyaz listedeki etiketi döner; değilse null. Büyük/küçük harf ve baştaki/sondaki boşluk yok sayılır. */
export function parseChannel(value: unknown): Channel | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return (CHANNELS as readonly string[]).includes(normalized) ? (normalized as Channel) : null;
}
