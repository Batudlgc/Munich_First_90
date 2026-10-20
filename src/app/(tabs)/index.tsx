import { useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AboutCard, AskCard, DeadlinesCard, SitesCard } from '@/components/home-aside';
import { HomeHero } from '@/components/home-hero';
import { Stamp } from '@/components/stamp';
import { SiteFooter } from '@/components/site-footer';
import { StateView } from '@/components/state-view';
import { PrimaryButton } from '@/components/primary-button';
import { StatusIcon } from '@/components/status-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NODE_CENTER, NODE_SIZE, TimelineNode, type NodeState } from '@/components/timeline-node';
import { AsideWidth, Border, BottomTabInset, gradientFill, Gutter, MaxContentWidth, MaxPageWidth, Radius, SideNavWidth, Spacing, TouchTarget, Typography } from '@/constants/theme';
import { useCompletedSteps } from '@/hooks/use-completed-steps';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { firstSentence } from '@/lib/format';
import { useLanguage, type Lang, type StringKey } from '@/lib/language';
import { getNextStep } from '@/lib/next-step';
import { openExternal } from '@/lib/open-external';
import { getOrderedSteps, getPrerequisiteTitles, isStepUnlocked, type Phase, type Step } from '@/lib/steps';

/**
 * ANA EKRAN (UI v2) — "5 saniyede sıradaki adım".
 *
 * Yukarıdan aşağı: yer + dil seçici, başlık, çentikli sayaç, "Sıradaki adım"
 * kutusu, tek dikey zaman çizgisi (zorunlu üç faz), katlı "Gerekirse" bölümü.
 *
 * ÖNCE: her adım ayrı bir gri kart, solunda "tamamlandı" kutucuğu vardı.
 * ŞİMDİ: ana ekrandan damgalama YOK — satırın tamamı tek dokunma hedefi ve
 * adım sayfasını açar. Damgalama tek yerde, adım sayfasında (uygulamanın tek
 * animasyon anı orada). Satırdaki iki ayrı dokunma hedefi (kutucuk + metin)
 * ekran okuyucuda aynı adımı iki kez okutuyor, küçük kutucuğu ıskalamak da
 * istemeden "tamamlandı" işaretliyordu.
 */

const orderedSteps = getOrderedSteps();

const MANDATORY_PHASES: Phase[] = ['pre_arrival', 'first_weeks', 'first_90_days'];
const PHASE_TITLE_KEY: Record<Phase, StringKey> = {
  pre_arrival: 'phase.pre_arrival',
  first_weeks: 'phase.first_weeks',
  first_90_days: 'phase.first_90_days',
  conditional: 'phase.conditional',
};

// orderedSteps modül yüklenirken bir kez hesaplanan sabit bir dizi; fazlara
// göre gruplama da bir kez yapılır (her render'da değil). Fazın içindeki sıra
// getOrderedSteps'in önkoşul sırasıdır.
const stepsByPhase: Record<Phase, Step[]> = {
  pre_arrival: [],
  first_weeks: [],
  first_90_days: [],
  conditional: [],
};
for (const step of orderedSteps) {
  stepsByPhase[step.phase].push(step);
}

// Sayaç ve çentikler yalnız zorunlu adımları sayar: "herkese gerekmeyen"
// conditional bir adım paydada durursa, ona hiç ihtiyacı olmayan biri için
// sayaç hiçbir zaman dolmazdı. Conditional adımların kendi küçük sayacı var.
const mandatorySteps = orderedSteps.filter((step) => step.phase !== 'conditional');
const conditionalSteps = stepsByPhase.conditional;
// Ray ilk zorunlu adımın düğümünde başlar, sonuncusunun düğümünde biter.
const firstMandatory = mandatorySteps[0];
const lastMandatory = mandatorySteps[mandatorySteps.length - 1];

/**
 * Satırın dikey ritmi. Düğüm satırın üstünden ROW_PAD aşağıda; başlığın ilk
 * satırı düğümün ortasına hizalansın diye metin, düğüm ile satır yüksekliği
 * farkının yarısı kadar daha aşağıdan başlar. Ray düğümün merkezinden
 * (RAIL_NODE_Y) geçer.
 */
