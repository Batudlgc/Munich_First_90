import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Web kök HTML'i (yalnız statik export sırasında, Node'da çalışır).
 *
 * Varsayılandan farkı: sayfa zemini ve tarayıcı çubuğu rengi tema zemininde (açık: krem, koyu: gece laciverti).
 * Önceden <body> beyazdı; iOS Safari'de kaydırma esnemesinde ve ilk karede beyaz
 * şerit görünüyordu. Renkler src/constants/theme.ts'teki `background` ile aynı —
 * bu dosya theme.ts'i içe aktaramaz (theme.ts global CSS içe aktarıyor, Expo
 * belgesi +html'de global CSS'i yasaklıyor), bu yüzden değerler burada yazılı.
 * `lang` ilk yüklemede "en"; seçili dil LanguageProvider'da güncellenir.
 */
const PAPER = '#FDFAF2';
const PAPER_DARK = '#021632';

const pageBackground = `body{background-color:${PAPER}}@media (prefers-color-scheme: dark){body{background-color:${PAPER_DARK}}}`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content={PAPER} />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content={PAPER_DARK} />
        {/* İkonlar (20.10): Google arama sonucu eski mor damga favicon'unu önbellekte
            tutuyordu. Açık <link rel="icon"> adresleri + 48'in katı boyutlar + manifest,
            bir sonraki taramada yeni logonun alınmasını sağlar. Dosyalar scripts/make-icon.mjs'ten. */}
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96" />
        <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
        <link rel="manifest" href="/site.webmanifest" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: pageBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
