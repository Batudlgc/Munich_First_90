#!/usr/bin/env bash
# Xcode/Simulator olmadan görsel doğrulama hattı.
#
# Kullanım:
#   scripts/screenshot.sh                          # tüm rotalar
#   scripts/screenshot.sh /adim/anmeldung adim-anmeldung
#   FONT_SCALE=1.5 scripts/screenshot.sh           # büyük yazı denetimi
#
# Ne yapar: web export alır, kendi statik sunucusunu 8099'da (Batu'nun Metro'su
# olabilecek 8081'e DOKUNMADAN) başlatır, headless Chrome'u CDP ile sürerek
# GERÇEK 390x844 mobil viewport'ta ekran görüntüsü alır ve her sayfayı
# otomatik denetler (yatay taşma, 44pt altı dokunma alanı, etiketsiz öğe).
#
# 14.09.2026 DÜZELTMESİ — neden CDP: eski sürüm `--window-size=390,844
# --screenshot` kullanıyordu. Bu bayrak headless Chrome'da sayfanın YERLEŞİM
# genişliğini belirlemiyor: sayfa 500px'te yerleşip çıktı 390px'e KIRPILIYORDU.
# Sonuç, içerik ekrandan taşıyormuş gibi görünen ama aslında yalnızca kırpılmış
# bir görüntüydü — yani hatalı bir "doğrulama". Ölçüm: aynı sayfa gerçek 390px
# viewport'ta scrollWidth=390, taşan eleman 0.
#
# SINIR: Bu web render'ıdır, iOS Simulator/cihaz render'ı DEĞİLDİR. "Ekran
# açılıyor ve düzen makul mü" sorusunu cevaplar; "iOS'ta birebir böyle görünür"
# sorusunu cevaplamaz. (CocoaPods kurulu olmadığı için yerel iOS derlemesi yok.)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-web"
# OUT_DIR / PORT dışarıdan verilebilir: iki oturum (ya da iki worktree) aynı
# anda çekim yaparken 8099'da çakışmasın, çıktılar ayrı klasöre düşsün.
OUT_DIR="${OUT_DIR:-$ROOT_DIR/docs/screenshots}"
PORT="${PORT:-8099}"
CDP_PORT="${CDP_PORT:-9222}"
while lsof -nP -iTCP:"$CDP_PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  CDP_PORT=$((CDP_PORT + 1))
done
WIDTH="${WIDTH:-390}"
HEIGHT="${HEIGHT:-844}"
FONT_SCALE="${FONT_SCALE:-1}"
# Chrome yolu: CHROME ortam değişkeni > macOS uygulaması > PATH (Linux/bulut).
# Bulut oturumunda Chrome'u scripts/cloud-setup.sh kurar (APP.md §9).
SANDBOX_FLAG=""
if [ -z "${CHROME:-}" ]; then
  if [ "$(uname)" = "Darwin" ]; then
    CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  else
    CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
  fi
fi
if [ "$(uname)" != "Darwin" ]; then
  # Bulut VM'i root çalışır; Chrome root altında sandbox'sız açılmak zorunda.
  SANDBOX_FLAG="--no-sandbox"
fi
PROFILE_DIR="$(mktemp -d)"

if [ -z "$CHROME" ] || [ ! -x "$CHROME" ]; then
  echo "HATA: Chrome bulunamadı (${CHROME:-yol yok}). macOS: Google Chrome kur." >&2
  echo "      Linux/bulut: bash scripts/cloud-setup.sh ya da CHROME=/yol/chrome" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Rota listesi: "rota:dosya-adı"
if [ "$#" -ge 1 ]; then
  ROUTES=("${1}:${2:-screenshot}")
else
  ROUTES=(
    "/:ana-ekran"
    "/explore:kesfet"
    "/sor:sor"
    "/hakkinda:hakkinda"
    "/adim/anmeldung:adim-anmeldung"
    "/adim/steuer-id:adim-steuer-id"
  )
fi

# SKIP_EXPORT=1: aynı kodun ikinci çekiminde (koyu tema, büyük yazı) export'u
# tekrar alma — dist-web zaten güncel.
if [ "${SKIP_EXPORT:-0}" = "1" ] && [ -d "$DIST_DIR" ]; then
  echo "[1/4] web export atlandı (SKIP_EXPORT=1)"
else
  echo "[1/4] web export (dist-web)..."
  (cd "$ROOT_DIR" && npx expo export --platform web --output-dir dist-web --clear >/dev/null)
fi

echo "[2/4] statik sunucu $PORT'ta başlıyor (COOP/COEP header'lı)..."
python3 "$ROOT_DIR/scripts/serve_with_headers.py" "$DIST_DIR" "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!

