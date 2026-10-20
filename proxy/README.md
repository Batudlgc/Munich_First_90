# pratik-proxy — "Sor" ekranının LLM proxy'si

Uygulamanın tek sunucu bileşeni (APP.md §4). Cloudflare Workers ücretsiz
katmanında çalışır. Soruyu alır, ilgili adımın JSON'unu sistem prompt'una koyar,
modele (Mistral Small 4, AB uç noktası) iletir, cevabı + kaynak adım id'lerini döner.

**Saklamaz, loglamaz:** soru metni hiçbir yere yazılmaz. Kodda `console` çağrısı yok,
`wrangler.jsonc`'de `observability` kapalı. Saklanan tek şey sayaçlar
(`src/usage.ts`): IP'nin günlük değişen tuzlu özeti (ertesi gün silinir), günlük soru
ve token toplamı, sonuç türüne göre toplam sayı.

## API (B3 istemcisi için)

`POST /ask` — gövde:

```json
{ "question": "Anmeldung için hangi belgeler gerekiyor?", "lang": "tr", "step_id": "anmeldung" }
```

- `lang`: `en` | `tr` | `de` (zorunlu)
- `question`: 3–500 karakter (zorunlu)
- `step_id`: isteğe bağlı; adım ekranından soruluyorsa o adım kullanılır, yoksa
  sorunun metninden eşleştirilir (`src/steps.ts`)

Cevaplar (hepsi HTTP 200):

| `status` | Anlamı | Model çağrıldı mı |
|---|---|---|
| `answer` | `answer` + `source_step_ids` | evet |
| `no_answer` | Adım içeriğinde cevap yok; `source_step_ids` | evet |
| `no_match` | Soruyla eşleşen adım yok | hayır |
| `out_of_scope` | Kapsam bekçisi (`src/lib/scope.ts`) bireysel hukuki değerlendirme saydı; `message` sabit metin | hayır |

Hatalar: `400 invalid_request` · `403 origin_not_allowed` · `429 rate_limited`
(IP başına günlük limit) · `503 budget_exhausted` (günlük token bütçesi) ·
`502 upstream_error` · `500 internal`. Gövdede ayrıntı yok.

## Ölçüm (C1) + kanal etiketi (L2) — `POST /event`, `GET /stats`

`POST /event` gövde `{"event":"open"}`, `{"event":"open","channel":"tr-wa"}` ya da
`{"event":"step_done","step_id":"anmeldung"}` → her zaman `204` (geçerliyse). Kimlik,
soru metni, çerez yok; IP'nin günlük tuzlu özeti yalnız o gün tekilleştirmek ve
`DAILY_EVENT_LIMIT` (60) olay/IP/gün tavanı için tutulur, ertesi gün silinir. Kalıcı
olan: gün bazlı `visitors`/`completers`, gün × kanal ziyaretçi-gün toplamı ve adım
başına `step_done` sayısı.

**Kanal (`channel`):** yalnız `open`'da; `../src/lib/channels.ts` beyaz listesine karşı
doğrulanır (tr-wa, tr-tg, esn, fb, reddit, linkedin, mail, dm, qr, danisman, ios). Geçersiz ya da
eksik değer isteği reddetmez, olay etiketsiz sayılır (eski istemciler çalışır).
`step_done`'daki `channel` yok sayılır. Bir ziyaretçi-gün en fazla bir kanala yazılır
(o gün ilk görülen etiket); bu yüzden kanal toplamı ziyaretçi-günü aşmaz.

`GET /stats` (yalnız Batu): `Authorization: Bearer <STATS_TOKEN>`. Secret tanımlı
değilse `404`, yanlışsa `401`.

```bash
openssl rand -hex 24 | tee /dev/stderr | npx wrangler secret put STATS_TOKEN   # tokeni bir yere not et
curl -s -H "Authorization: Bearer $STATS_TOKEN" https://pratik-proxy.dalliagac.workers.dev/stats | jq
```

Örnek çıktı (testten; sayılar uydurma değil, test girdisinin sonucu):

```json
{
  "period": { "from": "2026-10-06", "to": "2026-10-06", "days": 1 },
  "visitor_days": 5,
  "completer_days": 1,
  "questions_total": 1,
  "channels": {
    "tr-wa": 2, "tr-tg": 0, "esn": 1, "fb": 0, "reddit": 0, "linkedin": 0,
    "mail": 0, "dm": 0, "qr": 0, "danisman": 0, "ios": 0, "unlabeled": 2
  },
  "days": [
    { "day": "2026-10-06", "visitors": 5, "completers": 1,
      "channels": { "tr-wa": 2, "esn": 1, "unlabeled": 2 } }
  ],
  "step_done": { "anmeldung": 1 },
  "questions": { "answer": 1 },
  "today": { "questions": 1, "tokens": 1000 }
}
```

