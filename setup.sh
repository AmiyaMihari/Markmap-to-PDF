#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup.sh — deja el proyecto listo desde cero (o lo repara).
#
#   bash setup.sh
#
# Crea .venv, instala requirements.txt y descarga Chromium para Playwright.
# Es idempotente: puedes correrlo las veces que quieras.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PY="${PYTHON:-python3}"

if [ ! -d .venv ]; then
  echo ">> Creando entorno virtual en .venv"
  "$PY" -m venv .venv
else
  echo ">> .venv ya existe"
fi

echo ">> Instalando dependencias"
.venv/bin/python -m pip install --upgrade pip --quiet
.venv/bin/pip install -r requirements.txt --quiet

echo ">> Descargando Chromium para Playwright (solo la primera vez)"
.venv/bin/playwright install chromium

cat <<'MSG'

Listo.

  Activar a mano (bash):   source .venv/bin/activate
  Usar sin activar:        .venv/bin/python markmap2pdf.py mapa.md

En VS Code no necesitas activar nada: al abrir la carpeta toma .venv
automaticamente en cada terminal nueva.
MSG
