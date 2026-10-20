#!/usr/bin/env node
// Tek bir rotanın ekran görüntüsünü GERÇEK mobil viewport'ta alır ve
// sayfayı otomatik denetler (yatay taşma + 44pt dokunma alanı).
//
// NEDEN CDP: headless Chrome'un `--window-size` bayrağı `--screenshot` ile
// birlikte kullanıldığında sayfanın YERLEŞİM genişliğini belirlemiyor; sayfa
// varsayılan masaüstü genişliğinde (ölçülen: 500px) yerleşiyor ve çıktı
// yalnızca 390px'e KIRPILIYOR. Sonuç, ekrandan taşıyormuş gibi görünen ama
// aslında sadece kırpılmış bir görüntü — yani yanıltıcı bir doğrulama.
// Emulation.setDeviceMetricsOverride gerçek viewport'u dayatır.
//
// Node 24'ün yerleşik fetch ve WebSocket'ini kullanır; ek bağımlılık yoktur.
//
// Kullanım: node scripts/shot.mjs <url> <çıktı.png> [genişlik] [yükseklik] [fontScale]
//
// Ortam değişkenleri:
//   SEED_STORAGE  JSON nesnesi; sayfa yüklenmeden ÖNCE localStorage'a yazılır.
//                 (ör. tanıtım ekranlarını atlamak için {"onboarding_seen":"true"})
//   CLEAR_STORAGE 1 ise sayfa yüklenmeden önce localStorage temizlenir.
//                 GEREKLİ: localStorage aynı kaynakta gezinmeler arasında
//                 kalıcı, bu yüzden bir önceki rotanın tohumu sonraki rotaya
//                 sızıyor ve "ilk açılış" davranışı hiç görüntülenemiyordu.
//   CLICK_LABEL   Görüntü alınmadan önce tıklanacak öğenin erişilebilir adı.
//   CLICK_COUNT   Kaç kez tıklanacağı (varsayılan 0). Çok adımlı akışların
//                 (tanıtım ekranları) ara adımlarını yakalamak için.
//   TYPE_TEXT     Tıklamadan ÖNCE sayfadaki ilk metin kutusuna yazılır (Sor ekranı).
//                 Gerçek klavye olayı (Input.insertText) — React onChange tetiklenir.
//   CLICK_WAIT    Her tıklamadan sonra beklenen ms (varsayılan 600). Ağ isteği
//                 bekleyen akışlarda (Sor ekranı) artırılır.

import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';

const [, , url, outPath, wArg, hArg, fontArg] = process.argv;
if (!url || !outPath) {
  console.error('Kullanım: node scripts/shot.mjs <url> <çıktı.png> [genişlik] [yükseklik] [fontScale]');
  process.exit(1);
}
const W = Number(wArg || 390);
const H = Number(hArg || 844);
const FONT_SCALE = Number(fontArg || 1);
const MIN_TOUCH = 44; // Apple HIG: en küçük dokunma alanı 44x44 pt

const CDP_PORT = process.env.CDP_PORT || 9222;

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.error('HATA: açık bir Chrome sekmesi bulunamadı (CDP portu ' + CDP_PORT + ')');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: W,
  height: H,
  deviceScaleFactor: 2,
  mobile: true,
});
// COLOR_SCHEME=dark: koyu tema denetimi; REDUCED_MOTION=1: "Hareketi azalt".
// İkisi de medya sorgusu taklididir; React Native Web ve Reanimated bunları okur.
const media = [];
if (process.env.COLOR_SCHEME) media.push({ name: 'prefers-color-scheme', value: process.env.COLOR_SCHEME });
if (process.env.REDUCED_MOTION === '1') media.push({ name: 'prefers-reduced-motion', value: 'reduce' });
if (media.length) await send('Emulation.setEmulatedMedia', { features: media });

// FONT_SCALE: Dynamic Type benzetimi. ÖNCE kök font-size büyütülüyordu; RN Web
// ölçüleri px yazdığı için bunun HİÇBİR etkisi yoktu (denetim boşa geçiyordu).
// ŞİMDİ: her metin öğesinin hesaplanmış font-size ve line-height'ı ölçekle
// çarpılır — iOS'ta allowFontScaling'in yaptığı da budur. Kutular (padding,
// kenarlık) büyümez, tıpkı iOS'taki gibi. Tıklamalardan sonra yeni çıkan
// metinler için tekrar uygulanır (bkz. scaleFonts çağrıları). Başlıklar da
// dahil: RN Web `accessibilityRole="header"` metni h1/h2 olarak çiziyor.
// SINIR: `maxFontSizeMultiplier` (başlıklarda 1.4) DOM'a yazılmıyor; burada
// başlıklar da 1.5 büyür — iOS'tan daha sert, yani güvenli taraf.
const scaleFonts = async () => {
  if (FONT_SCALE === 1) return;
  await send('Runtime.evaluate', {
    expression: `(() => {
      const k = ${FONT_SCALE};
      // Önce hepsi ölçülür, sonra uygulanır: iç içe metinde (span) üst öğe
      // önce büyütülürse alt öğe miras aldığı büyümüş değeri tekrar çarpardı.
      const targets = [];
      document.querySelectorAll('div,span,h1,h2,h3,h4,h5,h6,p,input,textarea,a,button').forEach((el) => {
        if (el.dataset.fsScaled) return;
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!hasText && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
        const cs = getComputedStyle(el);
        targets.push([el, parseFloat(cs.fontSize), parseFloat(cs.lineHeight)]);
      });
      for (const [el, fs, lh] of targets) {
        el.style.fontSize = fs * k + 'px';
        if (!Number.isNaN(lh)) el.style.lineHeight = lh * k + 'px';
        el.dataset.fsScaled = '1';
      }
    })()`,
  });
  await new Promise((r) => setTimeout(r, 300));
};

