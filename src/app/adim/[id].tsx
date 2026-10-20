import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DisclosureRow } from '@/components/disclosure-row';
import { ExternalLink } from '@/components/external-link';
import { FormBox, FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Stamp } from '@/components/stamp';
import { StateView } from '@/components/state-view';
import { StatusIcon } from '@/components/status-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimelineNode } from '@/components/timeline-node';
import { WebHead } from '@/components/web-head';
import {
  AsideWidth,
  Border,
  Gutter,
  MaxContentWidth,
  MaxPageWidth,
  Radius,
  SideNavWidth,
  Spacing,
  TouchTarget,
} from '@/constants/theme';
import { useCompletedSteps } from '@/hooks/use-completed-steps';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { parseIsoDay } from '@/lib/completion';
import { firstSentence, formatStampDate } from '@/lib/format';
import { useLanguage } from '@/lib/language';
import { openExternal } from '@/lib/open-external';
import { trackStepDone } from '@/lib/metrics';
import { maybeRequestReview } from '@/lib/review-prompt';
import {
  getOrderedSteps,
  getPrerequisiteTitles,
  getStepById,
  isStepUnlocked,
  type Phase,
  type Step,
} from '@/lib/steps';

/** "Sık yapılan hatalar"da ilk bakışta görünen madde sayısı. */
const MISTAKES_VISIBLE = 2;

/** "Damga kaldırıldı · Geri al" satırının görünme süresi. */
const UNDO_MS = 5000;

/** Geri düğmesinin görünen çemberi; dokunma alanı yine TouchTarget (44). */
const BACK_CIRCLE = TouchTarget - Spacing.sm;

/**
 * Bölüm: kısa başlık ("Yanına al", "Randevu") + içerik. Web'de h2: sayfada
 * tek h1 (adımın adı) kalsın (critique 2026-10: düzeysiz role="header" her
 * bölüm başlığını h1 yapıyordu).
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="heading" accessibilityRole="header" aria-level={2}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

/**
 * Madde işaretli satır. "•" karakteri metnin İÇİNE yazılmaz, ayrı bir View'da
 * durur ve metin `flex: 1` alır — böylece ikinci ve sonraki satırlar madde
 * işaretinin ALTINA değil, ilk satırın metniyle aynı hizaya (asılı girinti)
 * düşer.
 */
function Bullet({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <ThemedText type="body" themeColor="textSecondary" style={styles.bulletMark}>
        •
      </ThemedText>
      <View style={styles.bulletBody}>{children}</View>
    </View>
  );
}

/**
 * URL'nin alan adını döner ("https://www.bzst.de/DE/..." -> "bzst.de").
 * Ayrıştırılamayan bir adreste URL'nin kendisi döner; ekran boş kalmasın.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Kaynak satırının ikinci satırı: adresin okunur yolu ("service/info/wohnsitzanmeldung").
 * NEDEN: bir adımın kaynaklarının çoğu aynı alan adında (stadt.muenchen.de);
 * yalnız alan adı yazılınca beş satır birbirinin aynısı görünüyordu. Sayfa
 * numarası gibi anlamsız parçalar ("1063475", "n0") atılır; satır tek satıra
 * kısaltılır, tam adres dokunulunca açılır.
 */
function pathOf(url: string): string | null {
  try {
    const parts = decodeURIComponent(new URL(url).pathname)
      .replace(/\.html?$/, '')
      .split('/')
      .filter((part) => part.length > 2 && !/^\d+$/.test(part));
    return parts.length > 0 ? parts.join('/') : null;
  } catch {
    return null;
  }
}

/**
 * Belge satırının sade açıklaması resmi adı yalnız tekrar ediyor mu?
 * (DE: "Gültiger Personalausweis oder Reisepass für jede anzumeldende Person" /
 * "Ein gültiger Personalausweis oder Reisepass für jede Person, die angemeldet
 * wird."). Kaba ölçü: açıklamanın uzun kelimelerinin çoğu resmi adda geçiyorsa
 * tekrar sayılır ve gizlenir. Yalnız gösterim; veri değişmez.
 */
function samePlain(official: string, plain: string): boolean {
  const words = (text: string) => text.toLowerCase().match(/\p{L}{5,}/gu) ?? [];
  const officialWords = new Set(words(official));
  const plainWords = words(plain);
  if (plainWords.length === 0) return true;
  const shared = plainWords.filter((word) => officialWords.has(word)).length;
  return shared / plainWords.length >= 0.6;
}

/**
 * Açıklamadaki parantez içi Almanca terim, hemen üstte kalın yazılan resmî adda
 * zaten geçiyorsa gösterimde atılır: "Ev sahibinden alınan taşınma onayı
 * (Wohnungsgeberbestätigung)" → "Ev sahibinden alınan taşınma onayı". Veri
 * değişmez (critique 6. tur).
 */
function withoutRepeatedTerm(plain: string, official: string): string {
  return plain
    .replace(/\s*\(([^()]+)\)/g, (match, inner: string) => (official.includes(inner.trim()) ? '' : match))
    .replace(/\s+([.,;:])/g, '$1');
}

/**
 * Bağlantı satırı: başlık + ikinci satır (alan adı ya da yol), tam adres
 * dokunulunca açılır.
 *
 * ÖNCE (B-blokları): ham URL metin olarak basılıyordu; boşluksuz tek "kelime"
 * olduğu için satır atlayamıyor ve 390px'lik ekrandan taşıyordu. ŞİMDİ
 * okunabilir bir etiket gösterilir; ekran okuyucu da "h-t-t-p-s..." yerine
 * anlamlı bir ad okur.
 */
