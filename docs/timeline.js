/* timeline.js — linea del tiempo: el mismo Markdown, como eventos en orden
   sobre un eje.

     #            el titulo, arriba de todo
     ## o -       cada evento, en el orden en que se escribe. Si empieza con
                  una fecha ("1810 — Inicio", "1914-1918: Guerra", "Siglo XIX")
                  la fecha va en una etiqueta de color sobre el eje
     lo de abajo  los detalles del evento, dentro de su tarjeta

   Las tarjetas se alternan a un lado y otro del eje: cada una solo tiene que
   librar a la anterior de su mismo lado, y la linea sale mas corta. Va
   horizontal, o vertical si la opcion `timelineDir` es 'vertical' (la elige
   quien usa la pagina, con los botones junto a "Vista previa").

   Hereda de ConceptMap (concept.js) todo lo que la pagina usa de markmap:
   create, setData, setOptions, fit, rescale, destroy, svg y state.rect. El
   texto va como HTML en <foreignObject>, y motor.js lo pasa al PDF como texto
   real; por eso las vinetas son caracteres (•) y no marcadores de lista.

   Opciones que usa (las casillas de Ajustes):
     spacingVertical   aire entre tarjetas del mismo lado
     branchGap         aire extra entre un evento y el siguiente
     color             color de cada evento (por defecto, la paleta)        */