echo "[3/4] headless Chrome $CDP_PORT'ta başlıyor..."
"$CHROME" --headless=new --disable-gpu --hide-scrollbars $SANDBOX_FLAG \
  --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$PROFILE_DIR" about:blank >/dev/null 2>&1 &
CHROME_PID=$!

cleanup() {
  kill "$CHROME_PID" "$SERVER_PID" 2>/dev/null || true
  # Chrome profil dizinine hâlâ yazıyor olabilir; kapanmasını bekle, yoksa
  # temizlik "Directory not empty" ile patlayıp betiği hatayla bitiriyordu.
  wait "$CHROME_PID" 2>/dev/null || true
  rm -rf "$PROFILE_DIR" 2>/dev/null || true
}
trap cleanup EXIT

# Sabit bekleme yerine Chrome'un CDP ucu açılana kadar yokla (en çok 30 sn).
# 13.10: bulut VM'inde Chrome 155 ilk açılışta ~13 sn sürdü; eski `sleep 4`
# ile shot.mjs ECONNREFUSED alıyordu.
for _ in $(seq 1 30); do
  curl -s "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null 2>&1 && break
  sleep 1
done

echo "[4/4] ekran görüntüleri (${WIDTH}x${HEIGHT}, fontScale=$FONT_SCALE, tema=${COLOR_SCHEME:-light})"
SUFFIX=""
if [ "${COLOR_SCHEME:-}" = "dark" ]; then SUFFIX="-koyu"; fi
if [ "$FONT_SCALE" != "1" ]; then SUFFIX="$SUFFIX-font$FONT_SCALE"; fi

for entry in "${ROUTES[@]}"; do
  route="${entry%%:*}"
  name="${entry##*:}"
  echo "  -> $route"
  # Tanıtım katmanı "görüldü" olarak tohumlanır, yoksa her rotanın üstünü
  # kapatır ve asıl ekran görüntülenemez.
  # CLICK_LABEL/CLICK_COUNT dışarıdan verilebilir: görüntü alınmadan önce bir
  # öğeye tıklar. Dil doğrulaması böyle yapılıyor:
  #   CLICK_LABEL=Deutsch CLICK_COUNT=1 scripts/screenshot.sh / ana-ekran-de
  # SEED_STORAGE dışarıdan verilirse onu kullanır (ör. dil: "app_language":"de").
  # TYPE_TEXT metin kutusuna yazar (Sor ekranı uçtan uca, bkz. docs/durum/B3.md):
  #   TYPE_TEXT="..." CLICK_LABEL=Ask CLICK_COUNT=1 CLICK_WAIT=4000 scripts/screenshot.sh /sor sor-cevap
  SEED_STORAGE="${SEED_STORAGE:-{\"onboarding_seen\":\"true\"\}}" \
  CLICK_LABEL="${CLICK_LABEL:-}" CLICK_COUNT="${CLICK_COUNT:-0}" \
  TYPE_TEXT="${TYPE_TEXT:-}" CLICK_WAIT="${CLICK_WAIT:-600}" TAB_COUNT="${TAB_COUNT:-0}" OFFLINE="${OFFLINE:-0}" \
  CDP_PORT="$CDP_PORT" node "$ROOT_DIR/scripts/shot.mjs" \
    "http://localhost:$PORT$route" "$OUT_DIR/$name$SUFFIX.png" \
    "$WIDTH" "$HEIGHT" "$FONT_SCALE"
done

# Tanıtım ekranları: tohum YOK (katman görünsün), her sayfa için bir görüntü.
# İki sayfa (UI v2, A5): 1 = ne olduğu, 2 = dil seçimi.
if [ "$#" -eq 0 ]; then
  for i in 0 1; do
    echo "  -> tanıtım adım $((i + 1))"
    # Buton etiketi CİHAZ DİLİNDEN geliyor (src/lib/language.tsx
    # detectDeviceLang). Headless Chrome burada en-US bildiriyor, o yüzden
    # "Continue". Dil değişirse bu etiket de değişir.
    CLEAR_STORAGE=1 CLICK_LABEL="${ONBOARDING_NEXT_LABEL:-Continue}" CLICK_COUNT="$i" \
    CDP_PORT="$CDP_PORT" node "$ROOT_DIR/scripts/shot.mjs" \
      "http://localhost:$PORT/" "$OUT_DIR/tanitim-$((i + 1))$SUFFIX.png" \
      "$WIDTH" "$HEIGHT" "$FONT_SCALE"
  done
fi

echo "Tamam: $OUT_DIR"
