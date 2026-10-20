import Head from 'expo-router/head';
import { usePathname } from 'expo-router';

import { useHydrated } from '@/hooks/use-hydrated';
import { useLanguage, type Lang } from '@/lib/language';

/** Sekme başlığındaki site adı, seçili dilde. */
const SITE_NAME: Record<Lang, string> = {
  en: 'Munich First 90 Days',
  tr: 'Münih’te İlk 90 Gün',
  de: 'Die ersten 90 Tage in München',
};
const DESCRIPTION: Record<Lang, string> = {
  en: 'Step-by-step guide to German bureaucracy for international students in Munich — Anmeldung, bank account, health insurance, residence permit. English, Türkçe, Deutsch. No account needed.',
  tr: 'Münih’teki uluslararası öğrenciler için Alman bürokrasisi adım adım: Anmeldung, banka hesabı, sağlık sigortası, oturum izni. Türkçe, English, Deutsch. Hesap gerekmez.',
  de: 'Schritt für Schritt durch die deutsche Bürokratie für internationale Studierende in München: Anmeldung, Bankkonto, Krankenversicherung, Aufenthaltstitel. Deutsch, English, Türkçe. Ohne Konto.',
};
/**
 * Link önizlemesi (WhatsApp, Facebook, Telegram, iMessage). Tarayıcıdaki dil
 * seçimi önizleyici botlara ulaşmaz: bot statik HTML'i okur ve o HTML tek bir
 * dille üretilir. Paylaşım ağırlıklı olarak Türkçe konuşan öğrencilere gittiği
 * için statik önizleme İKİ DİLLİ: Türkçe ilk, İngilizce ikinci.
 */
const SHARE_TITLE = 'Münih’te ilk 90 gün · Munich First 90 Days';
const SHARE_DESCRIPTION = 'Anmeldung, sigorta, banka, oturum izni: doğru sırayla. Ücretsiz, hesapsız. Free, no account. TR · EN · DE';

/**
 * Sitenin kökü. Önizleme görseli (og:image) mutlak adres ister; alan adı
 * değişince (munichfirst90.com) yalnız Vercel'deki EXPO_PUBLIC_SITE_URL değişir.
 */
const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? 'https://munichfirst90.com').replace(/\/$/, '');

// Web export'undaki <title>, açıklama ve paylaşım kartı etiketleri. Statik export
// sayfaya boş bir <title data-rh> koyuyor; o etiketi expo-router/head dolduruyor.
// og:* ve twitter:* olmadan WhatsApp vb. linki görselsiz, çıplak adres olarak gösteriyordu.
// Hydration öncesi (statik HTML = botların gördüğü) iki dilli paylaşım metni;
// hydration sonrası sekme başlığı ve açıklama seçili dilde. Native'de karşılığı web-head.tsx (boş).
export function WebHead({ title }: { title?: string }) {
  const { lang } = useLanguage();
  const hydrated = useHydrated();
  const pathname = usePathname();
  const siteName = hydrated ? SITE_NAME[lang] : SITE_NAME.en;
  const fullTitle = title ? `${title} · ${siteName}` : hydrated ? siteName : SHARE_TITLE;
  const shareDescription = hydrated ? DESCRIPTION[lang] : SHARE_DESCRIPTION;
  const url = pathname && pathname !== '/' ? `${SITE_URL}${pathname}` : SITE_URL;
  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={hydrated ? DESCRIPTION[lang] : DESCRIPTION.tr} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME.en} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={shareDescription} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={`${SITE_URL}/og.png?v=4`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Münih'te ilk 90 gün · Your first 90 days in Munich — Munich First 90" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={shareDescription} />
      <meta name="twitter:image" content={`${SITE_URL}/og.png?v=4`} />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <meta name="apple-mobile-web-app-title" content="First 90" />
    </Head>
  );
}
