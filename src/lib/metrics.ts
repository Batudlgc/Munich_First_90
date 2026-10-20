/**
 * Anonim kullanım ölçümü (APP.md §5, C1) — iki olay, kimlik yok.
 *
 * - `open`: uygulama oturumu açıldı (JS oturumu başına en fazla bir kez). Kanal
 *   etiketi YALNIZ bu olaya eklenir: web'de adres çubuğundaki `?k=` (beyaz liste,
 *   channels.ts), iOS uygulamasında sabit `ios`. Etiket okunur, hiçbir yere yazılmaz
 *   ve URL değiştirilmez.
 * - `step_done`: kullanıcı bir adımı "tamamlandı" işaretledi (geri almak sayılmaz).
 *
 * Gövdede yalnız olay adı, adım id'si ve (open'da) kanal etiketi gider. Cihazda bu ölçüm için HİÇBİR şey
 * saklanmaz (çerez, localStorage bayrağı, rastgele kimlik yok); bu yüzden ayrı bir
 * izin ekranı gerekmez. Tekilleştirmeyi proxy yapar: IP'nin günlük değişen tuzlu
 * özeti, yalnız o gün için (proxy/src/usage.ts). İzin gerektirmesi tek koşulda
 * değişir: cihaza ölçüm amaçlı bir şey yazmaya başlarsak — bunu yapma.
 *
 * Ölçüm ASLA kullanıcıyı bekletmez ve hata fırlatmaz: istek yarıda kalırsa
 * sessizce vazgeçilir. Proxy adresi tanımlı değilse hiçbir istek gitmez.
 * Sor özelliğinin 5.1.2(i) izin kapısıyla ilgisi yok: bu olaylar soru metni ya da
 * başka içerik taşımaz.
 */
import { Platform } from 'react-native';

import { getAskBaseUrl } from '@/lib/ask';
import { type Channel, parseChannel } from '@/lib/channels';

export type MetricEvent = { event: 'open'; channel?: Channel } | { event: 'step_done'; step_id: string };

type SendOptions = {
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
  /** Testler için: varsayılan `Platform.OS`. */
  platform?: string;
  /** Testler için: varsayılan `window.location.search`. */
  search?: string;
};

/** Bu oturumun kanalı: iOS'ta `ios`, web'de beyaz listedeki `?k=` değeri, yoksa null. */
export function resolveChannel(platform: string, search: string): Channel | null {
  if (platform === 'ios') return 'ios';
  if (platform !== 'web') return null;
  return parseChannel(new URLSearchParams(search).get('k'));
}

function currentSearch(): string {
  try {
    return typeof window !== 'undefined' ? window.location.search : '';
  } catch {
    return '';
  }
}

let openSent = false;

/** Testler için: oturum bayrağını sıfırlar. */
export function resetMetricsSession() {
  openSent = false;
}

export function sendMetric(payload: MetricEvent, options: SendOptions = {}): void {
  const baseUrl = options.baseUrl === undefined ? getAskBaseUrl() : options.baseUrl;
  if (!baseUrl) return;
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    // keepalive: sayfa kapanırken de istek tamamlansın. Yanıt okunmaz.
    fetchImpl(`${baseUrl}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // fetch senkron fırlatırsa da ölçüm uygulamayı etkilemez.
  }
}

/** Oturum başına bir kez. */
export function trackOpen(options: SendOptions = {}): void {
  if (openSent) return;
  openSent = true;
  const channel = resolveChannel(options.platform ?? Platform.OS, options.search ?? currentSearch());
  sendMetric(channel ? { event: 'open', channel } : { event: 'open' }, options);
}

export function trackStepDone(stepId: string, options?: SendOptions): void {
  sendMetric({ event: 'step_done', step_id: stepId }, options);
}
