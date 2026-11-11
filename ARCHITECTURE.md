# How markmap2pdf works

This is the map of the code: what each file does, how a line of Markdown becomes
a drawing and then a PDF, and what to touch to change or add things. For how to
*use* the tool, see the [README](README.md). Code comments are in Spanish; this
document is the English overview.

## The big picture

There are two programs that share the same idea:

* **The web app (`docs/`)** is the main product. It runs **entirely in the
  browser**, with no server and no build step: plain HTML, CSS and JavaScript,
  plus a few libraries loaded from jsDelivr with pinned versions. GitHub Pages
  serves the `docs/` folder of `main` at
  <https://amiyamihari.github.io/Markmap-to-PDF/>.
* **The CLI (`markmap2pdf.py`)** is the older Python tool. It opens Chromium with
  Playwright, draws a brace map with markmap and crops it. It only does brace
  maps. It reuses `docs/spacing.js` so both draw the same tree.

Everything the user loads (their Markdown, their assignment PDF) stays in the
browser; only the final file is downloaded.

## Files

| file | role |
|---|---|
| `docs/index.html` | the page: all the markup and all the CSS, inline. Loads the libraries and scripts in order |
| `docs/i18n.js` | Spanish and English texts, and the function `t(key, vars)` |
| `docs/app.js` | the interface: editor, preview, map type, files, page strip, downloads |
| `docs/spacing.js` | patches markmap: extra space between branches and fixes to the Markdown. Shared with the CLI |
| `docs/concept.js` | `ConceptMap`, the concept map. It is also the **base class** of the other two drawers |
| `docs/mindmap.js` | `MindMap`, the two-sided mind map |
| `docs/timeline.js` | `Timeline`, the timeline |
| `docs/motor.js` | `Motor`, the exporter: off-screen render, SVG, PNG, vector PDF, merging, reading markmap `.html` files |
| `markmap2pdf.py` | the CLI |
| `tests/*.py` | browser tests with Playwright |

### Load order

`index.html` loads, all with `defer` and in this order: d3, markmap-lib,
markmap-view (from the CDN), then `spacing.js`, `concept.js`, `mindmap.js`,
`timeline.js`, `motor.js` and `app.js`. `i18n.js` is loaded **without** `defer`
at the end of `<body>`, so the page is already translated before its first paint.
`mindmap.js` and `timeline.js` extend `ConceptMap`, so they must come after
`concept.js`.

## From Markdown to a drawing

1. **Text.** `app.js` reads the editor (`mdText()`). It strips the ```` ``` ````
   marks if the whole text is a code block (typical when pasting from an AI), and
   `mmSpacing.fixMarkdown()` keeps the bullets that markmap would drop before a
   sub-heading.
2. **Tree.** `markmap.Transformer().transform(text)` turns the Markdown into a
   tree of `{content, children, payload}` nodes. `content` is HTML. Note:
   **markmap writes every non-ASCII character as an HTML entity** (`—` arrives as
   `&#x2014;`, `é` as `&#xE9;`). Anything that parses node text has to decode
   them first (see `letters()` in `timeline.js`).
3. **Source.** `source()` returns `{root, opts, mode, key}`. `opts` comes from
   `mapOpts()`: markmap front-matter options, the two spacing settings and the
   timeline direction. `key` identifies the drawing: if it doesn't change, the
   exporter reuses the last one instead of drawing again.
   If the user uploaded a markmap `.html`, `Motor.readRepl()` extracts its tree
   (with its colors) inside a sandboxed iframe, and `source()` uses that tree.
4. **Drawer.** `mapClass(mode)` picks the class:

   | mode | class | file |
   |---|---|---|
   | `synoptic` (brace map) | `markmap.Markmap` | the markmap library, patched by `spacing.js` |
   | `concept` | `ConceptMap` | `concept.js` |
   | `mind` | `MindMap` | `mindmap.js` |
   | `timeline` | `Timeline` | `timeline.js` |

5. **Preview.** `preview()` creates the drawer once per type, then on every
   change: `setData(root)` → `Motor.settle()` → `fitPaper()`. `fitPaper()` sizes
   the sheet to the map's proportions and fits the map **once** (`recenter()`).
   Typing triggers `preview()` 250 ms after the last key. A single
   `ResizeObserver` on the tray refits when the window or the expanded view
   changes size, batching several notices into one frame (`queueFit()`).

### The drawer contract

The page treats every drawer like markmap. Each one has:

