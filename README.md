# markmap2pdf

Convierte tus mapas de [markmap](https://markmap.js.org/repl) a **PDF de una sola página, fondo blanco, recortado exacto y sin la marquita de agua** — y, si quieres, los pega directo dentro del PDF de tu tarea.

Ya no necesitas: captura de pantalla, Sejda, ni recortar a mano.

**Úsalo en línea, sin instalar nada:** <https://amiyamihari.github.io/Markmap-to-PDF/>

![interfaz](docs/interfaz.png)

---

## Uso: la interfaz web

La interfaz corre **completa en el navegador**: no hay servidor ni nada que
instalar. Ábrela en <https://amiyamihari.github.io/Markmap-to-PDF/>, o en tu compu:

```bash
git clone https://github.com/AmiyaMihari/Markmap-to-PDF.git
cd Markmap-to-PDF
bash start.sh
```

Se abre sola en <http://127.0.0.1:8765> (`start.sh` solo sirve la carpeta `docs/`
con el Python que ya trae el sistema). Desde ahí:

* **Escribe tu markdown** y ve el mapa en vivo mientras escribes (o arrastra un `.md`
  o el `.html` que descargas del REPL).
* **Arrastra el PDF de tu tarea** y verás sus páginas en miniatura. Arrastra la
  tarjeta del mapa entre ellas para colocarlo donde quieras (o usa ← → con la
  tarjeta seleccionada).
* Descarga **el PDF unido**, o solo el mapa en **PDF / PNG / SVG**.

