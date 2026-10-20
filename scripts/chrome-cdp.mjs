// Headless Chrome'u açıp DevTools protokolü (CDP) ile süren küçük yardımcı.
// scripts/make-icon.mjs (ikon PNG'leri) ve scripts/store-shots.mjs (store
// ekran görüntüleri) ikisi de bunu kullanır.
//
// NEDEN CDP, NEDEN BAĞIMLILIKSIZ: scripts/shot.mjs ile aynı gerekçe —
// `--screenshot --window-size` yerleşim genişliğini dayatmıyor; gerçek
// viewport'u (ve piksel yoğunluğunu) ancak Emulation.setDeviceMetricsOverride
// dayatır. Puppeteer gibi bir paket yerine Node 22'nin yerleşik fetch ve
// WebSocket'i yeter (CLAUDE.md: gereksiz bağımlılık yok).
//
// shot.mjs'ten farkı: Chrome'u kendisi açar ve kapatır. screenshot.sh'taki
// gibi ayrı bir kabuk betiğine gerek kalmaz; betik tek komutla tekrar çalışır.

import { Buffer } from 'node:buffer';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chrome yolu: CHROME ortam değişkeni > macOS uygulaması > PATH (screenshot.sh ile aynı sıra). */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  if (platform() === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
    try {
      return execFileSync('which', [name], { encoding: 'utf8' }).trim();
    } catch {
      // sıradakini dene
    }
  }
  return null;
}

/**
 * Chrome'u başlatır, ilk sekmeye bağlanır.
 * Dönen `send(method, params)` CDP komutu gönderir; hata dönerse fırlatır.
 * İş bitince `close()` çağrılmalı (Chrome ve geçici profil silinir).
 */
export async function launchChrome({ port = 9308 } = {}) {
  const chrome = findChrome();
  if (!chrome || !existsSync(chrome)) {
    throw new Error(
      `Chrome bulunamadı (${chrome ?? 'yol yok'}). Bulut: bash scripts/cloud-setup.sh · ya da CHROME=/yol/chrome`
    );
  }
  const profile = mkdtempSync(join(tmpdir(), 'pratik-chrome-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-color-profile=srgb', // renkler token hex'iyle birebir çıksın (renk yönetimi kaymasın)
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ];
  // Bulut VM'i root çalışır; Chrome root altında sandbox'sız açılmak zorunda.
  if (platform() !== 'darwin') args.unshift('--no-sandbox');
  const proc = spawn(chrome, args, { stdio: 'ignore' });

  let page;
  for (let i = 0; i < 50 && !page; i++) {
    await sleep(200);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      page = targets.find((t) => t.type === 'page');
    } catch {
      // Chrome henüz dinlemiyor
    }
  }
  if (!page) {
    proc.kill();
    throw new Error(`Chrome ${port} portunda açılmadı (port başka bir süreçte olabilir: PORT/CDP_PORT değiştir).`);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let msgId = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method) for (const fn of listeners.get(m.method) ?? []) fn(m.params);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(`${m.error.message} (${m.error.code})`));
      else resolve(m.result);
    }
  };
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');

  const close = async () => {
    try {
      ws.close();
    } catch {
      // zaten kapalı
    }
    proc.kill();
    await new Promise((r) => {
      if (proc.exitCode !== null) r();
      else proc.once('exit', r);
    });
    // Chrome'un alt süreçleri profil klasörüne kapanırken hâlâ yazabiliyor
    // (screenshot.sh'taki "Directory not empty" ile aynı sorun): birkaç kez
    // dene, olmazsa geçici klasörü bırak — betiğin sonucunu bozmasın.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // geçici klasör /tmp'de kalır
    }
  };

  /** CDP olayına dinleyici ekler (ör. `Runtime.exceptionThrown`, `Log.entryAdded`). */
  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn]);

  return { send, close, on };
}

/** Sayfada bir ifadeyi çalıştırıp değerini döner (Promise ise bekler). */
export async function evaluate(send, expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? 'evaluate hatası');
  return res.result.value;
}

/**
 * Verilen HTML'i width×height CSS pikselinde, `scale` piksel yoğunluğuyla
 * çizer ve PNG tamponu döner (çıktı: width*scale × height*scale).
 * `transparent` true ise sayfa zemini saydam kalır (splash, Android ön katman).
 * HTML fontları ve görselleri data: URI olarak gömülü olmalı (dosya erişimi yok).
 */
export async function renderHtml(send, html, { width, height, scale = 1, transparent = false }) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(100);
  const { frameTree } = await send('Page.getFrameTree');
  await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
  // Gömülü fontlar ve görseller çözülsün; aksi hâlde yedek fontla çizilir.
  await evaluate(send, 'document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))');
  await sleep(150);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  return Buffer.from(shot.data, 'base64');
}