- `visitor_days` / `completer_days` / `channels`: dönem toplamı (ilk günden bugüne). Günler UTC.
  `channels` içinde izinli her kanal görünür (0 dahil); `unlabeled` = etiketsiz ziyaretçi-gün
  (doğrudan giriş, eski istemci, geçersiz etiket). `sum(channels) == visitor_days`.
- `days[].channels`: o günün kırılımı (yalnız sıfırdan büyükler).
- `questions_total`: yanıt dönen Sor soruları = `answer + no_answer + no_match + out_of_scope`.
  Limit/bütçe/upstream hataları ve cihazda kapsam bekçisine takılan sorular (istek çıkmaz)
  dahil değil; ayrıntı `questions{}` (sonuç türüne göre).
- Ziyaretçi-gün **tekil kullanıcı değildir**: aynı kişi başka ağdan/başka gün tekrar sayılır
  (fazla), ortak IP'den (kampüs Wi-Fi, mobil NAT) gelen birden çok kişi tek sayılır (eksik).
  Yaklaşık bir gösterge; üst ya da alt sınır olarak okunmamalı. Bu bilinçli bir gizlilik tercihidir.

Deploy sonrası doğrulama (Batu; `$STATS_TOKEN` yukarıdaki secret):

```bash
P=https://pratik-proxy.dalliagac.workers.dev
# 1) etiketli open → 204
curl -s -o /dev/null -w "%{http_code}\n" -X POST $P/event -H 'Content-Type: application/json' -d '{"event":"open","channel":"dm"}'
# 2) etiketsiz (eski istemci) open → 204
curl -s -o /dev/null -w "%{http_code}\n" -X POST $P/event -H 'Content-Type: application/json' -d '{"event":"open"}'
# 3) geçersiz etiket → yine 204 (etiketsiz sayılır)
curl -s -o /dev/null -w "%{http_code}\n" -X POST $P/event -H 'Content-Type: application/json' -d '{"event":"open","channel":"bilinmeyen"}'
# 4) kırılım: channels.dm ≥ 1 görünmeli (not: 1–3 aynı IP'den → tek ziyaretçi-gün, kanal dm)
curl -s -H "Authorization: Bearer $STATS_TOKEN" $P/stats | jq '{visitor_days, channels}'
```

Not: 1–3 aynı IP'den geldiği için tek ziyaretçi-gün sayılır (`dm`). Bu bir test kaydıdır ve
canlı sayıya girer (sayacı sıfırlamanın yolu yok); durum dosyasına/ILERLEME'ye test kaydı olarak not et.

## Sıra (akış `src/index.ts` başında)

1. Doğrulama + izinli Origin (`ALLOWED_ORIGINS`; Origin'siz istek = iOS, izinli)
2. Kapsam bekçisi — uygulamayla **aynı dosya**, `../src/lib/scope.ts`
3. Adım eşleştirme — yoksa modele gidilmez
4. Limit — `DAILY_IP_LIMIT` soru/IP/gün, `DAILY_TOKEN_BUDGET` token/gün (Durable Object)
5. Model — `MAX_OUTPUT_TOKENS` çıkış tavanı, 20 sn zaman aşımı

## Geliştirme

```bash
npm ci            # kökte: testler ../src/lib/scope.ts'i derlerken kök tsconfig'i okur
cd proxy
npm ci
npm test          # workerd içinde, sahte upstream ile — anahtar gerekmez
npx tsc --noEmit
```

Not: npm 10.9'da `npm install` bu pakette arborist hatası veriyor
(`Cannot read properties of null (reading 'edgesOut')`); `npx npm@11 install` çalışıyor.
CI Node 24 / npm 11 kullanıyor.

## Deploy — Batu (👤, B1 bittikten sonra)

**Kısa yol:** repo kökünden `bash proxy/deploy.sh`. Aşağıdakilerin hepsini sırayla yapar,
sonunda canlı bir test isteği atar. Elle yapmak istersen:

```bash
cd proxy
npm ci
npx wrangler login
npx wrangler secret put LLM_API_KEY      # Mistral anahtarı (ücretli plan, Experiment değil)
openssl rand -hex 32 | npx wrangler secret put IP_HASH_SALT
npx wrangler deploy                      # → https://pratik-proxy.<hesap>.workers.dev
```

- Anahtar yalnız Cloudflare secret'ında durur; repoya, `wrangler.jsonc`'ye, `.dev.vars`
  dışında hiçbir dosyaya yazılmaz. CI her push'ta anahtar izi arar.
- Mistral konsolunda ayrıca aylık harcama tavanı koy. Proxy'nin kendi günlük token
  bütçesi (`DAILY_TOKEN_BUDGET`, varsayılan 300.000 ≈ günde en fazla ~$0,10) asıl sigorta.
- Deploy çıktısındaki URL istemciye `EXPO_PUBLIC_ASK_URL` olarak verilir (B3). Nasıl ve
  ne zaman: `docs/DEPLOY.md` → "Sor ekranını proxy'ye bağlama".
- Limitleri değiştirmek için `wrangler.jsonc` → `vars`, sonra yeniden `deploy`.
