import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetMetricsSession, resolveChannel, sendMetric, trackOpen, trackStepDone } from '@/lib/metrics';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

const BASE = 'https://proxy.test';
const okFetch = () => vi.fn(async () => new Response(null, { status: 204 }));
const bodyOf = (fetchImpl: ReturnType<typeof okFetch>) =>
  JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);

beforeEach(() => resetMetricsSession());

describe('metrics', () => {
  it('open: oturum başına bir kez, yalnız olay adı gider', async () => {
    const fetchImpl = okFetch();
    trackOpen({ baseUrl: BASE, fetchImpl, platform: 'web', search: '' });
    trackOpen({ baseUrl: BASE, fetchImpl, platform: 'web', search: '' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/event`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ event: 'open' });
  });

  it('step_done: adım id’si gider, başka alan yok', () => {
    const fetchImpl = okFetch();
    trackStepDone('anmeldung', { baseUrl: BASE, fetchImpl });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toEqual({ event: 'step_done', step_id: 'anmeldung' });
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('proxy adresi yoksa hiçbir istek gitmez', () => {
    const fetchImpl = okFetch();
    sendMetric({ event: 'open' }, { baseUrl: null, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ağ hatası ya da senkron istisna dışarı sızmaz', () => {
    const rejecting = vi.fn(async () => {
      throw new Error('offline');
    });
    const throwing = vi.fn(() => {
      throw new Error('boom');
    });
    expect(() => sendMetric({ event: 'open' }, { baseUrl: BASE, fetchImpl: rejecting })).not.toThrow();
    expect(() => sendMetric({ event: 'open' }, { baseUrl: BASE, fetchImpl: throwing as unknown as typeof fetch })).not.toThrow();
  });

  it('cihazda hiçbir şey saklanmaz', () => {
    const storage = { setItem: vi.fn(), getItem: vi.fn(() => null), removeItem: vi.fn() };
    vi.stubGlobal('window', { localStorage: storage });
    try {
      trackOpen({ baseUrl: BASE, fetchImpl: okFetch() });
      trackStepDone('anmeldung', { baseUrl: BASE, fetchImpl: okFetch() });
      expect(storage.setItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('kanal etiketi', () => {
    it('web: ?k= beyaz listedeyse open olayına channel olarak eklenir', () => {
      const fetchImpl = okFetch();
      trackOpen({ baseUrl: BASE, fetchImpl, platform: 'web', search: '?k=tr-wa' });
      expect(bodyOf(fetchImpl)).toEqual({ event: 'open', channel: 'tr-wa' });
    });

    it('web: başka parametrelerle birlikte ve büyük harfle de okunur', () => {
      expect(resolveChannel('web', '?utm=x&k=ESN')).toBe('esn');
    });

    it.each([['bilinmeyen değer', '?k=whatsapp'], ['boş değer', '?k='], ['parametre yok', ''], ['başka parametre', '?x=tr-wa']])(
      'web: %s → etiket yok, olay yine gider',
      (_name, search) => {
        const fetchImpl = okFetch();
        trackOpen({ baseUrl: BASE, fetchImpl, platform: 'web', search });
        expect(bodyOf(fetchImpl)).toEqual({ event: 'open' });
      },
    );

    it('iOS: sabit ios etiketi; ?k= yok sayılır', () => {
      const fetchImpl = okFetch();
      trackOpen({ baseUrl: BASE, fetchImpl, platform: 'ios', search: '?k=fb' });
      expect(bodyOf(fetchImpl)).toEqual({ event: 'open', channel: 'ios' });
    });

    it('Android (v1 dışı): etiket yok', () => {
      expect(resolveChannel('android', '?k=fb')).toBeNull();
    });

    it('step_done kanal taşımaz', () => {
      const fetchImpl = okFetch();
      trackStepDone('anmeldung', { baseUrl: BASE, fetchImpl, platform: 'web', search: '?k=tr-wa' });
      expect(bodyOf(fetchImpl)).toEqual({ event: 'step_done', step_id: 'anmeldung' });
    });

    it('etiket okunurken cihaza yazılmaz ve URL değişmez', () => {
      const storage = { setItem: vi.fn(), getItem: vi.fn(() => null), removeItem: vi.fn() };
      const history = { replaceState: vi.fn(), pushState: vi.fn() };
      vi.stubGlobal('window', { localStorage: storage, history, location: { search: '?k=qr' } });
      try {
        const fetchImpl = okFetch();
        trackOpen({ baseUrl: BASE, fetchImpl });
        expect(bodyOf(fetchImpl)).toEqual({ event: 'open', channel: 'qr' });
        expect(storage.setItem).not.toHaveBeenCalled();
        expect(history.replaceState).not.toHaveBeenCalled();
        expect(history.pushState).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
