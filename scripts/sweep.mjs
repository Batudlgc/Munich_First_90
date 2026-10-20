#!/usr/bin/env node
// Lansman öncesi kalite taraması (L4): rota × dil × tema × genişlik matrisi.
//
// Ne yapar: dist-web'i yerel statik sunucuda (scripts/serve_with_headers.py)
// açar, headless Chrome'u CDP ile sürer (scripts/chrome-cdp.mjs) ve her
// kombinasyonda sayfayı denetler:
//   · yatay taşma (belge + sağa taşan öğe)
//   · kesilen metin (overflow:hidden/clip + line-clamp)
//   · çevrilmemiş/ham arayüz anahtarı ("detail.xxx" gibi)
//   · seçili dil dışı dilden sızan arayüz metni (stopword sezgisi; elle gözden geçirilir)
//   · konsol hatası / yakalanmamış istisna / başarısız istek
//   · kırık iç link, kırık <img>
//   · masaüstünde aşırı geniş satır (px ve yaklaşık karakter)
//   · <title>, <html lang>, og/twitter etiketleri
// Sonuç: OUT/report.json + OUT/matrix.md. Ekran görüntüleri OUT/shots/ altına.
//
// Kullanım (dist-web önceden `npm run build:web` ile üretilmiş olmalı):
//   node scripts/sweep.mjs                       # tam matris (~15-25 dk)
//   ROUTES=/,/sor LANGS=tr WIDTHS=390 node scripts/sweep.mjs
//   SHOTS=none node scripts/sweep.mjs            # yalnız denetim, görüntü yok
//   node scripts/sweep.mjs flows                 # akış testleri (bkz. aşağıda)
//
// Ortam: OUT (varsayılan <scratch>/sweep), PORT (8123), CDP_PORT (9340),
// SHOTS=all|flagged|none (varsayılan flagged), ROUTES, LANGS, THEMES, WIDTHS.
//
// SINIR: Bu web render'ıdır (Chrome). iOS Simulator değildir. Dil sızıntısı
// sezgiseldir; yanlış pozitif verebilir (resmî Almanca ad TR sayfada geçer).
import { Buffer } from 'node:buffer';

import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluate, launchChrome } from './chrome-cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.env.DIST ?? join(ROOT, 'dist-web');
const PORT = Number(process.env.PORT ?? 8123);
const CDP_PORT = Number(process.env.CDP_PORT ?? 9340);
const OUT = process.env.OUT ?? join(ROOT, 'docs/screenshots/sweep');
const SHOTS = process.env.SHOTS ?? 'flagged';
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STEP_IDS = readdirSync(join(ROOT, 'src/data/steps'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));
const ALL_ROUTES = [
  '/',
  ...STEP_IDS.map((id) => `/adim/${id}`),
  '/sor',
  '/explore',
  '/hakkinda',
  '/privacy',
  '/support',
  '/zz-yok-boyle-bir-sayfa',
];
const list = (name, all) => (process.env[name] ? process.env[name].split(',') : all);
const ROUTES = list('ROUTES', ALL_ROUTES);
const LANGS = list('LANGS', ['tr', 'en', 'de']);
const THEMES = list('THEMES', ['light', 'dark']);
const WIDTHS = list('WIDTHS', ['360', '390', '430', '1280']).map(Number);

mkdirSync(join(OUT, 'shots'), { recursive: true });

