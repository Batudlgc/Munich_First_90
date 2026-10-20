#!/usr/bin/env node
/**
 * Derleme sonrası CSP kontrolü (build:web'in son adımı).
 *
 * vercel.json'daki Content-Security-Policy iki şeye bağlı:
 *   1. Expo'nun her sayfaya koyduğu tek satır içi script'in SHA-256 özeti
 *      ('sha256-...'). Expo sürümü bu satırı değiştirirse tarayıcı onu engeller.
 *   2. Sor ekranının proxy adresi (EXPO_PUBLIC_ASK_URL) connect-src'de olmalı;
 *      yoksa tarayıcı soruyu göndermez.
 * İkisinden biri tutmazsa bu betik hata verir → Vercel derlemesi başarısız olur
 * → canlıdaki eski (çalışan) sürüm yerinde kalır. Bozuk sürüm yayına çıkmaz.
 *
 * Kullanım: node scripts/check-csp.mjs [dist-web]
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = process.argv[2] ?? join(root, 'dist-web');

const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const csp = vercel.headers
  .flatMap((rule) => rule.headers)
  .find((h) => h.key === 'Content-Security-Policy')?.value;
if (!csp) fail('vercel.json içinde Content-Security-Policy yok.');

const directive = (name) =>
  (csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? '').split(/\s+/).slice(1);

const scriptSrc = directive('script-src');
const connectSrc = directive('connect-src');

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith('.html') ? [path] : [];
  });
}

const problems = [];
const inline = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
for (const file of htmlFiles(dist)) {
  const html = readFileSync(file, 'utf8');
  for (const [, body] of html.matchAll(inline)) {
    if (body.trim() === '') continue;
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    if (!scriptSrc.includes(hash)) problems.push(`${file.slice(dist.length)}: satır içi script CSP'de yok → ${hash}`);
  }
}

const askUrl = process.env.EXPO_PUBLIC_ASK_URL;
if (askUrl) {
  const origin = new URL(askUrl).origin;
  if (!connectSrc.includes(origin)) problems.push(`EXPO_PUBLIC_ASK_URL (${origin}) connect-src'de yok`);
}

if (problems.length > 0) fail(`CSP derlemeyle uyuşmuyor:\n  ${[...new Set(problems)].join('\n  ')}\nvercel.json'u güncelle.`);
console.log(`CSP kontrolü geçti (${htmlFiles(dist).length} HTML dosyası).`);

function fail(message) {
  console.error(`HATA: ${message}`);
  process.exit(1);
}