const ROW_PAD = Spacing.sm;
const TITLE_OFFSET = (NODE_SIZE - Typography.itemTitle.lineHeight) / 2;
const RAIL_NODE_Y = ROW_PAD + NODE_CENTER;
/** "Sıradaki adım" kutusundaki dolu yuvarlak işaret: 40pt, içindeki ok yarısı. */
const GO_SIZE = TouchTarget - Spacing.xs;

/** "{done} / {total}" gibi yer tutucuları doldurur; bilinmeyen yer tutucu olduğu gibi kalır. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}

/**
 * Adın altındaki resmi Almanca ad — TEK kural, her yüzeyde aynı
 * (critique 2026-10: aynı adım kartta, açık satırda ve damgalı satırda üç ayrı
 * adla görünüyordu).
 *
 * Başlık her yerde `step.title` (adım sayfasının başlığıyla aynı). Resmi ad
 * yalnız şu durumda ikinci satıra yazılır: dil Almanca DEĞİL ve başlık
 * Almanca terimi zaten parantez içinde taşımıyor ("Bloke hesap açma" +
 * "Sperrkonto"). Almancada başlık zaten Almanca; "Wohnsitz anmelden" +
 * "Anmeldung des Wohnsitzes (Wohnsitzanmeldung)" aynı kökü üç kez
 * tekrarlıyordu. Uzun resmi adın tamamı adım sayfasındaki form kutusunda.
 */
function officialLine(step: Step, lang: Lang): string | null {
  const title = step.title[lang];
  // Açıklayıcı ad ("Bankkonto eröffnen") resmî terim değil: Almanca alt satır
  // yok, başlık zaten düz çeviri (Batu, 06.10.2026; official_title_check).
  if (step.official_title_check.kind === 'descriptive') return null;
  if (lang === 'de' || /\([^()]+\)$/.test(title)) return null;
  // Başlık Almanca terimi zaten taşıyorsa ("Rundfunkbeitrag kaydı",
  // "SCHUFA kredi raporu") alt satır aynı kelimeyi tekrar etmesin (critique
  // 2026-10 5. tur: "Rundfunkbeitrag kaydı / Rundfunkbeitrag anmelden").
  if (sharesTerm(title, step.official_title)) return null;
  return step.official_title !== title ? step.official_title : null;
}

/** Başlık ile resmî ad 5+ harfli ortak bir kelime taşıyor mu (büyük/küçük harf duyarsız)? */
function sharesTerm(title: string, official: string): boolean {
  const words = (text: string) => text.toLocaleLowerCase('de').match(/\p{L}{5,}/gu) ?? [];
  const officialWords = new Set(words(official));
  return words(title).some((word) => officialWords.has(word));
}

/**
 * Son tarih yalnız gün sayısı olan kuralda gösterilir. `days` null olan
 * kurallar ("sabit bir gün sayısı yok") aciliyet değil açıklamadır; kırmızı
 * renk onlara verilirse her şey acil görünür ve kırmızı anlamını yitirir.
 */
function deadlineText(step: Step, lang: Lang): string | null {
  const rule = step.deadline_rule;
  return rule && rule.days !== null ? firstSentence(rule.text[lang]) : null;
}

function nodeState(step: Step, completedIds: ReadonlySet<string>): NodeState {
  if (completedIds.has(step.id)) return 'done';
  return isStepUnlocked(step, completedIds) ? 'open' : 'locked';
}

/**
 * Sıradaki adım kutusu: kâğıt yüzey, çerçevesiz, yumuşak gölgeyle zeminden
 * ayrılır (critique 2026-10: mürekkep çerçeve kaldırıldı; mürekkep çerçeve
 * yalnız resmi form kutusunda). "Sıradaki adım" kutunun içinde etiket değil,
 * üstünde bölüm başlığı. Tamamı tek dokunma hedefi. Son tarih satırı yalnız gün sayılı kuralda ve `due` renginde —
 * gün sayısından "14 gün içinde" gibi bir kalıp ÜRETİLMEZ, adım verisindeki
 * cümlenin kendisi kullanılır (bkz. format.ts firstSentence).
 */
