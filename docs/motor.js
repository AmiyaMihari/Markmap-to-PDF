/* motor.js — lo que antes hacia el servidor (Python + Chromium + pypdf),
   ahora dentro del navegador.

     Motor.render(src)               dibuja el mapa fuera de pantalla, a escala 1
     Motor.svg(r, pad)               SVG recortado, fondo blanco
     Motor.png(r, pad, scale)        PNG pasando el SVG por un canvas
     Motor.pdf(r, pad, title)        PDF vectorial, con texto seleccionable
     Motor.merge(mapa, bytes, ...)   el PDF de la tarea + la hoja del mapa
     Motor.readRepl(html)            el arbol de un .html exportado del REPL

   Las librerias pesadas (pdf-lib, pdf.js, fontkit y la fuente de respaldo)
   se descargan solo cuando hacen falta, y una sola vez. */
(function (global) {
  'use strict';

  const CDN = 'https://cdn.jsdelivr.net/npm/';
  const LIB = {
    pdflib:  CDN + 'pdf-lib@1.17.1/dist/pdf-lib.min.js',
    fontkit: CDN + '@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
    pdfjs:   CDN + 'pdfjs-dist@3.11.174/build/pdf.min.js',
    worker:  CDN + 'pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    dejavu:  CDN + 'dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans',
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const PX = 0.75;       // 1 px CSS = 0.75 pt: la misma hoja que daba Chromium

  // Los errores llevan un codigo; la interfaz lo muestra en su idioma (i18n.js).
  function fail(code) { const e = new Error(code); e.code = code; return e; }

  /* ------------------------------------------------------------------ */
  /* carga perezosa                                                      */
  /* ------------------------------------------------------------------ */
  const pending = {};
  function script(url) {
    return pending[url] || (pending[url] = new Promise((ok, fail_) => {
      const s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = ok;
      s.onerror = () => { delete pending[url]; s.remove(); fail_(fail('net')); };
      document.head.appendChild(s);
    }));
  }
  const pdfLib = () => script(LIB.pdflib).then(() => global.PDFLib);
  const fontkit = () => script(LIB.fontkit).then(() => global.fontkit);
  async function pdfjs() {
    await script(LIB.pdfjs);
    global.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.worker;
    return global.pdfjsLib;
  }
  const ttf = {};
  function dejavu(variant) {
    return ttf[variant] || (ttf[variant] = fetch(LIB.dejavu + variant + '.ttf')
      .then(r => { if (!r.ok) throw fail('net'); return r.arrayBuffer(); })
      .catch(() => { delete ttf[variant]; throw fail('net'); }));
  }

  /* ------------------------------------------------------------------ */
  /* el mapa, dibujado fuera de pantalla                                 */
  /* ------------------------------------------------------------------ */
  /* Lo mismo que hacia Chromium del lado del servidor: un lienzo limpio
     (sin el CSS de la pagina), escala 1 y sin zoom. Se guarda el ultimo:
     bajar el PDF y luego el PNG del mismo mapa no lo vuelve a dibujar. */
  let stage = null, last = null;

  function stageEl() {
    if (stage) return stage;
    stage = document.createElement('div');
    stage.setAttribute('aria-hidden', 'true');
    stage.style.cssText = 'all:initial;position:fixed;left:-30000px;top:0;' +
      'width:1920px;height:1200px;overflow:hidden;pointer-events:none;color-scheme:light';
    document.body.appendChild(stage);
    return stage;
  }

  function forget() {
    if (!last) return;
    try { last.mm.destroy(); } catch (e) { /* ya no estaba */ }
    last.svg.remove();
    last = null;
  }

  /* markmap coloca los nodos con transiciones de d3: aunque duren 0 ms,
     corren en el siguiente cuadro, despues de que setData() ya termino. Hay
     que esperar a que no quede ninguna pendiente (d3 las cuelga de cada
     elemento en `__transition`) o se mide el mapa a medio acomodar. */
  async function settle(g) {
    const busy = () => {
      if (g.__transition) return true;
      for (const n of g.querySelectorAll('*')) if (n.__transition) return true;
      return false;
    };
    for (let i = 0; i < 120 && busy(); i++) {
      if (global.d3 && global.d3.timerFlush) global.d3.timerFlush();
      if (!busy()) break;
      await new Promise(ok => requestAnimationFrame(ok));
    }
  }

  async function render(src) {
    if (last && last.key === src.key) return last;
    forget();
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', '1920');
    svg.setAttribute('height', '1200');
    stageEl().appendChild(svg);
    // el mismo dibujante que la vista previa: markmap (cuadro sinoptico), el
    // mapa conceptual, el mapa mental o la linea del tiempo
    const Map = {concept: global.ConceptMap, mind: global.MindMap, timeline: global.Timeline}[src.mode] ||
      global.markmap.Markmap;
    const mm = new Map(svg, Object.assign({}, src.opts, {duration: 0, zoom: false, pan: false}));
    await mm.setData(src.root);
    const g = svg.querySelector('g');
    await settle(g);
    g.removeAttribute('transform');      // coordenadas reales del mapa
    last = {key: src.key, mm, svg, g};
    return last;
  }

  // la caja exacta del contenido + el margen: igual que el recorte de antes
  function box(r, pad) {
    const b = r.g.getBBox();
    return {x: b.x - pad, y: b.y - pad,
            w: Math.ceil(b.width + pad * 2), h: Math.ceil(b.height + pad * 2)};
  }

  /* ------------------------------------------------------------------ */
  /* SVG                                                                 */
  /* ------------------------------------------------------------------ */
  // markmap mete su <style> dentro del <svg>: el archivo sale autocontenido
  function svgText(r, pad, scale) {
    const b = box(r, pad);
    const c = r.svg.cloneNode(true);
    c.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
    c.setAttribute('width', String(b.w * scale));
    c.setAttribute('height', String(b.h * scale));
    c.style.setProperty('background', '#ffffff');
    return new XMLSerializer().serializeToString(c);
  }

  function svg(r, pad) {
    const text = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgText(r, pad, 1);
    return new Blob([text], {type: 'image/svg+xml'});
  }

  /* ------------------------------------------------------------------ */
  /* PNG                                                                 */
  /* ------------------------------------------------------------------ */
  async function rasterize(r, pad, s) {
    const b = box(r, pad);
    const W = Math.round(b.w * s), H = Math.round(b.h * s);
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText(r, pad, s));
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    try {
      return await new Promise(ok => cv.toBlob(ok, 'image/png'));
    } catch (e) {
      throw fail('tainted');
    }
  }

  /* Un canvas no puede pasar de ~16k px por lado ni de cierta area. Si a la
     calidad pedida no cabe, se usa la mayor que si cabe (aunque sea menos de
     1x en mapas kilometricos); si aun asi el navegador no puede -Safari tiene
     un limite de area mas chico-, se sigue bajando. */
  async function png(r, pad, scale) {
    const b = box(r, pad);
    let s = Math.min(scale, 16384 / b.w, 16384 / b.h, Math.sqrt(200e6 / (b.w * b.h)));
    for (; s >= 0.25; s *= 0.7) {
      const blob = await rasterize(r, pad, s);
      if (blob) return blob;
    }
    throw fail('tooBig');
  }

  /* ------------------------------------------------------------------ */
  /* PDF vectorial                                                       */
  /* ------------------------------------------------------------------ */
  /* markmap escribe el texto como HTML dentro del SVG (<foreignObject>) y
     ninguna libreria pasa eso a PDF. Aqui se lee del navegador donde quedo
     cada letra y se escribe como texto de verdad: el PDF queda vectorial,
     con texto seleccionable y en el mismo lugar que en la vista previa.

     Fuentes: Helvetica/Courier (vienen con todo lector de PDF, no pesan
     nada). Lo que no cabe en ellas -flechas, griego, simbolos- sale con
     DejaVu Sans, que se descarga solo si el mapa lo necesita. Si aun asi
     algo no se puede escribir (emojis, formulas, imagenes), el PDF sale
     como imagen de alta resolucion para que nada se pierda. */

  function rgb(L, v) {
    const m = /rgba?\(([^)]+)\)/.exec(v || '');
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    const a = p.length > 3 ? p[3] : 1;
    if (!(a > 0)) return null;
    return {c: L.rgb(p[0] / 255, p[1] / 255, p[2] / 255), a: a < 1 ? a : undefined};
  }

  const asc = {};
  let ctx2d = null;
  // donde cae la linea base dentro de la caja de la letra, segun la fuente
  function ascent(cs) {
    const f = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (asc[f] != null) return asc[f];
    ctx2d = ctx2d || document.createElement('canvas').getContext('2d');
    ctx2d.font = f;
    const m = ctx2d.measureText('Hg');
    const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent;
    return (asc[f] = a > 0 && d >= 0 ? a / (a + d) : 0.8);
  }

  function styleOf(cs) {
    const w = cs.fontWeight;
    return {
      mono: /mono|courier|consol|menlo/i.test(cs.fontFamily),
      bold: w === 'bold' || parseInt(w, 10) >= 600,
      italic: /italic|oblique/.test(cs.fontStyle),
    };
  }

  // las rayas de texto (subrayado de enlaces, tachado) se heredan a la vista
  function decorations(el, stop) {
    let under = false, strike = false;
    for (let e = el; e && e !== stop; e = e.parentElement) {
      const t = getComputedStyle(e).textDecorationLine || '';
      if (t.includes('underline')) under = true;
      if (t.includes('line-through')) strike = true;
    }
    return {under, strike};
  }

  // lo que el PDF vectorial no sabe dibujar: el PDF sale como imagen
  const RASTER_ONLY = 'img, svg, canvas, video, table, .katex, math';

  function fontBook(L, doc) {
    const std = {}, uni = {};
    let kitReady = null;
    return {
      std(st) {
        const k = (st.mono ? 'Courier' : 'Helvetica') +
                  (st.bold ? 'Bold' : '') + (st.italic ? 'Oblique' : '');
        return std[k] || (std[k] = doc.embedFont(L.StandardFonts[k]));
      },
      async uni(st) {
        const v = (st.bold ? '-Bold' : '') + (st.italic ? '-Oblique' : '');
        if (!kitReady) kitReady = fontkit().then(fk => doc.registerFontkit(fk));
        await kitReady;
        return uni[v] || (uni[v] = dejavu(v).then(b => doc.embedFont(b, {subset: true})));
      },
    };
  }

  /* Revisa de antemano si el texto cabe en las fuentes del PDF.
     Devuelve 'std' (todo en Helvetica), 'uni' (hace falta DejaVu) o
     'raster' (hay algo que ninguna fuente tiene). */
  async function textPlan(fonts, r) {
    if (r.g.querySelector('foreignObject ' + RASTER_ONLY.split(', ').join(', foreignObject '))) return 'raster';
    const helv = await fonts.std({});
    const odd = new Set();
    for (const fo of r.g.querySelectorAll('foreignObject')) {
      for (const ch of fo.textContent) {
        if (/\s/.test(ch) || odd.has(ch)) continue;
        try { helv.widthOfTextAtSize(ch, 1); } catch (e) {
          // un emoji no lo tiene ninguna fuente de PDF: ni se baja DejaVu
          if (/\p{Emoji_Presentation}|\uFE0F/u.test(ch)) return 'raster';
          odd.add(ch);
        }
      }
    }
    if (!odd.size) return 'std';
    const fk = await fontkit();
    const face = fk.create(new Uint8Array(await dejavu('')));
    for (const ch of odd) if (!face.hasGlyphForCodePoint(ch.codePointAt(0))) return 'raster';
    return 'uni';
  }

  async function pdf(r, pad, title) {
    const L = await pdfLib();
    const doc = await L.PDFDocument.create();
    doc.setProducer('markmap2pdf');
    doc.setCreator('markmap2pdf');
    if (title) doc.setTitle(title);

    const b = box(r, pad);
    const W = b.w * PX, H = b.h * PX;
    const page = doc.addPage([W, H]);
    page.drawRectangle({x: 0, y: 0, width: W, height: H, color: L.rgb(1, 1, 1)});

    const fonts = fontBook(L, doc);
    if ((await textPlan(fonts, r)) === 'raster') {
      const img = await doc.embedPng(await (await png(r, pad, 3)).arrayBuffer());
      page.drawImage(img, {x: 0, y: 0, width: W, height: H});
      return doc;
    }
    await vector(L, page, r, b, fonts);
    return doc;
  }

  async function vector(L, page, r, b, fonts) {
    const H = b.h * PX;
    const X = x => (x - b.x) * PX, Y = y => H - (y - b.y) * PX;
    const inv = r.svg.getScreenCTM().inverse();
    const toMap = (cx, cy) => { const p = new DOMPoint(cx, cy).matrixTransform(inv); return [p.x, p.y]; };
    const helv = await fonts.std({});
    const fits = {};       // caracter -> cabe en Helvetica/Courier (misma codificacion)
    const std = ch => fits[ch] != null ? fits[ch]
      : (fits[ch] = (() => { try { helv.widthOfTextAtSize(ch, 1); return true; } catch (e) { return false; } })());
    const range = document.createRange();
    const CAP = {round: L.LineCapStyle.Round, square: L.LineCapStyle.Projecting};

    /* lineas, curvas y circulos: el mismo trazo del SVG */
    function shape(el, tag) {
      const cs = getComputedStyle(el);
      const stroke = rgb(L, cs.stroke), fill = rgb(L, cs.fill);
      const sw = parseFloat(cs.strokeWidth) || 0;
      if ((!stroke || !sw) && !fill) return;
      let d;
      if (tag === 'path') d = el.getAttribute('d');
      else if (tag === 'line') {
        const v = k => el[k].baseVal.value;
        d = `M${v('x1')} ${v('y1')}L${v('x2')} ${v('y2')}`;
      } else if (tag === 'rect') {
        // las cajas y etiquetas, con sus esquinas redondeadas
        const v = k => el[k].baseVal.value;
        const x = v('x'), y = v('y'), w = v('width'), h = v('height');
        const r = Math.min(v('rx') || v('ry') || 0, w / 2, h / 2);
        if (!w || !h) return;
        d = r ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
                `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
                `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
              : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      } else {
        const cx = el.cx.baseVal.value, cy = el.cy.baseVal.value, rr = el.r.baseVal.value;
        if (!rr) return;
        d = `M${cx - rr} ${cy}A${rr} ${rr} 0 1 0 ${cx + rr} ${cy}A${rr} ${rr} 0 1 0 ${cx - rr} ${cy}Z`;
      }
      if (!d) return;
      const m = el.getCTM();           // local -> mapa (el <g> raiz ya no tiene zoom)
      const o = {x: X(m.e), y: Y(m.f), scale: PX * m.a};
      if (stroke && sw) Object.assign(o, {borderColor: stroke.c, borderWidth: sw, borderOpacity: stroke.a});
      if (fill) Object.assign(o, {color: fill.c, opacity: fill.a});
      if (CAP[cs.strokeLinecap]) o.borderLineCap = CAP[cs.strokeLinecap];
      page.drawSvgPath(d, o);
    }

    /* un tramo de texto en una misma linea y con un mismo estilo */
    async function draw(chars, top, h, cs, st, col, deco) {
      while (chars.length && chars[chars.length - 1].ch === ' ') chars.pop();
      if (!chars.length) return;
      const size = parseFloat(cs.fontSize) * PX;
      const [, ty] = toMap(chars[0].l, top);
      const base = Y(ty + h * ascent(cs));
      // se parte donde cambia la fuente (Helvetica <-> DejaVu)
      for (let i = 0; i < chars.length;) {
        const s = std(chars[i].ch) || chars[i].ch === ' ';
        let j = i + 1;
        while (j < chars.length && (std(chars[j].ch) || chars[j].ch === ' ') === s) j++;
        const seg = chars.slice(i, j);
        while (seg.length && seg[seg.length - 1].ch === ' ') seg.pop();
        i = j;
        if (!seg.length) continue;
        const text = seg.map(c => c.ch).join('');
        const font = s ? await fonts.std(st) : await fonts.uni(st);
        const [x0] = toMap(seg[0].l, top), [x1] = toMap(seg[seg.length - 1].r, top);
        const room = (x1 - x0) * PX, need = font.widthOfTextAtSize(text, size);
        // si la fuente del PDF es mas ancha que la del navegador, se angosta
        // un poco (horizontalmente) para que quepa justo donde estaba
        const squeeze = need > room * 1.005 && room > 0 ? Math.max(70, (room / need) * 100) : 100;
        const sz = squeeze === 70 && need * 0.7 > room ? size * room / (need * 0.7) : size;
        if (squeeze < 100) page.pushOperators(L.pushGraphicsState(), L.setCharacterSqueeze(squeeze));
        page.drawText(text, {x: X(x0), y: base, size: sz, font, color: col.c, opacity: col.a});
        if (squeeze < 100) page.pushOperators(L.popGraphicsState());
        const thick = Math.max(0.4, sz / 14);
        if (deco.under) page.drawLine({start: {x: X(x0), y: base - sz * 0.12}, end: {x: X(x1), y: base - sz * 0.12}, thickness: thick, color: col.c, opacity: col.a});
        if (deco.strike) page.drawLine({start: {x: X(x0), y: base + sz * 0.28}, end: {x: X(x1), y: base + sz * 0.28}, thickness: thick, color: col.c, opacity: col.a});
      }
    }

    /* un nodo de texto del HTML, partido en lineas como lo acomodo el navegador */
    async function textNode(n, fo) {
      const s = n.data;
      if (!s.trim()) return;
      const el = n.parentElement, cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      const st = styleOf(cs), deco = decorations(el, fo);
      const col = rgb(L, cs.color) || {c: L.rgb(0, 0, 0)};

      // via rapida (casi todos los nodos): una sola linea de texto comun.
      // Basta con medir la primera y la ultima letra.
      const text = s.trim().replace(/\s+/g, ' ');
      range.selectNodeContents(n);
      if (range.getClientRects().length === 1 && !/^pre/.test(cs.whiteSpace) &&
          [...text].every(ch => ch === ' ' || std(ch))) {
        const at = i => { range.setStart(n, i); range.setEnd(n, i + 1); return range.getClientRects()[0]; };
        const ra = at(s.search(/\S/)), rz = at(s.search(/\S\s*$/));
        if (ra && rz) {
          const chars = [...text].map(ch => ({ch, l: ra.left, r: rz.right}));
          return draw(chars, ra.top, ra.height, cs, st, col, deco);
        }
      }

      // via completa: letra por letra (varias lineas, simbolos, codigo)
      const lines = [];
      let line = null, i = 0;
      for (const ch of s) {
        range.setStart(n, i); range.setEnd(n, i + ch.length); i += ch.length;
        const rc = range.getClientRects()[0];
        const ws = /\s/.test(ch);
        if (!rc || (ws && !rc.width)) continue;          // espacio colapsado
        if (!line || Math.abs(rc.top - line.top) > rc.height / 2) {
          if (ws) continue;                              // una linea no empieza en blanco
          line = {chars: [], top: rc.top, h: rc.height};
          lines.push(line);
        }
        line.chars.push({ch: ws ? ' ' : ch, l: rc.left, r: rc.right});
      }
      for (const ln of lines) await draw(ln.chars, ln.top, ln.h, cs, st, col, deco);
    }

    async function foreign(fo) {
      // fondos (codigo, resaltado) debajo del texto
      for (const e of fo.querySelectorAll('*')) {
        const bg = rgb(L, getComputedStyle(e).backgroundColor);
        if (!bg) continue;
        for (const rc of e.getClientRects()) {
          const [x1, y1] = toMap(rc.left, rc.top), [x2, y2] = toMap(rc.right, rc.bottom);
          page.drawRectangle({x: X(x1), y: Y(y2), width: (x2 - x1) * PX,
                              height: (y2 - y1) * PX, color: bg.c, opacity: bg.a});
        }
      }
      const tw = document.createTreeWalker(fo, NodeFilter.SHOW_TEXT);
      for (let n; (n = tw.nextNode());) await textNode(n, fo);
    }

    // en el orden del SVG, para que lo de encima quede encima
    const sel = 'path.markmap-link, g.markmap-node > line, g.markmap-node > circle, g.markmap-node > foreignObject, ' +
                'path.cm-link, g.cm-node > rect, g.cm-node > foreignObject, ' +
                'path.mg-link, g.mg-node > rect, g.mg-node > circle, g.mg-node > foreignObject, ' +
                'g.tl-lines > path, g.tl-node > rect, g.tl-node > circle, g.tl-node > foreignObject';
    for (const el of r.g.querySelectorAll(sel)) {
      const tag = el.localName;
      if (tag === 'foreignObject') await foreign(el);
      else shape(el, tag);
    }
  }

  /* ------------------------------------------------------------------ */
  /* unir con el PDF de la tarea                                         */
  /* ------------------------------------------------------------------ */
  async function merge(mapDoc, bytes, {at, fit, margin}) {
    const L = await pdfLib();
    // pdf-lib escribe las fuentes recien al guardar; embedPage() no lo hace
    // solo (copyPages si), y sin esto la hoja ajustada sale sin texto
    await mapDoc.flush();
    let src;
    try {
      src = await L.PDFDocument.load(bytes, {updateMetadata: false});
    } catch (e) {
      throw fail(/encrypt/i.test(String(e && e.message)) ? 'protected' : 'unreadable');
    }
    const n = src.getPageCount();
    if (!n) throw fail('noPages');

    const out = await L.PDFDocument.create();
    out.setProducer('markmap2pdf');
    out.setCreator('markmap2pdf');
    try {
      const t = src.getTitle(), a = src.getAuthor();
      if (t) out.setTitle(t);
      if (a) out.setAuthor(a);
    } catch (e) { /* sin metadatos */ }

    const pages = await out.copyPages(src, src.getPageIndices());
    const idx = Math.max(0, Math.min(at | 0, n));
    pages.slice(0, idx).forEach(p => out.addPage(p));

    if (fit === 'doc' || fit === 'landscape') {
      // la hoja del mapa del tamano de las de la tarea, con el mapa centrado
      const p0 = src.getPage(0);
      let {width: dw, height: dh} = p0.getSize();
      const rot = ((p0.getRotation().angle % 360) + 360) % 360;
      if (rot === 90 || rot === 270) [dw, dh] = [dh, dw];
      const mp = mapDoc.getPage(0), {width: mw, height: mh} = mp.getSize();
      if (fit === 'landscape' && (mw > mh) !== (dw > dh)) [dw, dh] = [dh, dw];
      const m = Math.max(0, Math.min(margin, Math.min(dw, dh) / 2 - 1));
      const s = Math.min((dw - 2 * m) / mw, (dh - 2 * m) / mh);
      const emb = await out.embedPage(mp);
      out.addPage([dw, dh]).drawPage(emb, {
        x: (dw - mw * s) / 2, y: (dh - mh * s) / 2, xScale: s, yScale: s,
      });
    } else {
      const [mp] = await out.copyPages(mapDoc, [0]);
      out.addPage(mp);
    }
    pages.slice(idx).forEach(p => out.addPage(p));
    return out.save();
  }

  /* ------------------------------------------------------------------ */
  /* .html del REPL                                                      */
  /* ------------------------------------------------------------------ */
  /* El archivo del REPL trae su propio markmap ya armado. Se abre en un
     iframe aislado (sin acceso a esta pagina) y un pequeno script le pide
     el arbol del mapa -con sus colores- para dibujarlo aqui como siempre. */
  function probe() {
    var tries = 0;
    (function look() {
      var mm = window.mm;
      if (mm && mm.state && mm.state.data) {
        var color = mm.options && mm.options.color;
        var strip = function (n) {
          var p = {}, k;
          for (k in n.payload || {}) p[k] = n.payload[k];
          try { if (color) p.__c = color(n); } catch (e) { /* sin color */ }
          return {content: n.content, payload: p, children: (n.children || []).map(strip)};
        };
        try { parent.postMessage({mmTree: strip(mm.state.data)}, '*'); }
        catch (e) { parent.postMessage({mmError: String(e)}, '*'); }
        return;
      }
      if (++tries > 400) return parent.postMessage({mmError: 'sin mapa'}, '*');
      setTimeout(look, 50);
    })();
  }

  function readRepl(html) {
    return new Promise((ok, no) => {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts');
      f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:fixed;left:-30000px;top:0;width:1200px;height:800px;border:0';
      const tag = '<script>(' + probe.toString() + ')();<\/script>';
      f.srcdoc = /<\/body>/i.test(html)
        ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, tag + '</body>')
        : html + tag;
      let done = false;
      const end = (fn, v) => {
        if (done) return;
        done = true; clearTimeout(timer);
        removeEventListener('message', on); f.remove(); fn(v);
      };
      const on = e => {
        if (e.source !== f.contentWindow || !e.data) return;
        if (e.data.mmTree) end(ok, e.data.mmTree);
        else if (e.data.mmError) end(no, fail('noRepl'));
      };
      const timer = setTimeout(() => end(no, fail('noRepl')), 25000);
      addEventListener('message', on);
      document.body.appendChild(f);
    });
  }

  global.Motor = {
    render, forget, svg, png, pdf, merge, readRepl, pdfjs, fail, settle,
    // adelantar la descarga de lo que se va a necesitar (al pasar el raton
    // por un boton, al soltar la tarea...) sin bloquear nada
    preload(kind) {
      if (kind === 'pdf') pdfLib().catch(() => {});
      else if (kind === 'pdfjs') pdfjs().catch(() => {});
    },
  };
})(window);
