import { describe, expect, it, vi } from 'vitest';

import { maybeRequestReview, REVIEW_DELAY_MS, REVIEW_FLAG_KEY, type ReviewDeps } from '@/lib/review-prompt';

// Yerel modüller Node'da YÜKLENMEZ: expo-store-review ve react-native native
// kod ister. Fabrika verilince vitest gerçek modülü hiç çalıştırmaz (vi.mock
// import'lardan önceye taşınır); testler zaten bütün bağımlılıkları `deps`
// ile veriyor.
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-store-review', () => ({ isAvailableAsync: vi.fn(), requestReview: vi.fn() }));

/** Uygun bir iOS cihazı: mağaza penceresi açılabilir, depo boş. */
function iosDeps(overrides: Partial<ReviewDeps> = {}) {
  const store = new Map<string, string>();
  const deps = {
    platform: 'ios',
    isAvailableAsync: vi.fn(async () => true),
    requestReview: vi.fn(async () => {}),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void store.set(key, value)),
    wait: vi.fn(async () => {}),
    ...overrides,
  };
  return { deps, store };
}

describe('maybeRequestReview', () => {
  it('iOS değilse hiçbir şey yapmaz (web, Android)', async () => {
    for (const platform of ['web', 'android']) {
      const { deps, store } = iosDeps({ platform });
      expect(await maybeRequestReview(5, deps)).toBe(false);
      expect(deps.isAvailableAsync).not.toHaveBeenCalled();
      expect(deps.requestReview).not.toHaveBeenCalled();
      expect(store.size).toBe(0);
    }
  });

  it('3. damgadan önce hiçbir şey yapmaz', async () => {
    for (const count of [0, 1, 2]) {
      const { deps, store } = iosDeps();
      expect(await maybeRequestReview(count, deps)).toBe(false);
      expect(deps.requestReview).not.toHaveBeenCalled();
      expect(store.size).toBe(0);
    }
  });

  it('3. damgada bir kez ister, bayrağı yazar; sonraki damgalarda sormaz', async () => {
    const { deps, store } = iosDeps();
    expect(await maybeRequestReview(3, deps)).toBe(true);
    expect(deps.requestReview).toHaveBeenCalledTimes(1);
    expect(store.get(REVIEW_FLAG_KEY)).toBe('true');

    expect(await maybeRequestReview(4, deps)).toBe(false);
    expect(await maybeRequestReview(3, deps)).toBe(false);
    expect(deps.requestReview).toHaveBeenCalledTimes(1);
  });

  it('bayrak daha önce yazılmışsa sormaz', async () => {
    const { deps, store } = iosDeps();
    store.set(REVIEW_FLAG_KEY, 'true');
    expect(await maybeRequestReview(7, deps)).toBe(false);
    expect(deps.isAvailableAsync).not.toHaveBeenCalled();
    expect(deps.requestReview).not.toHaveBeenCalled();
  });

  it('cihazda saklanan TEK şey bayrak', async () => {
    const { deps, store } = iosDeps();
    await maybeRequestReview(3, deps);
    expect([...store.keys()]).toEqual([REVIEW_FLAG_KEY]);
    expect(deps.setItem).toHaveBeenCalledTimes(1);
  });

  it('damga animasyonu bitsin diye beklemeden sonra ister', async () => {
    const order: string[] = [];
    const { deps } = iosDeps({
      wait: vi.fn(async () => void order.push('wait')),
      requestReview: vi.fn(async () => void order.push('request')),
    });
    await maybeRequestReview(3, deps);
    expect(deps.wait).toHaveBeenCalledWith(REVIEW_DELAY_MS);
    expect(order).toEqual(['wait', 'request']);
  });

  it('isAvailableAsync false (TestFlight) ise istemez ve bayrağı YAZMAZ — App Store sürümünde yine sorulabilsin', async () => {
    const { deps, store } = iosDeps({ isAvailableAsync: vi.fn(async () => false) });
    expect(await maybeRequestReview(3, deps)).toBe(false);
    expect(deps.requestReview).not.toHaveBeenCalled();
    expect(store.has(REVIEW_FLAG_KEY)).toBe(false);
  });

  it('requestReview hata fırlatırsa uygulama çökmez, bayrak yazılmaz, sonraki damgada yeniden dener', async () => {
    const requestReview = vi.fn<() => Promise<void>>(async () => {
      throw new Error('ERR_STORE_REVIEW_FAILED');
    });
    const { deps, store } = iosDeps({ requestReview });
    await expect(maybeRequestReview(3, deps)).resolves.toBe(false);
    expect(store.has(REVIEW_FLAG_KEY)).toBe(false);

    requestReview.mockImplementation(async () => {});
    expect(await maybeRequestReview(4, deps)).toBe(true);
    expect(store.get(REVIEW_FLAG_KEY)).toBe('true');
  });

  it('isAvailableAsync ya da depolama hata fırlatırsa da çökmez', async () => {
    const a = iosDeps({
      isAvailableAsync: vi.fn(async () => {
        throw new Error('native modül yok');
      }),
    });
    await expect(maybeRequestReview(3, a.deps)).resolves.toBe(false);

    const b = iosDeps({
      getItem: vi.fn(() => {
        throw new Error('depo okunamadı');
      }),
    });
    await expect(maybeRequestReview(3, b.deps)).resolves.toBe(false);
    expect(b.deps.requestReview).not.toHaveBeenCalled();
  });

  it('art arda iki damga tek istek doğurur', async () => {
    const { deps } = iosDeps();
    const [first, second] = await Promise.all([maybeRequestReview(3, deps), maybeRequestReview(4, deps)]);
    expect([first, second]).toEqual([true, false]);
    expect(deps.requestReview).toHaveBeenCalledTimes(1);
  });

  it('varsayılan bağımlılıklarla (testte platform web) hiçbir şey yapmaz', async () => {
    expect(await maybeRequestReview(5)).toBe(false);
  });
});
