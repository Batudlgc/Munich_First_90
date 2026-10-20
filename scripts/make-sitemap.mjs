#!/usr/bin/env node
/**
 * Derleme sonrası sitemap.xml + robots.txt üretir (build:web'in bir adımı).
 *
 * Neden derlemede: adım listesi src/data/steps/*.json'dan okunur; yeni adım
 * eklenince harita kendiliğinden güncellenir, elle bakım gerekmez.
 * Impressum bilerek haritada yok ve noindex (ev adresi aranınca çıkmasın, CILA).
 *
 * Kullanım: node scripts/make-sitemap.mjs [dist-web]
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = process.argv[2] ?? join(root, 'dist-web');
const site = (process.env.EXPO_PUBLIC_SITE_URL ?? 'https://munichfirst90.com').replace(/\/$/, '');

const stepIds = readdirSync(join(root, 'src/data/steps'))
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''))
  .sort();

const paths = ['/', '/sor', '/explore', '/hakkinda', ...stepIds.map((id) => `/adim/${id}`), '/privacy', '/support'];
const today = new Date().toISOString().slice(0, 10);

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...paths.map((path) => `  <url><loc>${site}${path === '/' ? '/' : path}</loc><lastmod>${today}</lastmod></url>`),
  '</urlset>',
  '',
].join('\n');

const robots = ['User-agent: *', 'Allow: /', '', `Sitemap: ${site}/sitemap.xml`, ''].join('\n');

writeFileSync(join(dist, 'sitemap.xml'), xml);
writeFileSync(join(dist, 'robots.txt'), robots);
console.log(`sitemap.xml: ${paths.length} adres · robots.txt yazıldı.`);
