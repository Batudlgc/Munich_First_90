import { type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DisclosureRow } from '@/components/disclosure-row';
import { AboutCard } from '@/components/home-aside';
import { FormBox, FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { SideCard } from '@/components/side-card';
import { StatusIcon } from '@/components/status-icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebHead } from '@/components/web-head';
import {
  Border,
  BottomTabInset,
  Gutter,
  AsideWidth,
  MaxContentWidth,
  MaxPageWidth,
  Radius,
  Spacing,
  TouchTarget,
  Typography,
} from '@/constants/theme';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { grantAiConsent, hasAiConsent, revokeAiConsent } from '@/lib/ai-consent';
import { askQuestion, MAX_QUESTION_LENGTH, MIN_QUESTION_LENGTH, type AskResult } from '@/lib/ask';
import { useLanguage } from '@/lib/language';
import { getStepById, type Step } from '@/lib/steps';

/**
 * "Sor" sekmesi (B3, görünüm UI v2): soru → proxy → cevap + kaynak adım.
 *
 * Akış src/lib/ask.ts'te: önce cihazda kapsam bekçisi (kapsam dışı soru hiç
 * gönderilmez), sonra proxy. Ekran yalnız sonucu gösterir. Adım sayfasından
 * gelindiyse (`/sor?step=anmeldung`) soru o adıma bağlanır ve proxy metinden
 * eşleştirme yapmadan o adımın içeriğini kullanır.
 *
 * Cevap metni düz metin olarak gösterilir; model çıktısı yorumlanmaz.
 *
 * İzin (B4): izin verilmeden soru kutusu hiç gösterilmez; yerine ne
 * gönderildiğini, kime gittiğini ve ne kadar saklandığını anlatan izin formu
 * çıkar (Apple 5.1.2(i)). Formun ilk kutusu cevapların bir yapay zekâ
 * modelinden geldiğini söyler (AI Act md. 50 — ilk etkileşimden önce).
 * Başlığın altındaki "yapay zekâ" etiketi iki hâlde de görünür, altta izni
 * geri alma bağlantısı durur. Asıl kapı ekranda değil askQuestion içinde:
 * izin kaydı yoksa istek zaten gitmez.
 *
 * UI v2'de yalnız GÖRÜNÜM değişti: izin metinleri (`ask.consent.*`), sırası
 * ve izin mantığı aynı — CONSENT_VERSION o metne bağlı.
 */
export default function AskScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, lang } = useLanguage();
  const { wide } = useLayout();
  const params = useLocalSearchParams<{ step?: string }>();
  const contextStep = params.step ? getStepById(params.step) : undefined;

  const [consented, setConsented] = useState(() => hasAiConsent());
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  // Arka arkaya iki soru sorulursa yalnız SONUNCUNUN cevabı gösterilir.
  const requestId = useRef(0);
  // Gönderilince sonuç alanı görünür alana kaydırılır (telefonda klavye ve
  // buton cevabın üstünü kapatmasın). Yalnız gönderimden sonraki ilk yerleşimde:
  // yazarken kutu büyüyüp alan aşağı kayarsa sayfa zıplamasın.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToResult = useRef(false);

  const canSubmit = !loading && question.trim().length >= MIN_QUESTION_LENGTH;

  async function submit() {
    if (!canSubmit) return;
    const id = ++requestId.current;
    scrollToResult.current = true;
    setLoading(true);
    setResult(null);
    const next = await askQuestion(question, lang, contextStep?.id ?? null);
    if (id !== requestId.current) return;
    setResult(next);
    setLoading(false);
  }

  // Bekleme 20 sn'ye kadar sürebilir; vazgeçince geç gelen cevap gösterilmez
  // (requestId) — istek zaten gitmiş olabilir, yalnız ekran serbest kalır.
  function cancel() {
    requestId.current++;
    setLoading(false);
  }

  function revoke() {
    revokeAiConsent();
    requestId.current++;
    setConsented(false);
    setLoading(false);
    setResult(null);
  }

  // Geniş ekranda (web masaüstü) içerik solda, bilgi kartları sağda; izin
  // kararı alt çubukta değil içeriğin sonunda (alt çubuk ortalı dar sütundu).
  const consentFooter = (
    <>
      {/* Yan yana, eşit genişlik: alt çubuk ekranın ~%30'u yerine ~%14'ü
          (critique 2026-10 3. tur). Vazgeçme kabul kadar kolay ve büyük kalır. */}
      <View style={[styles.footerWrap, { borderTopColor: theme.rule, backgroundColor: theme.background }]}>
        {/* İzin isteğe bağlı bilgisi kararın hemen üstünde (critique 10. tur:
            kaydırmadan görünmüyordu). Metin aynı; yalnız yeri değişti. */}
        <ThemedText type="caption" themeColor="textSecondary" style={styles.footerNote}>
          {t('ask.consent.voluntary')}
        </ThemedText>
      <View style={styles.footer}>
        <PrimaryButton
          label={t('ask.consent.decline')}
          variant="secondary"
          // Sor bir sekme: adım sayfasından gelindiyse oraya döner, geri
          // gidecek yer yoksa (doğrudan /sor açıldıysa) Adımlar sekmesine.
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.footerButton}
        />
        <PrimaryButton
          label={t('ask.consent.accept')}
          onPress={() => {
            grantAiConsent();
            setConsented(true);
          }}
          style={styles.footerButton}
        />
      </View>
      </View>
    </>
  );

  const mainChildren = (
    <>
      <AskHeader />
      {consented ? (
        <>
          <ThemedText type="body" themeColor="textSecondary">
            {t('ask.intro')}
          </ThemedText>

          {contextStep && (
            // Bağlamdan çıkmak URL'deki `step`'i siler: ekran ile adres
            // aynı şeyi söyler, geri dönüldüğünde bağlam hayalet gibi kalmaz.
            <StepContext step={contextStep} onRemove={() => router.setParams({ step: undefined })} />
          )}

          <QuestionField
            value={question}
            onChange={setQuestion}
            onSubmit={submit}
            // Boş, dokunulmamış kutuda uyarı hata gibi duruyordu; yalnız yazmaya
            // başlanıp 3 karakterin altında kalınca görünür.
            showHint={!loading && question.trim().length > 0 && !canSubmit}
          />

          <PrimaryButton
            label={t('ask.submit')}
            onPress={submit}
            disabled={!canSubmit}
            busy={loading}
            accessibilityHint={!loading && !canSubmit ? t('ask.submitHint') : undefined}
          />

          {(loading || result) && (
            <View
              style={styles.resultArea}
              accessibilityLiveRegion="polite"
              onLayout={(event) => {
                if (!scrollToResult.current) return;
                scrollToResult.current = false;
                scrollRef.current?.scrollTo({ y: event.nativeEvent.layout.y - Spacing.md, animated: true });
              }}
            >
              {loading ? <LoadingRow onCancel={cancel} /> : result && <ResultView result={result} onRetry={submit} />}
            </View>
          )}

          {/* Cevaptan sonra da durur: bir sonraki soru için (critique 2026-10 3. tur). */}
          {!loading && <Examples onPick={setQuestion} />}

          <ScopeHints />

          <Pressable onPress={revoke} accessibilityRole="button" style={styles.textButton}>
            <ThemedText type="link">{t('ask.revoke')}</ThemedText>
          </Pressable>
        </>
      ) : (
        <ConsentForm />
      )}
      {wide && !consented ? consentFooter : null}
    </>
  );

  return (
    <ThemedView style={styles.container}>
      <WebHead title={t('ask.title')} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView ref={scrollRef} contentContainerStyle={wide ? styles.wideRow : styles.content} keyboardShouldPersistTaps="handled">
          {wide ? (
            <>
              <View style={[styles.content, styles.mainWide]}>{mainChildren}</View>
              <View style={styles.asideCol}>
                <SideCard title={t('ask.canAskTitle')}>
                  <ThemedText type="label" themeColor="textSecondary">
                    {t('ask.canAskExample')}
                  </ThemedText>
                </SideCard>
                <SideCard title={t('ask.cannotAskTitle')}>
                  <ThemedText type="label" themeColor="textSecondary">
                    {t('ask.cannotAskExample')}
                  </ThemedText>
                </SideCard>
                <AboutCard />
              </View>
            </>
          ) : (
            mainChildren
          )}
        </ScrollView>
        {!consented && !wide && consentFooter}
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Sekme başlığı + kalıcı yapay zekâ etiketi (AI Act md. 50). Etiket izin
 * ekranında da, izinden sonra da başlığın hemen altında durur. critique
 * 2026-10: önce çerçeveliydi ve dokunulabilir bir buton gibi görünüyordu;
 * şimdi çerçevesiz, ikonlu bir satır.
 */
function AskHeader() {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.header}>
      <ThemedText type="display" accessibilityRole="header" aria-level={1}>
        {t('ask.title')}
      </ThemedText>
      <View style={styles.aiTag}>
        <StatusIcon ios="sparkles" material="auto_awesome" fallbackText="" size={16} color={theme.textSecondary} />
        <ThemedText type="label" themeColor="textSecondary">
          {t('ask.aiBadge')}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * İzin formu: ne, kime, ne kadar — sonra açık kabul ya da vazgeç.
 *
 * critique 2026-10: önce üç uzun paragraf (biri 10 satır) ve jargon ("tuzlu
 * özet", "Cloudflare Workers") ekranı dolduruyor, kabul butonu ikinci ekrana
 * düşüyordu. Şimdi başlık + yapay zekâ bildirimi, sonra her başlıkta
 * tek cümlelik özet (`*Short`); B4'teki tam metinler HİÇ değişmedi ve
 * "Ayrıntıları göster" ile aynı kutuda açılır. Özetler tam metinde söylenmeyen
 * hiçbir şey söylemez; bu yüzden CONSENT_VERSION artmadı. Tam metin
 * değişirse sürüm artmalı (ai-consent.ts).
 */
function ConsentForm() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useLanguage();
  const [details, setDetails] = useState(false);
  const sections = [
    ['ask.consent.whatTitle', 'ask.consent.whatShort', 'ask.consent.what'],
    ['ask.consent.whoTitle', 'ask.consent.whoShort', 'ask.consent.who'],
    ['ask.consent.storeTitle', 'ask.consent.storeShort', 'ask.consent.store'],
  ] as const;

  return (
    <>
      {/* critique 6. tur: "Sor" başlığının hemen altında ikinci bir başlık
          ("Sor özelliğini açmadan önce") yoğunluk yaratıyordu. Başlık yalnız
          ekran okuyucu için kalır (bölümün adı), görsel olarak AI kutusu açar. */}
      <ThemedText accessibilityRole="header" aria-level={2} style={styles.srOnly}>
        {t('ask.consent.title')}
      </ThemedText>
      <View style={[styles.panel, { backgroundColor: theme.fill }]}>
        <StatusIcon ios="sparkles" material="auto_awesome" fallbackText="" size={20} color={theme.text} />
        <ThemedText type="body" style={styles.panelText}>
          {t('ask.consent.aiNotice')}
        </ThemedText>
      </View>
      {/* Kullanıcının yapacağı tek şey önce: kişisel bilgi yazmamak. */}
      <ThemedText type="bodyBold">{t('ask.consent.personal')}</ThemedText>
      {/* Ayrıntılar açılınca metin yerinde değişir; ekran okuyucu yeni metni duyar. */}
      <View accessibilityLiveRegion="polite">
        <FormBox>
          {sections.map(([title, short, full]) => (
            <FormField key={title} label={t(title)}>
              <ThemedText type="body">{t(details ? full : short)}</ThemedText>
            </FormField>
          ))}
        </FormBox>
      </View>
      <DisclosureRow
        label={t(details ? 'ask.consent.hideDetails' : 'ask.consent.showDetails')}
        open={details}
        onToggle={() => setDetails((shown) => !shown)}
      />
      <Pressable onPress={() => router.push('/hakkinda')} accessibilityRole="link" style={styles.textButton}>
        <ThemedText type="link">{t('ask.consent.privacyLink')}</ThemedText>
      </Pressable>
    </>
  );
}

/** Adım sayfasından gelinen soru: hangi adım hakkında olduğu + bağlamdan çıkma (×). */
function StepContext({ step, onRemove }: { step: Step; onRemove: () => void }) {
  const theme = useTheme();
  const { t, lang } = useLanguage();
  return (
    <FormBox>
      <View style={styles.contextRow}>
        <View style={styles.contextField}>
          <FormField label={t('ask.stepContext')} value={step.title[lang]} />
        </View>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={t('ask.stepContextRemove')}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <StatusIcon ios="xmark" material="close" fallbackText="×" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>
    </FormBox>
  );
}

/**
 * Soru alanı, bir form alanı gibi: etiket üstte, kâğıt zeminli ve mürekkep
 * çerçeveli giriş kutusu, karakter sayacı altında. Sınır (MAX_QUESTION_LENGTH)
 * proxy'dekiyle aynı; `maxLength` fazlasını zaten yazdırmaz, sayaç yalnız
 * ne kadar yer kaldığını gösterir.
 *
 * Çerçeve giriş kutusunun KENDİSİNDE, sarmalayıcıda değil: web'de klavye odak
 * halkası (global.css :focus-visible) böylece kutunun tamamını çevreliyor.
 * ÖNCE etiket kutunun içindeydi ve halka kutunun içinde ikinci bir dikdörtgen
 * çiziyordu.
 */
function QuestionField({
  value,
  onChange,
  onSubmit,
  showHint,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  /** Gönderilemiyorken nedeni görünür yaz (önce yalnız ekran okuyucuya söyleniyordu). */
  showHint: boolean;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.field}>
      <ThemedText type="labelBold">{t('ask.inputLabel')}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        submitBehavior="blurAndSubmit"
        multiline
        maxLength={MAX_QUESTION_LENGTH}
        accessibilityLabel={t('ask.inputLabel')}
        placeholder={t('ask.inputPlaceholder')}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.line }]}
      />
      <View style={styles.fieldFoot}>
        <ThemedText type="caption" themeColor="textSecondary" style={styles.fieldHint}>
          {/* Kutunun hemen altında: gönderilemiyorsa nedeni, yoksa kişisel bilgi
              hatırlatması (critique 7. tur: butonun altında, kutudan uzaktı). */}
          {showHint ? t('ask.submitHint') : t('ask.consent.personal')}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {`${value.length} / ${MAX_QUESTION_LENGTH}`}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * Bekleme satırı. Sistem göstergesi (ActivityIndicator) B3'ten kaldı: cevap
 * 20 saniyeye kadar sürebilir, hareketsiz bir satır donmuş gibi görünürdü.
 * Bu bir ilerleme göstergesi, süs animasyonu değil (tek animasyon damga anı).
 */