function NextStepBox({ step, onOpen }: { step: Step; onOpen: () => void }) {
  const theme = useTheme();
  const { t, lang } = useLanguage();
  const official = officialLine(step, lang);
  const due = deadlineText(step, lang);

  // Randevu gereken adımda kutudan doğrudan randevu portalı (critique 2026-10
  // 3. tur: ürünün asıl işi — randevu bulmak — ilk ekranda değildi, iki dokunuş
  // uzaktaydı). Önce başvurulan adımlarda (oturum izni) ve randevusuzlarda yok:
  // orada önce adım sayfasındaki koşulları okumak gerekiyor.
  const bookable = step.appointment.mode === 'appointment' || step.appointment.mode === 'appointment_or_written';
  const bookingUrl = bookable ? step.booking_url : null;

  return (
    <View style={[styles.box, { backgroundColor: theme.surface }]}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="link"
        accessibilityLabel={[`${t('home.next')}: ${step.title[lang]}`, due].filter(Boolean).join('. ')}
        accessibilityHint={t('a11y.openStep')}
        style={({ pressed }) => [styles.boxMain, pressed && styles.pressed]}
      >
        <View style={styles.boxText}>
          <ThemedText type="subtitle">{step.title[lang]}</ThemedText>
          {official && (
            <ThemedText type="label" themeColor="textSecondary" style={styles.boxOfficial}>
              {official}
            </ThemedText>
          )}
          {/* Son tarihi olmayan kartta faz adı: kart neden "sıradaki" olduğunu
              kendisi söylesin (yeniden critique 2026-10: başlık tek başına kalıyordu). */}
          {/* Faz adı her zaman (critique 6. tur: gelmeden önce kullanıcıya
              Anmeldung gösterildiğinde bağlam yoktu). */}
          <ThemedText type="labelBold" themeColor="textSecondary" style={styles.boxPhase}>
            {t(PHASE_TITLE_KEY[step.phase])}
          </ThemedText>
          {/* Son tarihsiz kart yalnız başlık + faz kalmasın: makam (critique 8. tur). */}
          {!due && step.authority ? (
            <ThemedText type="label" themeColor="textSecondary" style={styles.boxOfficial}>
              {step.authority.official}
            </ThemedText>
          ) : !due && step.summary[lang].length > 0 ? (
            // Makamı da olmayan adımda özetin ilk cümlesi (critique 9. tur:
            // kart yalnız başlık + faz kalıyordu).
            <ThemedText type="label" themeColor="textSecondary" numberOfLines={2} style={styles.boxOfficial}>
              {firstSentence(step.summary[lang])}
            </ThemedText>
          ) : null}
          {due && (
            <View style={styles.due}>
              <View style={[styles.dueDot, { backgroundColor: theme.due }]} />
              <ThemedText type="labelBold" style={[styles.dueText, { color: theme.due }]}>
                {due}
              </ThemedText>
            </View>
          )}
        </View>
        <View style={[styles.go, { backgroundColor: theme.primary }, gradientFill(theme.primaryGradient)]}>
          <StatusIcon ios="chevron.right" material="chevron_right" fallbackText="›" size={GO_SIZE / 2} color={theme.onPrimary} />
        </View>
      </Pressable>
      {bookingUrl ? (
        <PrimaryButton
          variant="secondary"
          label={t('detail.openBooking')}
          onPress={() => void openExternal(bookingUrl)}
          accessibilityRole="link"
          icon={{ ios: 'arrow.up.right.square', material: 'open_in_new', fallback: '↗' }}
          style={styles.boxAction}
        />
      ) : null}
    </View>
  );
}

/**
 * Zorunlu adımların hepsi damgalıyken kutunun yerini alan sade durum:
 * kutu aynı, içinde tarihsiz, hareketsiz bir ERLEDIGT izi. Damga burada
 * dekoratif (aynı bilgi başlıkta yazılı), ekran okuyucudan gizli.
 */
