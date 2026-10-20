#!/usr/bin/env node
// Uygulama ikonu, splash işareti, favicon, Android ikon katmanları, uygulama içi
// marka PNG'leri ve link önizleme görselini (og.png) TEK bir tanımdan üretir:
// src/constants/brand-mark.json (tasarım sorumlusunun "Brand Identity 2.pdf" dosyasındaki
// "90" logosunun vektör hâli). Tekrar çalıştırılabilir: tasarım değişirse JSON
// değişir, komut yeniden çalışır, bütün dosyalar birlikte güncellenir.
//
// Kullanım:
//   node scripts/make-icon.mjs
//   CDP_PORT=9308 node scripts/make-icon.mjs      # paralel Chrome varsa başka port
//
// Ürettikleri (assets/images/):
//   icon.png                      1024×1024, ALFASIZ (App Store şartı): krem karo + lacivert/mavi işaret
//   icon-dark.png                 1024×1024, alfasız: iOS koyu görünüm ikonu (gece laciverti karo)
//   splash-icon.png               1024×1024 saydam; açık splash (krem zemin) ortasındaki işaret
//   splash-icon-dark.png          1024×1024 saydam; koyu splash (gece laciverti) için açık mavi işaret
//   brand-mark.png / -dark.png    yalnız işaret, saydam, 300 px yükseklik (iOS başlığındaki logo)
//   favicon.png                   48×48, köşeleri yuvarlatılmış krem karo (web sekmesi)
//   android-icon-foreground.png   1024×1024 saydam; işaret Android'in güvenli dairesi içinde
//   android-icon-background.png   1024×1024 düz krem
//   android-icon-monochrome.png   1024×1024 saydam; tek renk işaret (Android 13 temalı ikon)
// public/:
//   apple-touch-icon.png          180×180 opak (iOS ana ekrana ekle; köşeleri iOS yuvarlar)
//   og.png                        1200×630 link önizleme kartı (WhatsApp/Telegram/iMessage), TR + EN
//   icon.svg, favicon-96.png, icon-192.png, icon-512.png   arama motoru / tarayıcı / manifest ikonları
// ve docs/store/ikon-onizleme.png: ikonun 180/60/40/29 px hâli, iOS köşe
// maskesiyle, koyu ve açık duvar kâğıdında.
//
// Nasıl: SVG headless Chrome'da (scripts/chrome-cdp.mjs) tam hedef pikselde
// çizilir, ImageMagick (`convert`) alfa kanalını kaldırır / küçültür,
// `identify` boyutu ve alfayı doğrular. Doğrulama tutmazsa betik hata verir.
//
// TASARIM (20.10.2026, marka PDF'i): "9" ve "0" ortak gövdeli; üst kısım düz
// (açıkta lacivert, koyuda parlak mavi), alt kısım aşağı doğru açılan mavi
// gradyan. Karo: açıkta krem, koyuda gece laciverti. İşaret karonun ~%66'sı.
// Önceki mor damga ikonu bu turla kalktı.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchChrome, renderHtml } from './chrome-cdp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES = join(ROOT, 'assets/images');
const PUBLIC = join(ROOT, 'public');
const PREVIEW = join(ROOT, 'docs/store/ikon-onizleme.png');
const CDP_PORT = Number(process.env.CDP_PORT || 9308);

const MARK = JSON.parse(readFileSync(join(ROOT, 'src/constants/brand-mark.json'), 'utf8'));

// Sayfa renkleri src/constants/theme.ts ile aynı (oradan import edilemiyor: TS +
// react-native). theme.ts'te değişirse burada ve app.json'da da değiştir.
const PAPER = '#FDFAF2'; // Colors.light.background — krem
const INK = '#071739'; // Colors.light.text
const INK2 = '#4A5C7E'; // Colors.light.textSecondary
const BLUE = '#0051C2'; // Colors.light.accent
const CHIP = '#F0F2F5'; // Colors.light.surface

const SIZE = 1024;

