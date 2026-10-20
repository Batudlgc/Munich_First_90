/**
 * Damga ve tamamlanma tarihi: her dilde Alman biçimi (GG.AA.YYYY). Damga
 * Almanca ("ERLEDIGT") olduğu için tarihi de memur damgasındaki gibi yazılır.
 */
export function formatStampDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}`;
}

/**
 * Bir metnin ilk cümlesi — uzun süre/son tarih açıklamasının (deadline_rule.text)
 * form alanına ve "sıradaki adım" kutusuna sığan özeti. İçerik koda gömülmez:
 * özet, adım JSON'undaki cümlenin kendisidir.
 *
 * NEDEN gün sayısından ("14 gün içinde") üretilmiyor: `deadline_rule.days` her
 * adımda aynı anlamda değil — Semesterticket'ta 10 "ayın 10'u" demek, "10 gün
 * içinde" değil. Uydurma bir kalıp yanlış bilgi verirdi.
 *
 * Cümle sonu: nokta/ünlem/soru işaretinden sonra boşluk + büyük harf (ya da
 * metnin sonu). Rakamdan sonraki nokta cümle sonu sayılmaz ("der 10.
 * Kalendertag", "ayın 10. günü"); küçük harfle devam eden kısaltma ("Art. 15",
 * "z. B. die") da bölünmez.
 */
export function firstSentence(text: string): string {
  const match = text.match(/^[\s\S]*?(?<!\d)[.!?](?=\s+[A-ZÇĞİÖŞÜÄ„"(]|\s*$)/);
  return (match ? match[0] : text).trim();
}