* `Class.create(svg, opts, data)`: build it on an `<svg>` and draw `data`.
* `setData(root)`, `setOptions(opts)`, `fit()`, `rescale(factor)`, `destroy()`.
* `svg` (a d3 selection) and `state.rect` (`{x1, y1, x2, y2}`, the map's box).

`ConceptMap` implements all of this with d3-zoom. `MindMap` and `Timeline`
inherit it and only override `_draw()`, plus two static fields: `cls` (the CSS
class prefix: `cm`, `mg`, `tl`) and `css` (a `<style>` placed **inside** the
`<svg>`, so exported SVGs look the same outside the page).

Options they understand: `spacingVertical` and `branchGap` (the two settings),
`color` (a function, for maps uploaded from markmap), `zoom` / `pan` (off for the
exporter and for the thumbnail in the page strip), `fitRatio`, and
`timelineDir` (`'horizontal'` or `'vertical'`, only the timeline).

Each drawer is **deterministic**: the same text always gives the same drawing.
None of them uses randomness or a physics simulation.

### The drawers in one paragraph each

* **Concept map** (`concept.js`): top to bottom, boxes and right-angle lines.
  It measures every box once, then tries a full side-by-side layout; if it would
  be wider than `MAX_W` and more than `MAX_ASPECT` times wider than tall, it
  folds groups of leaves into columns, step by step, until it fits.
* **Mind map** (`mindmap.js`): main branches are split between the right and the
  left by height, keeping their order. Each subtree reserves a vertical band as
  tall as its content, so nothing overlaps and no connection crosses another
  branch. Connections are tapered Bézier ribbons drawn as filled paths.
* **Timeline** (`timeline.js`): `#` is the title, each child of the root is an
  event. `splitDate()` separates a leading date (`1810 — …`, `1914-1918 …`,
  `July 20, 1969: …`, `Siglo XIX`…) from the title. Dates go on pills on the
  axis; cards alternate sides, and each card only has to clear the previous one
  on its own side. Details become lines with bullet *characters* (see the PDF
  section for why).

## From drawing to file (`motor.js`)

`Motor.render(src)` draws the map again **off screen**, at scale 1, with zoom
off, using the same class as the preview. It waits for markmap to settle and
removes the zoom transform, so the `<g>` has the map's real coordinates. The
result is cached by `src.key`.

* **SVG:** clone the `<svg>`, set its `viewBox` to the content's `getBBox()`
  plus the margin, white background.
* **PNG:** draw that SVG on a canvas. If the requested scale doesn't fit the
  browser's canvas limits, it uses the largest one that does.
* **PDF (vector):** built with pdf-lib. It walks the drawing's elements **in
  document order** and redraws them: shapes (`path`, `line`, `rect`, `circle`)
  as PDF paths, and the HTML text inside `<foreignObject>` as real PDF text,
  placed where the browser laid out each letter (read with `Range` rects). Fonts
  are Helvetica and Courier, plus DejaVu Sans (downloaded only when needed) for
  symbols. If the map has something no PDF font can write (emoji, images,
  formulas), the whole PDF becomes a 288 dpi image instead.
* **Merge:** `Motor.merge()` inserts the map's page into the assignment's PDF at
  the chosen position, either at its own size or scaled onto a sheet like the
  assignment's (still vector).

Which elements get drawn is decided by the `sel` selector list in `vector()`.
A drawer's shapes **must** match it or they won't appear in the PDF.

Rules this imposes on drawers:

* Only use `path`, `line`, `rect` (rounded corners are fine), `circle`, and text
  in `<foreignObject>`.
* Text that should reach the PDF must be **real text nodes**. CSS list markers
  (`::marker`) and generated content (`::before`) are not text, so they are lost:
  that's why the timeline writes `•` as a character.
* Colors must be set as attributes or computed styles that resolve to `rgb()`.

## Internationalization (`i18n.js`)

Two dictionaries, `ES` and `EN`, with the same keys. Markup uses
`data-i18n` (text), `data-i18n-ph` (placeholder), `data-i18n-title` and
`data-i18n-aria`; scripts use `t('key', {vars})`. `I18N.onChange()` lets
`app.js` redo the texts it builds on the fly. Every visible text needs a key in
**both** languages.

The editor's example text is per map type (`md.example.<mode>`). The textarea
uses `data-i18n` on its default text: an untouched textarea follows its default
value, so switching type or language swaps the example, while text the user
typed (or a file they loaded) stays.

## Small things worth knowing

* **Saved in `localStorage`:** `lang`, `mapType`, `tlDir` (and the old `mode`
  key, read once to migrate). Every access is wrapped in `try`.
* **markmap quirks handled in code:**
  * markmap's `destroy()` leaves its own `wheel` listener on the `<svg>`;
    `ConceptMap`'s constructor removes it, or switching away from the brace map
    makes the wheel push the map off screen.
  * markmap places nodes one frame after `setData()` and its `fit()` is a d3
    transition (it waits for frames). That's why the preview calls
    `Motor.settle()` and fits only once.
* **Performance:** the page is meant to run well on modest computers. There are
  no infinite animations, no `backdrop-filter` and no large `filter: blur`; the
  background glow is two static gradients. Keep it that way.
* **No third-party scripts** beyond the pinned libraries. The Ko-fi button is a
  plain link on purpose (Ko-fi's widget script would add a request on every
  visit and uses `document.write`).
* **Python CLI:** `markmap2pdf.py` builds a small HTML page with markmap from the
  CDN, injects `docs/spacing.js`, renders it with Playwright's Chromium and
  exports PDF/PNG/SVG. It can also be imported (`render_to_bytes`).

## Adding a new map type

1. Write `docs/<type>.js` with a class that extends `ConceptMap`, sets `cls` and
   `css`, and overrides `_draw()`. `_draw()` must fill `this.state.rect` and
   should not leave temporary fields on the tree nodes.
2. `docs/index.html`: add the `<script defer>` before `motor.js`, a button in
   `.modes`, and update the `.modes` grid columns, the pill width and its
   `translateX` rule.
3. `docs/app.js`: add the mode to `MODES` and to `mapClass`.
4. `docs/motor.js`: add the class to the lookup in `render()` and its selectors
   to `sel` in `vector()`.
5. `docs/i18n.js`: `mode.<type>`, `kind.<type>` and `md.example.<type>`, in
   Spanish and English (and its own prompt if the AI needs different rules).
6. Add a test in `tests/` and document it in the README.

## Tests

`tests/mindmap_browser.py` and `tests/timeline_browser.py` start a temporary
local server for `docs/`, open a headless Chromium with Playwright and check
geometry (no overlaps, everything inside the fit box, deterministic output),
date parsing, mode switching, persistence after reload and the absence of
JavaScript errors. Run them with `.venv/bin/python tests/<file>.py` after
`bash setup.sh`. They need internet access for the CDN libraries.

For visual changes, also look at the page: run `bash start.sh` and check light
and dark mode, desktop and a 375 px wide phone, with no horizontal scroll.
