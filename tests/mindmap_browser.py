"""Browser regression checks for mind-map geometry and mode switching.

Run with .venv/bin/python tests/mindmap_browser.py after setup.sh.
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


def node(content, *children):
    return {"content": content, "children": list(children)}


def cases():
    chain = node("Último nivel")
    for i in reversed(range(16)):
        chain = node(f"Nivel {i}", chain)
    rich = node(
        "<strong>Integración</strong> y calidad",
        node("<em>Pruebas</em> con <code>CI/CD</code>",
             node("Una explicación suficientemente larga para ocupar varias líneas "
                  "sin invadir la siguiente rama ni perder acentos: ejecución, análisis."),
             node("<a href='https://example.com'>Documentación</a> y <mark>ejemplos</mark>")),
        node("UnaPalabraExtraordinariamenteLargaSinEspacios" * 4,
             node("<strong>Éxito</strong><br>Validación final")),
    )
    uneven = node("Integración")
    for i, count in enumerate([2, 12, 1, 7, 3, 9]):
        branch = node(f"Rama {i + 1}")
        for j in range(count):
            branch["children"].append(node(
                f"Concepto {i + 1}.{j + 1}",
                *[node(f"Detalle {k + 1}: una definición legible")
                  for k in range(j % 3)],
            ))
        uneven["children"].append(branch)
    return {
        "single root": node("Idea central"),
        "empty root": node(""),
        "untitled branches": node("", node("Primera", node("Detalle")), node("Segunda")),
        "single branch": node("Tema", node("Definición de una sola rama", node("Resultado"))),
        "deep chain": chain,
        "uneven branches": uneven,
        "rich and long text": rich,
    }


GEOMETRY = r"""async ({data, spacing, gap}) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '1600');
  svg.setAttribute('height', '1000');
  document.body.appendChild(svg);
  const map = new MindMap(svg, {zoom: false, spacingVertical: spacing, branchGap: gap});
  const failures = [];
  try {
    await map.setData(data);
    const first = map.g.node().innerHTML;
    const bounds = map.state.rect;
    if (!Object.values(bounds).every(Number.isFinite)) failures.push('non-finite map bounds');
    const rects = Array.from(svg.querySelectorAll('.mg-node'), el => {
      const b = el.getBBox(), matrix = el.getCTM();
      const a = new DOMPoint(b.x, b.y).matrixTransform(matrix);
      const z = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(matrix);
      return {label: el.textContent, x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y};
    });
    for (const a of rects) {
      if (![a.x, a.y, a.w, a.h].every(Number.isFinite)) failures.push('non-finite node geometry');
      if (a.x < bounds.x1 - 3 || a.y < bounds.y1 - 3 ||
          a.x + a.w > bounds.x2 + 3 || a.y + a.h > bounds.y2 + 3)
        failures.push('node outside fit bounds: ' + a.label);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX > 0.5 && overlapY > 0.5)
          failures.push('overlapping nodes: ' + a.label + ' / ' + b.label);
      }
    }
    for (const path of svg.querySelectorAll('path')) {
      if (/NaN|Infinity/.test(path.getAttribute('d') || '')) failures.push('non-finite connector');
    }
    const inspect = n => {
      for (const key of Object.keys(n)) {
        if (key.startsWith('_')) failures.push('temporary layout field retained: ' + key);
      }
      (n.children || []).forEach(inspect);
    };
    inspect(data);
    await map.setData(data);
    if (first !== map.g.node().innerHTML) failures.push('layout is not deterministic');
    return {failures, nodes: rects.length};
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
            page.wait_for_function("typeof MindMap === 'function' && typeof markmap === 'object'")
            checks = 0
            for name, tree in cases().items():
                for spacing, gap in [(10, 40), (0, 0), (120, 400)]:
                    result = page.evaluate(GEOMETRY, {"data": tree, "spacing": spacing, "gap": gap})
                    assert not result["failures"], f"{name} ({spacing}, {gap}): {result['failures']}"
                    checks += 1
                    print(f"PASS {name}: spacing={spacing}, gap={gap}, nodes={result['nodes']}")

            page.locator("#md").fill("# Integración\n## Pruebas\n- Resultado\n## Proceso\n- Entrega")
            for mode, selector in [("mind", ".mg-node"), ("concept", ".cm-node"),
                                   ("synoptic", ".markmap-node"), ("mind", ".mg-node")]:
                page.locator(f'button[data-mode="{mode}"]').click()
                page.wait_for_function(
                    "selector => document.querySelectorAll('#preview ' + selector).length === 5", arg=selector)
                assert page.locator(f'button[data-mode="{mode}"]').get_attribute("aria-checked") == "true"
                assert page.evaluate("localStorage.getItem('mapType')") == mode
            page.reload(wait_until="networkidle")
            page.wait_for_selector("#preview .mg-node")
            assert page.locator('button[data-mode="mind"]').get_attribute("aria-checked") == "true"
            assert not errors, f"Browser errors: {errors}"
            browser.close()
            print(f"PASS {checks} geometry cases, mode switching, persistence, and no browser errors")
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == "__main__":
    main()
