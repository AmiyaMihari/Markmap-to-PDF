# Notes for AI agents

markmap2pdf turns Markdown into four kinds of maps (brace map, concept map, mind
map, timeline) and exports them as cropped PDF/PNG/SVG, all in the browser. Read
[ARCHITECTURE.md](ARCHITECTURE.md) before changing code; the [README](README.md)
explains how people use it.

## Run and check

* `bash start.sh` serves `docs/` at <http://127.0.0.1:8765> (no build step, no
  install). The maintainer reviews changes there, so leave it running when you
  hand work over.
* `bash setup.sh` creates `.venv/` with Playwright and its Chromium. Then:
  `.venv/bin/python tests/concept_browser.py`,
  `.venv/bin/python tests/mindmap_browser.py` and
  `.venv/bin/python tests/timeline_browser.py`. All three must pass.
* For anything visual, take Playwright screenshots and look at them: light and
  dark mode, desktop and a 375 px phone, and check there is no horizontal scroll
  (`document.documentElement.scrollWidth` equals the viewport width).
* Save screenshots and scratch files outside the repo. `*.png` is git-ignored,
  but `docs/` is published as-is.

## Conventions

* **Languages:** code comments in plain Spanish; README and these docs in
  English. Every visible UI text goes through `docs/i18n.js`, in **both**
  Spanish and English.
* **Keep it light:** no infinite animations, no `backdrop-filter`, no large CSS
  blurs, no new third-party scripts. Libraries come from jsDelivr with a pinned
  version. The tool must run well on modest computers.
* **Keep the PDF vector:** drawers may only use `path`, `line`, `rect`, `circle`
  and text inside `<foreignObject>`, and their selectors must be listed in
  `motor.js` (`sel` in `vector()`). Text must be real characters (no CSS list
  markers or `::before` content).
* **Deterministic drawings:** the same Markdown must always give the same map.
* **Remove dead code** when a change leaves something unused (functions, CSS,
  i18n keys, files).
* **Update the docs** (README, ARCHITECTURE.md) in the same change as the
  feature.

## Git

* `main` is the live site: GitHub Pages publishes `docs/` from `main`. Work on a
  branch and let the maintainer review it locally first.
* Commit, push or merge only when the maintainer asks.
* Commit messages in Spanish. The maintainer (AmiyaMihari) is the author; do
  **not** add `Co-Authored-By` or other attribution lines.
* `version-python` is the old FastAPI version; leave it alone.

## License

GPL-3.0-or-later. New dependencies must be GPL-3.0 compatible (MIT, BSD, ISC
and Apache-2.0 are) and be added to the credits table in the README.
