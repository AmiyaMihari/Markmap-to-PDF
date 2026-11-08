/* mindmap.js — mapa mental de lectura bilateral.
   La idea central sostiene dos grupos de ramas que crecen hacia afuera.
   Cada subarbol reserva la altura de su contenido: no necesita simulacion,
   no cruza cajas y produce siempre el mismo dibujo para el mismo Markdown.

   Conserva la API de ConceptMap y el texto HTML del resto de los mapas.
   Las formas son SVG simples para mantener la exportacion PDF vectorial.
   spacingVertical separa nodos hermanos; branchGap separa ramas principales. */
(function (global) {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const XHTML = 'http://www.w3.org/1999/xhtml';
  const CENTER = '#243449';
  const PALETTE = ['#25867c', '#7462b3', '#c48a31', '#c3667c', '#4b80b6', '#8c9651', '#a56a44', '#648c9b'];
  const HALO = 6;

  // El SVG exportado lleva su propia tipografia, sin depender de la pagina.
  const CSS = `
.mg{font:400 15px/1.45 Arial,Helvetica,sans-serif;color:#334155;letter-spacing:normal}
.mg-link{stroke:none}
.mg-foreign{overflow:visible}
.mg-text{display:inline-block;box-sizing:border-box;padding:4px 12px;max-width:260px;
  font:400 15px/1.4 Arial,Helvetica,sans-serif;color:#334155;
  text-align:left;white-space:normal;overflow-wrap:anywhere;letter-spacing:normal}
.mg-text.d0{padding:17px 24px;max-width:280px;font-size:24px;line-height:1.25;font-weight:700;text-align:center;color:#fff}
.mg-text.d1{padding:12px 17px;max-width:228px;font-size:18px;line-height:1.3;font-weight:700}
.mg-text.d2{padding:6px 12px;font-size:16px;font-weight:700;max-width:220px}
.mg-text.left{text-align:right}
.mg-text.d0,.mg-text.d1{text-align:center}
.mg-text p{margin:0}
.mg-text ul,.mg-text ol{margin:0;padding-left:20px;text-align:left}
.mg-text a{color:#176ca5;text-decoration:underline}
.mg-text.d0 a{color:#b8e2ff}
.mg-text code{padding:.1em .3em;font-size:calc(1em - 2px);color:#425268;background:#edf1f5;border-radius:3px}
.mg-text pre{margin:0;text-align:left;white-space:pre-wrap}
.mg-text pre>code{display:block}
.mg-text mark{background:#ffeaa7}
.mg-text del{text-decoration:line-through}
.mg-text strong{font-weight:700}
.mg-text em{font-style:italic}
.mg-text img{max-width:100%;height:auto}`;

  const plain = html => String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  const hasContent = html => !!plain(html) || /<(?:img|svg|math)\b/i.test(html || '');
  const f1 = v => Math.round(v * 10) / 10;
  function el(tag, cls) {
    const e = document.createElementNS(SVGNS, tag);
    if (cls) e.setAttribute('class', cls);
    return e;
  }
  function attrs(e, values) {
    Object.entries(values).forEach(([k, v]) => e.setAttribute(k, v));
  }

  // Cinta Bezier que se afina al llegar al hijo, sin filtros ni rasterizado.
  function branch(P, C, w0, w1) {
    const reach = (C[0] - P[0]) * 0.48;
    const a = [P[0] + reach, P[1]], b = [C[0] - reach, C[1]];
    const left = [], right = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, u = 1 - t;
      const x = u ** 3 * P[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t ** 3 * C[0];
      const y = u ** 3 * P[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t ** 3 * C[1];
      const dx = 3 * u * u * (a[0] - P[0]) + 6 * u * t * (b[0] - a[0]) + 3 * t * t * (C[0] - b[0]);
      const dy = 3 * u * u * (a[1] - P[1]) + 6 * u * t * (b[1] - a[1]) + 3 * t * t * (C[1] - b[1]);
      const len = Math.hypot(dx, dy) || 1, w = (w0 + (w1 - w0) * t) / 2;
      const nx = -dy / len * w, ny = dx / len * w;
      left.push([x + nx, y + ny]);
      right.push([x - nx, y - ny]);
    }
    const pts = left.concat(right.reverse());
    return {d: 'M' + pts.map(p => `${f1(p[0])},${f1(p[1])}`).join('L') + 'Z', pts};
  }

  class MindMap extends global.ConceptMap {
    _draw() {
      const o = this.options, d3 = global.d3, g = this.g.node();
      while (g.firstChild) g.firstChild.remove();
      const spacing = Math.max(0, +o.spacingVertical || 0);
      const mainGap = 24 + Math.max(0, +o.branchGap || 0);
      const siblingGap = 4 + spacing;
      const levelGap = 36 + spacing * 0.6;
      const centerGap = 86 + spacing;
      const mix = (c, k) => d3.color(d3.interpolateRgb(c, '#ffffff')(k)).formatHex();
      const root = this.state.data;
      let id = 0;
      (function init(n, depth, parent) {
        n.children = n.children || [];
        n.state = Object.assign({}, n.state, {
          id: ++id, depth, path: parent ? parent.state.path + '.' + id : String(id),
        });
        n.children.forEach(c => init(c, depth + 1, n));
      })(root, 0, null);

      let data = root;
      while (!hasContent(data.content) && data.children.length === 1) data = data.children[0];
      // Una imagen tambien es contenido: no se pierde si es la idea central.
      const dot = !hasContent(data.content);
      const nodes = [];
      function wrap(data, depth, parent, color) {
        const n = {data, depth, parent, color, side: 0};
        nodes.push(n);
        n.children = data.children.map((c, i) => wrap(c, depth + 1, n,
          depth === 0 ? (o.color ? o.color(c) : PALETTE[i % PALETTE.length]) : color));
        return n;
      }
      const center = wrap(data, 0, null, CENTER);
      const links = el('g', 'mg-links'), boxes = el('g', 'mg-nodes');
      g.appendChild(links);
      g.appendChild(boxes);

      nodes.forEach(n => {
        n.g = el('g', 'mg-node');
        n.g.setAttribute('data-depth', n.depth);
        boxes.appendChild(n.g);
        if (n === center && dot) {
          const c = el('circle');
          attrs(c, {r: 10, fill: CENTER});
          n.g.appendChild(c);
          n.w = n.h = 20;
          return;
        }
        if (n === center) {
          n.halo = el('rect', 'mg-halo');
          n.g.appendChild(n.halo);
        }
        n.rect = el('rect', 'mg-box');
        n.fo = el('foreignObject', 'mg-foreign');
        attrs(n.fo, {width: 1000, height: 1000});
        n.div = document.createElementNS(XHTML, 'div');
        n.div.className = 'mg-text d' + Math.min(n.depth, 3);
        n.div.innerHTML = n.data.content || '';
        n.fo.appendChild(n.div);
        n.g.appendChild(n.rect);
        n.g.appendChild(n.fo);
      });
      // Medir todos los textos antes de posicionar evita reflows por rama.
      nodes.forEach(n => {
        if (!n.div) return;
        n.tw = n.div.offsetWidth;
        n.th = n.div.offsetHeight;
        n.w = n.tw + (n.halo ? HALO * 2 : 0);
        n.h = n.th + (n.halo ? HALO * 2 : 0);
      });

      // Una banda vertical exclusiva por subarbol evita tanto colisiones de
      // cajas como conexiones que atraviesen contenido de otra rama.
      function measure(n) {
        n.children.forEach(measure);
        n.kidsHeight = n.children.reduce((h, c) => h + c.span, 0)
          + Math.max(0, n.children.length - 1) * siblingGap;
        n.span = Math.max(n.h, n.kidsHeight);
      }
      center.children.forEach(measure);

      // Reparto por altura real, conservando el orden de lectura en cada lado.
      const sides = [{dir: 1, children: [], height: 0}, {dir: -1, children: [], height: 0}];
      center.children.forEach(n => {
        const side = sides[0].height <= sides[1].height ? sides[0] : sides[1];
        if (side.children.length) side.height += mainGap;
        side.children.push(n);
        side.height += n.span;
      });
      center.x = center.y = 0;
      function place(n, x, top, dir) {
        n.side = dir;
        n.x = x;
        n.y = top + n.span / 2;
        let y = n.y - n.kidsHeight / 2;
        n.children.forEach(c => {
          // Un hijo unico queda cerca: no hay un abanico que deba abrirse.
          const gap = n.children.length === 1 ? levelGap * 0.72 : levelGap;
          place(c, x + dir * (n.w / 2 + gap + c.w / 2), y, dir);
          y += c.span + siblingGap;
        });
      }
      sides.forEach(side => {
        let y = -side.height / 2;
        side.children.forEach(n => {
          place(n, side.dir * (center.w / 2 + centerGap + n.w / 2), y, side.dir);
          y += n.span + mainGap;
        });
      });

      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      const grow = (x, y) => {
        x1 = Math.min(x1, x); y1 = Math.min(y1, y);
        x2 = Math.max(x2, x); y2 = Math.max(y2, y);
      };
      nodes.forEach(n => {
        attrs(n.g, {transform: `translate(${f1(n.x)},${f1(n.y)})`, 'data-side': n.side});
        if (n.div) {
          n.div.classList.toggle('left', n.side < 0);
          if (n.depth === 1) n.div.style.color = d3.color(d3.interpolateRgb(n.color, CENTER)(0.38)).formatHex();
          const rounded = (e, w, h, radius) => attrs(e, {
            x: f1(-w / 2), y: f1(-h / 2), width: w, height: h, rx: radius,
          });
          if (n.halo) {
            rounded(n.halo, n.w, n.h, 22);
            attrs(n.halo, {fill: '#edf1f5', stroke: 'none'});
          }
          rounded(n.rect, n.tw, n.th, n.depth === 0 ? 17 : n.depth === 1 ? 12 : 7);
          const look = n.depth === 0 ? {fill: CENTER, stroke: 'none', 'stroke-width': 0}
            : n.depth === 1 ? {fill: mix(n.color, 0.89), stroke: mix(n.color, 0.62), 'stroke-width': 1.2}
            : n.children.length ? {fill: mix(n.color, 0.96), stroke: 'none', 'stroke-width': 0}
            : {fill: '#ffffff', stroke: 'none', 'stroke-width': 0};
          attrs(n.rect, look);
          attrs(n.fo, {x: f1(-n.tw / 2), y: f1(-n.th / 2), width: n.tw + 2, height: n.th + 2});
        }
        // Incluir borde y halo en el encuadre, incluso con margen de exportacion 0.
        grow(n.x - n.w / 2 - 1, n.y - n.h / 2 - 1);
        grow(n.x + n.w / 2 + 1, n.y + n.h / 2 + 1);
        if (!n.parent) return;
        const p = n.parent, dir = n.side;
        const inset = p === center && p.halo ? HALO : 0;
        const P = [p.x + dir * (p.w / 2 - inset - 1), p.y];
        const C = [n.x - dir * (n.w / 2 - 1), n.y];
        const widths = n.depth === 1 ? [7, 2.8] : n.depth === 2 ? [3, 1.6] : [1.8, 1.1];
        const b = branch(P, C, ...widths);
        const path = el('path', 'mg-link');
        attrs(path, {d: b.d, fill: mix(n.color, n.depth === 1 ? 0.08 : 0.3)});
        links.appendChild(path);
        b.pts.forEach(q => grow(q[0], q[1]));
      });
      this.state.rect = isFinite(x1) ? {x1, y1, x2, y2} : {x1: 0, y1: 0, x2: 0, y2: 0};
    }
  }

  MindMap.cls = 'mg';
  MindMap.css = CSS;
  global.MindMap = MindMap;
})(window);