function LinkRow({
  url,
  title,
  detail,
  accessibilityLabel,
}: {
  url: string;
  title: string;
  detail: string | null;
  accessibilityLabel: string;
}) {
  // Kaynak listesinde bağlantılar 500 ağırlık (`linkQuiet`): 7 satır 600 + mavi +
  // altı çizili iken sayfanın en gürültülü bloğuydu (critique 2026-10).
  const theme = useTheme();
  return (
    // ExternalLink: native'de uygulama içi tarayıcıda açar (kullanıcı Safari'ye
    // atılmaz), web'de normal <a target="_blank"> gibi davranır.
    <ExternalLink
      href={url as Href & string}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      style={styles.linkRow}
    >
      <View style={styles.linkRowInner}>
        <StatusIcon
          ios="arrow.up.right.square"
          material="open_in_new"
          fallbackText="↗"
          size={18}
          color={theme.accent}
        />
        <View style={styles.linkText}>
          <ThemedText type="linkQuiet" themeColor="accent" style={styles.underline} numberOfLines={1}>
            {title}
          </ThemedText>
          {detail ? (
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
              {detail}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </ExternalLink>
  );
}

/**
 * Telefon satırı. LinkRow'dan ayrı: ExternalLink native'de adresi uygulama içi
 * tarayıcıda açıyor, "tel:" orada çalışmaz. Linking.openURL hem native'de
 * arama ekranını hem web'de telefon uygulamasını açar.
 */
function PhoneRow({ number, hours }: { number: string; hours: string | null }) {
  const { t } = useLanguage();
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => Linking.openURL(`tel:${number.replace(/[^+\d]/g, '')}`)}
      accessibilityRole="link"
      accessibilityLabel={`${t('appt.phone')}: ${number}`}
      style={styles.linkRow}
    >
      <View style={styles.linkRowInner}>
        <StatusIcon ios="phone" material="call" fallbackText="☎" size={18} color={theme.accent} />
        <View style={styles.linkText}>
          <ThemedText type="link">{number}</ThemedText>
          {hours ? (
            <ThemedText type="caption" themeColor="textSecondary">
              {hours}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Randevu / çevrimiçi işlem bölümü (A4 verisi), adımın randevu biçimine göre:
 *
 * - Randevu gereken ya da önce başvurulan adım: başlık "Randevu"; portal
 *   birincil buton → telefon → yeni randevular ne zaman açılır (tonal kutu,
 *   JSON metni birebir, maddeli) → not. Slot bilgisi olan adımda not "Ek bilgi"
 *   altında katlı (Anmeldung'daki 9 satırlık e-Anmeldung paragrafı).
 * - Randevusuz ama çevrimiçi işlemi olan adım (Steuer-ID, Rundfunkbeitrag):
 *   başlık "Çevrimiçi işlem"; önce not, sonra İKİNCİL buton. critique 2026-10
 *   3. tur: birincil mavi buton, posta ile kendiliğinden gelen bir numara için
 *   "yeniden talep formu"nu sayfanın en güçlü öğesi yapıyordu.
 * - Randevusuz ve bağlantısız adım (Bankkonto): bölüm YOK; not form
 *   kutusundaki "Randevu gerekmez" alanının altında (aynı şey iki kez
 *   söylenmiyordu, ama iki ayrı yerdeydi).
 *
 * walk_in null ise hiçbir yerde gösterilmez: "bilmiyoruz" demek yerine susmak,
 * yanlış güven vermekten iyi.
 */
function AppointmentSection({
  step,
  summary,
  portalShownAbove = false,
}: {
  step: Step;
  summary: string;
  /** Telefonda randevu butonu form kutusunun hemen altına taşındı; burada tekrar çizilmez. */
  portalShownAbove?: boolean;
}) {
  const { t, lang } = useLanguage();
  const theme = useTheme();
  const appt = step.appointment;
  const bookingUrl = step.booking_url;
  if (appt.mode === 'no_appointment' && !bookingUrl && !appt.phone && !appt.slot_release) return null;
  if (!appt.note && !appt.slot_release && !bookingUrl && !appt.phone) return null;
  const online = appt.mode === 'no_appointment';
  const bookable = appt.mode === 'appointment' || appt.mode === 'appointment_or_written';
  const portalLabel = t(bookable ? 'detail.openBooking' : 'detail.openOnline');
  const note = appt.note ? <ThemedText type="body">{appt.note[lang]}</ThemedText> : null;
  const portal = bookingUrl && !portalShownAbove ? (
    <PrimaryButton
      variant={online ? 'secondary' : 'primary'}
      label={portalLabel}
      onPress={() => void openExternal(bookingUrl)}
      accessibilityRole="link"
      accessibilityLabel={`${portalLabel}: ${hostOf(bookingUrl)}`}
      icon={{ ios: 'arrow.up.right.square', material: 'open_in_new', fallback: '↗' }}
    />
  ) : null;

  if (online) {
    // Bağlantı satırı (telefon satırı gibi), buton değil: alt çubuktaki damgala
    // butonuyla aynı görünen ikinci bir buton olmasın (critique 9. tur).
    return (
      <Section title={t('detail.sectionOnline')}>
        {note}
        {bookingUrl ? (
          <LinkRow
            url={bookingUrl}
            title={portalLabel}
            detail={hostOf(bookingUrl)}
            accessibilityLabel={`${portalLabel}: ${hostOf(bookingUrl)}`}
          />
        ) : null}
      </Section>
    );
  }

  return (
    <Section title={t('detail.sectionBooking')}>
      {/* Randevu biçimi (form kutusundan buraya taşındı): "Randevu gerekli · …" */}
      {/* "Randevu gerekli" başlığı tekrar ediyor; yalnız bilgi taşıyan biçimlerde
          (yazılı başvuru / önce başvuru, randevusuz giriş bilgisi) gösterilir. */}
      {appt.mode !== 'appointment' || appt.walk_in !== null ? <ThemedText type="term">{summary}</ThemedText> : null}
      {portal || appt.phone ? (
        <View style={styles.apptActions}>
          {portal}
          {appt.phone ? <PhoneRow number={appt.phone.number} hours={appt.phone.hours?.[lang] ?? null} /> : null}
        </View>
      ) : null}
      {appt.slot_release ? (
        <View style={[styles.panel, { backgroundColor: theme.fill }]}>
          <ThemedText type="labelBold">{t('appt.slotRelease')}</ThemedText>
          {splitLines(appt.slot_release[lang]).map(({ text, item }) =>
            item ? (
              <Bullet key={text}>
                <ThemedText type="body">{text}</ThemedText>
              </Bullet>
            ) : (
              <ThemedText key={text} type="body">
                {text}
              </ThemedText>
            )
          )}
        </View>
      ) : null}
      {note && appt.slot_release ? <Disclosure title={t('detail.moreInfo')}>{note}</Disclosure> : note}
    </Section>
  );
}

/**
 * Açılır-kapanır alt bölüm (varsayılan KATLI): başlık satırı + ok. Kaynaklar
 * ve "Ek bilgi" aynı biçimde. Seçim saklanmaz.
 */
function Disclosure({
  title,
  heading = false,
  children,
}: {
  title: string;
  /** Bölüm başlığı boyutunda mı (Kaynaklar) yoksa bölüm içi satır mı (Ek bilgi). */
  heading?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.section}>
      <DisclosureRow label={title} open={open} heading={heading} onToggle={() => setOpen((shown) => !shown)} />
      {open ? children : null}
    </View>
  );
}

/**
 * Uzun bir metni satırlara böler; metin BİREBİR aynı kalır, yalnız boşluk satır
 * sonuna döner (Batu, 06.10.2026: "yalnız saf satır sonu"). Bölünme yerleri:
 * cümle sonu (. ! ? sonrası boşluk + büyük harf), noktalı virgül ve iki nokta;
 * parantez içinde bölünmez.
 * Rakam sonrası nokta ("10.") ve küçük harfle süren kısaltma ("z. B. die")
 * bölünmez — firstSentence (format.ts) ile aynı kural.
 */
function splitLines(text: string): { text: string; item: boolean }[] {
  const lines: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    // Parantez içinde bölünmez: "(…; …)" tek satırda kalır.
    if (depth > 0 || !/\s/.test(text[i + 1] ?? '')) continue;
    const next = text.slice(i + 1).trimStart()[0] ?? '';
    const clause = char === ';' || char === ':';
    const sentence = /[.!?]/.test(char) && !/\d/.test(text[i - 1] ?? '') && /[A-ZÇĞİÖŞÜÄ„"(]/.test(next);
    if (clause || sentence) {
      lines.push(text.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  lines.push(text.slice(start).trim());
  // İki nokta ya da noktalı virgülden sonra gelen yan cümle madde olarak
  // gösterilir (küçük harfle başlayan satır başı kopuk duruyordu — critique
  // 2026-10 3. tur). Metin yine birebir aynı; yalnız madde işareti eklenir.
  return lines
    .filter((line) => line.length > 0)
    .map((line, i, all) => ({ text: line, item: i > 0 && /[:;]$/.test(all[i - 1]) }));
}

/**
 * Kaynaklar: varsayılan KATLI, başlıkta sayı ("Kaynaklar (7)"). critique
 * 2026-10: yedi altı çizili bağlantı her açılışta sayfanın sonunu dolduruyordu;
 * kaynak doğrulamak isteyen için bir dokunuş uzakta. Seçim saklanmaz.
 */
function SourcesSection({ sources, verified }: { sources: string[]; verified: string | null }) {
  const { t } = useLanguage();
  // Doğrulama tarihi adım verisinden (last_verified); başlığın altında, katlıyken
  // de görünür — içeriğin ne kadar güncel olduğu tek bakışta (yeniden critique 2026-10).
  const verifiedDate = verified ? parseIsoDay(verified) : null;
  return (
    <View style={styles.section}>
      <Disclosure heading title={`${t('detail.sectionSources')} (${sources.length})`}>
        {/* Randevu kaynakları genel listeye eklenir, tekrar edenler bir kez. */}
        <View>
          {sources.map((url) => (
            <LinkRow
              key={url}
              url={url}
              title={hostOf(url)}
              detail={pathOf(url)}
              accessibilityLabel={`${t('detail.openSource')}: ${hostOf(url)}`}
            />
          ))}
        </View>
      </Disclosure>
      {verifiedDate ? (
        <ThemedText type="caption" themeColor="textSecondary" style={styles.verified}>
          {t('detail.lastVerified').replace('{date}', formatStampDate(verifiedDate))}
        </ThemedText>
      ) : null}
    </View>
  );
}

const NAV_PHASES: Phase[] = ['pre_arrival', 'first_weeks', 'first_90_days', 'conditional'];

/**
 * Sol menü (geniş ekran, üç kolon): bütün adımlar fazlarına göre, şu anki adım
 * vurgulu. Adımdan adıma ana sayfaya dönmeden geçilir.
 */
function StepNav({ currentId, completedIds }: { currentId: string; completedIds: ReadonlySet<string> }) {
  const router = useRouter();
  const theme = useTheme();
  const { t, lang } = useLanguage();
  const all = getOrderedSteps();
  return (
    <View role="navigation" aria-label={t('detail.allSteps')} style={styles.nav}>
      <ThemedText type="eyebrow" themeColor="textSecondary" style={styles.navTitle}>
        {t('detail.allSteps').toLocaleUpperCase()}
      </ThemedText>
      {NAV_PHASES.map((phase) => {
        const list = all.filter((item) => item.phase === phase);
        if (list.length === 0) return null;
        return (
          <View key={phase} style={styles.navGroup}>
            <ThemedText type="caption" themeColor="textSecondary" style={styles.navPhase}>
              {t(`phase.${phase}`)}
            </ThemedText>
            {list.map((item) => {
              const current = item.id === currentId;
              const done = completedIds.has(item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.replace({ pathname: '/adim/[id]', params: { id: item.id } })}
                  accessibilityRole="link"
                  aria-current={current ? 'page' : undefined}
                  style={({ pressed, hovered }) => [
                    styles.navItem,
                    current && { backgroundColor: theme.accentSoft },
                    !current && (pressed || hovered) && { backgroundColor: theme.surface },
                  ]}
                >
                  <View
                    style={[
                      styles.navDot,
                      { borderColor: done ? theme.accent : theme.lockedLine },
                      done && { backgroundColor: theme.accent },
                    ]}
                  />
                  <ThemedText
                    type={current ? 'labelBold' : 'label'}
                    style={[styles.navLabel, { color: current ? theme.accent : theme.text }]}
                  >
                    {item.title[lang]}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Web statik export'u (app.json `web.output: "static"`) bu dinamik rota için
 * varsayılan olarak tek bir `adim/[id].html` üretir; Vercel gibi düz bir
 * statik sunucu `/adim/anmeldung` isteğinde onu bulamaz ve 404 verir. Bu
 * fonksiyon yalnız export sırasında (Node'da) çalışır ve her adım için ayrı
 * bir `adim/<id>.html` ürettirir. iOS derlemesini etkilemez.
 */
export function generateStaticParams(): { id: string }[] {
  return getOrderedSteps().map((step) => ({ id: step.id }));
}

/** Bu kadar aşağıdaysa damga yine ekranda: yukarı kaydırmaya gerek yok. */
const STAMP_VISIBLE_SCROLL = 40;
/** Yukarı kayma bitmezse (ör. kullanıcı parmağıyla durdurdu) damga en geç bu sürede iner. */
const SCROLL_TOP_MAX_MS = 1200;

export default function StepDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const step = id ? getStepById(id) : undefined;
  const { completedIds, toggleStep, restoreStep, completedAt, storageError } = useCompletedSteps();
  // Damga kaldırılınca 5 sn "Geri al" (critique 10. tur: tek dokunuşla damga
  // tarihi kayboluyordu). Eski tarih yalnız bu sürede bellekte tutulur.
  const [undo, setUndo] = useState<{ day: string | null; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => () => {
    if (undo) clearTimeout(undo.timer);
  }, [undo]);
  const { t, lang } = useLanguage();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { wide, threeCol } = useLayout();
  // Damga yalnız BASILDIĞI anda iner. Sayfaya sonradan gelindiğinde (ya da
  // sayfa yeniden açıldığında) bu false başlar ve damga animasyonsuz durur.
  const [justStamped, setJustStamped] = useState(false);
  // Kaydırılınca üst çubuğun altına ince ayraç: içerik çubuğun altına girerken
  // satırlar yarım kesilmiş gibi görünmesin (critique 2026-10).
  const [scrolled, setScrolled] = useState(false);
  // Başlık bloğu görünür alandan çıkınca üst çubukta faz adı yerine adımın adı
  // (critique 5. tur: uzun sayfada nerede olduğun belli değildi).
  const [titleBottom, setTitleBottom] = useState(Number.POSITIVE_INFINITY);
  const [pastTitle, setPastTitle] = useState(false);
  const [showAllMistakes, setShowAllMistakes] = useState(false);
  // Damgalama butonu sayfanın altında; kullanıcı aşağıdaysa damga (sayfanın
  // üstünde) ekran dışında iniyor ve hiç görülmüyordu (Batu, 07.10). Bu yüzden
  // basınca önce sayfa yukarı kayar, damga kayma bittikten sonra iner.
  const scrollRef = useRef<ScrollView>(null);
  // Sayfa içi atlama (critique 9. tur: "Yanına al" 2. ekranda, kuyrukta her
  // seferinde randevu bilgisini geçmek gerekiyordu). Bölümlerin içerik
  // içindeki y konumu onLayout ile tutulur.
  const sectionY = useRef<Record<string, number>>({});
  const jumpTo = (key: string) => {
    const y = sectionY.current[key];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - Spacing.sm), animated: !reduceMotion });
  };
  const scrollY = useRef(0);
  // Kayma sürerken bekleyen damga: tepeye varınca (onScroll) ya da en geç
  // SCROLL_TOP_MAX_MS sonra iner. Süre platforma ve mesafeye göre değişiyor
  // (web'de ölçülen ~600 ms), sabit bir bekleme damgayı kayma bitmeden indiriyordu.
  const pending = useRef<{ land: () => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const reduceMotion = useReducedMotion();
  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current.timer);
  }, []);
  const firePending = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    p.land();
  };

  if (!step) {
    return (
      <ThemedView style={styles.container}>
        {/* Başlık verilmezse web'de rota adı ("adim/[id]") görünüyordu. */}
        <Stack.Screen options={{ title: t('notFound.title') }} />
        <SafeAreaView style={styles.container}>
          <StateView
            kind="empty"
            title={t('detail.notFound')}
            body={t('notFound.body')}
            actionLabel={t('notFound.action')}
            onAction={() => router.replace('/')}
          />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const title = step.title[lang];
  const completed = completedIds.has(step.id);
  // Tamamlanmış adım, önkoşulu sonradan geri alınmış olsa da kilitli sayılmaz:
  // damgası durur ve kaldırılabilir.
  const locked = !completed && !isStepUnlocked(step, completedIds);
  const missing = step.prerequisites.filter((dep) => !completedIds.has(dep));
  // Alt çubuktaki not eksik önkoşulu adıyla söyler (critique 5. tur: "Önkoşul
  // henüz işaretlenmedi" hangisi olduğunu söylemiyordu; kutu ekranın altındaydı).
  const missingTitles = getPrerequisiteTitles(missing, lang);
  const missingLabel =
    missingTitles.length > 1
      ? `${missingTitles[0]} ${t('home.lockedMore').replace('{n}', String(missingTitles.length - 1))}`
      : (missingTitles[0] ?? '');
  const stampAnywayNote = t('detail.stampAnywayNote').replace('{name}', missingLabel);
  const stampDay = completedAt(step.id);
  const stampDate = stampDay ? parseIsoDay(stampDay) : null;
  const stampText = stampDate ? formatStampDate(stampDate) : null;
  const sources = [...new Set([...step.sources, ...step.appointment.sources])];
  // Randevusuz ama çevrimiçi işlemli adımda "Çevrimiçi işlem" bölümü notla
  // "randevu yok" der; form kutusunda bir kez daha söylenmez (critique 8. tur).
  const onlineSection = step.appointment.mode === 'no_appointment' && Boolean(step.booking_url);
  const noApptSection =
    step.appointment.mode === 'no_appointment' &&
    !step.booking_url &&
    !step.appointment.phone &&
    !step.appointment.slot_release;
  const deadlineFull = step.deadline_rule?.text[lang] ?? '';
  const deadlineFirst = firstSentence(deadlineFull);
  const deadlineRest = deadlineFull.slice(deadlineFull.indexOf(deadlineFirst) + deadlineFirst.length).trim();
  const apptMode = t(`appt.mode.${step.appointment.mode}`);
  const walkIn =
    step.appointment.walk_in === null
      ? null
      : t(step.appointment.walk_in ? 'appt.walkInYes' : 'appt.walkInNo');
  const apptSummary = walkIn ? `${apptMode} · ${walkIn}` : apptMode;
  // Randevu bölümü "Randevu" başlığıyla mı çiziliyor (online/randevusuz değil)?
  const apptSection =
    step.appointment.mode !== 'no_appointment' &&
    Boolean(step.appointment.note || step.appointment.slot_release || step.booking_url || step.appointment.phone);
  // Randevu gerektiren adımda (randevu sayfası bağlantısı varsa) telefonda
  // buton ilk ekrana, form kutusunun altına alınır.
  const bookingAbove =
    !wide &&
    Boolean(step.booking_url) &&
    (step.appointment.mode === 'appointment' || step.appointment.mode === 'appointment_or_written');
  const bookingUrlAbove = bookingAbove ? step.booking_url : null;
  const jumps: [string, string][] = [
    ...(apptSection || onlineSection
      ? [['appt', t(onlineSection ? 'detail.sectionOnline' : 'detail.sectionBooking')] as [string, string]]
      : []),
    ...(step.documents.length > 0
      ? [
          [
            'docs',
            t(onlineSection ? 'detail.sectionDocumentsOnline' : 'detail.sectionDocuments'),
          ] as [string, string],
        ]
      : []),
    ...(step.common_mistakes.length > 0 ? [['mistakes', t('detail.jumpMistakes')] as [string, string]] : []),
  ];

  // Damgalama TEK yerde toplanır: ölçüm, kayıt, animasyon, haptik, ekran
  // okuyucu. Ölçüm (trackStepDone) MEVCUT davranış: yalnız damgalarken,
  // kaldırırken değil.
  const stamp = () => {
    if (pending.current) return; // kayma sürerken ikinci basış yok sayılır
    const land = () => {
      trackStepDone(step.id);
      toggleStep(step.id);
      setJustStamped(true);
      if (process.env.EXPO_OS === 'ios') {
        // Titreşim damganın kâğıda değdiği ana denk gelsin (animasyonun ~%60'ı).
        setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), reduceMotion ? 0 : 200);
      }
      AccessibilityInfo.announceForAccessibility(`${title}: ${t('stamp.announceDone')}`);
      // App Store değerlendirme isteği (A8): yalnız iOS, 3. damgadan sonra bir kez,
      // damga animasyonu bittikten sonra. Sözleşme src/lib/review-prompt.ts'te.
      void maybeRequestReview(completedIds.size + 1);
    };
    // Damga zaten görünür bölgedeyse (sayfanın üstü, ya da geniş ekranda
    // yapışkan sağ kolon) beklemeden iner.
    if (wide || scrollY.current <= STAMP_VISIBLE_SCROLL) {
      land();
      return;
    }
    scrollRef.current?.scrollTo({ y: 0, animated: !reduceMotion });
    if (reduceMotion) {
      land();
      return;
    }
    pending.current = { land, timer: setTimeout(firePending, SCROLL_TOP_MAX_MS) };
  };

  const unstamp = () => {
    const day = completedAt(step.id);
    toggleStep(step.id);
    setJustStamped(false);
    if (undo) clearTimeout(undo.timer);
    setUndo({ day, timer: setTimeout(() => setUndo(null), UNDO_MS) });
    AccessibilityInfo.announceForAccessibility(t('stamp.announceRemoved'));
  };

  const undoUnstamp = () => {
    if (!undo) return;
    clearTimeout(undo.timer);
    if (undo.day) restoreStep(step.id, undo.day);
    else toggleStep(step.id);
    setUndo(null);
    setJustStamped(false);
  };

  // Web'de sayfaya doğrudan bağlantıyla gelinebilir; geri gidilecek yer yoksa ana ekran.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // Geniş ekranda (web masaüstü) form kutusu + damga + eylemler sağ kolonda,
  // yapışkan; içerik ortada. Telefonda aynı parçalar eski yerlerinde.
  const formPanel = (
      <View style={styles.formArea}>
        {/* Damga, form kutusunun sağ üstünde KENDİ yerine vurulur; kutunun
            çerçevesine hafifçe biner ama hiçbir yazının üstüne binmez.
            07.10 düzeltmesi (#39): eskiden mutlak konumluydu ve özetin son
            satırına, uzun metinlerde kutudaki yazıya biniyordu. Yer yalnız
            adım tamamlanınca açılır. */}
        {completed ? (
          <View style={styles.stampSpot}>
            <Stamp
              date={stampText}
              animate={justStamped}
              accessibilityLabel={stampText ? `${t('stamp.label')}, ${stampText}` : t('stamp.label')}
            />
          </View>
        ) : null}
        <FormBox>
          {/* "Resmi adı" yalnız gerçekten resmî terimse (official_title_check). */}
          {step.official_title_check.kind !== 'descriptive' ? (
            <FormField label={t('detail.officialNameLabel')} value={step.official_title} />
          ) : null}
          {step.authority ? (
            <FormField label={t('detail.fieldAuthority')} value={step.authority.official}>
              {step.authority.plain[lang].length > 0 ? (
                <ThemedText type="label" themeColor="textSecondary">
                  {step.authority.plain[lang]}
                </ThemedText>
              ) : null}
            </FormField>
          ) : null}
          {/* Makam ve Süre taslakta yan yana; gerçek veride ikisi de uzun
              ("Kreisverwaltungsreferat" tek kelimesi yarım hücreye sığmıyor),
              bu yüzden her alan tam genişlik satır. Süre: metnin ilk cümlesi;
              kırmızı YALNIZ gün sayılı yasal süre varsa. */}
          {/* Son tarih TEK yerde: ilk cümle alan değeri (gün sayılı ise
              kırmızı), kalanı (yasal dayanak vb.) hemen altında. critique
              2026-10: önce ayrıca bir "Süre" bölümü aynı cümleyi tekrarlıyordu. */}
          {step.deadline_rule ? (
            <FormField
              label={t('detail.fieldDeadline')}
              value={deadlineFirst}
              tone={step.deadline_rule.days !== null ? 'due' : undefined}
            >
              {deadlineRest ? (
                <ThemedText type="label" themeColor="textSecondary">
                  {deadlineRest}
                </ThemedText>
              ) : null}
            </FormField>
          ) : null}
          {/* Randevu alanı yalnız ayrı bir "Randevu" bölümü YOKSA burada: önce
              "Randevu: Randevu gerekli" satırının hemen altında "Randevu" başlığı
              geliyordu (critique 4. tur). Bölüm varsa aynı bilgi bölümün ilk satırı. */}
          {!apptSection && !onlineSection ? (
            <FormField label={t('detail.fieldAppointment')} value={apptSummary}>
              {/* Randevusuz ve bağlantısız adımda ayrı bölüm yok; gerekçe notu burada. */}
              {noApptSection && step.appointment.note ? (
                <ThemedText type="label" themeColor="textSecondary">
                  {step.appointment.note[lang]}
                </ThemedText>
              ) : null}
            </FormField>
          ) : null}
        </FormBox>

      </View>
  );

  const actions = (
    <View style={styles.footerInner}>
      {undo && !completed ? (
        <View style={styles.undoRow} accessibilityLiveRegion="polite">
          <ThemedText type="label" themeColor="textSecondary">
            {t('detail.unstamped')}
          </ThemedText>
          <Pressable
            onPress={undoUnstamp}
            accessibilityRole="button"
            style={({ pressed }) => [styles.undoButton, pressed && styles.pressed]}
          >
            <ThemedText type="link" themeColor="accent" style={styles.underline}>
              {t('detail.undo')}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
      {completed ? (
        <PrimaryButton variant="secondary" label={t('detail.unstamp')} onPress={unstamp} />
      ) : locked ? (
        // Kilitli adım da damgalanabilir (Batu, 06.10.2026): gerçek sıra
        // modelden farklı olabilir (ör. Immatrikulation Krankenkasse
        // damgasından önce). Önce buton devre dışıydı; tek çıkış önkoşulları
        // yanlış damgalamaktı, bu da ilerlemeyi bozuyordu.
        <View style={styles.footerStack}>
          <ThemedText type="caption" themeColor="textSecondary" style={styles.footerNote}>
            {stampAnywayNote}
          </ThemedText>
          <PrimaryButton
            variant="secondary"
            label={t('detail.stampAnyway')}
            onPress={stamp}
            accessibilityHint={stampAnywayNote}
          />
        </View>
      ) : (
        // Damgalama ikincil (tonal): sayfanın ana eylemi randevu. Kullanıcı
        // adımı genelde makamdan döndükten sonra damgalar (critique 2026-10).
        <PrimaryButton variant="secondary" label={t('detail.stamp')} onPress={stamp} />
      )}
    </View>
  );

  const mainChildren = (
    <>
        <View
          style={styles.titleBlock}
          onLayout={(event) => setTitleBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
        >
          <ThemedText type="title" accessibilityRole="header" aria-level={1}>
            {title}
          </ThemedText>
          {step.summary[lang].length > 0 ? <ThemedText type="body">{step.summary[lang]}</ThemedText> : null}
        </View>

        {/* Kilit durumu formdan ÖNCE (critique 6. tur: kutu ikinci ekrandaydı,
            yalnız alt çubuktaki not görünüyordu). */}
        {locked ? (
          <View style={[styles.locked, { borderColor: theme.lockedLine, backgroundColor: theme.surface }]}>
            {/* Toplantı 20.10: kilit "daha net gösterilebilir" — kilit ikonu + ne
                anlama geldiği (okunabilir, yalnız işaretleme sırası var). */}
            <View style={styles.lockedHead}>
              <StatusIcon ios="lock" material="lock" fallbackText="🔒" size={18} color={theme.text} />
              <ThemedText type="labelBold">{t('detail.lockedTitle')}</ThemedText>
            </View>
            <ThemedText type="label" themeColor="textSecondary">
              {t('detail.lockedExplain')}
            </ThemedText>
            {missing.map((dep) => {
              const prerequisite = getStepById(dep);
              return (
                <Pressable
                  key={dep}
                  onPress={() => router.push({ pathname: '/adim/[id]', params: { id: dep } })}
                  accessibilityRole="link"
                  accessibilityLabel={prerequisite?.title[lang] ?? dep}
                  style={({ pressed }) => [styles.lockedRow, pressed && styles.pressed]}
                >
                  <TimelineNode
                    state={prerequisite && !isStepUnlocked(prerequisite, completedIds) ? 'locked' : 'open'}
                  />
                  <ThemedText type="itemTitle" style={styles.lockedRowText}>
                    {prerequisite?.title[lang] ?? dep}
                  </ThemedText>
                  <StatusIcon
                    ios="chevron.right"
                    material="chevron_right"
                    fallbackText="›"
                    size={18}
                    color={theme.textSecondary}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {wide ? null : formPanel}

        {/* Telefonda randevu butonu ilk ekranda (kullanıcı geri bildirimi, 13.10: Anmeldung
            linkini görmedi; 390 px'te buton form kutusu ve bölüm menüsünün
            altında, ilk ekranın dışındaydı). Masaüstünde yeri değişmez. */}
        {bookingUrlAbove ? (
          <PrimaryButton
            label={t('detail.openBooking')}
            onPress={() => void openExternal(bookingUrlAbove)}
            accessibilityRole="link"
            accessibilityLabel={`${t('detail.openBooking')}: ${hostOf(bookingUrlAbove)}`}
            icon={{ ios: 'arrow.up.right.square', material: 'open_in_new', fallback: '↗' }}
          />
        ) : null}

        {storageError ? (
          <StateView kind="error" title={t('state.errorTitle')} body={t('state.errorBody')} />
        ) : null}


        {jumps.length > 1 ? (
          <View style={styles.jumps} accessibilityRole="toolbar" accessibilityLabel={t('detail.jumpTo')}>
            {/* Toplantı 20.10: çipler "tıklanabilir durmuyor"du (gri, etiketsiz).
                Artık önde "Bölüme git", her çipte aşağı ok, marka mavisi çerçeve. */}
            <ThemedText type="label" themeColor="textSecondary" style={styles.jumpLead}>
              {t('detail.jumpTo')}
            </ThemedText>
            {jumps.map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => jumpTo(key)}
                accessibilityRole="button"
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.jump,
                  { borderColor: theme.accent },
                  hovered && { backgroundColor: theme.accentSoft },
                  pressed && styles.pressed,
                ]}
              >
                <StatusIcon ios="arrow.down" material="arrow_downward" fallbackText="↓" size={16} color={theme.accent} />
                <ThemedText type="labelBold" style={{ color: theme.accent }}>
                  {label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Sarmalayıcı yalnız bölüm çiziliyorsa: boş View bile içerik boşluğuna
            (gap) katılıyor ve 6 adımda boşluk iki katına çıkıyordu (critique 10. tur). */}
        {apptSection || onlineSection ? (
          <View onLayout={(event) => (sectionY.current.appt = event.nativeEvent.layout.y)}>
            <AppointmentSection step={step} summary={apptSummary} portalShownAbove={bookingAbove} />
          </View>
        ) : null}

        {step.documents.length > 0 ? (
          <View onLayout={(event) => (sectionY.current.docs = event.nativeEvent.layout.y)}>
          <Section
            title={t(
              step.appointment.mode === 'no_appointment' && step.booking_url
                ? 'detail.sectionDocumentsOnline'
                : 'detail.sectionDocuments'
            )}
          >
            <View style={styles.list}>
              {step.documents.map((doc, index) => (
                <View key={doc.official} style={styles.docRow}>
                  {/* Sıra numarası, onay kutusu DEĞİL: çerçevesiz düz rakam
                      (critique 2026-10: çerçeveli kare işaretlenebilir bir
                      kutu gibi görünüyordu; işaretlemek kalıcı bir belge listesi
                      gerektirirdi, bu akışın kapsamında değil). */}
                  <ThemedText type="term" themeColor="textSecondary" style={styles.docIndex}>
                    {`${index + 1}.`}
                  </ThemedText>
                  <View style={styles.docText}>
                    <ThemedText type="term">{doc.official}</ThemedText>
                    {/* Çeviri satırı gövde boyutunda ve mürekkep renginde (Batu,
                        06.10.2026): Almanca terim önde kalır, ama TR/EN okuru
                        için asıl okunan satır bu; 14pt gri iken ikincil
                        kalıyordu. */}
                    {doc.plain[lang].length > 0 && !samePlain(doc.official, doc.plain[lang]) ? (
                      <ThemedText type="body">
                        {withoutRepeatedTerm(doc.plain[lang], doc.official)}
                      </ThemedText>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </Section>
          </View>
        ) : null}

        {step.common_mistakes.length > 0 ? (
          <View onLayout={(event) => (sectionY.current.mistakes = event.nativeEvent.layout.y)}>
          <Section title={t('detail.sectionMistakes')}>
            {/* İlk 3 madde görünür, gerisi bir dokunuşla (critique 4. tur: grup
                başına 4'ten fazla öğe bilişsel yükü artırıyordu). */}
            <View style={styles.list}>
              {(showAllMistakes ? step.common_mistakes : step.common_mistakes.slice(0, MISTAKES_VISIBLE)).map(
                (mistake) => (
                  <Bullet key={mistake.en || mistake.de}>
                    <ThemedText type="body">{mistake[lang]}</ThemedText>
                  </Bullet>
                )
              )}
            </View>
            {!showAllMistakes && step.common_mistakes.length > MISTAKES_VISIBLE ? (
              <DisclosureRow
                label={t('detail.showAllMistakes').replace('{n}', String(step.common_mistakes.length - MISTAKES_VISIBLE))}
                open={false}
                onToggle={() => setShowAllMistakes(true)}
              />
            ) : null}
          </Section>
          </View>
        ) : null}

        <SourcesSection sources={sources} verified={step.last_verified} />

        <View>
          <Pressable
            onPress={() => router.push({ pathname: '/sor', params: { step: step.id } })}
            accessibilityRole="link"
            style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
          >
            <View style={styles.linkRowInner}>
              <StatusIcon
                ios="questionmark.bubble"
                material="contact_support"
                fallbackText="?"
                size={18}
                color={theme.accent}
              />
              <ThemedText type="link" style={styles.linkText}>
                {t('detail.askAboutStep')}
              </ThemedText>
            </View>
          </Pressable>

          <ThemedText type="caption" themeColor="textSecondary" style={styles.disclaimer}>
            {t('detail.disclaimer')}
          </ThemedText>
        </View>
    </>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Yerel gezinme çubuğu gizli: geri düğmesi ve faz adı sayfanın kendi
          üst çubuğunda (taslak 2. ekran). */}
      <Stack.Screen options={{ headerShown: false, title }} />
      <WebHead title={title} />

      {wide ? (
        <SiteHeader />
      ) : (
        <View
          style={[
            styles.topBar,
            { paddingTop: insets.top + Spacing.xs, borderBottomColor: scrolled ? theme.rule : 'transparent' },
          ]}
        >
          <View style={styles.topBarInner}>
            <Pressable
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel={t('detail.back')}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <View style={[styles.backCircle, { backgroundColor: theme.fill }]}>
                <StatusIcon ios="chevron.left" material="chevron_left" fallbackText="‹" size={20} color={theme.text} />
              </View>
            </Pressable>
            <ThemedText type="labelBold" numberOfLines={1} style={styles.topBarLabel}>
              {pastTitle ? title : t(`phase.${step.phase}`)}
            </ThemedText>
          </View>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.scroll}
        scrollEventThrottle={32}
        onScroll={(event) => {
          const y = event.nativeEvent.contentOffset.y;
          scrollY.current = y;
          if (pending.current && y <= 1) firePending();
          if (y > 0 !== scrolled) setScrolled(y > 0);
          if (y > titleBottom !== pastTitle) setPastTitle(y > titleBottom);
        }}
      >
        {wide ? (
          <View style={styles.wideRow}>
            {threeCol ? (
              <View style={styles.navCol}>
                <StepNav currentId={step.id} completedIds={completedIds} />
              </View>
            ) : null}
            <View style={[styles.content, styles.mainColWide]}>
              {/* Masaüstünde geri düğmesi (toplantı 20.10: "geri dön tuşu yok";
                  telefonda üst çubukta zaten var). Adımlar › faz adı. */}
              <View style={styles.crumbs}>
                <Pressable
                  onPress={goBack}
                  accessibilityRole="button"
                  accessibilityLabel={t('detail.back')}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    styles.crumbBack,
                    { borderColor: theme.rule },
                    hovered && { backgroundColor: theme.surface },
                    pressed && styles.pressed,
                  ]}
                >
                  <StatusIcon ios="chevron.left" material="chevron_left" fallbackText="‹" size={18} color={theme.text} />
                  <ThemedText type="labelBold">{t('detail.backToSteps')}</ThemedText>
                </Pressable>
                <ThemedText type="label" themeColor="textSecondary">
                  {`/  ${t(`phase.${step.phase}`)}`}
                </ThemedText>
              </View>
              {mainChildren}
            </View>
            <View style={styles.asideCol}>
              <ThemedText type="eyebrow" themeColor="textSecondary">
                {t('detail.summaryTitle').toLocaleUpperCase()}
              </ThemedText>
              {formPanel}
              {actions}
            </View>
          </View>
        ) : (
          <View style={styles.content}>{mainChildren}</View>
        )}
        <SiteFooter />
      </ScrollView>

      {/* Sabit alt buton (telefon): kaydırılan içeriğin dışında, sütunun en altında.
          Geniş ekranda eylemler sağ kolonda, alt çubuk yok. */}
      {wide ? null : (
        <View
          style={[
            styles.footer,
            { borderTopColor: theme.rule, backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.smd },
          ]}
        >
          {actions}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  crumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: -Spacing.md,
  },
  crumbBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: TouchTarget - Spacing.xs,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.smd,
    borderRadius: Radius.pill,
    borderWidth: Border.hairline,
  },
  wideRow: {
    // Geniş ekran: sol adım menüsü (üç kolonda) + içerik + yapışkan sağ kolon.
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xl,
    width: '100%',
    maxWidth: MaxPageWidth + Gutter * 3,
    alignSelf: 'center',
    paddingHorizontal: Gutter * 1.5,
    paddingTop: Spacing.lg,
  },
  mainColWide: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingTop: Spacing.lg,
  },
  navCol: {
    width: SideNavWidth,
    position: 'sticky' as 'relative',
    top: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  asideCol: {
    width: AsideWidth,
    gap: Spacing.md,
    paddingTop: Spacing.lg + Spacing.sm,
    position: 'sticky' as 'relative',
    top: 0,
  },
  nav: {
    gap: Spacing.md,
  },
  navTitle: {
    paddingHorizontal: Spacing.sm,
  },
  navGroup: {
    gap: Spacing.xxs,
  },
  navPhase: {
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xxs,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget - Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  navDot: {
    width: Spacing.smd - Spacing.xxs,
    height: Spacing.smd - Spacing.xxs,
    borderRadius: Radius.pill,
    borderWidth: Border.node,
  },
  navLabel: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: Gutter - (TouchTarget - BACK_CIRCLE) / 2,
    paddingBottom: Spacing.xs,
    borderBottomWidth: Border.hairline,
  },
  topBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  backButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backCircle: {
    // Mürekkep halka yerine tonal dolgu (critique 8. tur: 70px'lik çerçeveli
    // daire sayfanın en ağır öğelerinden biriydi).
    width: BACK_CIRCLE,
    height: BACK_CIRCLE,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarLabel: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Gutter,
    paddingTop: Spacing.smd,
    paddingBottom: Spacing.xxl,
    // Bölümler arası 32, bölüm içi 12: gruplar net ayrılsın (önce 24/12'ydi,
    // sayfa düz bir akış gibi okunuyordu — critique 2026-10).
    gap: Spacing.xl,
  },
  titleBlock: {
    gap: Spacing.smd,
  },
  formArea: {
    marginTop: Spacing.sm,
  },
  stampSpot: {
    // Akışın içinde, sağa yaslı: yazıyla çakışamaz, büyük yazıda (Dynamic Type)
    // damga büyürse yer de büyür. Düz hâlinin alt kenarı kutunun çizgisinde;
    // eğik damganın yalnız sol alt köşesi çerçeveye biner (elle vurulmuş damga),
    // tarih yazısı çizginin üstünde kalır (−12 iken çizgi tarihin içinden
    // geçiyordu, ekran görüntüsüyle görüldü).
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: Spacing.sm,
    // Opak kutudan önce çizildiği için öne alınır.
    zIndex: 1,
    pointerEvents: 'none',
  },
  section: {
    gap: Spacing.smd,
  },
  jumps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: -Spacing.sm,
  },
  jump: {
    minHeight: TouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingLeft: Spacing.smd - Spacing.xxs,
    paddingRight: Spacing.smd + Spacing.xxs,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  jumpLead: {
    alignSelf: 'center',
    marginRight: Spacing.xxs,
  },
  apptActions: {
    gap: Spacing.xs,
  },
  panel: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  underline: {
    textDecorationLine: 'underline',
  },
  verified: {
    marginTop: -Spacing.sm,
  },
  pair: {
    gap: Spacing.xxs,
  },
  list: {
    gap: Spacing.smd,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.smd,
  },
  docIndex: {
    minWidth: Spacing.lg,
  },
  docText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xxs,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  bulletMark: {
    // Madde işareti sabit genişlikte: metin bloğu her maddede aynı yerden başlar.
    width: Spacing.sm,
    textAlign: 'center',
  },
  bulletBody: {
    flex: 1,
    minWidth: 0,
  },
  locked: {
    borderWidth: Border.box,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.smd,
    paddingTop: Spacing.smd,
    paddingBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  lockedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.smd,
    minHeight: TouchTarget + Spacing.xs,
  },
  lockedRowText: {
    flex: 1,
    minWidth: 0,
  },
  linkRow: {
    minHeight: TouchTarget,
    justifyContent: 'center',
  },
  linkRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.smd,
    // Uzun yol ("Privatpersonen/SteuerlicheIdentifikationsnummer") tek satıra
    // kısaltılır. Web'de bağlantının (<a>) içindeki View inline-flex çiziliyor
    // ve içeriği kadar genişliyordu (ölçüm: 350px'lik satırda 404px, ekrandan
    // taşma); genişlik satıra bağlanınca kısaltma devreye giriyor.
    width: '100%',
    minWidth: 0,
  },
  linkText: {
    flex: 1,
    minWidth: 0,
  },
  disclaimer: {
    marginTop: Spacing.md,
  },
  footer: {
    borderTopWidth: Border.hairline,
    paddingTop: Spacing.smd,
    paddingHorizontal: Gutter,
  },
  undoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: -Spacing.sm,
  },
  undoButton: {
    minHeight: TouchTarget,
    justifyContent: 'center',
  },
  footerStack: {
    gap: Spacing.sm,
  },
  footerNote: {
    textAlign: 'center',
  },
  footerInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
