#!/usr/bin/env bash
# Abre la interfaz web de markmap2pdf en el navegador.
#   bash start.sh          -> http://127.0.0.1:8765
#   bash start.sh 9000     -> otro puerto
#
# La pagina corre completa en el navegador (docs/): esto solo la sirve en
# local, igual que lo haria GitHub Pages. No hace falta el entorno virtual.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

PORT="${1:-8765}"
URL="http://127.0.0.1:$PORT"
echo
echo "  markmap2pdf  ->  $URL"
echo "  (Ctrl+C para cerrar)"
echo
( sleep 1; xdg-open "$URL" >/dev/null 2>&1 || open "$URL" >/dev/null 2>&1 || true ) &

exec python3 - "$PORT" <<'PY'
import functools, http.server, sys

class SinCache(http.server.SimpleHTTPRequestHandler):
    # Que el navegador pregunte siempre por la version actual. Sin esto,
    # Chrome puede seguir mostrando una copia vieja guardada (paso con la
    # version que usaba el servidor de Python en esta misma direccion).
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

handler = functools.partial(SinCache, directory="docs")
try:
    http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), handler).serve_forever()
except KeyboardInterrupt:
    pass
PY