function AllDoneBox() {
  const theme = useTheme();
  const { t } = useLanguage();

  return (
    <View style={[styles.box, styles.allDone, { backgroundColor: theme.surface }]}>
      <View aria-hidden style={styles.allDoneStamp}>
        <Stamp accessibilityLabel={t('home.allDoneTitle')} />
      </View>
      <ThemedText type="subtitle">{t('home.allDoneTitle')}</ThemedText>
      <ThemedText type="label" themeColor="textSecondary">
        {fill(t('home.allDoneBody'), { section: t('phase.conditional') })}
      </ThemedText>
    </View>
  );
}

/**
 * Rayın bir satırdaki parçası. Ray tek bir uzun çizgi değil, her satırın düğüm
 * sütununda bir parça: satır yükseklikleri metne göre değiştiği için (iki
 * satıra saran Almanca ad, büyük yazı) uzun tek çizginin bitişini hesaplamak
 * yerine her parça kendi satırını doldurur. İlk adımda düğümden aşağı, son
 * adımda düğüme kadar çizilir; ray böylece düğümden düğüme gider.
 */
function RailSegment({ from, to }: { from: 'top' | 'node'; to: 'bottom' | 'node' }) {
  const theme = useTheme();
  if (from === 'node' && to === 'node') return null;
  const span =
    from === 'node'
      ? { top: RAIL_NODE_Y, bottom: 0 }
      : to === 'node'
        ? { top: 0, height: RAIL_NODE_Y }
        : { top: 0, bottom: 0 };
  return <View style={[styles.rail, span, { backgroundColor: theme.line }]} />;
}