function LoadingRow({ onCancel }: { onCancel: () => void }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={styles.loadingRow}>
      <ActivityIndicator color={theme.textSecondary} />
      <ThemedText type="label" themeColor="textSecondary" style={styles.loadingText}>
        {t('ask.loading')}
      </ThemedText>
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
      >
        <ThemedText type="link" themeColor="accent" style={styles.underline}>
          {t('ask.cancel')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

/**
 * Model düz metin istense de ara sıra markdown işareti döndürebiliyor; cevap
 * düz metin gösterildiği için (yorumlanmaz) işaretler temizlenir: kalın/italik
 * yıldızları, başlık diyezleri; satır başı "- " / "* " madde işaretine döner.
 * Metnin kendisi değişmez.
 */
function plainAnswer(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ');
}

/** Yeniden denemenin işe yarayabileceği hatalar (sınır dolması ve kapalı özellik değil). */
const RETRYABLE = new Set(['network', 'timeout', 'unavailable']);

function ResultView({ result, onRetry }: { result: AskResult; onRetry: () => void }) {
  const { t } = useLanguage();
  switch (result.status) {
    case 'answer':
      return (
        <FormBox>
          <FormField label={t('ask.answerLabel')}>
            <ThemedText type="body" selectable>
              {plainAnswer(result.answer)}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary" style={styles.answerNote}>
              {t('ask.answerNote')}
            </ThemedText>
          </FormField>
          {result.source_step_ids.length > 0 && <SourceList ids={result.source_step_ids} />}
        </FormBox>
      );
    case 'no_answer':
      return (
        <>
          <Notice kind="no_answer" text={t('ask.noAnswer')} />
          {result.source_step_ids.length > 0 && (
            <FormBox>
              <SourceList ids={result.source_step_ids} />
            </FormBox>
          )}
        </>
      );
    case 'no_match':
      return <Notice kind="no_match" text={t('ask.noMatch')} />;
    case 'out_of_scope':
      return <Notice kind="out_of_scope" text={result.message} />;
    case 'error':
      return (
        <Notice
          kind="error"
          text={t(`ask.error.${result.error}`)}
          onRetry={RETRYABLE.has(result.error) ? onRetry : undefined}
        />
      );
  }
}

/**
 * Cevabın dayandığı adımlar: kısa ad + resmi Almanca ad, tek "›" ile adım
 * sayfasına gider. Proxy'nin döndüğü ama uygulamada olmayan bir kimlik
 * (eski sürüm, bozuk yanıt) bağlantı olmaz — boş sayfaya götürmesin.
 */
function SourceList({ ids }: { ids: string[] }) {
  const theme = useTheme();
  const router = useRouter();
  const { t, lang } = useLanguage();
  const steps = ids.map((id) => getStepById(id)).filter((step): step is Step => step !== undefined);
  if (steps.length === 0) return null;

  return (
    <View>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.sourcesLabel}>
        {t('ask.sourcesTitle')}
      </ThemedText>
      {steps.map((step, i) => (
        <Pressable
          key={step.id}
          onPress={() => router.push({ pathname: '/adim/[id]', params: { id: step.id } })}
          accessibilityRole="link"
          accessibilityLabel={`${step.title[lang]}, ${step.official_title}`}
          accessibilityHint={t('ask.sourceHint')}
          style={({ pressed }) => [
            styles.sourceRow,
            i > 0 && [styles.sourceRule, { borderTopColor: theme.rule }],
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.sourceText}>
            <ThemedText type="itemTitle">{step.title[lang]}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {step.official_title}
            </ThemedText>
          </View>
          <StatusIcon
            ios="chevron.right"
            material="chevron_right"
            fallbackText="›"
            size={20}
            color={theme.textSecondary}
          />
        </Pressable>
      ))}
    </View>
  );
}

type NoticeKind = 'no_answer' | 'no_match' | 'out_of_scope' | 'error';

const NOTICE_ICONS: Record<NoticeKind, { ios: SFSymbol; material: AndroidSymbol; fallback: string }> = {
  no_answer: { ios: 'doc.text.magnifyingglass', material: 'find_in_page', fallback: '?' },
  no_match: { ios: 'questionmark.circle', material: 'help', fallback: '?' },
  out_of_scope: { ios: 'hand.raised', material: 'back_hand', fallback: '!' },
  error: { ios: 'exclamationmark.triangle', material: 'warning', fallback: '!' },
};

/**
 * Cevap olmayan sonuçlar (kapsam dışı, eşleşme yok, cevap yok, hata): cevap
 * kutusundan ayrı biçimde — çerçevesiz, tonal zeminli (`fill`), ikonlu bir
 * not. Ağ/zaman aşımı/kullanılamıyor hatalarında "Tekrar dene". Sakin kalır: hata da kırmızı (`due`) DEĞİL; o renk yalnız son tarih.
 * Hata ikonu mürekkep, diğerleri ikincil mürekkep rengi.
 */
function Notice({ kind, text, onRetry }: { kind: NoticeKind; text: string; onRetry?: () => void }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const icon = NOTICE_ICONS[kind];
  return (
    <View style={[styles.notice, { backgroundColor: theme.fill }]}>
      <StatusIcon
        ios={icon.ios}
        material={icon.material}
        fallbackText={icon.fallback}
        size={22}
        color={kind === 'error' ? theme.text : theme.textSecondary}
      />
      <View style={styles.noticeText}>
        <ThemedText type="body">{text}</ThemedText>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
          >
            <ThemedText type="link" themeColor="accent" style={styles.underline}>
              {t('ask.retry')}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Örnek sorular dokunulabilir çipler: dokununca soru kutuya yazılır (critique
 * 2026-10: önce tırnak içinde düz metindi, telefonda yeniden yazmak gerekiyordu).
 * Örnekler mevcut `ask.canAskExample` metninden ayrıştırılır — tek kaynak,
 * yeni metin yok. Tırnak biçimi dile göre değişir ("…" / „…“).
 */
function Examples({ onPick }: { onPick: (question: string) => void }) {
  const { t } = useLanguage();
  const theme = useTheme();
  const examples = [...t('ask.canAskExample').matchAll(/["„“]([^"„“”]+)["“”]/g)].map((match) => match[1]);
  if (examples.length === 0) return null;
  return (
    <View style={styles.hint}>
      <ThemedText type="labelBold">{t('ask.examplesTitle')}</ThemedText>
      <View style={styles.chips}>
        {examples.map((example) => (
          <Pressable
            key={example}
            onPress={() => onPick(example)}
            accessibilityRole="button"
            accessibilityHint={t('ask.exampleHint')}
            // Yüzey + ince çizgi: devre dışı gönder butonuyla aynı gri dolguda
            // pasif gibi görünüyordu (critique 9. tur).
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: theme.surface, borderColor: theme.rule },
              pressed && styles.pressed,
            ]}
          >
            <ThemedText type="label">{example}</ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Neyin cevaplanmadığı — formdan ince bir ayraçla ayrı. Sorulabilecekler artık çip (Examples). */
function ScopeHints() {
  const theme = useTheme();
  const { t } = useLanguage();
  return (
    <View style={[styles.hints, { borderTopColor: theme.rule }]}>
      <View style={styles.hint}>
        <ThemedText type="labelBold">{t('ask.cannotAskTitle')}</ThemedText>
        <ThemedText type="label" themeColor="textSecondary">
          {t('ask.cannotAskExample')}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    // alignItems: 'center' BURAYA KONMAZ — bkz. (tabs)/index.tsx'teki açıklama.
    flex: 1,
  },
  wideRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xxl - Spacing.md,
    width: '100%',
    maxWidth: MaxPageWidth + Gutter * 3,
    alignSelf: 'center',
    paddingHorizontal: Gutter * 1.5,
    paddingBottom: Spacing.xxl,
  },
  mainWide: {
    flex: 1,
    maxWidth: 760,
    paddingHorizontal: 0,
    paddingTop: Spacing.xl,
    paddingBottom: 0,
  },
  asideCol: {
    width: AsideWidth,
    gap: Spacing.md,
    paddingTop: Spacing.xl,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Gutter,
    paddingTop: Spacing.lg,
    paddingBottom: BottomTabInset + Spacing.xl,
    gap: Spacing.md,
  },
  header: {
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  aiTag: {
    flexDirection: 'row',
    // flex-start: büyük yazıda etiket iki satıra sarınca ikon ilk satırın yanında
    // kalır (center iken iki satırın ortasına, ikinci satırın başına düşüyordu).
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.smd,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  panelText: {
    flex: 1,
  },
  underline: {
    textDecorationLine: 'underline',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    borderWidth: Border.hairline,
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingHorizontal: Spacing.smd,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  footerButton: {
    flex: 1,
    paddingHorizontal: Spacing.smd,
  },
  footerWrap: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Gutter,
    paddingVertical: Spacing.smd,
    gap: Spacing.sm,
    borderTopWidth: Border.hairline,
  },
  footerNote: {
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  textButton: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contextField: {
    flex: 1,
    minWidth: 0,
  },
  iconButton: {
    width: TouchTarget,
    height: TouchTarget,
    marginRight: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  field: {
    gap: Spacing.xs,
  },
  input: {
    ...Typography.body,
    borderWidth: Border.box,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.smd,
    paddingVertical: Spacing.smd - Spacing.xxs,
    // Dört satırlık yer: örnek soru placeholder'da tam görünsün, yazarken
    // kutu zıplamasın.
    minHeight: Typography.body.lineHeight * 4 + Spacing.lg,
    textAlignVertical: 'top',
  },
  fieldFoot: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  fieldHint: {
    flex: 1,
  },
  resultArea: {
    gap: Spacing.smd,
  },
  loadingText: {
    flex: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget,
  },
  answerNote: {
    marginTop: Spacing.sm,
  },
  sourcesLabel: {
    paddingHorizontal: Spacing.smd,
    paddingTop: Spacing.smd - Spacing.xxs,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: TouchTarget + Spacing.sm,
    paddingHorizontal: Spacing.smd,
    paddingVertical: Spacing.sm,
  },
  sourceRule: {
    borderTopWidth: Border.hairline,
  },
  sourceText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xxs,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.smd,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  noticeText: {
    flex: 1,
  },
  hints: {
    borderTopWidth: Border.hairline,
    paddingTop: Spacing.md,
    marginTop: Spacing.sm,
    gap: Spacing.md,
  },
  hint: {
    gap: Spacing.xxs,
  },
});
