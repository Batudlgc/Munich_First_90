import { useId } from 'react';

import mark from '@/constants/brand-mark.json';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Marka işareti ("90"), web sürümü: satır içi SVG — ağ isteği yok, her
 * boyutta keskin. Geometri ve renkler tek kaynaktan (brand-mark.json, tasarım sorumlusunun
 * marka PDF'i). Açık temada lacivert üst + mavi gradyan, koyu temada parlak
 * mavi üst + açık mavi gradyan. `tile` true ise uygulama ikonu gibi yuvarlak
 * köşeli karo içinde çizilir.
 *
 * Dekoratif: yanında her zaman marka adı yazılı (ekran okuyucu onu okur).
 * Native karşılığı brand-logo.tsx (PNG).
 */
export function BrandLogo({
  size = 32,
  tile = false,
  scheme: forced,
}: {
  size?: number;
  tile?: boolean;
  /** Temadan bağımsız sabit sürüm (ör. her temada koyu olan alt bilgi bandında 'dark'). */
  scheme?: 'light' | 'dark';
}) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const scheme = forced ?? system;
  const c = mark[scheme];
  // Aynı sayfada birden çok logo olabilir; gradyan kimliği çakışmasın.
  const id = `brand-${useId().replace(/:/g, '')}`;
  const split = mark.split / mark.height;

  const gradient = (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2={mark.height} gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor={c.top} />
      <stop offset={split} stopColor={c.top} />
      <stop offset={split} stopColor={c.from} />
      <stop offset="1" stopColor={c.to} />
    </linearGradient>
  );

  if (tile) {
    // İkon oranları: karo 100 birim, işaret yüksekliğin ~%66'sı, ortada.
    const s = 0.66;
    const dx = (100 - mark.width * s) / 2;
    const dy = (100 - mark.height * s) / 2;
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0 }}>
        <defs>{gradient}</defs>
        <rect width="100" height="100" rx="22.4" fill={c.tile} />
        <g transform={`translate(${dx} ${dy}) scale(${s})`}>
          <path d={mark.path} fillRule="evenodd" fill={`url(#${id})`} />
        </g>
      </svg>
    );
  }

  return (
    <svg
      width={(size * mark.width) / mark.height}
      height={size}
      viewBox={mark.viewBox}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>{gradient}</defs>
      <path d={mark.path} fillRule="evenodd" fill={`url(#${id})`} />
    </svg>
  );
}
