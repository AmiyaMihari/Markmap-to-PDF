#!/usr/bin/env python3
"""
markmap2pdf.py
==============
Convierte un mapa de markmap en un PDF (vectorial, texto seleccionable),
PNG de alta resolucion y SVG limpio:

  * fondo blanco
  * SIN la marquita de agua / barra de herramientas de markmap
  * recortado exacto al contenido (sin margenes gigantes que recortar a mano)
  * una sola pagina del tamano justo del mapa -> se inserta en Word tal cual

Modos de uso
------------
1) Desde Markdown (recomendado, ya no necesitas descargar el HTML):

       python markmap2pdf.py mapa.md

2) Desde el HTML que descargas del REPL ("Download as interactive HTML"):

       python markmap2pdf.py markmap.html

Opciones utiles:
       --out CARPETA     carpeta de salida (default: junto al archivo)
       --pad 24          margen blanco alrededor, en px (default 20)
       --scale 3         factor de resolucion del PNG (default 3 = ~288 dpi)
       --png / --no-pdf / --svg   que formatos generar (default: pdf + png + svg)

Instalacion (una sola vez):
       pip install playwright
       playwright install chromium
"""

from __future__ import annotations

import argparse
import asyncio
import pathlib
import sys

try:
    from playwright.async_api import async_playwright
except ImportError:  # pragma: no cover
    sys.exit(
        "Falta Playwright. Instala con:\n"
        "    pip install playwright\n"
        "    playwright install chromium"
    )


# --------------------------------------------------------------------------- #
# Plantilla para renderizar Markdown directamente con markmap (sin Node.js).
# --------------------------------------------------------------------------- #
MD_TEMPLATE = """<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; }
  svg#mindmap { display: block; width: 100vw; height: 100vh; }
</style>
<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<!-- OJO: el build de navegador es index.iife.js, NO index.js (ese es ESM y no
     define ningun global -> "M.Transformer is not a constructor"). -->
<script src="https://cdn.jsdelivr.net/npm/markmap-lib@0.18.12/dist/browser/index.iife.js"></script>
<script>window.__mmLib = window.markmap;</script>  <!-- por si acaso -->
<script src="https://cdn.jsdelivr.net/npm/markmap-view@0.18.12/dist/browser/index.js"></script>
</head><body>
<svg id="mindmap"></svg>
<script type="text/markdown" id="md-source">__MARKDOWN__</script>
<script>
window.__mmReady = false;
window.__mmError = null;
(async function () {
  try {
    var md = document.getElementById('md-source').textContent;
    // Ambos builds hacen `this.markmap = this.markmap || {}`, o sea que se
    // FUSIONAN en el mismo global. __mmLib queda como respaldo defensivo.
    var view = window.markmap || {};
    var lib = view.Transformer ? view : (window.__mmLib || {});
    if (!lib.Transformer) throw new Error('markmap-lib no cargo (revisa tu conexion al CDN).');
    if (!view.Markmap) throw new Error('markmap-view no cargo (revisa tu conexion al CDN).');

    var transformer = new lib.Transformer();
    var res = transformer.transform(md);

    // KaTeX / resaltado de codigo: cargar los assets que el markdown pida.
    try {
      var assets = transformer.getUsedAssets(res.features);
      if (assets.styles && view.loadCSS) view.loadCSS(assets.styles);
      if (assets.scripts && view.loadJS) await view.loadJS(assets.scripts);
    } catch (e) { /* sin assets extra tambien se ve bien */ }

    var opts = {};
    if (view.deriveOptions && res.frontmatter && res.frontmatter.markmap) {
      opts = view.deriveOptions(res.frontmatter.markmap);
    }
    opts.duration = 0;
    if (opts.initialExpandLevel == null || opts.initialExpandLevel === 0) {
      opts.initialExpandLevel = -1;    // -1 = todo expandido
    }

    var mm = view.Markmap.create('#mindmap', opts, res.root);
    await mm.fit();
    window.__mmReady = true;
  } catch (e) {
    window.__mmError = String(e);
    window.__mmReady = true;
  }
})();
</script>
</body></html>
"""


# --------------------------------------------------------------------------- #
# JS que corre DENTRO de la pagina: limpia, recorta y devuelve el SVG.
# --------------------------------------------------------------------------- #
JS_EXTRACT = r"""
(pad) => {
  // 1. Fuera la barra/marca de agua de markmap y cualquier UI extra.
  document.querySelectorAll(
    '.mm-toolbar, .markmap-toolbar, .mm-brand, [class*="toolbar"]'
  ).forEach(el => el.remove());

  const svg = document.querySelector('svg.markmap') || document.querySelector('svg');
  if (!svg) throw new Error('No se encontro ningun <svg> en la pagina.');

  // 2. Quitar el zoom/pan que aplico d3 para trabajar en coordenadas reales.
  const g = svg.querySelector('g');
  if (!g) throw new Error('El SVG no tiene contenido renderizado todavia.');
  g.removeAttribute('transform');

  // 3. Caja exacta del contenido + margen.
  const bb = g.getBBox();
  const x = bb.x - pad, y = bb.y - pad;
  const w = Math.ceil(bb.width + pad * 2);
  const h = Math.ceil(bb.height + pad * 2);

  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  svg.style.width = w + 'px';
  svg.style.height = h + 'px';
  svg.style.maxWidth = 'none';
  svg.style.background = '#ffffff';

  // 4. Recolectar CSS de la pagina para que el SVG se vea igual fuera de ella.
  const styles = Array.from(document.querySelectorAll('style'))
    .map(s => s.textContent).join('\n');
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map(l => l.href);

  return { w, h, svg: svg.outerHTML, styles, links };
}
"""