(function (global) {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const XHTML = 'http://www.w3.org/1999/xhtml';
  const INK = '#243449';
  const AXIS = '#cfd6df';
  // la misma paleta suave del mapa mental
  const PALETTE = ['#25867c', '#7462b3', '#c48a31', '#c3667c', '#4b80b6', '#8c9651', '#a56a44', '#648c9b'];
  const BULLETS = ['•', '–', '·'];     // todos existen en Helvetica: el PDF queda vectorial

  const CSS = `
.tl{font:400 14px/1.4 Arial,Helvetica,sans-serif;color:#334155}
.tl-foreign{overflow:visible}
.tl-head{display:inline-block;max-width:640px;padding:0 8px;font:700 26px/1.25 Arial,Helvetica,sans-serif;
  color:${INK};text-align:center}
.tl-date{display:inline-block;padding:5px 14px;font:700 14px/1.2 Arial,Helvetica,sans-serif;color:#fff;white-space:nowrap}
.tl-card{display:inline-block;box-sizing:border-box;max-width:240px;padding:11px 15px 12px;
  font:400 13.5px/1.4 Arial,Helvetica,sans-serif;color:#334155;text-align:left;overflow-wrap:anywhere}
.tl-title{font-size:15.5px;font-weight:700;line-height:1.3}
.tl-li{display:flex;gap:6px;margin-top:3px}
.tl-title + .tl-li{margin-top:6px}
.tl-li.head{font-weight:700}
.tl-bul{flex:none;color:var(--c)}
.tl-foreign p{margin:0}
.tl-foreign a{color:#176ca5;text-decoration:underline}
.tl-foreign code{padding:.1em .3em;font-size:calc(1em - 2px);color:#425268;background:#edf1f5;border-radius:3px}
.tl-foreign pre{margin:0;white-space:pre-wrap}
.tl-foreign mark{background:#ffeaa7}
.tl-foreign del{text-decoration:line-through}
.tl-foreign strong{font-weight:700}
.tl-foreign em{font-style:italic}
.tl-foreign img{max-width:100%;height:auto}`;

  /* markmap escribe todo lo que no es ASCII como codigo HTML ("—" llega como
     "&#x2014;", "é" como "&#xE9;"). Se regresan a letras para poder buscar la
     fecha; solo los que no son ASCII, asi "&#x3C;" nunca se vuelve una etiqueta. */
  const letters = html => String(html || '').replace(/&#(x[0-9a-f]+|\d+);/gi, (m, c) => {
    const n = c[0] === 'x' || c[0] === 'X' ? parseInt(c.slice(1), 16) : +c;
    return n > 127 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
  const plain = html => letters(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').trim();
  const f1 = v => Math.round(v * 10) / 10;
  function el(tag, cls) {
    const e = document.createElementNS(SVGNS, tag);
    if (cls) e.setAttribute('class', cls);
    return e;
  }
  function attrs(e, values) { Object.entries(values).forEach(([k, v]) => e.setAttribute(k, v)); }

  /* ── la fecha de cada evento ──────────────────────────────────────────── */
  const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|' +
    'noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|' +
    'november|december';
  const WORDS = 'siglos?|años?|décadas?|decadas?|eras?|edad|épocas?|epocas?|etapas?|fases?|' +
    'periodos?|períodos?|hoy|actualidad|presente|antigüedad|antiguedad|centur(?:y|ies)|years?|' +
    'decades?|age|today|present|stages?|phases?|periods?';
  const START = new RegExp(`^(?:${WORDS}|${MONTHS})\\b`, 'i');
  // lo de antes de ":" o "—" parece fecha: tiene numeros, un numero romano o una palabra de tiempo
  const looksDate = s => s.length <= 40 && (/\d/.test(s) || START.test(s) || /^[IVXLCDM]+\b/.test(s));
  // todo el texto es una fecha ("1810", "15 de septiembre de 1810", "Siglo XIX")
  const isDate = s => s.length <= 40 && s.split(/\s+/).length <= 6 &&
    (/^\d/.test(s) || START.test(s) || /^[IVXLCDM]+$/.test(s));

  // separa "fecha — titulo" (o ": ", " | ", " - "); sin fecha, todo es titulo
  function splitDate(html) {
    const h = letters(html).trim();
    const m = /^(?:<(?:strong|b|em)>)?([^<]+?)(?:<\/(?:strong|b|em)>)?(?:\s*[—–|]\s*|:\s+|\s+-\s+)(\S[\s\S]*)$/.exec(h);
    if (m && looksDate(plain(m[1]))) return {date: m[1].trim(), title: m[2]};
    // "1492 Llegada de Colon", "1914-1918 Primera Guerra", "300 a. C. Fundacion"
    const y = /^(?:<(?:strong|b|em)>)?(\d{3,4}(?:\s*[-–]\s*\d{2,4})?(?:\s*(?:a\.?\s?C\.?|d\.?\s?C\.?|BCE?|AD|CE)(?!\w))?)(?:<\/(?:strong|b|em)>)?\s+(\S[\s\S]*)$/.exec(h);
    if (y) return {date: y[1], title: y[2]};
    if (isDate(plain(h))) return {date: h, title: ''};
    return {date: '', title: h};
  }

  // los detalles de un evento, como renglones con vineta (cada nivel, mas adentro)
  function details(kids, depth) {
    return kids.map(k =>
      `<div class="tl-li${k.children.length ? ' head' : ''}" style="margin-left:${depth * 14}px">` +
      `<span class="tl-bul">${BULLETS[Math.min(depth, 2)]}</span><span>${k.content || ''}</span></div>` +
      details(k.children, depth + 1)).join('');
  }

  class Timeline extends global.ConceptMap {
    _draw() {
      const o = this.options, d3 = global.d3, g = this.g.node();
      while (g.firstChild) g.firstChild.remove();
      const spacing = Math.max(0, +o.spacingVertical || 0);
      const cardGap = 14 + spacing * 1.5;              // entre tarjetas del mismo lado
      const pillGap = 16 + Math.max(0, +o.branchGap || 0) * 0.5;   // entre etiquetas del eje
      const stem = 26 + spacing;                       // del eje a las tarjetas
      const mix = (c, k) => d3.color(d3.interpolateRgb(c, '#ffffff')(k)).formatHex();
      const root = this.state.data;

      // ── 1. estado de cada nodo, igual que lo arma markmap ─────────────────
      let id = 0;
      (function init(n, depth, parent) {
        n.children = n.children || [];
        n.state = Object.assign({}, n.state, {
          id: ++id, depth, path: parent ? parent.state.path + '.' + id : String(id),
        });
        n.children.forEach(c => init(c, depth + 1, n));
      })(root, 0, null);

      // el titulo; sin "# titulo" y con una sola rama arriba, esa es el titulo
      let head = root;
      while (!plain(head.content) && head.children.length === 1) head = head.children[0];
      const events = head.children.map((n, i) => Object.assign({n, side: 0},
        splitDate(n.content), {color: o.color ? o.color(n) : PALETTE[i % PALETTE.length]}));

      // ── 2. lo que se mide: titulo, etiquetas de fecha y tarjetas ──────────
      const lines = el('g', 'tl-lines'), boxes = el('g', 'tl-nodes');
      g.appendChild(lines);
      g.appendChild(boxes);
      function html(parent, cls, inner, style) {
        const fo = el('foreignObject', 'tl-foreign');
        attrs(fo, {width: 1000, height: 1000});
        const div = document.createElementNS(XHTML, 'div');
        div.className = cls;
        if (style) div.setAttribute('style', style);
        div.innerHTML = inner;
        fo.appendChild(div);
        parent.appendChild(fo);
        return {fo, div};
      }
      const top = plain(head.content) ? (() => {
        const ng = el('g', 'tl-node');
        boxes.appendChild(ng);
        return Object.assign({g: ng}, html(ng, 'tl-head', head.content));
      })() : null;
      events.forEach(e => {
        e.g = el('g', 'tl-node');
        boxes.appendChild(e.g);
        const tint = d3.color(d3.interpolateRgb(e.color, INK)(0.38)).formatHex();
        if (e.title || e.n.children.length) {
          e.box = el('rect');
          e.g.appendChild(e.box);
          e.card = html(e.g, 'tl-card',
            (e.title ? `<div class="tl-title" style="color:${tint}">${e.title}</div>` : '') +
            details(e.n.children, 0), `--c:${e.color}`);
        }
        if (e.date) {
          e.chip = el('rect');
          e.g.appendChild(e.chip);
          e.pill = html(e.g, 'tl-date', e.date);
        } else {
          e.dot = el('circle');
          e.g.appendChild(e.dot);
        }
      });
      // todas las mediciones juntas: cada una obliga a recalcular la pagina
      const size = x => x ? {w: x.div.offsetWidth, h: x.div.offsetHeight} : null;
      if (top) Object.assign(top, size(top));
      events.forEach(e => { e.cs = size(e.card); e.ps = size(e.pill) || {w: 16, h: 16}; });

      // ── 3. acomodo, en la direccion elegida ───────────────────────────────
      /* "a lo largo" es la direccion del eje y "a lo ancho", la otra. Cada
         etiqueta libra a la anterior sobre el eje; cada tarjeta, solo a la
         anterior de su mismo lado. */
      const V = o.timelineDir === 'vertical';
      const along = s => V ? s.h : s.w, across = s => V ? s.w : s.h;
      const sideOf = i => V ? (i % 2 ? -1 : 1) : (i % 2 ? 1 : -1);
      const reach = Math.max(...events.map(e => across(e.ps)), 16) / 2 + stem;
      const last = {}, at = [];
      events.forEach((e, i) => {
        let p = i ? at[i - 1] + (along(events[i - 1].ps) + along(e.ps)) / 2 + pillGap : 0;
        const prev = last[sideOf(i)];
        if (e.cs && prev) p = Math.max(p, prev.p + (along(prev.cs) + along(e.cs)) / 2 + cardGap);
        if (e.cs) last[sideOf(i)] = {p, cs: e.cs};
        at.push(p);
      });
      const n = events.length;
      const start = (n ? at[0] - along(events[0].ps) / 2 : 0) - 26;
      const end = (n ? at[n - 1] + along(events[n - 1].ps) / 2 : 0) + 30;
      // a lo largo / a lo ancho -> x, y
      const xy = (a, c) => V ? [c, a] : [a, c];

      // ── 4. eje, flecha y uniones ──────────────────────────────────────────
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      const grow = (x, y) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
      const line = (d, stroke, width, cls) => {
        const p = el('path', cls);
        attrs(p, {d, fill: 'none', stroke, 'stroke-width': width, 'stroke-linecap': 'round'});
        lines.appendChild(p);
      };
      const [sx, sy] = xy(start, 0), [ex, ey] = xy(end, 0);
      line(`M${f1(sx)},${f1(sy)}L${f1(ex)},${f1(ey)}`, AXIS, 6, 'tl-axis');
      const tip = xy(end + 18, 0), b1 = xy(end, -10), b2 = xy(end, 10);
      const arrow = el('path', 'tl-arrow');
      attrs(arrow, {d: `M${f1(tip[0])},${f1(tip[1])}L${f1(b1[0])},${f1(b1[1])}L${f1(b2[0])},${f1(b2[1])}Z`, fill: AXIS});
      lines.appendChild(arrow);
      [[sx, sy], tip, b1, b2].forEach(q => grow(q[0], q[1]));

      // ── 5. etiquetas, puntos y tarjetas ───────────────────────────────────
      const place = (fo, rect, w, h, cx, cy, look) => {
        attrs(fo, {x: f1(cx - w / 2), y: f1(cy - h / 2), width: f1(w + 2), height: f1(h + 2)});
        if (rect) attrs(rect, Object.assign({x: f1(cx - w / 2), y: f1(cy - h / 2), width: w, height: h}, look));
        grow(cx - w / 2 - 1, cy - h / 2 - 1);
        grow(cx + w / 2 + 1, cy + h / 2 + 1);
      };
      events.forEach((e, i) => {
        const side = sideOf(i);
        const [px, py] = xy(at[i], 0);
        if (e.pill) {
          place(e.pill.fo, e.chip, e.ps.w, e.ps.h, px, py,
                {rx: e.ps.h / 2, fill: d3.color(e.color).darker(0.25).formatHex()});
        } else {
          attrs(e.dot, {cx: f1(px), cy: f1(py), r: 7, fill: e.color, stroke: '#ffffff', 'stroke-width': 3});
          grow(px - 9, py - 9); grow(px + 9, py + 9);
        }
        if (!e.cs) return;
        const half = (V ? e.cs.w : e.cs.h) / 2;
        const [cx, cy] = xy(at[i], side * (reach + half));
        place(e.card.fo, e.box, e.cs.w, e.cs.h, cx, cy,
              {rx: 10, fill: mix(e.color, 0.93), stroke: mix(e.color, 0.55), 'stroke-width': 1.2});
        // la union, del borde de la etiqueta (o del punto) al de la tarjeta
        const from = side * ((V ? e.ps.w : e.ps.h) / 2), to = side * reach;
        const [ax, ay] = xy(at[i], from), [bx, by] = xy(at[i], to);
        line(`M${f1(ax)},${f1(ay)}L${f1(bx)},${f1(by)}`, mix(e.color, 0.35), 2, 'tl-stem');
      });

      // ── 6. el titulo, arriba de todo y centrado ───────────────────────────
      if (top) {
        const cx = V ? 0 : (x1 + x2) / 2;
        place(top.fo, null, top.w, top.h, cx, (isFinite(y1) ? y1 : 0) - 24 - top.h / 2);
      }
      this.state.rect = isFinite(x1) ? {x1, y1, x2, y2} : {x1: 0, y1: 0, x2: 0, y2: 0};
    }
  }

  Timeline.cls = 'tl';
  Timeline.css = CSS;
  Timeline.splitDate = splitDate;      // para las pruebas
  global.Timeline = Timeline;
})(window);