/** İşaretin gradyan tanımı (id ile). `mono` verilirse düz tek renk. */
function gradient(id, scheme) {
  const c = MARK[scheme];
  const s = MARK.split / MARK.height;
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="${MARK.height}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${c.top}"/><stop offset="${s}" stop-color="${c.top}"/>
    <stop offset="${s}" stop-color="${c.from}"/><stop offset="1" stop-color="${c.to}"/></linearGradient>`;
}

/**
 * İşaret, `box` kenarlı kare tuvalin ortasında, yüksekliği `ratio` kadar.
 * `fill` bir renk ya da `url(#id)`.
 */
function markAt({ box, ratio, fill }) {
  const s = (box * ratio) / MARK.height;
  const dx = (box - MARK.width * s) / 2;
  const dy = (box - MARK.height * s) / 2;
  return `<g transform="translate(${dx} ${dy}) scale(${s})"><path d="${MARK.path}" fill-rule="evenodd" fill="${fill}"/></g>`;
}

const svg = ({ w = SIZE, h = SIZE, defs = '', background, body }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<defs>${defs}</defs>` +
  (background ? `<rect width="${w}" height="${h}" fill="${background}"/>` : '') +
  body +
  '</svg>';

const page = (content, extraHead = '') =>
  `<!doctype html><html><head>${extraHead}</head><body style="margin:0;background:transparent">${content}</body></html>`;

/** Uygulama ikonu karosu (köşeler kare — iOS kendisi yuvarlar). */
const tileSvg = (scheme) =>
  svg({
    defs: gradient('g', scheme),
    background: MARK[scheme].tile,
    body: markAt({ box: SIZE, ratio: 0.66, fill: 'url(#g)' }),
  });

// Android uyarlanabilir ikon: 108 dp tuvalin ortasındaki 66 dp'lik daire her
// maske şeklinde görünür. İşaretin köşegeni yükseklikle ~1,4 kat; 0,42 oranla
// ~600 px → güvenli dairenin (%61 ≈ 625 px) içinde.
const ANDROID_RATIO = 0.42;

const ASSETS = [
  { file: 'icon.png', transparent: false, html: tileSvg('light') },
  { file: 'icon-dark.png', transparent: false, html: tileSvg('dark') },
  {
    file: 'splash-icon.png',
    transparent: true,
    html: svg({ defs: gradient('g', 'light'), body: markAt({ box: SIZE, ratio: 0.62, fill: 'url(#g)' }) }),
  },
  {
    file: 'splash-icon-dark.png',
    transparent: true,
    html: svg({ defs: gradient('g', 'dark'), body: markAt({ box: SIZE, ratio: 0.62, fill: 'url(#g)' }) }),
  },
  {
    file: 'android-icon-foreground.png',
    transparent: true,
    html: svg({ defs: gradient('g', 'light'), body: markAt({ box: SIZE, ratio: ANDROID_RATIO, fill: 'url(#g)' }) }),
  },
  { file: 'android-icon-background.png', transparent: false, html: svg({ background: MARK.light.tile, body: '' }) },
  {
    file: 'android-icon-monochrome.png',
    transparent: true,
    html: svg({ body: markAt({ box: SIZE, ratio: ANDROID_RATIO, fill: '#000000' }) }),
  },
];

const tmp = mkdtempSync(join(tmpdir(), 'pratik-icon-'));
const magick = (args) => execFileSync('convert', args);
const info = (file) => execFileSync('identify', ['-format', '%w %h %A', file], { encoding: 'utf8' }).trim();

// og.png için Figtree (repodaki OFL dosyaları), veri adresi olarak gömülü:
// about:blank sayfası file:// yükleyemez.
const font = (file, weight) =>
  `@font-face{font-family:F;font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(join(ROOT, 'assets/fonts', file)).toString('base64')})}`;
const FONTS = `<style>${font('Figtree-Regular.ttf', 400)}${font('Figtree-SemiBold.ttf', 600)}${font('Figtree-ExtraBold.ttf', 800)}</style>`;

/**
 * Link önizleme kartı. Önizleyici botlar dil seçimini görmez; paylaşım ağırlıkla
 * Türk öğrencilere gittiği için Türkçe önce, İngilizce ikinci (web-head.web.tsx
 * ile aynı karar). Yalnız sitede zaten yazan olgular: 11 zorunlu adım, ücretsiz,
 * hesapsız, üç dil.
 */
const OG = `
<div style="width:1200px;height:630px;box-sizing:border-box;background:${PAPER};font-family:F,sans-serif;color:${INK};padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between">
  <div style="display:flex;align-items:center;gap:22px">
    ${svg({ w: 88, h: 88, defs: gradient('t', 'light'), body: `<rect width="88" height="88" rx="20" fill="${MARK.light.tile}" stroke="#E6E1D3" stroke-width="2"/>` + markAt({ box: 88, ratio: 0.62, fill: 'url(#t)' }) })}
    <div style="font-weight:800;font-size:34px;line-height:1.05;letter-spacing:-0.3px">Munich<br>First 90</div>
  </div>
  <div>
    <div style="font-weight:800;font-size:96px;line-height:1;letter-spacing:-2px">Münih’te ilk 90 gün</div>
    <div style="font-weight:600;font-size:40px;line-height:1.2;color:${INK2};margin-top:18px">Your first 90 days in Munich</div>
  </div>
  <div style="display:flex;gap:14px;font-weight:600;font-size:26px;color:${BLUE}">
    <span style="background:${CHIP};border-radius:999px;padding:12px 24px">Anmeldung · Bank · Versicherung</span>
    <span style="background:${CHIP};border-radius:999px;padding:12px 24px">Ücretsiz · Free</span>
    <span style="background:${CHIP};border-radius:999px;padding:12px 24px">TR · EN · DE</span>
  </div>
</div>`;

const { send, close } = await launchChrome({ port: CDP_PORT });
try {
  for (const asset of ASSETS) {
    const raw = join(tmp, asset.file);
    writeFileSync(raw, await renderHtml(send, page(asset.html), { width: SIZE, height: SIZE, transparent: asset.transparent }));
    const out = join(IMAGES, asset.file);
    // -strip: tarih/yazılım meta verisi PNG'ye girmez → aynı tasarım aynı bayt
    // üretir. Opak dosyada -alpha off: App Store alfa kanallı ikonu reddeder.
    magick([raw, ...(asset.transparent ? [] : ['-alpha', 'off']), '-strip', out]);
    console.log(`  ${asset.file.padEnd(30)} ${info(out)}`);
  }

  // Uygulama içi marka PNG'leri (iOS başlığı): yalnız işaret, saydam. 1024'te
  // çizilip kırpılır; 300 px yükseklik 3x ekranda 100 pt'ye kadar keskin.
  for (const [file, scheme] of [['brand-mark.png', 'light'], ['brand-mark-dark.png', 'dark']]) {
    const raw = join(tmp, file);
    writeFileSync(
      raw,
      await renderHtml(send, page(svg({ defs: gradient('g', scheme), body: markAt({ box: SIZE, ratio: 0.9, fill: 'url(#g)' }) })), {
        width: SIZE,
        height: SIZE,
        transparent: true,
      })
    );
    magick([raw, '-trim', '+repage', '-resize', 'x300', '-strip', join(IMAGES, file)]);
    console.log(`  ${file.padEnd(30)} ${info(join(IMAGES, file))}`);
  }

  // Favicon ve apple-touch-icon: krem karo. Favicon köşeleri yuvarlatılmış
  // (sekme çubuğunda uygulama ikonu gibi dursun); apple-touch-icon opak kare.
  const favRaw = join(tmp, 'favicon.png');
  writeFileSync(
    favRaw,
    await renderHtml(
      send,
      page(`<div style="width:${SIZE}px;height:${SIZE}px;border-radius:${SIZE * 0.22}px;overflow:hidden">${svg({ defs: gradient('g', 'light'), background: MARK.light.tile, body: markAt({ box: SIZE, ratio: 0.7, fill: 'url(#g)' }) })}</div>`),
      { width: SIZE, height: SIZE, transparent: true }
    )
  );
  magick([favRaw, '-resize', '48x48', '-strip', join(IMAGES, 'favicon.png')]);
  console.log(`  ${'favicon.png'.padEnd(30)} ${info(join(IMAGES, 'favicon.png'))}`);
  magick([join(IMAGES, 'icon.png'), '-resize', '180x180', '-alpha', 'off', '-strip', join(PUBLIC, 'apple-touch-icon.png')]);
  console.log(`  ${'public/apple-touch-icon.png'.padEnd(30)} ${info(join(PUBLIC, 'apple-touch-icon.png'))}`);

  // Arama motorları ve tarayıcılar için ek ikonlar (20.10: Google sonuçlarında eski mor
  // damga favicon'u önbellekte kaldı). Google 48'in katı kare ikon ister; HTML'de
  // <link rel="icon"> ile adres verilince bir sonraki taramada yenisini alır.
  //   icon.svg        vektör karo (modern tarayıcılar, her boyutta keskin)
  //   favicon-96.png  / icon-192.png / icon-512.png  (rel=icon sizes + web manifest)
  const tileRounded = (scheme) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><defs>${gradient('g', scheme)}</defs>` +
    `<rect width="${SIZE}" height="${SIZE}" rx="${SIZE * 0.22}" fill="${MARK[scheme].tile}"/>` +
    markAt({ box: SIZE, ratio: 0.7, fill: 'url(#g)' }) +
    '</svg>';
  writeFileSync(join(PUBLIC, 'icon.svg'), tileRounded('light') + '\n');
  console.log(`  ${'public/icon.svg'.padEnd(30)} vektör`);
  const roundRaw = join(tmp, 'icon-round.png');
  writeFileSync(roundRaw, await renderHtml(send, page(tileRounded('light')), { width: SIZE, height: SIZE, transparent: true }));
  for (const [file, px] of [['favicon-96.png', 96], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    magick([roundRaw, '-resize', `${px}x${px}`, '-strip', join(PUBLIC, file)]);
    console.log(`  ${('public/' + file).padEnd(30)} ${info(join(PUBLIC, file))}`);
  }

  const ogRaw = join(tmp, 'og.png');
  writeFileSync(ogRaw, await renderHtml(send, page(OG, FONTS), { width: 1200, height: 630 }));
  magick([ogRaw, '-alpha', 'off', '-strip', join(PUBLIC, 'og.png')]);
  console.log(`  ${'public/og.png'.padEnd(30)} ${info(join(PUBLIC, 'og.png'))}`);
} finally {
  await close();
}

// --- doğrulama: App Store ikonları 1024×1024 ve alfasız olmak zorunda ---
for (const file of ['icon.png', 'icon-dark.png']) {
  const [w, h, alpha] = info(join(IMAGES, file)).split(' ');
  if (w !== '1024' || h !== '1024' || !['False', 'Undefined'].includes(alpha)) {
    console.error(`HATA: ${file} ${w}×${h}, alfa=${alpha} — 1024×1024 ve alfasız olmalı.`);
    process.exit(1);
  }
}

// --- küçük boyut önizlemesi: 180, 60, 40, 29 px — iOS köşe maskesi (%22,37
// yarıçap yaklaşımı), koyu ve açık duvar kâğıdında; üst sıra açık ikon, alt
// sıra koyu ikon.
const tiles = [];
for (const [iconFile, wallpaper] of [['icon.png', '#DFE6F0'], ['icon.png', '#2B2F3A'], ['icon-dark.png', '#2B2F3A']]) {
  for (const s of [180, 60, 40, 29]) {
    const r = Math.round(s * 0.2237);
    const tile = join(tmp, `tile-${iconFile}-${wallpaper.slice(1)}-${s}.png`);
    magick([
      join(IMAGES, iconFile), '-resize', `${s}x${s}`, '-alpha', 'set',
      '(', '-size', `${s}x${s}`, 'xc:black', '-fill', 'white', '-draw', `roundrectangle 0,0,${s - 1},${s - 1},${r},${r}`, ')',
      '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', '-compose', 'over',
      '-background', wallpaper, '-gravity', 'center', '-extent', '200x200', tile,
    ]);
    tiles.push(tile);
  }
}
execFileSync('montage', [...tiles, '-tile', '4x', '-geometry', '200x200+0+0', '-strip', PREVIEW]);
console.log(`  önizleme: ${PREVIEW}`);

rmSync(tmp, { recursive: true, force: true });