// ---------------------------------------------------------------- sunucu + Chrome
const server = spawn('python3', [join(ROOT, 'scripts/serve_with_headers.py'), DIST, String(PORT)], { stdio: 'ignore' });
for (let i = 0; i < 40; i++) {
  try {
    await fetch(BASE + '/');
    break;
  } catch {
    await sleep(150);
  }
}
const { send, close, on } = await launchChrome({ port: CDP_PORT });
let consoleErrors = [];
on('Runtime.exceptionThrown', (p) =>
  consoleErrors.push('exception: ' + (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '?').slice(0, 200))
);
on('Runtime.consoleAPICalled', (p) => {
  if (p.type === 'error') consoleErrors.push('console.error: ' + p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
});
on('Log.entryAdded', (p) => {
  if (p.entry.level === 'error' && !/127\.0\.0\.1:9\b/.test(p.entry.url ?? '') && !/ERR_CONNECTION_REFUSED/.test(p.entry.text)) consoleErrors.push(`log: ${p.entry.text} ${p.entry.url ?? ''}`.slice(0, 200));
});
await send('Log.enable');
await send('Network.enable');
const failedRequests = [];
on('Network.loadingFailed', (p) => {
  if (!p.canceled) failedRequests.push(`${p.errorText} ${p.requestId}`);
});
const shutdown = async () => {
  server.kill();
  await close();
};
process.on('SIGINT', async () => {
  await shutdown();
  process.exit(130);
});

// ---------------------------------------------------------------- sayfa içi denetim
// Sayfa bağlamında çalışan tek ifade. Dönüş: düz nesne (JSON).
const AUDIT = `(() => {
  const lang = document.documentElement.lang;
  const wanted = window.__SWEEP_LANG;
  const EN = new Set('the and with your you for are this that from will which what when how have before after within until must should about'.split(' '));
  const DE = new Set('und der die das nicht für mit wird werden ist sind bei auf oder ein eine einen zum zur von dem nach wenn kann muss sich auch vor'.split(' '));
  const TR = new Set('ve bir için ile olarak gerekli değil veya bu çok her daha ya da gibi kadar sonra önce olan'.split(' '));
  const STOP = { en: EN, de: DE, tr: TR };
  const vw = window.innerWidth;
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const short = (s) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, 70);
  const out = { overflow: [], clipped: [], rawKeys: [], leaks: [], wide: [], brokenImgs: [], links: [], buttonsNoLabel: 0, smallTargets: 0 };

  if (document.documentElement.scrollWidth > vw + 1) out.overflow.push('belge scrollWidth=' + document.documentElement.scrollWidth + ' > ' + vw);
  const seenOverflow = new Set();
  document.querySelectorAll('body *').forEach((el) => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    // Kaydırılabilir bir kabın İÇİNDEKİ taşma meşru (ör. yatay şerit): kabın kendisi ölçülür.
    if (r.right > vw + 1 && r.left < vw) {
      const k = el.tagName + Math.round(r.right);
      if (!seenOverflow.has(k)) { seenOverflow.add(k); out.overflow.push(Math.round(r.right) + 'px ' + el.tagName + ' "' + short(el.textContent) + '"'); }
    }
  });

  document.querySelectorAll('body *').forEach((el) => {
    if (!vis(el)) return;
    const cs = getComputedStyle(el);
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim();
    if (own) {
      const clip = cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none';
      const urlLike = /^[a-z0-9._~\/-]+$/i.test(own); // kaynak adresi yolu: tek satır + ellipsis KASITLI
      if (clip && !urlLike && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
        out.clipped.push(Math.round(el.scrollWidth) + 'x' + Math.round(el.scrollHeight) + ' > ' + el.clientWidth + 'x' + el.clientHeight + ' "' + short(own) + '"');
      }
      // ham anahtar
      const m = own.match(/\\b(?:detail|ask|home|tabs|phase|glossary|about|onboarding|appt|stamp|state|notFound|a11y|legal)\\.[A-Za-z0-9_.]+/);
      if (m) out.rawKeys.push(m[0]);
      // dil sızıntısı (resmî terimler stopword içermediği için geçer)
      if (wanted && cs.fontFamily && !urlLike) {
        const words = own.toLowerCase().replace(/[^a-zäöüßçğıöşü ]+/g, ' ').split(/\\s+/).filter(Boolean);
        for (const [code, set] of Object.entries(STOP)) {
          if (code === wanted) continue;
          const hits = [...new Set(words.filter((w) => set.has(w)))];
          if (hits.length >= 2 || (hits.length === 1 && words.length <= 5 && words.length >= 1 && hits[0].length > 2)) {
            out.leaks.push(code + ': ' + hits.join('/') + ' | "' + short(own) + '"');
            break;
          }
        }
      }
      // masaüstünde aşırı geniş satır
      if (own.length > 90) {
        const r = el.getBoundingClientRect();
        const fs = parseFloat(cs.fontSize);
        if (r.width > 760) out.wide.push(Math.round(r.width) + 'px (~' + Math.round(r.width / (fs * 0.5)) + ' kar.) "' + short(own) + '"');
      }
    }
    if (el.tagName === 'IMG' && (!el.complete || el.naturalWidth === 0)) out.brokenImgs.push(el.src.slice(0, 80));
    const label = el.getAttribute('aria-label');
    // ham anahtar erişilebilirlik etiketinde
    if (label && /\\b(?:detail|ask|home|tabs|phase|glossary|about|onboarding|appt|stamp|state|notFound|a11y|legal)\\.[A-Za-z0-9_.]+/.test(label)) out.rawKeys.push('aria-label: ' + label);
  });

  document.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href');
    if (h && !h.startsWith('#') && !h.startsWith('mailto:') && !h.startsWith('tel:')) out.links.push(h);
  });
  document.querySelectorAll('[role="button"],button').forEach((el) => {
    if (!vis(el)) return;
    if (!(el.getAttribute('aria-label') || el.textContent || '').trim()) out.buttonsNoLabel++;
  });
  out.title = document.title;
  out.htmlLang = lang;
  out.h1 = [...document.querySelectorAll('h1')].map((h) => short(h.textContent)).slice(0, 2);
  out.meta = Object.fromEntries(
    [...document.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"],meta[name="description"]')].map((m) => [m.getAttribute('property') || m.getAttribute('name'), m.content])
  );
  out.textLen = document.body.innerText.length;
  // sayfanın tam yüksekliği (RN Web iç kaydırıcısı dahil)
  let h = document.documentElement.scrollHeight;
  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > h) h = el.scrollHeight;
  });
  out.fullHeight = h;
  return out;
})()`;

// ---------------------------------------------------------------- yardımcılar
let seedScriptId = null;
async function open(route, { lang, theme, width, seed = true, clear = false }) {
  const mobile = width <= 500;
  await send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  if (seedScriptId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seedScriptId });
  const items = {};
  if (seed) {
    items.onboarding_seen = 'true';
    if (lang) items.app_language = lang;
  }
  const src = `try{${clear ? "if(!sessionStorage.getItem('__sweep_cleared')){localStorage.clear();sessionStorage.setItem('__sweep_cleared','1');}" : ''}for(const [k,v] of Object.entries(${JSON.stringify(items)}))if(localStorage.getItem(k)===null||!sessionStorage.getItem('__sweep_seeded'))localStorage.setItem(k,v);sessionStorage.setItem('__sweep_seeded','1');}catch(e){}window.__SWEEP_LANG=${JSON.stringify(lang ?? null)};`;
  seedScriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: src })).identifier;
  consoleErrors = [];
  failedRequests.length = 0;
  await evaluate(send, 'sessionStorage.clear()').catch(() => {}); // her açılış taze başlar; yenilemeler (reload) oturumu korur
  await send('Page.navigate', { url: BASE + route });
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    const n = await evaluate(send, 'document.body ? document.body.innerText.length : 0').catch(() => 0);
    if (n > 30) break;
  }
  await evaluate(send, 'document.fonts.ready.then(() => true)').catch(() => {});
  await sleep(450); // damga/animasyon oturur
  // Kapalı bölümler (ana ekranda "Gerekirse", adım sayfasında akordeonlar) açılır:
  // içlerindeki metin de denetlenmeli.
  const opened = await evaluate(
    send,
    `(() => { const c = [...document.querySelectorAll('[aria-expanded="false"]')]; c.forEach((e) => e.click()); return c.length; })()`
  ).catch(() => 0);
  if (opened) await sleep(450);
}

