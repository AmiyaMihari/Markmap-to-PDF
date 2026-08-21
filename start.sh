#!/usr/bin/env bash
# Abre la interfaz web de markmap2pdf en el navegador.
#   bash start.sh          -> http://127.0.0.1:8765
#   bash start.sh 9000     -> otro puerto
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -x .venv/bin/python ]; then
  echo "No hay entorno. Corriendo setup.sh primero..."
  bash setup.sh
fi

exec .venv/bin/python app.py "$@"
