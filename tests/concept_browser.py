"""Browser regression checks for the concept map layout and its layout buttons
(Auto, Open, Compact).

Run with .venv/bin/python tests/concept_browser.py after setup.sh.
The app's pinned CDN dependencies require an internet connection. The test
serves docs/ on an ephemeral localhost port and does not change saved files.
"""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


NETWORK = """# Arquitectura de administración de redes
## Elementos administrados
- Gestor o entidad administradora
  - Supervisa dispositivos e inicia acciones de control
  - Utiliza NMS (sistema de administración de red)
- Dispositivos administrados
  - Routers, switches, servidores y puntos de acceso
- Agentes de administración
  - Recopilan datos, responden consultas y notifican eventos al gestor
## Comunicación e información
- Gestor y agentes
  - Se comunican mediante SNMP
  - Intercambian consultas, respuestas, notificaciones y solicitudes de cambio
- Sistema de información
  - Organiza inventarios, configuraciones, eventos y mediciones
## Modelos de administración
- Información
  - Estructura los datos que representan los recursos administrados
  - Utiliza SMI (estructura de la información de administración)
- Funcional
  - Se divide en áreas FCAPS
    - Fallas
      - Detecta y corrige problemas, verificando la recuperación del servicio
    - Configuración
      - Mantiene inventarios, versiones y configuraciones
      - Controla los cambios en los equipos
"""

CELL = """# Célula
## Estructura
- Membrana
  - Bicapa lipídica
  - Proteínas
- Núcleo
  - ADN
- Citoplasma
  - Citosol
  - Organelos
## Funciones
- Nutrición
  - Endocitosis
- Relación
  - Señales químicas
  - Receptores
- Reproducción
  - Mitosis
  - Meiosis
## Tipos
- Procariota
  - Sin núcleo
- Eucariota
  - Con núcleo
  - Organelos membranosos
"""

SMALL = "# Agua\n## Estados\n- Sólido\n- Líquido\n## Usos\n- Riego\n"


def cases():
    deep = "# Nivel 0\n" + "".join("  " * i + f"- Nivel {i + 1}\n" for i in range(15))
    uneven = ["# Integración"]
    for i, count in enumerate([2, 12, 1, 7, 3, 9]):
        uneven.append(f"## Rama {i + 1}")
        for j in range(count):
            uneven.append(f"- Concepto {i + 1}.{j + 1}")
            uneven += [f"  - Detalle {k + 1}: una definición legible" for k in range(j % 3)]
    return {
        "single root": "# Idea central",
        "untitled branches": "- Primera\n  - Detalle\n- Segunda\n",
        "single branch": "# Tema\n## Definición de una sola rama\n- Resultado\n  - Más\n  - Otro\n",
        "deep chain": deep,
        "uneven branches": "\n".join(uneven),
        "small": SMALL,
        "cell": CELL,
        "network": NETWORK,
        "rich and long text": (
            "# **Integración** y calidad\n## *Pruebas* con `CI/CD`\n"
            "- Una explicación suficientemente larga para ocupar varias líneas sin invadir la siguiente rama\n"
            "- [Documentación](https://example.com) y ==ejemplos==\n"
            "## " + "UnaPalabraExtraordinariamenteLargaSinEspacios" * 3 + "\n- **Éxito**\n  - Validación final\n"
        ),
    }


