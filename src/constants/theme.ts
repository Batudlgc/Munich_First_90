/**
 * TASARIM SİSTEMİ (marka kimliği, 20.10.2026)
 *
 * Uygulamanın tek görsel kaynağı: renk, tipografi, boşluk, yarıçap, kenarlık
 * ve dokunma alanı. Ekran dosyalarında sihirli sayı (fontSize: 17) veya satır
 * içi renk ('#ffffff') BULUNMAMALIDIR — hepsi buradan token olarak gelir.
 *
 * Renkler tasarım sorumlusunun "Brand Identity 2.pdf" dosyasından (19.10.2026) alındı:
 * açık tema krem zemin + lacivert mürekkep + kraliyet mavisi; koyu tema gece
 * laciverti zemin + beyaz metin + parlak mavi. Değerler PDF'teki açık ve koyu
 * telefon görsellerinin pikselleri ölçülerek çıkarıldı (zemin, kart, çip,
 * buton, ilerleme rayı, ayraç, metin). Marka değerleri: güvenilirlik, sakinlik,
 * yenilik. Mor damga ve sarı giriş bandı (UI v2/v3) bu turla kalktı; damga
 * mekaniği duruyor, rengi marka mavisi. Kırmızı YALNIZ son tarih ve aciliyet içindir.
 *
 * Kontrast: her token ölçüldü (WCAG 2.1 AA — normal metin 4.5:1, büyük metin
 * ve arayüz bileşeni/çizgi 3:1), ölçüm yanında. PDF'teki koyu buton (#0E7AFE)
 * beyaz yazıyla 4.01:1 kalıyordu (16 px yazı için AA değil); bir ton koyusu
 * (#0B6FE8, 4.72:1) kullanıldı, görünüm aynı aile.
 *
 * `accent` metin/çizgi rengidir (bağlantı, sayaç, seçili sekme); `primary`
 * dolu yüzey rengidir (birincil buton, tamamlanan düğüm). Açık temada ikisi
 * aynı; koyu temada metin için daha açık mavi gerekiyor (buton mavisi lacivert
 * zeminde 3.83:1, metin için yetmez).
 */

import '@/global.css';

import { Platform, type ViewStyle } from 'react-native';

