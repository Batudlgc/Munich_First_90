#!/usr/bin/env node
// Dış link denetimi: adım JSON'larındaki ve public/*.html'deki http(s) adreslerini
// GET ile dener, 200 dönmeyenleri listeler. Çıkış kodu: 0 = hepsi 200, 1 = en az bir sorun.
//
// Kullanım: node scripts/check-links.mjs
//
// Taranan: src/data/steps/*.json içindeki her http(s) metin değeri (sources,
// appointment.sources, booking_url ve diğer alanlar) + public/*.html içindeki
// href/src adresleri. Çıplak mailto:/tel: ve sayfa içi (#) bağlar taranmaz.
//
// Gerçek tarayıcı User-Agent'ı, 15 sn zaman aşımı, yönlendirmeler takip edilir
// (son durum kodu raporlanır; yönlendirme zinciri sonunda 200 olmayan hata sayılır).
// Aynı adres bir kez denenir (#parça kırpılır), 6'şar paralel.
//
// BULUT NOTU: Bulut oturumunun ağı dış siteleri engelleyebilir. Node'un fetch'i
// varsayılan olarak ortam proxy'sini KULLANMAZ; bulutta hepsi 403 döner ve bu
// KANIT DEĞİLDİR. Bulutta şöyle çalıştır (24.09+ oturumlarda 74 adresten 71'i 200):
//     NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node scripts/check-links.mjs
// Tüm adresler başarısız kalırsa betik "ağ engeli şüphesi" uyarısı basar (çıkış
// kodu yine 1). O durumda betik Batu'nun Mac'inde çalıştırılmalı:
//     node scripts/check-links.mjs
// Bazı resmî siteler (ör. botlara 403/429 dönen CDN'ler) tarayıcıda açılırken bu
// betikte 403 verebilir; böyle adresleri tarayıcıdan elle aç, sonra karar ver.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15_000;
const PARALLEL = 6;

/** adres -> nereden geldiği (ilk birkaç yer) */
const found = new Map();
const add = (url, where) => {
  const clean = url.trim().replace(/#.*$/, '');
  if (!/^https?:\/\//.test(clean)) return;
  if (!found.has(clean)) found.set(clean, []);
  if (found.get(clean).length < 3) found.get(clean).push(where);
};

function walk(node, where) {
  if (typeof node === 'string') add(node, where);
  else if (Array.isArray(node)) node.forEach((n) => walk(n, where));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => walk(n, where));
}

const stepsDir = join(ROOT, 'src/data/steps');
for (const f of readdirSync(stepsDir).filter((x) => x.endsWith('.json'))) {
  walk(JSON.parse(readFileSync(join(stepsDir, f), 'utf8')), `steps/${f}`);
}
const pubDir = join(ROOT, 'public');
for (const f of readdirSync(pubDir).filter((x) => x.endsWith('.html'))) {
  const html = readFileSync(join(pubDir, f), 'utf8');
  for (const m of html.matchAll(/\b(?:href|src)="(https?:\/\/[^"]+)"/g)) add(m[1], `public/${f}`);
}

async function check(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'de,en;q=0.8' },
    });
    await res.body?.cancel().catch(() => {});
    return { status: res.status, final: res.url !== url ? res.url : null };
  } catch (e) {
    return { status: 0, error: e.name === 'AbortError' ? 'zaman aşımı (15 sn)' : String(e.cause?.code ?? e.message ?? e).slice(0, 80) };
  } finally {
    clearTimeout(timer);
  }
}

const urls = [...found.keys()];
const results = new Map();
let next = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (next < urls.length) {
      const u = urls[next++];
      let r = await check(u);
      if (r.status === 0) r = await check(u); // ağ hatası/zaman aşımı: bir kez daha dene
      results.set(u, r);
    }
  })
);

const bad = urls.filter((u) => results.get(u).status !== 200);
console.log(`${urls.length} benzersiz adres tarandı, ${urls.length - bad.length} tanesi 200.`);
for (const u of bad) {
  const r = results.get(u);
  console.log(`\n${r.status || 'HATA'}  ${u}${r.error ? '  (' + r.error + ')' : ''}${r.final ? '\n     -> ' + r.final : ''}\n     ${found.get(u).join(', ')}`);
}
const allFailedSame = bad.length > 5 && bad.length === urls.length;
if (allFailedSame) {
  console.log('\nUYARI: tüm adresler başarısız — büyük olasılıkla ağ engeli (bulut proxy). Betiği Batu’nun Mac’inde çalıştır.');
}
process.exit(bad.length ? 1 : 0);