async function shot(file, fullHeight, width) {
  const mobile = width <= 500;
  // +96: sabit sekme çubuğu kaydırıcının yüksekliğinden düşüyor; tam içerik sığsın.
  const h = Math.min(Math.max(fullHeight + 96, mobile ? 844 : 900), 6000);
  await send('Emulation.setDeviceMetricsOverride', { width, height: h, deviceScaleFactor: 1, mobile });
  await sleep(200);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.data, 'base64'));
}

const stepIdOk = (href) => {
  const m = href.match(/^\/adim\/([^/?#]+)/);
  return !m || STEP_IDS.includes(m[1]);
};
const linkCache = new Map();
async function linkStatus(href) {
  if (!linkCache.has(href)) {
    const abs = href.startsWith('http') ? href : BASE + href;
    linkCache.set(href, await fetch(abs, { redirect: 'manual' }).then((r) => r.status).catch(() => 0));
  }
  return linkCache.get(href);
}

// ---------------------------------------------------------------- akışlar
async function flows() {
  const results = [];
  const rec = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'GEÇTİ ' : 'KUSUR '} ${name}${detail ? ' — ' + detail : ''}`);
  };
  const txt = () => evaluate(send, 'document.body.innerText');
  const click = (label) =>
    evaluate(
      send,
      `(() => { const l = ${JSON.stringify(label)};
        const el = [...document.querySelectorAll('[role="button"],[role="link"],button,a,[role="switch"],[role="checkbox"],[role="radio"],[role="tab"],[aria-label]')].find((n) => (n.getAttribute('aria-label') || n.textContent || '').trim() === l);
        if (!el) return false; el.click(); return true; })()`
    );
  const typeInto = async (text) => {
    await evaluate(send, `document.querySelector('textarea,input[type="text"],input:not([type])')?.focus()`);
    await send('Input.insertText', { text });
  };
  const m = { width: 390, theme: 'light' };

  // 1) ilk açılış (web, 08.10 yeniden tasarım): tanıtım katmanı YOK, ana sayfa
  // giriş bandıyla açılır; dil tarayıcıdan (Chrome en-US) gelir, başlıktan değişir.
  await open('/', { ...m, seed: false, clear: true });
  let t = await txt();
  rec('ilk açılış: giriş bandı görünür (EN)', /Your first 90 days in Munich/.test(t), t.slice(0, 80).replace(/\n/g, ' | '));
  await shot(join(OUT, 'shots/flow-home-en.png'), 1100, 390);
  rec('dil seçimi: Türkçe tıklanır', await click('Türkçe'));
  await sleep(500);
  t = await txt();
  rec('ana ekran TR açılır', /Münih'te ilk 90 gün/.test(t) && !/Your first 90 days/.test(t), t.slice(0, 100).replace(/\n/g, ' | '));
  await shot(join(OUT, 'shots/flow-home-tr.png'), 1100, 390);
  await send('Page.reload');
  await sleep(2200);
  t = await txt();
  rec('yenileme: dil TR korunuyor', /Münih'te ilk 90 gün/.test(t), '');

  // 2) damgalama + geri alma + yenilemede kalıcılık (adım sayfası, TR)
  await open('/adim/anmeldung', { ...m, lang: 'tr', clear: true });
  rec('damga: "Bunu hallettim" bulundu', await click('Bunu hallettim'));
  await sleep(1500);
  t = await txt();
  rec('damga: geri alma düğmesi çıktı', /Geri al/.test(t));
  await shot(join(OUT, 'shots/flow-stamped-tr.png'), 1400, 390);
  await send('Page.reload');
  await sleep(2200);
  t = await txt();
  rec('damga: yenilemede kalıcı', /Geri al/.test(t));
  await open('/', { ...m, lang: 'tr' });
  t = await txt();
  rec('damga: ana ekran sayacı güncel', /1\s*\/\s*\d+|1 adım damgalandı|1\s+\d+\s*adım damgalandı/.test(t) || /damgalandı/.test(t), (t.match(/.{0,20}damgalandı.{0,10}/) || [''])[0]);
  await open('/adim/anmeldung', { ...m, lang: 'tr' });
  rec('damga geri al: tıklanır', await click('Geri al'));
  await sleep(1200);
  t = await txt();
  rec('damga geri al: yeniden damgalanabilir', /Bunu hallettim/.test(t));
  await send('Page.reload');
  await sleep(2200);
  t = await txt();
  rec('damga geri al: yenilemede kalıcı', /Bunu hallettim/.test(t) && !/Geri al/.test(t));

  // 3) Sor: izin ver → izni geri çek (TR)
  await open('/sor', { ...m, lang: 'tr', clear: true });
  t = await txt();
  rec('sor: izin ekranı görünür, kutu yok', /Kabul ediyorum/.test(t) && !(await evaluate(send, '!!document.querySelector("textarea")')));
  await shot(join(OUT, 'shots/flow-sor-izin-tr.png'), 2000, 390);
  rec('sor: izin verilir', await click('Kabul ediyorum'));
  await sleep(700);
  rec('sor: soru kutusu açıldı', await evaluate(send, '!!document.querySelector("textarea")'));
  await send('Page.reload');
  await sleep(2200);
  rec('sor: izin yenilemede korunuyor', await evaluate(send, '!!document.querySelector("textarea")'));
  rec('sor: izin geri çekilir', await click('Sor iznini geri al'));
  await sleep(700);
  t = await txt();
  rec('sor: izin geri çekilince izin ekranı döner', /Kabul ediyorum/.test(t) && !(await evaluate(send, '!!document.querySelector("textarea")')));

  // 4) çevrilimdışı Sor: izin ver → ağ kes → gönder (derleme ASK_URL ile yapılmış olmalı)
  await open('/sor', { ...m, lang: 'tr', clear: true });
  await click('Kabul ediyorum');
  await sleep(600);
  await typeInto('Anmeldung için hangi belgeler gerekiyor?');
  await sleep(300);
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  const sent = await click('Soruyu gönder');
  await sleep(2500);
  t = await txt();
  await shot(join(OUT, 'shots/flow-sor-offline-tr.png'), 1600, 390);
  const net = /Bağlantı kurulamadı/.test(t);
  const nc = /bu sürümde henüz bağlı değil/.test(t);
  rec('sor çevrimdışı: bağlantı mesajı', sent && net, nc ? 'derleme EXPO_PUBLIC_ASK_URL olmadan: "bağlı değil" görüldü, çevrimdışı yolu doğrulanamadı' : (t.match(/.{0,40}(Bağlantı|bağlı|hata).{0,60}/i) || [''])[0]);
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  writeFileSync(join(OUT, 'flows.json'), JSON.stringify(results, null, 2));
  return results.filter((r) => !r.ok).length;
}

// ---------------------------------------------------------------- ana döngü
if (process.argv[2] === 'flows') {
  const bad = await flows();
  await shutdown();
  process.exit(bad ? 1 : 0);
}

const report = [];
let n = 0;
const total = ROUTES.length * LANGS.length * THEMES.length * WIDTHS.length;
for (const route of ROUTES) {
  for (const lang of LANGS) {
    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        n++;
        let a;
        try {
          await open(route, { lang, theme, width });
          a = await evaluate(send, AUDIT);
        } catch (e) {
          report.push({ route, lang, theme, width, fatal: String(e).slice(0, 200) });
          console.log(`[${n}/${total}] ${route} ${lang} ${theme} ${width}: HATA ${e}`);
          continue;
        }
        const defects = [];
        if (a.overflow.length) defects.push(['taşma', a.overflow.slice(0, 4)]);
        if (a.clipped.length) defects.push(['kesilen metin', a.clipped.slice(0, 4)]);
        if (a.rawKeys.length) defects.push(['ham anahtar', a.rawKeys.slice(0, 4)]);
        if (a.leaks.length) defects.push(['dil sızıntısı?', a.leaks.slice(0, 6)]);
        if (a.brokenImgs.length) defects.push(['kırık görsel', a.brokenImgs]);
        if (a.buttonsNoLabel) defects.push(['etiketsiz düğme', [String(a.buttonsNoLabel)]]);
        if (width >= 1000 && a.wide.length) defects.push(['geniş satır', a.wide.slice(0, 3)]);
        if (consoleErrors.length) defects.push(['konsol', [...new Set(consoleErrors)].slice(0, 3)]);
        const bad = a.links.filter((h) => !stepIdOk(h));
        for (const h of new Set(a.links.filter((l) => l.startsWith('/')))) {
          const s = await linkStatus(h);
          if (s !== 200 && s !== 301 && s !== 308) bad.push(`${h} -> ${s}`);
        }
        if (bad.length) defects.push(['kırık iç link', bad.slice(0, 4)]);
        if (route !== '/zz-yok-boyle-bir-sayfa' && a.textLen < 40) defects.push(['boş sayfa', [String(a.textLen)]]);
        if (a.htmlLang !== lang && !route.match(/privacy|support/)) defects.push(['<html lang>', [`${a.htmlLang} != ${lang}`]]);
        const id = `${route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_')}_${lang}_${theme}_${width}`;
        if (SHOTS === 'all' || (SHOTS === 'flagged' && defects.length)) await shot(join(OUT, 'shots', id + '.png'), a.fullHeight, width);
        report.push({ route, lang, theme, width, title: a.title, htmlLang: a.htmlLang, h1: a.h1, meta: a.meta, defects });
        console.log(`[${n}/${total}] ${route} ${lang} ${theme} ${width}: ${defects.length ? 'KUSUR ' + defects.map((d) => d[0]).join(',') : 'geçti'}`);
      }
    }
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));

// Özet: kusur türü × sayı, ilk örnek.
const byKind = {};
for (const r of report)
  for (const [kind, ex] of r.defects ?? []) {
    byKind[kind] ??= { count: 0, examples: new Map() };
    byKind[kind].count++;
    for (const e of ex) if (!byKind[kind].examples.has(e)) byKind[kind].examples.set(e, `${r.route} ${r.lang} ${r.theme} ${r.width}`);
  }
let md = `# Tarama özeti\n\n${report.length} kombinasyon, ${report.filter((r) => r.defects?.length || r.fatal).length} kusurlu.\n\n`;
for (const [kind, v] of Object.entries(byKind)) {
  md += `## ${kind} (${v.count})\n`;
  for (const [e, where] of [...v.examples].slice(0, 25)) md += `- ${e}  ← ${where}\n`;
  md += '\n';
}
writeFileSync(join(OUT, 'matrix.md'), md);
console.log('\n' + md);
await shutdown();
