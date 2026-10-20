#!/usr/bin/env bash
# Proxy'yi Cloudflare'e tek komutla yayınlar. Nereden çalıştırılırsa çalıştırılsın
# proxy/ klasörüne geçer (kökte çalıştırınca yanlış Worker yayınlanmasın diye).
#
#   bash proxy/deploy.sh
#
# Senden istenenler: tarayıcıda Cloudflare girişi (ilk sefer) ve Mistral anahtarını
# yapıştırmak. Anahtar ekranda görünmez, dosyaya yazılmaz, yalnız Cloudflare'e gider.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

say "1/5 Bağımlılıklar (proxy/)"
# npm 10.9'daki arborist hatası yüzünden npm 11 (bkz. README).
npx -y npm@11 ci --no-audit --no-fund

say "2/5 Cloudflare girişi"
if ! npx wrangler whoami >/dev/null 2>&1; then
  npx wrangler login
fi
npx wrangler whoami | grep -iE "logged in|email" || true

say "3/5 Yayınla (Worker adı: pratik-proxy)"
out="$(mktemp)"
npx wrangler deploy | tee "$out"
url="$(grep -oE 'https://pratik-proxy\.[a-z0-9.-]+\.workers\.dev' "$out" | head -1 || true)"
rm -f "$out"
url="${url:-https://pratik-proxy.dalliagac.workers.dev}"

say "4/5 Secret'lar"
read -r -p "Mistral anahtarını şimdi girmek ister misin? Daha önce girdiysen 'h' yaz. [E/h] " answer
if [[ ! "$answer" =~ ^[hHnN] ]]; then
  echo "Birazdan anahtarı yapıştır, Enter'a bas (ekranda görünmeyecek):"
  npx wrangler secret put LLM_API_KEY
fi
if ! npx wrangler secret list 2>/dev/null | grep -q IP_HASH_SALT; then
  openssl rand -hex 32 | npx wrangler secret put IP_HASH_SALT
fi

say "5/5 Test"
echo "Adres: $url"
sleep 5
curl -sS -X POST "$url/ask" -H 'Content-Type: application/json' \
  -d '{"question":"Which documents do I need for the Anmeldung?","lang":"en"}' || true
echo
cat <<EOF

Beklenen: {"status":"answer",...}. Şunlar da "proxy ayakta" demek:
  {"status":"out_of_scope",...}  → kapsam bekçisi çalışıyor
  {"error":"upstream_error"}     → proxy çalışıyor ama Mistral anahtarı eksik/yanlış (adım 4'ü tekrarla)
HTML ya da bağlantı hatası → bu çıktıyı Claude'a yapıştır.

Son iş (bir kere): yanlışlıkla yayınlanan eski Worker'ı sil:
  Cloudflare paneli → Workers & Pages → pratik-app → Settings → Delete
EOF