function PhaseHeading({ phase, rail, openCount = 0 }: { phase: Phase; rail: boolean; openCount?: number }) {
  const { t } = useLanguage();
  return (
    <View style={styles.timelineRow}>
      <View style={styles.nodeCol}>{rail && <RailSegment from="top" to="bottom" />}</View>
      {/* Web'de başlık düzeyi: sayfa başlığı h1, faz başlıkları h2 (düzeysiz
          role="header" hepsini h1 yapıyordu). */}
      <View style={styles.phaseTitle}>
        <ThemedText type="heading" accessibilityRole="header" aria-level={2}>
          {t(PHASE_TITLE_KEY[phase])}
        </ThemedText>
        {/* "Gelmeden önce" adımları açıkken başlık altında sayı: sıradaki adım
            kutusu son tarihli Anmeldung'u gösterse de bunlar unutulmasın
            (critique 9. tur). */}
        {openCount > 0 ? (
          <ThemedText type="label" themeColor="textSecondary">
            {fill(t('home.phaseOpen'), { n: openCount })}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Zaman çizgisindeki adım satırı: düğüm + kısa ad + tek alt satır. Alt satır
 * duruma göre değişir:
 * - kilitli: eksik önkoşulun adı ("Önce: Adres kaydı (Anmeldung) +1")
 * - açık ve gün sayılı son tarihli: kırmızı kısa işaret ("Son tarihli ·
 *   randevu gerekli"). Gün sayısı yazılmaz (bkz. deadlineText); tam cümle
 *   sıradaki adım kutusunda ve adım sayfasında.
 * - diğerleri: resmi Almanca ad (kısa adla aynıysa hiç)
 * Ekran okuyucu satırı tek parça, durumuyla duyar: "Adres kaydı, tamamlandı".
 */
function StepRow({
  step,
  completedIds,
  first,
  last,
  isNext = false,
  onOpen,
}: {
  step: Step;
  completedIds: ReadonlySet<string>;
  first: boolean;
  last: boolean;
  /** "Sıradaki adım" kutusundaki adım mı — düğüm mavi halkayla işaretlenir. */
  isNext?: boolean;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const { t, lang } = useLanguage();
  const state = nodeState(step, completedIds);
  const node: NodeState = isNext && state === 'open' ? 'next' : state;

  const title = step.title[lang];
  let subline: string | null = null;
  let apptMark: string | null = null;
  let due = false;
  let status: string;

  if (state === 'locked') {
    // Yalnız EKSİK önkoşullar: Anmeldung damgalandıysa artık "önce Anmeldung"
    // demenin anlamı yok, kalan engel söylenir.
    const missing = getPrerequisiteTitles(
      step.prerequisites.filter((id) => !completedIds.has(id)),
      lang
    );
    const rest = missing.length - 1;
    // "+1" şifreliydi (yeniden critique 2026-10): "ve 1 adım daha".
    subline = `${t('home.lockedShortPrefix')} ${missing[0]}${rest > 0 ? ` ${fill(t('home.lockedMore'), { n: rest })}` : ''}`;
    status = `${t('home.a11y.locked')} ${missing.join(', ')}`;
  } else if (state === 'open' && deadlineText(step, lang)) {
    // Kırmızı YALNIZ son tarih işaretinde; "randevu gerekli" ikincil renkte
    // (critique 8. tur: ikisi birlikte kırmızıydı, kural "kırmızı yalnız son tarih").
    subline = t('home.hasDeadline');
    if (step.appointment.mode === 'appointment') apptMark = t('home.apptRequired');
    due = true;
    status = [t('home.a11y.open'), subline, apptMark].filter(Boolean).join(', ');
  } else {
    subline = officialLine(step, lang);
    status = t(state === 'done' ? 'home.a11y.done' : 'home.a11y.open');
  }

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="link"
      accessibilityLabel={`${step.title[lang]}, ${node === 'next' ? `${t('home.next')}, ` : ''}${status}`}
      accessibilityHint={t('a11y.openStep')}
      style={({ pressed }) => [styles.timelineRow, styles.stepRow, pressed && styles.pressed]}
    >
      <View style={styles.nodeCol}>
        <RailSegment from={first ? 'node' : 'top'} to={last ? 'node' : 'bottom'} />
        <View style={styles.nodeSlot}>
          <TimelineNode state={node} />
        </View>
      </View>
      <View style={styles.rowText}>
        {/* Kilitli ad ikincil renkte (A1: taslaktaki soluk gri AA altındaydı). */}
        <ThemedText type="itemTitle" themeColor={state === 'locked' ? 'textSecondary' : 'text'}>
          {title}
        </ThemedText>
        {subline && (
          <ThemedText
            type={due ? 'labelBold' : 'label'}
            themeColor={due ? undefined : 'textSecondary'}
            style={due && { color: theme.due }}
          >
            {subline}
            {apptMark ? (
              <ThemedText type="label" themeColor="textSecondary">
                {` · ${apptMark}`}
              </ThemedText>
            ) : null}
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

/**
 * İlerleme kartı: sayaç + çentikler. Sayaç ve çentikler ekran okuyucuya TEK bir
 * ilerleme çubuğu (rakam ve çentikler ayrı okunsa aynı bilgi iki kez gelirdi).
 * Değer aria-* ile: accessibilityValue web'de yazılmıyordu.
 */
function ProgressCard({ doneCount, total, card }: { doneCount: number; total: number; card: boolean }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={fill(t('home.a11y.tally'), { done: doneCount, total })}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={doneCount}
      style={[styles.tally, card && [styles.progressCard, { backgroundColor: theme.surface }]]}
    >
      {card ? (
        <ThemedText type="labelBold" themeColor="textSecondary">
          {t('home.progressTitle')}
        </ThemedText>
      ) : null}
      <View style={styles.tallyText}>
        <ThemedText type="tally" themeColor="accent">
          {`${doneCount} / ${total}`}
        </ThemedText>
        <ThemedText type="label" themeColor="textSecondary">
          {t('home.progressSuffix')}
        </ThemedText>
      </View>
      {/* Çentik başına bir zorunlu adım; damgalananlar baştan dolar. */}
      <View style={styles.ticks}>
        {mandatorySteps.map((step, i) => (
          <View
            key={step.id}
            style={[styles.tick, { backgroundColor: i < doneCount ? theme.accent : theme.track }]}
          />
        ))}
      </View>
      <ThemedText type="caption" themeColor="textSecondary">
        {t('home.progressNote')}
      </ThemedText>
    </View>
  );
}

const SECTION_PHASES: Phase[] = [...MANDATORY_PHASES, 'conditional'];

/**
 * Sol menü (geniş ekran, üç kolon): faz başlıkları + tamamlanan/toplam. Tıklanınca
 * zaman çizgisinde o faza kayar. Geri bildirim: "ekranın sadece ortasını kullanma".
 */
function SectionNav({
  completedIds,
  onJump,
}: {
  completedIds: ReadonlySet<string>;
  onJump: (phase: Phase) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.sideNav} role="navigation" aria-label={t('home.sectionsTitle')}>
      <ThemedText type="eyebrow" themeColor="textSecondary" style={styles.sideNavTitle}>
        {t('home.sectionsTitle').toLocaleUpperCase()}
      </ThemedText>
      {SECTION_PHASES.map((phase) => {
        const list = stepsByPhase[phase];
        if (list.length === 0) return null;
        const done = list.filter((step) => completedIds.has(step.id)).length;
        return (
          <Pressable
            key={phase}
            onPress={() => onJump(phase)}
            accessibilityRole="link"
            style={({ pressed, hovered }) => [
              styles.sideNavItem,
              (pressed || hovered) && { backgroundColor: theme.surface },
            ]}
          >
            <ThemedText type="labelBold" style={styles.sideNavLabel}>
              {t(PHASE_TITLE_KEY[phase])}
            </ThemedText>
            <ThemedText type="label" themeColor={done === list.length ? 'accent' : 'textSecondary'}>
              {`${done}/${list.length}`}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { completedIds, storageError } = useCompletedSteps();
  const { t } = useLanguage();
  const { wide, threeCol } = useLayout();
  // "Gerekirse" varsayılan KATLI: herkese gerekmeyen altı adım ilk bakışta
  // zorunlu zaman çizgisiyle yarışmasın. Seçim saklanmaz (ekran durumu).
  const [showConditional, setShowConditional] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Sol menüden faza atlama: faz bloklarının sayfa içindeki y konumu.
  const bodyY = useRef(0);
  const phaseY = useRef<Partial<Record<Phase, number>>>({});

  const doneCount = mandatorySteps.filter((step) => completedIds.has(step.id)).length;
  const total = mandatorySteps.length;
  const nextStep = getNextStep(orderedSteps, completedIds);
  const conditionalDone = conditionalSteps.filter((step) => completedIds.has(step.id)).length;
  const open = (step: Step) => router.push(`/adim/${step.id}` as Href);

  const jumpTo = (phase: Phase) => {
    if (phase === 'conditional') setShowConditional(true);
    const y = phaseY.current[phase];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: bodyY.current + y - Spacing.md, animated: true });
  };

  const timeline = (
    <>
      {storageError && <StateView kind="error" title={t('state.errorTitle')} body={t('state.errorBody')} />}

      {orderedSteps.length === 0 ? (
        <StateView kind="empty" title={t('state.emptyTitle')} body={t('state.emptyBody')} />
      ) : (
        <>
          {/* Telefonda ilerleme burada; masaüstünde giriş bandının sağında. */}
          {!wide ? <ProgressCard doneCount={doneCount} total={total} card={false} /> : null}

          {nextStep || doneCount === total ? (
            <ThemedText
              type="heading"
              accessibilityRole="header"
              aria-level={2}
              style={[styles.nextHeading, wide && styles.nextHeadingWide]}
            >
              {t('home.next')}
            </ThemedText>
          ) : null}
          {nextStep ? (
            <NextStepBox step={nextStep} onOpen={() => open(nextStep)} />
          ) : doneCount === total ? (
            <AllDoneBox />
          ) : null}

          <View style={styles.timeline}>
            {MANDATORY_PHASES.map((phase) =>
              stepsByPhase[phase].length === 0 ? null : (
                <View key={phase} onLayout={(event) => (phaseY.current[phase] = event.nativeEvent.layout.y)}>
                  {/* İlk faz başlığında ray yok: ray ilk düğümde başlar. */}
                  <PhaseHeading
                    phase={phase}
                    rail={phase !== firstMandatory?.phase}
                    openCount={
                      phase === 'pre_arrival'
                        ? stepsByPhase.pre_arrival.filter((step) => !completedIds.has(step.id)).length
                        : 0
                    }
                  />
                  {stepsByPhase[phase].map((step) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      completedIds={completedIds}
                      first={step === firstMandatory}
                      last={step === lastMandatory}
                      isNext={step === nextStep}
                      onOpen={() => open(step)}
                    />
                  ))}
                </View>
              )
            )}
          </View>

          {conditionalSteps.length > 0 && (
            <ConditionalSection
              open={showConditional}
              onToggle={() => setShowConditional((shown) => !shown)}
              done={conditionalDone}
              completedIds={completedIds}
              onOpen={open}
              onLayoutY={(y) => (phaseY.current.conditional = y)}
            />
          )}
        </>
      )}
    </>
  );

  const asideCards = (
    <>
      <DeadlinesCard />
      <AskCard />
      <SitesCard />
      <AboutCard />
    </>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={wide ? [] : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={wide ? styles.pageWide : styles.pageNarrow}>
          <HomeHero
            compact={completedIds.size > 0}
            onNext={nextStep ? () => open(nextStep) : null}
            aside={<ProgressCard doneCount={doneCount} total={total} card />}
          />

          {wide ? (
            <View style={styles.body} onLayout={(event) => (bodyY.current = event.nativeEvent.layout.y)}>
              {threeCol ? (
                <View style={styles.sideNavCol}>
                  <SectionNav completedIds={completedIds} onJump={jumpTo} />
                </View>
              ) : null}
              <View style={styles.mainCol}>{timeline}</View>
              <View style={styles.asideCol}>{asideCards}</View>
            </View>
          ) : (
            <View style={styles.page} onLayout={(event) => (bodyY.current = event.nativeEvent.layout.y)}>
              {timeline}
              <View style={styles.asideNarrow}>{asideCards}</View>
            </View>
          )}
          <SiteFooter />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Katlı "Gerekirse" bölümü (herkese gerekmeyen adımlar). */
function ConditionalSection({
  open,
  onToggle,
  done,
  completedIds,
  onOpen,
  onLayoutY,
}: {
  open: boolean;
  onToggle: () => void;
  done: number;
  completedIds: ReadonlySet<string>;
  onOpen: (step: Step) => void;
  onLayoutY: (y: number) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.conditional} onLayout={(event) => onLayoutY(event.nativeEvent.layout.y)}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        // aria-expanded: iOS'ta accessibilityState.expanded olur, web'de de yazılır.
        aria-expanded={open}
        accessibilityLabel={`${t('phase.conditional')}, ${fill(t('home.a11y.tally'), {
          done,
          total: conditionalSteps.length,
        })}`}
        accessibilityHint={t('a11y.toggleSection')}
        style={({ pressed }) => [
          styles.timelineRow,
          styles.conditionalHeader,
          { borderTopColor: theme.rule },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.nodeCol, styles.chevron]}>
          <View style={open && styles.flipped}>
            <StatusIcon
              ios="chevron.down"
              material="expand_more"
              fallbackText="▾"
              size={NODE_SIZE - Spacing.sm}
              color={theme.text}
            />
          </View>
        </View>
        <View style={styles.conditionalTitle}>
          <ThemedText type="heading">{t('phase.conditional')}</ThemedText>
          <ThemedText type="label" themeColor="textSecondary">
            {`${done} / ${conditionalSteps.length}`}
          </ThemedText>
        </View>
      </Pressable>

      {open &&
        conditionalSteps.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            completedIds={completedIds}
            first={i === 0}
            last={i === conditionalSteps.length - 1}
            onOpen={() => onOpen(step)}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    // alignItems: 'center' BURAYA KONMAZ: o durumda ScrollView ekran
    // genişliğine göre değil, içeriğinin doğal genişliğine göre boyutlanıyor;
    // yazı satır atlamıyor ve sayfa ekrandan geniş hâle geliyordu.
    flex: 1,
  },
  pageNarrow: {
    // Alt bilgi bandı sayfanın sonunda; altında krem şerit kalmasın.
    paddingBottom: BottomTabInset,
  },
  page: {
    // Telefon ve dar web: tek sütun, tablet genişliğinde ortalı.
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: Gutter,
    paddingTop: Spacing.lg,
  },
  pageWide: {
    paddingBottom: 0,
  },
  body: {
    // Geniş ekran: sol menü (üç kolonda) + içerik + sağ bilgi kolonu.
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xxl - Spacing.md,
    width: '100%',
    maxWidth: MaxPageWidth + Gutter * 3,
    alignSelf: 'center',
    paddingHorizontal: Gutter * 1.5,
    paddingTop: Spacing.xl,
  },
  sideNavCol: {
    width: SideNavWidth,
    // Kayarken menü görünür kalır (web).
    position: 'sticky' as 'relative',
    top: Spacing.xxl + Spacing.lg,
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    maxWidth: MaxContentWidth,
  },
  asideCol: {
    width: AsideWidth,
    gap: Spacing.md,
  },
  asideNarrow: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  sideNav: {
    gap: Spacing.xxs,
  },
  sideNavTitle: {
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.smd,
  },
  sideNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.smd,
    borderRadius: Radius.sm,
  },
  sideNavLabel: {
    flex: 1,
  },
  progressCard: {
    padding: Spacing.mdl,
    borderRadius: Radius.lg,
    marginTop: 0,
    boxShadow: '0px 1px 2px rgba(20, 26, 43, 0.06), 0px 8px 24px rgba(20, 26, 43, 0.08)',
  },
  nextHeadingWide: {
    marginTop: 0,
  },
  tally: {
    gap: Spacing.sm,
  },
  tallyText: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: Spacing.sm,
  },
  ticks: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  tick: {
    flex: 1,
    // critique 2026-10: önce 11 ayrı mürekkep çerçeveli kutucuk; şimdi çerçevesiz
    // dolgu çentikler — boş çentik açık mavi ray (`track`), damgalı çentik marka mavisi.
    height: Spacing.sm - Spacing.xxs,
    borderRadius: Radius.xs / 2,
  },
  nextHeading: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.smd,
  },
  boxMain: {
    flexDirection: 'row',
    // Ok başlıkla aynı hizada (critique 7. tur: altta, son tarih satırının
    // yanında ayrı bir buton gibi duruyordu; kutunun tamamı zaten bağlantı).
    alignItems: 'flex-start',
    gap: Spacing.smd,
  },
  boxAction: {
    marginTop: Spacing.md,
  },
  box: {
    padding: Spacing.mdl,
    borderRadius: Radius.lg,
    boxShadow: '0px 1px 2px rgba(20, 26, 43, 0.06), 0px 4px 16px rgba(20, 26, 43, 0.06)',
  },
  boxText: {
    flex: 1,
    minWidth: 0,
  },
  boxOfficial: {
    marginTop: Spacing.xxs,
  },
  boxPhase: {
    marginTop: Spacing.smd,
  },
  due: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.smd,
  },
  dueDot: {
    width: Spacing.sm,
    height: Spacing.sm,
    borderRadius: Radius.pill,
    // Nokta, metin ikinci satıra sarsa da ilk satırın ortasında kalır.
    marginTop: (Typography.labelBold.lineHeight - Spacing.sm) / 2,
  },
  dueText: {
    flex: 1,
  },
  go: {
    width: GO_SIZE,
    height: GO_SIZE,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDone: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: Spacing.xs,
  },
  allDoneStamp: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
  },
  timeline: {
    marginTop: Spacing.lg,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: Spacing.smd,
  },
  nodeCol: {
    width: NODE_SIZE,
    alignItems: 'center',
  },
  rail: {
    position: 'absolute',
    left: NODE_CENTER - Border.node / 2,
    width: Border.node,
  },
  nodeSlot: {
    marginTop: ROW_PAD,
  },
  phaseTitle: {
    flex: 1,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  stepRow: {
    minHeight: TouchTarget,
  },
  rowText: {
    flex: 1,
    // minWidth: 0 olmadan esnek kutu, içindeki uzun tek kelimenin (Wohnungs-
    // geberbestätigung) doğal genişliğinin altına küçülmeyi reddedip taşıyor.
    minWidth: 0,
    gap: Spacing.xxs,
    paddingTop: ROW_PAD + TITLE_OFFSET,
    paddingBottom: ROW_PAD,
  },
  conditional: {
    marginTop: Spacing.lg,
  },
  conditionalHeader: {
    alignItems: 'center',
    minHeight: TouchTarget,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
    borderTopWidth: Border.hairline,
  },
  flipped: {
    transform: [{ rotate: '180deg' }],
  },
  chevron: {
    justifyContent: 'center',
  },
  conditionalTitle: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: Spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