Debajo del título, **¿Cómo se usa?** explica en corto el formato que entiende el
mapa y trae un prompt listo para pedirle el mapa a una IA (ChatGPT, Claude,
Gemini…). No hay límite de niveles: después de `###` puedes seguir con `####`,
`#####` y `######` para sub-ramas dentro de los subtemas, y con viñetas con
sangría tan hondo como quieras. markmap tira las viñetas que van antes de un
sub-encabezado (`### A`, unas viñetas y luego `#### B`); la página lo corrige
sola y las conserva. Si pegas su respuesta con todo y las marcas ```` ``` ```` del bloque de
código, la página las quita sola. Arriba a la derecha puedes cambiar la interfaz
a **inglés**; se recuerda para la próxima vez.

La vista previa es **la hoja real**: toma la proporción exacta del PDF que vas a
obtener y te dice cuánto mide, así que ves de antemano si tu mapa sale ancho o
alargado. Abajo a la derecha tiene cuatro botones:

| botón | qué hace |
|---|---|
| **−** / **+** | alejar y acercar. Si te acercas más allá del encuadre, la hoja deja de recortar y el mapa se extiende por toda la bandeja, con el fondo en blanco |
| **centrar** (la mirita) | vuelve a encuadrar el mapa en la hoja — igual que hacer doble clic sobre él |
| **ampliar** (las flechas) | el mapa pasa a ocupar la ventana entera, blanco de borde a borde y sin marcos, desde el primer momento; `Esc`, el mismo botón o un clic en el borde para volver |

### Mapa mental o mapa conceptual

Arriba de **¿Cómo se usa?** eliges el tipo de mapa. El mismo texto sirve para los dos:

| tipo | cómo se ve |
|---|---|
| **Mapa mental** | de izquierda a derecha, con ramas curvas (el de markmap) |
| **Mapa conceptual** | de arriba hacia abajo, con cajas y líneas en ángulo, como un organigrama |

En el conceptual, cada rama principal lleva su color. Un mapa chico va todo lado a
lado; si uno grande quedaría más ancho que una hoja, sus grupos se van plegando en
columnas bajo su caja hasta que la proporción quepa. Las ramas principales siempre
quedan lado a lado. La elección se recuerda para la próxima vez. El CLI de Python
solo hace mapas mentales.

### Aire entre ramas

markmap acomoda el árbol lo más apretado que puede y los mapas grandes salen
amontonados, así que el mapa sale con un poco de aire de fábrica. En **Ajustes**
puedes moverlo:

| ajuste | qué hace |
|---|---|
| **Separación entre ramas** | espacio vertical entre nodos, en todos los niveles (default 10 px; markmap trae 5) |
| **Aire entre ramas principales** | separación extra solo entre las ramas del primer nivel, para que no se peguen entre sí (default 40 px) |

Ponlos en `5` y `0` si prefieres el mapa tal como lo dibuja markmap. Lo que ves
en la vista previa es lo que sale en el PDF: es el mismo código.

Además, cuando un nodo tiene **un solo hijo** (lo típico: un término y su
definición), la línea que los une se acorta. markmap deja a todos los hijos a la
misma distancia, y con varios hijos ese espacio lo llenan las curvas, pero con uno
solo quedaba una recta larga y el texto se veía lejísimos. Las curvas no cambian.

Puedes soltar los archivos en cualquier parte de la ventana: el `.pdf` se toma como
tu documento y el `.md` / `.html` como el mapa.

**Todo pasa en tu navegador.** Los archivos no salen de tu compu y solo baja el
archivo final, así que no se te acumulan archivos sueltos en la carpeta.

En VS Code: `Ctrl+Shift+B` → "Abrir la interfaz web".

### Tamaño de la hoja al unir

| opción | qué hace |
|---|---|
| **del tamaño del mapa** (default) | la hoja mide justo lo que mide el mapa, sin márgenes |
| **igual que tu documento** | la hoja del mapa queda idéntica a las de tu tarea (mismo tamaño y orientación) |
| **horizontal** | gira esa hoja a apaisado para que el mapa salga más grande |

---

## Uso: línea de comandos

Sigue disponible si lo prefieres, o para procesar varios mapas de golpe. Este sí
necesita instalar algo, una sola vez:

```bash
bash setup.sh
```

`setup.sh` crea el entorno virtual en `.venv/`, instala `requirements.txt` y descarga
el Chromium que usa Playwright (~115 MB). Es idempotente: si algo se rompe, vuelve a correrlo.

```bash
python markmap2pdf.py mapa.md
python markmap2pdf.py ~/Downloads/markmap.html
python markmap2pdf.py mapas/*.md          # en lote
```

Genera `mapa.pdf`, `mapa.png` y `mapa.svg` junto al archivo de entrada.
Pruébalo con el mapa incluido: `python markmap2pdf.py ejemplo.md`

| flag | qué hace |
|---|---|
| `--out carpeta` | carpeta de salida |
| `--pad 40` | margen blanco alrededor, en px (default 20) |
| `--scale 4` | resolución del PNG (3 ≈ 288 dpi, default) |
| `--spacing 10` | separación vertical entre nodos, en px (default 10) |
| `--gap 40` | aire extra entre las ramas principales, en px (default 40) |
| `--no-png` / `--no-svg` / `--no-pdf` | omitir formatos |

---

## El entorno se enciende solo

**En VS Code no tienes que activar nada.** `.vscode/settings.json` deja configurado:

* `python.defaultInterpreterPath` → `.venv/bin/python`
* `python.terminal.activateEnvironment` → `true`
* la terminal integrada del proyecto usa **bash**

Al abrir la carpeta, cada terminal nueva ya trae el `.venv` activado (verás `(.venv)`).
Requiere la extensión **ms-python.python**, ya recomendada en `.vscode/extensions.json`.

**Fuera de VS Code**, en bash:

```bash
source .venv/bin/activate      # a mano
# ...o sin activar nada:
.venv/bin/python markmap2pdf.py mapa.md
```

<details>
<summary>Opcional: que bash active el venv solo al entrar a la carpeta</summary>

Pega esto **una vez** al final de tu `~/.bashrc`:

```bash
# auto-activar .venv al entrar a una carpeta que lo tenga
_auto_venv() {
  if [[ -n "$VIRTUAL_ENV" && "$PWD" != "$(dirname "$VIRTUAL_ENV")"* ]]; then
    deactivate 2>/dev/null
  fi
  if [[ -z "$VIRTUAL_ENV" ]]; then
    local d="$PWD"
    while [[ "$d" != "/" ]]; do
      if [[ -f "$d/.venv/bin/activate" ]]; then
        source "$d/.venv/bin/activate"
        break
      fi
      d="$(dirname "$d")"
    done
  fi
}
PROMPT_COMMAND="_auto_venv${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
```

Luego `source ~/.bashrc`.
</details>

---

## Cómo funciona el recorte

Tanto la página como el CLI dibujan el mapa aparte, a escala 1 y sin zoom, y luego:

1. borran el `transform` de zoom que d3 aplica al `<g>`,
2. calculan el `getBBox()` real del contenido y reescriben el `viewBox` con ese tamaño + margen,
3. exportan con una hoja idéntica al contenido → **una página, cero márgenes que recortar**.

El PDF sale vectorial: el texto se puede seleccionar y no pixelea al hacer zoom.
Al unirlo con tu tarea, el mapa se escala y centra en la hoja **sin perder calidad**
(sigue siendo vectorial, no se convierte a imagen).

En la página, el PDF lo arma `docs/motor.js` con [pdf-lib](https://pdf-lib.js.org/):
lee del navegador dónde quedó cada letra y la escribe como texto real. Usa
Helvetica y Courier (vienen con cualquier lector de PDF) y, solo si el mapa trae
flechas, letras griegas u otros símbolos, descarga la fuente DejaVu Sans para
ellos. Si el mapa trae emojis o imágenes, que ninguna fuente de PDF tiene, ese PDF
sale como imagen a 288 dpi para que no se pierda nada.

---

## Bonus para Word

Word 2016+ inserta **SVG nativo** (`Insertar > Imágenes > Este dispositivo > mapa.svg`).
Se ve perfecto a cualquier tamaño y pesa nada. Si tu Word lo soporta, usa el `.svg`;
si no, el `.png` a 3× es la siguiente mejor opción. El PDF unido conviene cuando
entregas la tarea ya en PDF.

---

## Estructura

| archivo | qué es |
|---|---|
| `docs/index.html` | la interfaz |
| `docs/app.js` | lo que hace la interfaz: vista previa, archivos, descargas |
| `docs/i18n.js` | los textos en español e inglés |
| `docs/concept.js` | el mapa conceptual (de arriba hacia abajo) |
| `docs/motor.js` | el exportador en el navegador: SVG, PNG, PDF y unir con la tarea |
| `docs/spacing.js` | el aire entre ramas (lo comparten la página y el CLI) |
| `markmap2pdf.py` | el CLI (renderiza y recorta con Chromium) |
| `start.sh` | abre la interfaz en local |
| `setup.sh` | instala lo que necesita el CLI |
| `ejemplo.md` | mapa de prueba |

La versión anterior, con la interfaz servida por Python (FastAPI + Chromium),
sigue en la rama [`version-python`](https://github.com/AmiyaMihari/Markmap-to-PDF/tree/version-python).

---

## Google Colab

Solo si necesitas el CLI en otra máquina. La instalación de Chromium (~1–2 min)
se repite **cada sesión**.

```python
!pip -q install playwright
!playwright install --with-deps chromium
!git clone -q https://github.com/AmiyaMihari/Markmap-to-PDF.git
%cd Markmap-to-PDF
```

```python
from google.colab import files
files.upload()          # sube tu mapa.md
!python markmap2pdf.py mapa.md
files.download('mapa.pdf')
```

---

## Si algo falla

* **El mapa sale vacío** → suele ser el CDN de markmap. Descarga el HTML del REPL
  y súbelo, que ese no depende del CDN.
  (Nota: el build de navegador correcto es `dist/browser/index.iife.js`;
  `dist/browser/index.js` es ESM y no define ningún global.)
* **Se ve cortado un nodo** → sube el margen en *Ajustes* (o `--pad 60` en el CLI).
* **Fondo gris u oscuro** → se fuerza `color_scheme="light"`; si tu HTML trae tema
  oscuro embebido, expórtalo del REPL con el tema claro (el solecito ☀).
* **`Address already in use`** → ya hay una instancia abierta, o usa otro puerto:
  `bash start.sh 9000`.
* **`playwright: command not found`** → no estás en el venv: `bash setup.sh`.

---

## Requisitos

Python 3.9+ (probado en 3.14). Todo lo demás lo instala `setup.sh`.