# Draws the Markdown and reads back, for every box, whether its children sit
# side by side ('row') or hang in a column under it ('stack').
GEOMETRY = r"""async ({md, spacing, gap, layout}) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '1600');
  svg.setAttribute('height', '1000');
  document.body.appendChild(svg);
  const root = new markmap.Transformer().transform(md).root;
  const map = new ConceptMap(svg, {zoom: false, spacingVertical: spacing, branchGap: gap, conceptLayout: layout});
  const failures = [];
  try {
    await map.setData(root);
    const first = map.g.node().innerHTML;
    // the boxes are drawn in tree order; an untitled root has no box
    const plain = h => String(h || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    const nodes = [];
    (function walk(n, depth, parent) {
      const item = {n, depth, parent, kids: [], label: plain(n.content)};
      if (parent) parent.kids.push(item);
      nodes.push(item);
      (n.children || []).forEach(c => walk(c, depth + 1, item));
    })(root, 0, null);
    const drawn = nodes.filter(it => !(it.depth === 0 && !it.label));
    const els = Array.from(svg.querySelectorAll('.cm-node'));
    if (els.length !== drawn.length) failures.push(`boxes: ${els.length}, nodes: ${drawn.length}`);
    drawn.forEach((it, i) => {
      const m = els[i].transform.baseVal.consolidate().matrix, r = els[i].querySelector('rect');
      Object.assign(it, {x: m.e, y: m.f, w: +r.getAttribute('width'), h: +r.getAttribute('height')});
    });
    const bounds = map.state.rect;
    if (!Object.values(bounds).every(Number.isFinite)) failures.push('non-finite map bounds');
    for (const a of drawn) {
      if (![a.x, a.y, a.w, a.h].every(Number.isFinite)) failures.push('non-finite box: ' + a.label);
      if (a.x < bounds.x1 - 0.5 || a.y < bounds.y1 - 0.5 || a.x + a.w > bounds.x2 + 0.5 || a.y + a.h > bounds.y2 + 0.5)
        failures.push('outside the map box: ' + a.label);
      for (const b of drawn) {
        if (a === b) continue;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0.5 && oy > 0.5 && a.label < b.label) failures.push('overlap: ' + a.label + ' / ' + b.label);
      }
    }
    for (const path of svg.querySelectorAll('path')) {
      if (/NaN|Infinity/.test(path.getAttribute('d') || '')) failures.push('non-finite path');
    }
    // the root and its chain of single children always open side by side
    let fork = nodes[0];
    fork.top = true;
    while (fork.kids.length === 1) { fork = fork.kids[0]; fork.top = true; }
    // a column starts 12 px under its parent; a row, at least 40 px under it
    const modes = {};
    for (const it of drawn) {
      if (!it.kids.length || it.top) continue;
      const k = it.kids[0], below = k.y - (it.y + it.h);
      const mode = Math.abs(below - 12) < 0.5 && Math.abs(k.x - (it.x + 28)) < 0.5 ? 'stack' : 'row';
      (modes[it.depth] = modes[it.depth] || new Set()).add(mode);
    }
    const summary = {};
    for (const [d, set] of Object.entries(modes)) summary[d] = [...set].sort().join('+');
    await map.setData(root);
    if (first !== map.g.node().innerHTML) failures.push('layout is not deterministic');
    return {failures, modes: summary, width: bounds.x2 - bounds.x1};
  } finally {
    map.destroy();
    svg.remove();
  }
}"""


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT / "docs")))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{server.server_port}/", wait_until="networkidle")
            page.wait_for_function("typeof ConceptMap === 'function' && typeof markmap === 'object'")

            checks = 0
            for name, md in cases().items():
                for layout in ["auto", "open", "compact"]:
                    for spacing, gap in [(10, 40), (0, 0), (120, 400)]:
                        args = {"md": md, "spacing": spacing, "gap": gap, "layout": layout}
                        result = page.evaluate(GEOMETRY, args)
                        where = f"{name} ({layout}, {spacing}, {gap})"
                        assert not result["failures"], f"{where}: {result['failures']}"
                        # open: every box opens side by side; compact: everything
                        # under the main branches hangs in columns
                        want = {"open": "row", "compact": "stack"}.get(layout)
                        if want:
                            assert all(m == want for m in result["modes"].values()), f"{where}: {result['modes']}"
                        checks += 1
                print(f"PASS {name}: 3 layouts x 3 spacings")

            # a small map stays open in Auto; a big one folds part of itself
            auto = lambda md: page.evaluate(GEOMETRY, {"md": md, "spacing": 10, "gap": 40, "layout": "auto"})["modes"]
            assert auto(SMALL) == {"1": "row"}, auto(SMALL)
            assert "stack" in "+".join(auto(NETWORK).values()), auto(NETWORK)
            print("PASS Auto keeps small maps open and folds big ones")

            # the buttons only show up in the concept map
            page.locator("#md").fill(CELL)
            for mode in ["concept", "timeline", "mind", "concept"]:
                page.locator(f'button[data-mode="{mode}"]').click()
                shown = page.evaluate("!document.querySelector('#cmLayout').classList.contains('hidden')")
                assert shown == (mode == "concept"), f"layout buttons visible={shown} in {mode}"
            page.wait_for_function("document.querySelectorAll('#preview .cm-node').length === 25")
            width = "document.querySelector('#preview > g').getBBox().width"
            start = page.evaluate(width)
            # Auto by default; "open" widens the map and "compact" narrows it
            assert page.locator('#cmLayout button[data-value="auto"]').get_attribute("aria-checked") == "true"
            page.locator('#cmLayout button[data-value="open"]').click()
            page.wait_for_function("document.querySelector('#cmLayout').dataset.active === 'open'")
            page.wait_for_timeout(300)
            wide = page.evaluate(width)
            assert wide >= start - 1, (wide, start)
            assert page.evaluate("localStorage.getItem('cmLayout')") == "open"
            page.locator('#cmLayout button[data-value="compact"]').click()
            page.wait_for_function(f"{width} < {wide} * 0.7")
            assert page.evaluate("localStorage.getItem('cmLayout')") == "compact"
            page.reload(wait_until="networkidle")
            page.wait_for_selector("#preview .cm-node")
            assert page.locator('button[data-mode="concept"]').get_attribute("aria-checked") == "true"
            assert page.locator('#cmLayout button[data-value="compact"]').get_attribute("aria-checked") == "true"
            assert page.evaluate("document.querySelector('#cmLayout').dataset.active") == "compact"
            # the editor goes back to its example after reloading
            page.locator("#md").fill(CELL)
            page.wait_for_function("document.querySelectorAll('#preview .cm-node').length === 25")
            page.wait_for_function(f"{width} < {wide} * 0.7")
            page.locator('#cmLayout button[data-value="auto"]').click()
            page.wait_for_function(f"Math.abs({width} - {start}) < 1")
            assert page.evaluate("localStorage.getItem('cmLayout')") == "auto"
            assert not errors, f"Browser errors: {errors}"
            browser.close()
            print(f"PASS {checks} geometry cases, layout buttons, persistence, and no browser errors")
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == "__main__":
    main()
