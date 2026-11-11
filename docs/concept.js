/* concept.js — mapa conceptual: el mismo arbol del Markdown, pero de arriba
   hacia abajo, con cajas y conectores en angulo (como un organigrama).

   Imita lo que la pagina usa de markmap (create, setData, setOptions, fit,
   rescale, destroy, svg, state.rect), asi la vista previa, la lupa, la vista
   ampliada y el exportador funcionan igual con los dos tipos de mapa.

   El texto de cada caja va como HTML dentro de un <foreignObject>, igual que
   en markmap: negritas, codigo y enlaces se ven igual, y motor.js lo pasa al
   PDF como texto real con el mismo codigo de siempre.

   Opciones que usa (las mismas casillas de Ajustes):
     spacingVertical   separacion entre cajas hermanas
     branchGap         aire extra entre las ramas principales
     color             color de cada rama (por defecto, el de markmap)
     conceptLayout     'auto' (por defecto: pliega en columnas lo que no cabe),
                       'open' (todo lado a lado, aunque quede ancho) o
                       'compact' (todo en columnas bajo las ramas principales) */
(function (global) {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const XHTML = 'http://www.w3.org/1999/xhtml';

  // va dentro del <svg>: el SVG exportado se ve igual fuera de la pagina
  const CSS = `
.cm{font:400 14px/1.35 sans-serif;color:#1f2328}
.cm-link{fill:none;stroke:#a9b1bb;stroke-width:1.5px;stroke-linejoin:round}
.cm-foreign{overflow:visible}
.cm-text{display:inline-block;box-sizing:border-box;padding:7px 12px;max-width:200px;
  text-align:center;white-space:normal;overflow-wrap:break-word}
.cm-text.d0{font-size:17px;font-weight:700;padding:10px 18px;max-width:300px}
.cm-text.d1{font-size:15px;font-weight:600;max-width:230px}
.cm-text.leaf{text-align:left;max-width:270px}
.cm-text p{margin:0}
.cm-text a{color:#0969da}
.cm-text code{padding:.1em .3em;font-size:calc(1em - 2px);color:#555;background:#f0f0f0;border-radius:3px}
.cm-text pre{margin:0;text-align:left}
.cm-text pre>code{display:block}
.cm-text mark{background:#ffeaa7}
.cm-text del{text-decoration:line-through}
.cm-text strong{font-weight:700}
.cm-text em{font-style:italic}
.cm-text img{max-width:100%}`;

  // medidas, en px
  const STACK_TOP = 12;    // de la caja padre a la primera hoja apilada
  const STACK_GAP = 8;     // entre hojas apiladas
  const SPINE = 14;        // la linea vertical de la pila, desde el borde del padre
  const INDENT = 28;       // las hojas apiladas, desde el borde del padre
  // un grupo de hojas mas ancho que esto se apila (cuando ya hay que plegar)
  const LIMIT_LEAVES = 360;
  // el mapa se pliega en columnas mientras pase de este ancho y sea mas
  // ancho que esta proporcion
  const MAX_W = 1600;
  const MAX_ASPECT = 1.7;

  function walk(n, fn) { fn(n); n.children.forEach(c => walk(c, fn)); }
  const plain = html => String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

  class ConceptMap {
    static create(svg, opts, data) {
      const cm = new this(svg, opts);       // this: ConceptMap o MindMap
      if (data) cm.setData(data).then(() => cm.fit());
      return cm;
    }

    constructor(svg, opts) {
      const el = typeof svg === 'string' ? document.querySelector(svg) : (svg.node ? svg.node() : svg);
      this.svg = global.d3.select(el);
      this.svg.selectAll('*').remove();
      /* markmap (cuadro sinoptico) le pone al <svg> un 'wheel' propio que
         desplaza el mapa, y su destroy() no lo quita. Si se queda, cada giro
         de la rueda aqui empuja el mapa hacia abajo y el zoom "salta" fuera
         de la vista. El zoom de este mapa usa 'wheel.zoom' y no se toca. */
      this.svg.on('wheel', null);
      // agrega, no reemplaza: la miniatura es svg.mini. `cls` y `css` son de
      // cada tipo de mapa (mindmap.js hereda de aqui y cambia el dibujo)
      el.classList.add(this.constructor.cls);
      this.svg.append('style').text(this.constructor.css);
      this.g = this.svg.append('g').attr('class', this.constructor.cls + '-g');
      this.state = {data: null, rect: {x1: 0, y1: 0, x2: 0, y2: 0}};
      this.zoom = global.d3.zoom().scaleExtent([0.02, 8])
        .on('zoom', e => this.g.attr('transform', e.transform));
      this.options = {fitRatio: 0.95, maxInitialScale: 2, zoom: true, spacingVertical: 10, branchGap: 40};
      this.setOptions(opts);
    }

    setOptions(opts) {
      Object.assign(this.options, opts || {});
      if (this.options.zoom === false) this.svg.on('.zoom', null);
      // el doble clic es de la pagina (recentrar), no del zoom
      else this.svg.call(this.zoom).on('dblclick.zoom', null);
    }

    async setData(data) {
      if (data) this.state.data = data;
      if (this.state.data) this._draw();
    }

    async fit(maxScale = this.options.maxInitialScale) {
      const box = this.svg.node().getBoundingClientRect();
      const {x1, y1, x2, y2} = this.state.rect;
      const w = x2 - x1, h = y2 - y1;
      if (!w || !h || !box.width || !box.height) return;
      const r = this.options.fitRatio;
      const k = Math.min(box.width / w * r, box.height / h * r, maxScale);
      const t = global.d3.zoomIdentity
        .translate((box.width - w * k) / 2 - x1 * k, (box.height - h * k) / 2 - y1 * k).scale(k);
      this.svg.call(this.zoom.transform, t);
    }

    async rescale(f) { this.svg.call(this.zoom.scaleBy, f); }

    destroy() {
      this.svg.on('.zoom', null);
      this.svg.selectAll('*').remove();
      this.svg.node().classList.remove(this.constructor.cls);
    }

    _draw() {
      const o = this.options, root = this.state.data;
      const d3 = global.d3, g = this.g.node();
      while (g.firstChild) g.firstChild.remove();

      const hGap = 14 + 2 * Math.max(0, +o.spacingVertical || 0);   // entre cajas hermanas
      const vGap = 40 + Math.max(0, +o.spacingVertical || 0);       // entre filas
      const branch = Math.max(0, +o.branchGap || 0);                // extra entre ramas principales

      // ── 1. estado de cada nodo, igual que lo arma markmap ─────────────────
      let id = 0;
      (function init(n, depth, parent) {
        id += 1;
        n.children = n.children || [];
        n.state = Object.assign({}, n.state, {
          id, depth, path: parent ? parent.state.path + '.' + id : String(id),
        });
        n.children.forEach(c => init(c, depth + 1, n));
      })(root, 0, null);

      // un Markdown sin "# titulo" no tiene raiz: las ramas quedan sueltas
      const virtual = !plain(root.content);

      /* Cada rama tiene un color y todo lo que cuelga de ella, el mismo. Las
         ramas se cuentan en el primer nivel que de verdad se abre (si la raiz
         tiene un solo hijo, en el de abajo); lo de arriba va en azul, como la
         caja central. Sin colores propios del mapa van en orden por la paleta
         de markmap: markmap los reparte segun el orden en que se piden y dos
         ramas podian repetirse. */
      const paint = (n, c) => { n._color = c; n.children.forEach(k => paint(k, c)); };
      const palette = d3.schemeCategory10.slice(1).concat(d3.schemeCategory10[0]);
      let fork = root;
      root._top = true;
      while (fork.children.length === 1) { fork = fork.children[0]; fork._top = true; }
      fork.children.forEach((k, i) => paint(k, o.color ? o.color(k) : palette[i % palette.length]));

      // ── 2. las cajas, para medir su texto ─────────────────────────────────
      const links = document.createElementNS(SVGNS, 'g');
      links.setAttribute('class', 'cm-links');
      g.appendChild(links);
      const boxes = document.createElementNS(SVGNS, 'g');
      boxes.setAttribute('class', 'cm-nodes');
      g.appendChild(boxes);

      walk(root, n => {
        if (n === root && virtual) { n._w = n._h = 0; return; }
        const ng = document.createElementNS(SVGNS, 'g');
        ng.setAttribute('class', 'cm-node');
        const rect = document.createElementNS(SVGNS, 'rect');
        rect.setAttribute('class', 'cm-box');
        const fo = document.createElementNS(SVGNS, 'foreignObject');
        fo.setAttribute('class', 'cm-foreign');
        fo.setAttribute('width', '1000');
        fo.setAttribute('height', '1000');
        const div = document.createElementNS(XHTML, 'div');
        div.className = 'cm-text d' + Math.min(n.state.depth, 2);
        div.innerHTML = n.content || '';
        fo.appendChild(div);
        ng.appendChild(rect);
        ng.appendChild(fo);
        boxes.appendChild(ng);
        Object.assign(n, {_g: ng, _rect: rect, _fo: fo, _div: div});
      });
      /* Cada caja se mide una vez en sus dos formas: normal y, las hojas,
         tambien como item de una columna (alineadas a la izquierda y algo
         mas anchas). Asi el acomodo puede probar varias formas sin volver a
         medir: cada medicion obliga al navegador a recalcular la pagina. */
      const all = [];
      walk(root, n => { if (n._div) all.push(n); });
      const tips = all.filter(n => !n.children.length);
      tips.forEach(n => n._div.classList.add('leaf'));
      tips.forEach(n => { n._lw = n._div.offsetWidth; n._lh = n._div.offsetHeight; });
      tips.forEach(n => n._div.classList.remove('leaf'));
      all.forEach(n => { n._nw = n._div.offsetWidth; n._nh = n._div.offsetHeight; });
      if (virtual) root._nw = root._nh = 0;

      // ── 3. tamano de cada subarbol (de las hojas hacia arriba) ────────────
      /* Los hijos de un nodo van lado a lado si caben. Si no, cuelgan en
         columna bajo el padre, cada uno con su propia rama debajo, como en un
         organigrama compacto. Sin esto, un mapa de apuntes normal mediria
         metros de ancho. Las ramas principales siempre van lado a lado. */
      /* Los botones de la vista previa pueden forzarlo: 'open' nunca pliega y
         'compact' pliega todo lo que cuelga de las ramas principales. */
      const compact = o.conceptLayout === 'compact';
      // `inner`: n ya cuelga de una columna (su posicion la da la columna)
      function measure(n, limitGroup, inner) {
        n._w = n._nw; n._h = n._nh; n._asLeaf = false;
        const kids = n.children;
        if (!kids.length) { n._sw = n._w; n._sh = n._h; n._mode = 'leaf'; return; }
        kids.forEach(k => measure(k, limitGroup, inner));
        const gap = n === root ? hGap + branch : hGap;
        const rowW = kids.reduce((a, k) => a + k._sw, 0) + gap * (kids.length - 1);
        const leaves = kids.every(k => !k.children.length);
        const limitLeaves = limitGroup === Infinity ? Infinity : Math.min(limitGroup, LIMIT_LEAVES);
        const limit = Math.max(n._w * 1.6, leaves ? limitLeaves : limitGroup);
        // la raiz (y su cadena hasta donde se abre) nunca cuelga: son las ramas
        // principales. Dentro de una columna, un hijo unico cuelga con la misma
        // linea lateral que los demas (lado a lado haria un zigzag).
        if (!n._top && (compact || (inner && kids.length === 1) || (kids.length > 1 && rowW > limit))) {
          n._mode = 'stack';
          // lo que cuelga se vuelve a medir como "dentro de una columna"
          if (!inner) kids.forEach(k => measure(k, limitGroup, true));
          if (leaves) kids.forEach(k => { k._asLeaf = true; k._w = k._sw = k._lw; k._h = k._sh = k._lh; });
          n._sw = Math.max(n._w, INDENT + Math.max(...kids.map(k => k._sw)));
          n._sh = n._h + STACK_TOP + kids.reduce((a, k) => a + k._sh, 0) + STACK_GAP * (kids.length - 1);
        } else {
          n._mode = 'row';
          n._gap = gap;
          n._rowW = rowW;
          n._rowH = Math.max(...kids.map(k => k._h));
          n._sw = Math.max(n._w, rowW);
          n._sh = n._h + vGap + Math.max(...kids.map(k => (n._rowH - k._h) / 2 + k._sh));
        }
      }
      /* Primero todo lado a lado (como un mapa conceptual de libro). Si eso
         queda mas ancho que una hoja razonable, se va plegando en columnas, de
         a poco, hasta que la proporcion quepa. Un mapa chico no cambia.
         'open' y 'compact' se quedan con la primera medida: sin limite nada
         se pliega, y 'compact' ya plego todo. */
      const auto = o.conceptLayout !== 'open' && !compact;
      const steps = auto ? [Infinity, 900, 640, 520, 420, 340, 260, 200, 0] : [Infinity];
      for (const limitGroup of steps) {
        measure(root, limitGroup, false);
        if (root._sw <= MAX_W || root._sw <= root._sh * MAX_ASPECT) break;
      }
      all.forEach(n => n._div.classList.toggle('leaf', n._asLeaf));

      // ── 4. filas: lo que no cuelga va por niveles, a la misma altura ──────
      const rowH = [];
      (function rows(n) {
        const d = n.state.depth;
        rowH[d] = Math.max(rowH[d] || 0, n._h);
        if (n._mode === 'row') n.children.forEach(rows);
      })(root);
      const rowTop = [];
      for (let d = 0, y = virtual ? -vGap : 0; d < rowH.length; d++) {
        rowTop[d] = y;
        y += (rowH[d] || 0) + vGap;
      }

      // ── 5. posiciones ─────────────────────────────────────────────────────
      const hang = n => {                       // los hijos, en columna bajo n
        let y = n._y + n._h + STACK_TOP;
        n.children.forEach(k => { inner(k, n._x + INDENT, y); y += k._sh + STACK_GAP; });
      };
      // dentro de una columna todo se acomoda relativo, alineado a la izquierda
      const inner = (n, left, top) => {
        n._x = left; n._y = top;
        if (n._mode === 'stack') return hang(n);
        if (n._mode !== 'row') return;
        let x = left;
        n.children.forEach(k => {
          inner(k, x, top + n._h + vGap + (n._rowH - k._h) / 2);
          x += k._sw + n._gap;
        });
      };
      (function free(n, left) {
        const d = n.state.depth;
        n._free = true;
        n._x = left + (n._mode === 'stack' ? 0 : (n._sw - n._w) / 2);
        n._y = rowTop[d] + ((rowH[d] || 0) - n._h) / 2;
        if (n._mode === 'stack') return hang(n);
        if (n._mode !== 'row') return;
        let x = left + (n._sw - n._rowW) / 2;
        n.children.forEach(k => { free(k, x); x += k._sw + n._gap; });
        // el padre, centrado sobre las cajas de sus hijos (no sobre todo lo que
        // cuelga de ellas): con un hijo unico la linea baja recta
        const a = n.children[0], z = n.children[n.children.length - 1];
        const mid = (a._x + a._w / 2 + z._x + z._w / 2) / 2;
        n._x = Math.min(Math.max(mid - n._w / 2, left), left + n._sw - n._w);
      })(root, 0);

      // ── 6. cajas ──────────────────────────────────────────────────────────
      const white = '#ffffff';
      walk(root, n => {
        if (!n._g) return;
        const d = n.state.depth, c = n._color || '#3b6fd8';
        const look = d === 0 ? {fill: '#eef4ff', stroke: '#3b6fd8', sw: 2, rx: 9}
          : d === 1 ? {fill: d3.interpolateRgb(c, white)(0.86), stroke: c, sw: 1.6, rx: 7}
          : {fill: white, stroke: c, sw: 1.2, rx: 7};
        n._g.setAttribute('transform', `translate(${n._x},${n._y})`);
        const r = n._rect;
        r.setAttribute('width', n._w);
        r.setAttribute('height', n._h);
        r.setAttribute('rx', look.rx);
        r.setAttribute('fill', d3.color(look.fill).formatHex());
        r.setAttribute('stroke', d3.color(look.stroke).formatHex());
        r.setAttribute('stroke-width', look.sw);
        // un pelo de holgura: con el ancho exacto, el texto podria cambiar de renglon
        n._fo.setAttribute('width', n._w + 2);
        n._fo.setAttribute('height', n._h + 2);
      });

      // ── 7. conectores en angulo ───────────────────────────────────────────
      walk(root, n => {
        if (!n.children.length || (n === root && virtual)) return;
        let d = '';
        if (n._mode === 'stack') {
          const sx = n._x + SPINE, last = n.children[n.children.length - 1];
          d += `M${sx},${n._y + n._h}V${last._y + last._h / 2}`;
          n.children.forEach(k => { d += `M${sx},${k._y + k._h / 2}H${k._x}`; });
        } else {
          const px = n._x + n._w / 2;
          // mitad del hueco entre el padre y la fila de sus hijos; en las filas
          // libres, la misma para todo el nivel (queda pareja entre ramas)
          const mid = n._free ? rowTop[n.state.depth + 1] - vGap / 2 : n._y + n._h + vGap / 2;
          const xs = n.children.map(k => k._x + k._w / 2);
          d += `M${px},${n._y + n._h}V${mid}`;
          const lo = Math.min(px, ...xs), hi = Math.max(px, ...xs);
          if (hi - lo > 0.5) d += `M${lo},${mid}H${hi}`;
          n.children.forEach((k, i) => { d += `M${xs[i]},${mid}V${k._y}`; });
        }
        const p = document.createElementNS(SVGNS, 'path');
        p.setAttribute('class', 'cm-link');
        p.setAttribute('d', d);
        links.appendChild(p);
      });

      // la caja del mapa: la usan fit() y el recorte al exportar
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      walk(root, n => {
        if (!n._g) return;
        x1 = Math.min(x1, n._x); y1 = Math.min(y1, n._y);
        x2 = Math.max(x2, n._x + n._w); y2 = Math.max(y2, n._y + n._h);
      });
      this.state.rect = isFinite(x1) ? {x1, y1, x2, y2} : {x1: 0, y1: 0, x2: 0, y2: 0};

      // los datos de dibujo no se quedan colgados del arbol
      walk(root, n => {
        for (const k of ['_g', '_rect', '_fo', '_div', '_mode', '_rowW', '_rowH', '_gap', '_sh', '_free',
                         '_top', '_asLeaf', '_nw', '_nh', '_lw', '_lh'])
          delete n[k];
      });
    }
  }

  ConceptMap.cls = 'cm';
  ConceptMap.css = CSS;
  global.ConceptMap = ConceptMap;
})(window);
