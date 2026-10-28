import { describe, expect, it, vi } from 'vitest';

import { CONSENT_VERSION, grantAiConsent, hasAiConsent, revokeAiConsent } from '@/lib/ai-consent';
import { askQuestion, isSafeAskUrl, parseAskResponse } from '@/lib/ask';
import { OUT_OF_SCOPE_RESPONSE } from '@/lib/scope';

const BASE = 'https://proxy.test';
const IN_SCOPE = 'Which documents are needed for the Anmeldung?';

/** Node'da window yok; device-storage.web.ts'in okuduğu localStorage'ın bellek kopyası. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('askQuestion — izin kapısı (B4)', () => {
  it('sends nothing without consent, even with a configured proxy', async () => {
    const fetchImpl = fakeFetch(200, { status: 'answer', answer: 'A', source_step_ids: [] });
    const result = await askQuestion(IN_SCOPE, 'en', 'anmeldung', { consent: false, baseUrl: BASE, fetchImpl });

    expect(result).toEqual({ status: 'error', error: 'no_consent' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads consent from the device when not passed: none stored → no request', async () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
    try {
      const fetchImpl = fakeFetch(200, { status: 'answer', answer: 'A', source_step_ids: [] });
      const result = await askQuestion(IN_SCOPE, 'en', null, { baseUrl: BASE, fetchImpl });

      expect(result).toEqual({ status: 'error', error: 'no_consent' });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends after consent is granted and stops again after it is revoked', async () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
    try {
      const fetchImpl = fakeFetch(200, { status: 'answer', answer: 'A', source_step_ids: [] });
      grantAiConsent();
      expect(hasAiConsent()).toBe(true);
      await askQuestion(IN_SCOPE, 'en', null, { baseUrl: BASE, fetchImpl });
      expect(fetchImpl).toHaveBeenCalledOnce();

      revokeAiConsent();
      const result = await askQuestion(IN_SCOPE, 'en', null, { baseUrl: BASE, fetchImpl });
      expect(result).toEqual({ status: 'error', error: 'no_consent' });
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('treats consent given to an older consent text as no consent', async () => {
    const storage = memoryStorage();
    storage.setItem('ai_consent_version', `old-${CONSENT_VERSION}`);
    vi.stubGlobal('window', { localStorage: storage });
    try {
      expect(hasAiConsent()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not answer out-of-scope questions locally either without consent', async () => {
    const fetchImpl = fakeFetch(200, {});
    const result = await askQuestion('Should I appeal if rejected?', 'en', null, { consent: false, baseUrl: BASE, fetchImpl });

    expect(result).toEqual({ status: 'error', error: 'no_consent' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('askQuestion', () => {
  it('sends question, lang and step_id to POST /ask', async () => {
    const fetchImpl = fakeFetch(200, { status: 'answer', answer: 'A', source_step_ids: ['anmeldung'] });
    const result = await askQuestion(`  ${IN_SCOPE} `, 'en', 'anmeldung', { consent: true, baseUrl: BASE, fetchImpl });

    expect(result).toEqual({ status: 'answer', answer: 'A', source_step_ids: ['anmeldung'] });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/ask`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ question: IN_SCOPE, lang: 'en', step_id: 'anmeldung' });
  });

  it('answers out-of-scope questions locally without any request', async () => {
    const fetchImpl = fakeFetch(200, {});
    const result = await askQuestion('Should I appeal if rejected?', 'tr', null, { consent: true, baseUrl: BASE, fetchImpl });

    expect(result).toEqual({ status: 'out_of_scope', message: OUT_OF_SCOPE_RESPONSE.tr });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not send anything when no proxy URL is configured', async () => {
    const fetchImpl = fakeFetch(200, {});
    const result = await askQuestion(IN_SCOPE, 'en', null, { consent: true, fetchImpl });

    expect(result).toEqual({ status: 'error', error: 'not_configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects too short and too long questions before sending', async () => {
    const fetchImpl = fakeFetch(200, {});
    expect(await askQuestion('ab', 'en', null, { consent: true, baseUrl: BASE, fetchImpl })).toEqual({ status: 'error', error: 'invalid' });
    expect(await askQuestion('which documents '.repeat(40), 'en', null, { consent: true, baseUrl: BASE, fetchImpl })).toEqual({
      status: 'error',
      error: 'invalid',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'rate_limited'],
    [503, 'unavailable'],
    [502, 'unavailable'],
    [500, 'unavailable'],
    [400, 'invalid'],
    [403, 'invalid'],
  ] as const)('maps HTTP %i to %s', async (status, error) => {
    const result = await askQuestion(IN_SCOPE, 'en', null, { consent: true, baseUrl: BASE, fetchImpl: fakeFetch(status, { error: 'x' }) });
    expect(result).toEqual({ status: 'error', error });
  });

  it('maps a failed connection to network', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await askQuestion(IN_SCOPE, 'en', null, { consent: true, baseUrl: BASE, fetchImpl })).toEqual({ status: 'error', error: 'network' });
  });

  it('aborts after the timeout', async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const result = await askQuestion(IN_SCOPE, 'en', null, { consent: true, baseUrl: BASE, fetchImpl, timeoutMs: 10 });
    expect(result).toEqual({ status: 'error', error: 'timeout' });
  });

  it('treats an unexpected 200 body as invalid', async () => {
    const result = await askQuestion(IN_SCOPE, 'en', null, { consent: true, baseUrl: BASE, fetchImpl: fakeFetch(200, { status: 'answer' }) });
    expect(result).toEqual({ status: 'error', error: 'invalid' });
  });
});

describe('parseAskResponse', () => {
  it('accepts every proxy status', () => {
    expect(parseAskResponse({ status: 'no_answer', source_step_ids: ['schufa'] })).toEqual({
      status: 'no_answer',
      source_step_ids: ['schufa'],
    });
    expect(parseAskResponse({ status: 'no_match' })).toEqual({ status: 'no_match' });
    expect(parseAskResponse({ status: 'out_of_scope', message: 'm' })).toEqual({ status: 'out_of_scope', message: 'm' });
  });

  it('rejects malformed bodies', () => {
    expect(parseAskResponse(null)).toBeNull();
    expect(parseAskResponse({ status: 'answer', answer: 'a', source_step_ids: [1] })).toBeNull();
    expect(parseAskResponse({ status: 'error' })).toBeNull();
  });
});

describe('isSafeAskUrl', () => {
  it('https ve yerel geliştirme adreslerine izin verir', () => {
    expect(isSafeAskUrl('https://pratik-proxy.dalliagac.workers.dev')).toBe(true);
    expect(isSafeAskUrl('http://localhost:8787')).toBe(true);
    expect(isSafeAskUrl('http://127.0.0.1:8787')).toBe(true);
  });

  it('şifresiz uzak adresi ve benzeri hileleri reddeder', () => {
    expect(isSafeAskUrl('http://pratik-proxy.example.com')).toBe(false);
    expect(isSafeAskUrl('http://localhost.evil.com')).toBe(false);
    expect(isSafeAskUrl('ftp://example.com')).toBe(false);
    expect(isSafeAskUrl('pratik-proxy.example.com')).toBe(false);
  });
});