// Sayfa açılmadan önce localStorage tohumu — böylece tanıtım katmanı diğer
// rotaların görüntüsünü kapatmıyor.
const seed = process.env.SEED_STORAGE;
const clear = process.env.CLEAR_STORAGE === '1';
if (seed || clear) {
  const clearSrc = clear ? 'localStorage.clear();' : '';
  const seedSrc = seed
    ? `const s=${JSON.stringify(seed)};for(const[k,v]of Object.entries(JSON.parse(s)))localStorage.setItem(k,v);`
    : '';
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try{${clearSrc}${seedSrc}}catch(e){}`,
  });
}

await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 3500));

// OFFLINE=1: sayfa YÜKLENDİKTEN sonra ağ kesilir (uçak modu benzetimi). Uygulama
// içi gezinme (adım sayfaları) çalışmaya devam etmeli; Sor'da gönderim "bağlantı
// yok" demeli (A6). Yükleme öncesi kesilirse web sürümü hiç açılmaz — iOS'ta adım
// içeriği pakette, orada bu sorun yok.
if (process.env.OFFLINE === '1') {
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
}

await scaleFonts();

const typeText = process.env.TYPE_TEXT;
if (typeText) {
  const res = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const el = document.querySelector('textarea,input[type="text"],input:not([type])');
      if (!el) return 'bulunamadi';
      el.focus();
      return 'odaklandi';
    })()`,
  });
  if (res.result.value === 'odaklandi') {
    await send('Input.insertText', { text: typeText });
    await new Promise((r) => setTimeout(r, 300));
  } else {
    console.log('  UYARI: yazılacak metin kutusu bulunamadı');
  }
}

// Çok adımlı akışların ara adımları: erişilebilir ada göre tıkla.
const clickCount = Number(process.env.CLICK_COUNT || 0);
const clickLabel = process.env.CLICK_LABEL;
for (let i = 0; i < clickCount; i++) {
  const res = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const label = ${JSON.stringify(clickLabel ?? '')};
      const nodes = [...document.querySelectorAll('[role="button"],[role="link"],button,a,[aria-label]')];
      const el = nodes.find((n) => (n.getAttribute('aria-label') || n.textContent || '').trim() === label);
      if (!el) return 'bulunamadi';
      el.click();
      return 'tiklandi';
    })()`,
  });
  if (res.result.value !== 'tiklandi') {
    console.log(`  UYARI: "${clickLabel}" öğesi bulunamadı (tıklama ${i + 1})`);
    break;
  }
  await new Promise((r) => setTimeout(r, Number(process.env.CLICK_WAIT || 600)));
}

// TAB_COUNT: klavye odağı denetimi (WCAG 2.4.7). Gerçek Tab tuşu olayı gönderir;
// görüntüde odak halkası görünmeli, denetim odaktaki öğenin çerçevesini yazar.
const tabCount = Number(process.env.TAB_COUNT || 0);
for (let i = 0; i < tabCount; i++) {
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  }
  await new Promise((r) => setTimeout(r, 120));
}

await scaleFonts();

const audit = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const vw = window.innerWidth;
    const overflow = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1) {
        overflow.push(Math.round(r.right) + 'px ' + el.tagName + ' "' + (el.textContent || '').trim().slice(0, 40) + '"');
      }
    });
    const small = [];
    const seen = new Set();
    document.querySelectorAll('[role="button"],[role="link"],button,a,[tabindex]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.width < ${MIN_TOUCH} || r.height < ${MIN_TOUCH}) {
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40);
        const key = label + Math.round(r.width) + 'x' + Math.round(r.height);
        if (seen.has(key)) return;
        seen.add(key);
        small.push(Math.round(r.width) + 'x' + Math.round(r.height) + ' "' + label + '"');
      }
    });
    const unlabeled = [];
    document.querySelectorAll('[role="button"],[role="link"],button').forEach((el) => {
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
      if (!label) unlabeled.push(el.tagName + '.' + (el.className || '').toString().slice(0, 30));
    });
    const f = document.activeElement;
    const focus = f && f !== document.body
      ? (f.getAttribute('aria-label') || f.textContent || f.tagName).trim().slice(0, 40) +
        ' | outline=' + getComputedStyle(f).outlineStyle + ' ' + getComputedStyle(f).outlineWidth
      : null;
    return {
      focus,
      innerWidth: vw,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: overflow.slice(0, 8),
      overflowCount: overflow.length,
      small: small.slice(0, 10),
      smallCount: small.length,
      unlabeledCount: unlabeled.length,
    };
  })()`,
});

const a = audit.result.value;
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(outPath, Buffer.from(shot.data, 'base64'));

console.log(`  viewport=${a.innerWidth} scrollWidth=${a.scrollWidth} fontScale=${FONT_SCALE}`);
console.log(`  yatay taşma: ${a.overflowCount}${a.overflowCount ? ' -> ' + a.overflow.join(' | ') : ' (temiz)'}`);
console.log(`  44pt altı dokunma alanı: ${a.smallCount}${a.smallCount ? ' -> ' + a.small.join(' | ') : ' (temiz)'}`);
console.log(`  etiketsiz dokunulabilir öğe: ${a.unlabeledCount}`);
if (tabCount) console.log(`  klavye odağı: ${a.focus ?? 'yok'}`);
console.log(`  yazıldı: ${outPath}`);

ws.close();
