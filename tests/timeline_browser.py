"""Browser regression checks for the timeline: dates, geometry and mode switching.

Run with .venv/bin/python tests/timeline_browser.py after setup.sh.
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


# heading -> (date, title) as the timeline should split it
DATES = {
    "1810 — Grito de Dolores": ("1810", "Grito de Dolores"),
    "1820 – Guerra de guerrillas": ("1820", "Guerra de guerrillas"),
    "1811: Captura de Hidalgo": ("1811", "Captura de Hidalgo"),
    "**1821** — Plan de Iguala": ("1821", "Plan de Iguala"),
    "1914-1918 Primera Guerra Mundial": ("1914-1918", "Primera Guerra Mundial"),
    "300 a. C. Fundación": ("300 a. C.", "Fundación"),
    "27 de septiembre de 1821: Entrada": ("27 de septiembre de 1821", "Entrada"),
    "Siglo XIX": ("Siglo XIX", ""),
    "Época colonial": ("Época colonial", ""),
    "Edad Media | Feudalismo": ("Edad Media", "Feudalismo"),
    "Causas: económicas": ("", "Causas: económicas"),
    "Revolución de 1910": ("", "Revolución de 1910"),
}


def node(content, *children):
    return {"content": content, "children": list(children)}


def cases():
    many = node("Historia de la computación", *[
        node(f"{1940 + i * 8} — Hito {i + 1}", node(f"Detalle del hito {i + 1}"))
        for i in range(12)])
    rich = node("Independencia", node(
        "1810 — Grito de Dolores",
        node("Una explicación suficientemente larga para ocupar varias líneas dentro de la tarjeta"),
        node("Tres garantías", node("Religión"), node("Independencia"), node("Unión"))),
        node("1815 — Muerte de Morelos"),
        node("UnaPalabraExtraordinariamenteLargaSinEspacios" * 3, node("<strong>Éxito</strong>")))
    return {
        "title only": node("Solo un título"),
        "empty": node(""),
        "no title": node("", node("1492 Llegada de Colón"), node("1519 Llegada de Cortés")),
        "no dates": node("Etapas", node("Infancia", node("Juego")), node("Adolescencia"), node("Adultez")),
        "dates only": node("Años", node("1810"), node("1821"), node("1910")),
        "many events": many,
        "rich and long text": rich,
    }


SPLIT = r"""async (headings) => {
  const T = new markmap.Transformer();
  const strip = h => h.replace(/<[^>]*>/g, '').trim();
  return headings.map(h => {
    const content = T.transform('## ' + h).root.content;
    const r = Timeline.splitDate(content);
    return [strip(r.date), strip(r.title)];
  });
}"""

GEOMETRY = r"""async ({data, spacing, gap, dir}) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '1600');
  svg.setAttribute('height', '1000');
  document.body.appendChild(svg);
  const map = new Timeline(svg, {zoom: false, spacingVertical: spacing, branchGap: gap, timelineDir: dir});
  const failures = [];
  try {
    await map.setData(data);
    const first = map.g.node().innerHTML;
    const bounds = map.state.rect;
    if (!Object.values(bounds).every(Number.isFinite)) failures.push('non-finite map bounds');
    // every shape that must not touch another: cards, date labels, dots and the title
    const shapes = Array.from(svg.querySelectorAll('.tl-node > rect, .tl-node > circle, .tl-node > foreignObject'))
      .filter(e => e.localName !== 'foreignObject' || e.firstChild.classList.contains('tl-head'))
      .map(e => { const b = e.getBBox(); return {label: e.parentNode.textContent.slice(0, 40), x: b.x, y: b.y, w: b.width, h: b.height}; });
    for (const a of shapes) {
      if (![a.x, a.y, a.w, a.h].every(Number.isFinite)) failures.push('non-finite geometry');
      if (a.x < bounds.x1 - 3 || a.y < bounds.y1 - 3 || a.x + a.w > bounds.x2 + 3 || a.y + a.h > bounds.y2 + 3)
        failures.push('shape outside fit bounds: ' + a.label);
    }
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const a = shapes[i], b = shapes[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0.5 && oy > 0.5) failures.push('overlap: ' + a.label + ' / ' + b.label);
      }
    }
    for (const path of svg.querySelectorAll('path')) {
      if (/NaN|Infinity/.test(path.getAttribute('d') || '')) failures.push('non-finite path');
    }
    await map.setData(data);
    if (first !== map.g.node().innerHTML) failures.push('layout is not deterministic');
    return {failures, shapes: shapes.length};
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
            page.wait_for_function("typeof Timeline === 'function' && typeof markmap === 'object'")

            got = page.evaluate(SPLIT, list(DATES))
            for (heading, want), have in zip(DATES.items(), got):
                assert tuple(have) == want, f"{heading!r}: expected {want}, got {tuple(have)}"
            print(f"PASS {len(DATES)} date formats")

            checks = 0
            for name, tree in cases().items():
                for dir_ in ["auto", "horizontal", "vertical"]:
                    for spacing, gap in [(10, 40), (0, 0), (120, 400)]:
                        result = page.evaluate(GEOMETRY, {"data": tree, "spacing": spacing, "gap": gap, "dir": dir_})
                        assert not result["failures"], f"{name} ({dir_}, {spacing}, {gap}): {result['failures']}"
                        checks += 1
                print(f"PASS {name}: 3 directions x 3 spacings")

            page.locator("#md").fill("# Historia\n## 1810 — Inicio\n- Detalle\n## 1821: Fin\n")
            for mode in ["timeline", "mind", "timeline"]:
                page.locator(f'button[data-mode="{mode}"]').click()
                assert page.evaluate("localStorage.getItem('mapType')") == mode
                visible = page.evaluate("!document.querySelector('#tlDirRow').classList.contains('hidden')")
                assert visible == (mode == "timeline"), f"direction row visible={visible} in {mode}"
            page.wait_for_function("document.querySelectorAll('#preview .tl-node').length === 3")
            page.reload(wait_until="networkidle")
            page.wait_for_selector("#preview .tl-node")
            assert page.locator('button[data-mode="timeline"]').get_attribute("aria-checked") == "true"
            assert not errors, f"Browser errors: {errors}"
            browser.close()
            print(f"PASS {checks} geometry cases, mode switching, persistence, and no browser errors")
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == "__main__":
    main()