WRAPPER = """<!doctype html>
<html><head><meta charset="utf-8">
__LINKS__
<style>
@page { size: __W__px __H__px; margin: 0; }
html, body { margin: 0; padding: 0; background: #ffffff; }
svg { display: block; background: #ffffff; }
__STYLES__
</style>
</head><body>__SVG__</body></html>
"""


async def render(src: pathlib.Path, args) -> list[pathlib.Path]:
    out_dir = pathlib.Path(args.out) if args.out else src.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = src.stem
    written: list[pathlib.Path] = []

    is_md = src.suffix.lower() in (".md", ".markdown", ".txt")

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(
            viewport={"width": 1920, "height": 1200},
            device_scale_factor=args.scale,
            color_scheme="light",  # evita que el tema oscuro se cuele
        )
        page = await ctx.new_page()

        # ---- 1. Cargar el mapa ------------------------------------------------
        if is_md:
            md = src.read_text(encoding="utf-8").replace("</script", "<\\/script")
            html = MD_TEMPLATE.replace("__MARKDOWN__", md)
            tmp = out_dir / f".{stem}.tmp.html"
            tmp.write_text(html, encoding="utf-8")
            await page.goto(tmp.resolve().as_uri(), wait_until="networkidle")
            await page.wait_for_function("window.__mmReady === true", timeout=60000)
            err = await page.evaluate("window.__mmError")
            if err:
                await browser.close()
                tmp.unlink(missing_ok=True)
                sys.exit(
                    f"markmap no pudo procesar el Markdown: {err}\n"
                    "Prueba el modo HTML (descarga el HTML del REPL y pasalo a este script)."
                )
            tmp.unlink(missing_ok=True)
        else:
            await page.goto(src.resolve().as_uri(), wait_until="networkidle")
            await page.wait_for_selector("svg g", timeout=60000)
            await page.wait_for_timeout(800)  # deja terminar la animacion inicial

        # ---- 2. Limpiar + recortar + extraer ---------------------------------
        data = await page.evaluate(JS_EXTRACT, args.pad)
        w, h = data["w"], data["h"]
        print(f"  contenido detectado: {w} x {h} px "
              f"({w/96:.2f} x {h/96:.2f} pulgadas)")

        wrapper = (
            WRAPPER.replace("__W__", str(w))
            .replace("__H__", str(h))
            .replace("__STYLES__", data["styles"])
            .replace(
                "__LINKS__",
                "\n".join(f'<link rel="stylesheet" href="{u}">' for u in data["links"]),
            )
            .replace("__SVG__", data["svg"])
        )

        # ---- 3. SVG limpio ----------------------------------------------------
        if args.svg:
            svg_path = out_dir / f"{stem}.svg"
            svg_path.write_text(
                '<?xml version="1.0" encoding="UTF-8"?>\n' + data["svg"],
                encoding="utf-8",
            )
            written.append(svg_path)

        # ---- 4. PDF vectorial de una sola pagina ------------------------------
        page2 = await ctx.new_page()
        await page2.set_content(wrapper, wait_until="networkidle")
        await page2.wait_for_timeout(300)

        if args.pdf:
            pdf_path = out_dir / f"{stem}.pdf"
            await page2.pdf(
                path=str(pdf_path),
                width=f"{w}px",
                height=f"{h}px",
                print_background=True,
                margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
                page_ranges="1",
            )
            written.append(pdf_path)

        # ---- 5. PNG de alta resolucion ---------------------------------------
        if args.png:
            png_path = out_dir / f"{stem}.png"
            await page2.set_viewport_size(
                {"width": min(w, 16000), "height": min(h, 16000)}
            )
            await page2.screenshot(
                path=str(png_path),
                clip={"x": 0, "y": 0, "width": w, "height": h},
                scale="device",
            )
            written.append(png_path)

        await browser.close()

    return written


def main() -> None:
    ap = argparse.ArgumentParser(
        description="markmap (.md o .html) -> PDF/PNG/SVG recortado, fondo blanco, sin marca de agua."
    )
    ap.add_argument("input", nargs="+", help="archivo(s) .md o .html")
    ap.add_argument("--out", default=None, help="carpeta de salida")
    ap.add_argument("--pad", type=int, default=20, help="margen blanco en px (default 20)")
    ap.add_argument("--scale", type=int, default=3, help="factor de resolucion del PNG (default 3)")
    ap.add_argument("--no-pdf", dest="pdf", action="store_false")
    ap.add_argument("--no-png", dest="png", action="store_false")
    ap.add_argument("--no-svg", dest="svg", action="store_false")
    args = ap.parse_args()

    for raw in args.input:
        src = pathlib.Path(raw).expanduser()
        if not src.exists():
            print(f"!! No existe: {src}")
            continue
        print(f"-> {src.name}")
        files = asyncio.run(render(src, args))
        for f in files:
            print(f"   OK {f}")


if __name__ == "__main__":
    main()
