#!/usr/bin/env python3
"""scripts/screenshot.sh için yardımcı statik sunucu.

Sade `python3 -m http.server` iki nedenle yetmiyor:
1. expo-sqlite'ın web (wasm) katmanı SharedArrayBuffer kullanıyor; bu da
   Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy header'ları
   olmadan tarayıcıda kapalı kalıyor (bkz. docs.expo.dev/versions/v57.0.0/sdk/sqlite/).
2. expo-router'ın "static" web export'u her rota için "<rota>.html" dosyası
   üretiyor (örn. /explore -> explore.html); düz bir dosya sunucusu uzantısız
   istekte (tarayıcının/bizim yazdığımız gibi "/explore") bunu bulamaz.
3. Dinamik route'lar (örn. /adim/[id]) tek bir "[id].html" dosyası olarak
   üretiliyor; /adim/anmeldung gibi gerçek bir id için de 404 döner.
Bu sunucu, tam eşleşme yoksa önce "<yol>.html"i, o da yoksa aynı klasördeki
tek dinamik segment dosyasına ("[id].html" / "[...slug].html") düşer.
"""

import functools
import http.server
import os
import sys

directory = sys.argv[1]
port = int(sys.argv[2])


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        super().end_headers()

    def translate_path(self, path):
        default = super().translate_path(path)
        if os.path.exists(default) or path.endswith("/"):
            return default

        # 1) "<yol>.html" var mı? (statik export'un ürettiği asıl dosya adı)
        with_html = default + ".html"
        if os.path.exists(with_html):
            return with_html

        # 2) Yoksa (ör. /adim/anmeldung), aynı klasördeki tek dinamik segment
        # dosyasına ([id].html / [...slug].html) düş.
        parent = os.path.dirname(default)
        if os.path.isdir(parent):
            for name in os.listdir(parent):
                if name.startswith("[") and name.endswith(".html"):
                    return os.path.join(parent, name)
        return default


    def send_error(self, code, message=None, explain=None):
        # Vercel bilinmeyen adreste 404 DURUMUYLA birlikte 404.html'i sunar
        # (npm run build:web onu üretir). Yerelde de aynısı: düz Python 404'ü
        # gerçek ziyaretçinin göreceği ekranı denetlemeye izin vermiyordu.
        page = os.path.join(directory, "404.html")
        if code == 404 and self.command == "GET" and os.path.exists(page):
            body = open(page, "rb").read()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().send_error(code, message, explain)


Handler = functools.partial(Handler, directory=directory)

with http.server.ThreadingHTTPServer(("localhost", port), Handler) as httpd:
    httpd.serve_forever()