export const Colors = {
  light: {
    // --- yüzeyler ---
    /** Sayfa zemini — krem (PDF: #FDFAF2) */
    background: '#FDFAF2',
    /** Yükseltilmiş/ikincil yüzey: kartlar, sıradaki adım kutusu, yan kolon, çipler */
    surface: '#F0F2F5',
    /** Seçili/vurgulu zemin (mavinin açık tonu): seçili sekme, ikincil buton. Mavi 5.97:1, mürekkep 14.82:1 */
    accentSoft: '#E3ECFA',
    /** Tonal dolgu: dil seçici rayı, ok yuvarlağı. Mürekkep 14.88:1, ikincil 5.67:1, mavi 5.99:1 */
    fill: '#E8ECF2',
    /** Dolgu üstündeki seçili parça (dil seçicide seçili dil) */
    raised: '#FFFFFF',
    /** Giriş bandı (ana sayfa üstü) — PDF'te sayfayla aynı krem; ayrı renk yok */
    band: '#FDFAF2',
    /** İlerleme rayının boş çentiği (PDF: #CDD9ED). Dolu çentik (`accent`) bunun üstünde 4.99:1 */
    track: '#CDD9ED',

    // --- metin ---
    /** Mürekkep (lacivert) — zeminde 16.91:1, yüzeyde 15.73:1 */
    text: '#071739',
    /** İkincil metin — zeminde 6.45:1, yüzeyde 6.00:1 */
    textSecondary: '#4A5C7E',

    // --- çizgiler ---
    /** Kutu kenarı, zaman çizgisi rayı — zeminde 4.86:1 */
    line: '#5F6F8C',
    /** Ayraç (dekoratif) */
    rule: '#DCE1E8',
    /** Kilitli düğümün kesikli çizgisi — zeminde 3.47:1, yüzeyde 3.23:1 */
    lockedLine: '#7A879F',

    // --- anlam ---
    /** Marka mavisi (metin/çizgi): bağlantı, sayaç, seçili sekme, damga — zeminde 6.81:1 */
    accent: '#0051C2',
    /** Mavi zemin ÜZERİNDEKİ metin */
    onAccent: '#FFFFFF',
    /** Dolu marka yüzeyi: birincil buton, tamamlanan düğüm, ok yuvarlağı — beyaz yazı 7.10:1 */
    primary: '#0051C2',
    /** Dolu yüzey üstündeki metin/ikon */
    onPrimary: '#FFFFFF',
    /** Dil seçicide seçili dil: açıkta beyaz parça + mürekkep (17.64:1) */
    toggleOn: '#FFFFFF',
    onToggleOn: '#071739',
    /** YALNIZ son tarih ve aciliyet — zeminde 6.27:1, yüzeyde 5.83:1 */
    due: '#B3261E',

    // --- marka gradyanları (toplantı 20.10: "biraz kişilik, gradyan"). CSS dizesi;
    // `gradientFill()` ile web'de backgroundImage, native'de experimental_backgroundImage. ---
    /** Birincil buton ve ok yuvarlağı: beyaz yazı en açık uçta (#2C72CA) 4.81:1 */
    primaryGradient: 'linear-gradient(135deg, #0A4FB8 0%, #0051C2 50%, #2C72CA 100%)',
    /** Başlıktaki "90 gün" vurgusu (yalnız web; native düz `accent`) */
    titleGradient: 'linear-gradient(90deg, #0051C2 0%, #2C72CA 100%)',
    /** Giriş bandının arkasındaki yumuşak mavi ışık */
    heroGlow:
      'radial-gradient(380px circle at 96% -70px, rgba(0, 81, 194, 0.14) 0%, rgba(0, 81, 194, 0) 100%), radial-gradient(260px circle at 0% -40px, rgba(44, 114, 202, 0.08) 0%, rgba(44, 114, 202, 0) 100%)',

    // --- koyu alt bilgi bandı (her iki temada koyu; toplantı: "koyu banner") ---
    /** Alt bilgi zemini — beyaz 17.64:1 */
    footerBg: '#071739',
    footerText: '#FFFFFF',
    /** Alt bilgi ikincil yazı — zeminde 9.88:1 */
    footerMuted: '#B4C3DB',
    /** Alt bilgi bağlantı mavisi — zeminde 8.03:1 */
    footerAccent: '#7FB0FF',
    footerRule: 'rgba(255, 255, 255, 0.12)',
    footerGlow: 'radial-gradient(circle at 100% 0%, rgba(61, 149, 255, 0.28) 0%, rgba(61, 149, 255, 0) 50%)',
  },
  dark: {
    /** Gece laciverti (PDF: #021632) */
    background: '#021632',
    /** Kart, sıradaki adım kutusu (PDF: #0E2445) */
    surface: '#0E2445',
    /** Mavi metin 4.94:1, beyaz 13.92:1 */
    accentSoft: '#0A2650',
    /** Çip, dil seçici rayı — mürekkep 13.14:1, ikincil 7.90:1 */
    fill: '#132B50',
    raised: '#1E3A66',
    band: '#021632',
    /** PDF: #19325D civarı */
    track: '#1C3762',

    /** zeminde 16.82:1 */
    text: '#F5F7FA',
    /** zeminde 10.12:1, yüzeyde 8.67:1 */
    textSecondary: '#B4C3DB',

    /** zeminde 5.92:1 */
    line: '#8095B6',
    rule: '#22395B',
    /** zeminde 4.03:1, yüzeyde 3.45:1 */
    lockedLine: '#62789C',

    /** Açık mavi (metin/çizgi) — zeminde 5.97:1, yüzeyde 5.12:1 */
    accent: '#3D95FF',
    /** Açık mavi üstünde lacivert 5.97:1 */
    onAccent: '#021632',
    /** Dolu buton mavisi — beyaz yazı 4.72:1, zeminden 3.83:1 ayrışır */
    primary: '#0B6FE8',
    onPrimary: '#FFFFFF',
    /** Koyuda seçili dil dolu mavi + beyaz (PDF'teki gibi) — 4.72:1 */
    toggleOn: '#0B6FE8',
    onToggleOn: '#FFFFFF',
    /** zeminde 7.91:1 */
    due: '#FF8A80',

    /** beyaz yazı en açık uçta (#0B6FE8) 4.72:1 */
    primaryGradient: 'linear-gradient(135deg, #0A55C8 0%, #0B6FE8 100%)',
    titleGradient: 'linear-gradient(90deg, #3D95FF 0%, #A9CFF7 100%)',
    heroGlow:
      'radial-gradient(380px circle at 96% -70px, rgba(61, 149, 255, 0.24) 0%, rgba(61, 149, 255, 0) 100%), radial-gradient(300px circle at 0% -40px, rgba(18, 84, 170, 0.35) 0%, rgba(18, 84, 170, 0) 100%)',

    /** gece lacivertinden bir ton koyu — ikincil yazı 11.04:1, bağlantı 8.97:1 */
    footerBg: '#010B1C',
    footerText: '#FFFFFF',
    footerMuted: '#B4C3DB',
    footerAccent: '#7FB0FF',
    footerRule: 'rgba(255, 255, 255, 0.10)',
    footerGlow: 'radial-gradient(circle at 100% 0%, rgba(61, 149, 255, 0.22) 0%, rgba(61, 149, 255, 0) 50%)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Tema bağımsız bir yerde (splash, ikon, web theme-color) gereken marka
 * renkleri. Arayüzde DAİMA useTheme() kullanılır.
 */
export const BrandColors = {
  paper: Colors.light.background,
  stamp: Colors.light.accent,
  ink: Colors.light.text,
  night: Colors.dark.background,
} as const;

/**
 * CSS gradyanını stile çevirir: web'de `backgroundImage` (react-native-web),
 * iOS/Android'de `experimental_backgroundImage` (RN yeni mimari). Gradyan
 * çizilemezse altındaki `backgroundColor` görünür — çağıran düz rengi de verir.
 */
export function gradientFill(css: string): ViewStyle {
  return (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css }) as ViewStyle;
}

/**
 * FONT AİLELERİ — Figtree (08.10.2026; önce Barlow / Barlow Semi Condensed).
 *
 * Geri bildirim: dar Barlow resmi ve soğuk duruyordu. Figtree geniş, sıcak,
 * Türkçe/Almanca karakterlerin hepsi var. Başlıklar 700/800, gövde 400/500/600.
 *
 * SDK 57'de her ağırlık AYRI bir aile adıyla yüklenir. Bu yüzden stillerde
 * fontWeight YOK: ağırlık aile adının içinde. Adlar `src/app/_layout.tsx`'teki
 * useFonts anahtarlarıyla birebir aynı.
 *
 * Web'de yedek aile zinciri eklenir: font yüklenemezse sistem sans-serif'ine düşer.
 */
const face = (name: string) =>
  Platform.select({ web: `${name}, system-ui, -apple-system, 'Segoe UI', sans-serif`, default: name });

export const FontFamily = {
  head700: face('Figtree_700Bold'),
  head800: face('Figtree_800ExtraBold'),
  body400: face('Figtree_400Regular'),
  body500: face('Figtree_500Medium'),
  body600: face('Figtree_600SemiBold'),
} as const;

/**
 * TİPOGRAFİ ÖLÇEĞİ
 * Ekranlarda fontSize/lineHeight/fontFamily elle yazılmaz; ThemedText'in
 * `type`'ı kullanılır.
 */
export const Typography = {
  /** Logo yanındaki iki satırlık marka adı ("Munich / First 90") */
  wordmark: { fontFamily: FontFamily.head800, fontSize: 15, lineHeight: 16, letterSpacing: -0.1 },
  /** Ana sayfa/giriş bandı başlığı */
  display: { fontFamily: FontFamily.head800, fontSize: 40, lineHeight: 46, letterSpacing: -0.6 },
  /** Adım sayfası başlığı */
  title: { fontFamily: FontFamily.head800, fontSize: 32, lineHeight: 38, letterSpacing: -0.4 },
  /** Sıradaki adım kutusu başlığı, izin ekranı başlığı */
  subtitle: { fontFamily: FontFamily.head700, fontSize: 22, lineHeight: 28 },
  /** Bölüm başlığı ("Yanına al", faz adları) */
  heading: { fontFamily: FontFamily.head700, fontSize: 20, lineHeight: 26 },
  /** Zaman çizgisindeki adım adı, liste öğesi başlığı */
  itemTitle: { fontFamily: FontFamily.body600, fontSize: 17, lineHeight: 23 },
  /** Resmi Almanca terim, form alanı değeri */
  term: { fontFamily: FontFamily.body600, fontSize: 16, lineHeight: 22 },
  /** Sayaç rakamı ("3 / 11") */
  tally: { fontFamily: FontFamily.head800, fontSize: 28, lineHeight: 34 },
  /** Gövde metni */
  body: { fontFamily: FontFamily.body400, fontSize: 16, lineHeight: 25 },
  bodyBold: { fontFamily: FontFamily.body600, fontSize: 16, lineHeight: 25 },
  /** Giriş bandındaki açıklama metni */
  lead: { fontFamily: FontFamily.body400, fontSize: 18, lineHeight: 28 },
  /** Etiket, yardımcı metin */
  label: { fontFamily: FontFamily.body500, fontSize: 14, lineHeight: 20 },
  labelBold: { fontFamily: FontFamily.body600, fontSize: 14, lineHeight: 20 },
  /** Küçük üst başlık ("München · Uluslararası öğrenciler için") */
  eyebrow: { fontFamily: FontFamily.head700, fontSize: 13, lineHeight: 18, letterSpacing: 0.8 },
  /** En küçük metin — form alanı etiketi, yasal not */
  caption: { fontFamily: FontFamily.body500, fontSize: 13, lineHeight: 18 },
  /** Buton metni */
  button: { fontFamily: FontFamily.body600, fontSize: 16, lineHeight: 22 },
  /** Metin içi bağlantı (altı çizili — renk tek başına anlam taşımasın, WCAG 1.4.1) */
  link: { fontFamily: FontFamily.body600, fontSize: 15, lineHeight: 20 },
  /** Liste içindeki bağlantı satırı (kaynaklar): altı çizili ama 500 ağırlık, sakin */
  linkQuiet: { fontFamily: FontFamily.body500, fontSize: 15, lineHeight: 20 },
  /** Damga yazısı ("ERLEDIGT") */
  stamp: { fontFamily: FontFamily.head800, fontSize: 26, lineHeight: 30, letterSpacing: 2.4 },
  /** Damga tarihi */
  stampDate: { fontFamily: FontFamily.head700, fontSize: 13, lineHeight: 16, letterSpacing: 1 },
} as const;

export const Fonts = Platform.select({
  ios: { mono: 'ui-monospace' },
  default: { mono: 'monospace' },
  web: { mono: 'var(--font-mono)' },
});

/**
 * BOŞLUK — 4pt tabanlı ızgara.
 * İsimler ölçeğe göredir (xs < sm < md < lg < xl < xxl), sayıya göre değil.
 */
export const Spacing = {
  /** 2 — yalnızca çok sıkı satır içi boşluk */
  xxs: 2,
  xs: 4,
  sm: 8,
  /** 12 — form alanı iç boşluğu */
  smd: 12,
  md: 16,
  /** 20 — sayfa kenar boşluğu (Gutter) */
  mdl: 20,
  lg: 24,
  xl: 32,
  xxl: 64,
} as const;

/** Sayfa kenar boşluğu. Kutular ve metin aynı hizadan başlar. */
export const Gutter = Spacing.mdl;

/** KÖŞE YARIÇAPI */
export const Radius = {
  /** Belge sıra kutusu, küçük çip */
  xs: 4,
  /** Dil seçici */
  sm: 8,
  /** Form kutusu */
  md: 12,
  /** Buton, sıradaki adım kutusu */
  lg: 14,
  /** Hap / tam yuvarlak */
  pill: 999,
} as const;

/** KENARLIK KALINLIKLARI */
export const Border = {
  /** Form alanı ayracı */
  hairline: 1,
  /**
   * Resmi form kutusunun mürekkep kenarı. critique 2026-10: önceden 1.5 ve her
   * kapta (buton, dil seçici, metin kutusu, sayaç…) aynıydı; her şey çerçeveli
   * olunca hiçbiri öne çıkmıyordu. Artık mürekkep çerçeve YALNIZ resmi form
   * kutusunda (FormBox) ve geri düğmesinde; diğer kaplar tonla (`fill`) ayrılır.
   */
  box: 1,
  /** Zaman çizgisi rayı ve düğüm kenarı */
  node: 2,
  /** Damga dış çerçevesi */
  stamp: 3,
} as const;

/**
 * En küçük dokunma alanı (Apple HIG ve WCAG 2.5.5).
 * Görsel öğe daha küçük olabilir; dokunulabilir alan bu boyutun altına inmez.
 */
export const TouchTarget = 44;

/**
 * Sekme çubuğunun altta kapladığı yer. iOS'ta NativeTabs ilk ScrollView'a
 * içerik boşluğunu kendisi ekler (contentInsetAdjustment); web'de sekme
 * çubuğu akışın içinde durduğu için içerik zaten üstünde biter.
 */
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 640;

/**
 * GENİŞ EKRAN (yalnız web masaüstü). Geri bildirim: "ekranın sadece ortasını
 * kullanma". Bu genişliğin üstünde sayfa tek sütun değil, kolonlu yerleşime geçer.
 */
export const WideBreakpoint = 1024;
/** Üç kolon (sol menü + içerik + sağ bilgi kolonu) için en küçük genişlik */
export const ThreeColBreakpoint = 1240;
/** Geniş yerleşimin en büyük genişliği (kenar boşlukları hariç) */
export const MaxPageWidth = 1240;
/** Sol menü ve sağ bilgi kolonu genişlikleri */
export const SideNavWidth = 220;
export const AsideWidth = 320;
