#!/usr/bin/env node
// TEK KULLANIMLIK GÖÇ (migration): src/data/steps/*.json dosyalarını eski
// iki-dilli-düz şemadan yeni üç-dilli-katmanlı şemaya taşır.
//
// NEDEN: eski şemada bir adımın metni tek bir dizeydi ve o dize kimi dosyada
// Almanca, kimi dosyada Türkçe yazılmıştı; hangi parçanın resmi terim (asla
// çevrilmemesi gereken) hangisinin açıklama (çevrilmesi gereken) olduğu
// veriden okunamıyordu. Yeni şema bu ikisini ayırır:
//   official_title / authority.official / documents[].official  -> Almanca, çevrilmez
//   title / summary / *.plain / deadline_rule.text / common_mistakes -> { en, tr, de }
//
// EŞLEME:
//   title_de            -> official_title  VE  title.de
//   title_en            -> title.en
//   title.tr            -> "" (FAZ 2 dolduracak)
//   authority (string)  -> authority.official; authority.plain boş
//   documents[] (string)-> documents[].official; .plain boş
//   deadline_rule(str)  -> deadline_rule.text boş, days null  (metin kaybolmaz, aşağıya bak)
//   common_mistakes[]   -> boş dizi olarak DEĞİL, her madde boş çeviri nesnesi olarak taşınır
//
// BOŞ BIRAKILAN ÇEVİRİLER BİLİNÇLİDİR. Eski ham metni yeni "sade açıklama"
// alanına kopyalamak, yarısı göç etmiş içeriği tamamlanmış gibi gösterirdi:
// strict validate-steps.mjs o zaman yeşil yanar ve FAZ 2 atlanabilirdi. Boş
// bırakınca validator tam olarak yazılması gereken alanların listesini basar.
//
// HİÇBİR BİLGİ KAYBOLMAZ: göçten önceki tam veri
// docs/research/steps-legacy-<tarih>.json dosyasına dökülür (src/ dışında,
// uygulamaya paketlenmez) ve göç tek commit olduğu için `git revert` ile de
// geri alınabilir.
//
// Kullanım: node scripts/migrate-steps.mjs [--dry-run]

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const STEPS_DIR = path.join(ROOT, 'src', 'data', 'steps');
const LEGACY_DIR = path.join(ROOT, 'docs', 'research');

const dryRun = process.argv.includes('--dry-run');

/** Boş üç dilli açıklama nesnesi — FAZ 2 dolduracak. */
const emptyLocalized = () => ({ en: '', tr: '', de: '' });

function migrateStep(old) {
  // Zaten yeni şemadaysa dokunma (script iki kez çalıştırılırsa bozmasın).
  if ('official_title' in old) return { step: old, skipped: true };

  return {
    skipped: false,
    step: {
      id: old.id,
      city: old.city,
      official_title: old.title_de,
      title: { en: old.title_en ?? '', tr: '', de: old.title_de ?? '' },
      summary: emptyLocalized(),
      authority:
        old.authority === null || old.authority === undefined
          ? null
          : { official: old.authority, plain: emptyLocalized() },
      documents: (old.documents ?? []).map((doc) => ({
        official: doc,
        plain: emptyLocalized(),
      })),
      deadline_rule:
        old.deadline_rule === null || old.deadline_rule === undefined
          ? null
          : { days: null, text: emptyLocalized() },
      common_mistakes: (old.common_mistakes ?? []).map(() => emptyLocalized()),
      booking_url: old.booking_url ?? null,
      prerequisites: old.prerequisites ?? [],
      typical_duration_days: old.typical_duration_days ?? null,
      sources: old.sources ?? [],
      last_verified: old.last_verified ?? null,
    },
  };
}

function main() {
  const files = readdirSync(STEPS_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();

  const legacy = [];
  let migrated = 0;
  let skipped = 0;

  for (const name of files) {
    const filePath = path.join(STEPS_DIR, name);
    const old = JSON.parse(readFileSync(filePath, 'utf8'));
    legacy.push(old);

    const { step, skipped: wasSkipped } = migrateStep(old);
    if (wasSkipped) {
      skipped += 1;
      console.log(`  atlandı (zaten yeni şema): ${name}`);
      continue;
    }

    if (!dryRun) {
      writeFileSync(filePath, JSON.stringify(step, null, 2) + '\n', 'utf8');
    }
    migrated += 1;
    console.log(`  göç etti: ${name}`);
  }

  if (!dryRun && migrated > 0) {
    mkdirSync(LEGACY_DIR, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const legacyPath = path.join(LEGACY_DIR, `steps-legacy-${stamp}.json`);
    writeFileSync(legacyPath, JSON.stringify(legacy, null, 2) + '\n', 'utf8');
    console.log(`\nGöç öncesi ham veri: ${path.relative(ROOT, legacyPath)}`);
  }

  console.log(`\n${migrated} dosya göç etti, ${skipped} atlandı${dryRun ? ' (DENEME — yazılmadı)' : ''}.`);
}

main();
