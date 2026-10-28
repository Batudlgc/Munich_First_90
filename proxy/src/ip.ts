/**
 * Limit ve sayaçlarda "bir istemci" = bir IPv4 adresi ya da bir IPv6 /64 ağı.
 * Tam IPv6 adresi kullanılsaydı tek bağlantı /64 içinden sınırsız adres
 * üretip IP limitini ve olay limitini aşabilirdi. Tanınmayan biçim olduğu gibi kalır.
 */
export function ipBucket(ip: string): string {
  if (!ip.includes(':')) return ip;
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];

  const halves = lower.split('::');
  if (halves.length > 2) return ip;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return ip;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}
