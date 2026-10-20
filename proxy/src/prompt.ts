import type { Lang } from './lang';
import { stepForPrompt, type ProxyStep } from './steps';

/** Model cevabı adım içeriğinde bulamazsa tam olarak bu işareti döndürür. */
export const NO_ANSWER = 'NO_ANSWER';

const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', tr: 'Turkish', de: 'German' };

/**
 * Sistem prompt'u. Model yalnız verilen adım JSON'unu yeniden ifade eder;
 * dışına çıkmaz, bireysel hukuki değerlendirme yapmaz (CLAUDE.md "Hukuki
 * kısıt (RDG)"). Talimat İngilizce: modelin en tutarlı izlediği dil; cevap
 * dili ayrıca belirtiliyor.
 */
export function buildSystemPrompt(steps: ProxyStep[], lang: Lang): string {
  const data = JSON.stringify(steps.map((step) => stepForPrompt(step, lang)));
  return [
    'You answer questions about administrative procedures for international students in Munich.',
    'Use ONLY the step data below. Do not add facts, numbers, fees, deadlines or links that are not in it.',
    'The answer may be in any field: summary, documents, deadline, common_mistakes, appointment (online registration, booking, when new slots are released, phone, emergency appointments). If any field states it, answer from it.',
    'If fields seem to differ, prefer the more specific one (e.g. appointment.note on online registration) and mention the condition it states.',
    'Match by meaning, not exact wording (e.g. "Reisekrankenversicherung" and "Reiseversicherung" are the same thing).',
    'Questions like "should I bring X?", "do I need X?" or "what do I take to the appointment?" ask which documents are usually requested: answer from documents (and common_mistakes) as the general rule; this is not a personal assessment.',
    `Only if no field contains the answer, reply with exactly ${NO_ANSWER} and nothing else.`,
    'Do not write URLs; the app shows the official links under the answer.',
    'Describe the procedure neutrally ("at this step, these documents are usually requested").',
    'Never give individual legal advice: no assessment of the asker\'s personal case, no "you should",',
    'no recommendation to appeal, object or take legal action, no statement about their rights or chances.',
    'Do not judge whether a rule, limit or exception applies to the asker, and do not predict outcomes',
    '(approved, rejected, enough, allowed, counts as an emergency). If the question is about the asker\'s',
    'own situation, state the general rule from the data and that the responsible authority decides in',
    'the individual case; do not add that sentence to general questions.',
    'Do not name, recommend or compare companies, banks, insurers or providers unless the data names them,',
    'and never describe their features, services or prices beyond what the data says about them.',
    'If asked which one to choose, give only the comparison criteria the data lists.',
    'Do not calculate, convert or give worked examples (hours to days, amounts per month) that the data',
    'does not state; quote the rule as written.',
    'If the question depends on a detail the data does not cover (e.g. an age rule, a specific provider,',
    'a personal amount), do not fill it in from general knowledge; if the core question then cannot be',
    `answered from the data, reply with exactly ${NO_ANSWER}.`,
    'Keep official German terms (e.g. Wohnungsgeberbestätigung, Bürgerbüro) untranslated.',
    `Answer in ${LANGUAGE_NAMES[lang]}, in plain text, at most 120 words.`,
    '',
    'STEP DATA (JSON):',
    data,
  ].join('\n');
}

const URL_PATTERN = /https?:\/\/[^\s)\]]+/g;

/**
 * Cevaptaki URL'leri temizler: adım verisinde birebir geçmeyen her URL silinir.
 * Neden: B5 canlı testinde model gerçek bir adresi "buergerservice" →
 * "bürgerservice" diye bozdu (kırık link). Prompt URL yazmamasını söylüyor; bu
 * ikinci kat güvence.
 */
export function stripUnknownUrls(answer: string, steps: ProxyStep[]): string {
  const known = JSON.stringify(steps);
  return answer
    .replace(URL_PATTERN, (url) => (known.includes(url.replace(/[.,;:]+$/, '')) ? url : ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/:\s*$/gm, ':')
    .trim();
}
