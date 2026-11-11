const $ = s => document.querySelector(s);
const md = $('#md'), strip = $('#strip'), statusEl = $('#status');
let mapFile = null, docFile = null, docPages = 0, busy = false, mapCard = null;
// el arbol del mapa cuando viene de un .html del REPL (si no, sale del editor)
let replTree = null, replId = 0;
// 'synoptic' = cuadro sinoptico (markmap, de izquierda a derecha, como llaves)
// 'concept'  = mapa conceptual (concept.js, de arriba hacia abajo)
// 'mind'     = mapa mental (mindmap.js, ramas curvas a ambos lados de la idea central)
// 'timeline' = linea del tiempo (timeline.js, eventos en orden sobre un eje)
const MODES = ['synoptic', 'concept', 'mind', 'timeline'];
let mode = 'synoptic';
try {
  const saved = localStorage.getItem('mapType');
  if (MODES.includes(saved)) mode = saved;
  // antes se guardaba en 'mode', y 'mind' era el de markmap (hoy cuadro sinoptico)
  else if (localStorage.getItem('mode') === 'concept') mode = 'concept';
} catch (e) { /* cuadro sinoptico */ }
// el dibujante de cada tipo; todos se usan igual
const mapClass = m => ({concept: ConceptMap, mind: MindMap, timeline: Timeline})[m] || markmap.Markmap;
// la direccion de la linea del tiempo: la elige la persona y se recuerda
let tlDir = 'horizontal';
try { if (localStorage.getItem('tlDir') === 'vertical') tlDir = 'vertical'; } catch (e) { /* horizontal */ }
// el acomodo del mapa conceptual: 'auto' (pliega en columnas lo que no cabe),
// 'open' (todo lado a lado) o 'compact' (todo en columnas bajo las ramas
// principales); se recuerda
let cmLayout = 'auto';
try {
  const saved = localStorage.getItem('cmLayout');
  if (saved === 'open' || saved === 'compact') cmLayout = saved;
} catch (e) { /* automatico */ }

/* ══════════════ vista previa en vivo ══════════════ */
const T = new markmap.Transformer();
let mm = null, mini = null, mmMode = null, miniMode = null;

/* Aire entre ramas: un solo lugar que lo lee, para que la vista previa y lo
   que se descarga digan siempre lo mismo (incluso con la casilla vacia). */
const SPACING = {spacing: 10, gap: 40};
function air(key){
  const v = parseInt($('#' + key).value, 10);
  return Number.isFinite(v) && v >= 0 ? v : SPACING[key];
}

function mapOpts(res){
  let o = {};
  if (markmap.deriveOptions && res.frontmatter && res.frontmatter.markmap)
    o = markmap.deriveOptions(res.frontmatter.markmap);
  o.duration = 0;
  if (o.initialExpandLevel == null || o.initialExpandLevel === 0) o.initialExpandLevel = -1;
  o.timelineDir = tlDir;
  o.conceptLayout = cmLayout;
  // el mismo aire que aplicara el exportador -> la vista previa no miente
  return window.mmSpacing ? window.mmSpacing.opts(air('spacing'), air('gap'), o) : o;
}
/* El mapa que se dibuja y se descarga: del .html del REPL si se subio uno,
   si no del editor. `key` identifica el dibujo: si no cambia, el motor
   reutiliza el que ya tiene en vez de volver a dibujarlo. */
function hasMap(){ return !!replTree || !!md.value.trim(); }
/* Si pegaron la respuesta de una IA con todo y las marcas del bloque de
   codigo (```markdown ... ```), markmap haria un solo nodo con codigo: se
   quitan cuando envuelven TODO el texto. */
function mdText(){
  const m = /^\s*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\s*\1\s*$/.exec(md.value);
  // y que markmap no pierda viñetas que van antes de un sub-encabezado (spacing.js)
  return mmSpacing.fixMarkdown(m ? m[2] : md.value);
}
// mensaje de error en el idioma de la pagina
function errText(e){ return e && e.code ? t('err.' + e.code) : (e && e.message) || t('err.generic'); }
function source(){
  const air_ = `${air('spacing')}:${air('gap')}:${tlDir}:${cmLayout}`;
  if (replTree){
    const o = mapOpts({}), base = markmap.defaultOptions.color;
    o.color = n => (n.payload && n.payload.__c) || base(n);   // sus colores
    return {root: structuredClone(replTree), opts: o, mode, key: `${mode}:html:${replId}:${air_}`};
  }
  const text = mdText(), res = T.transform(text);
  return {root: res.root, opts: mapOpts(res), mode, key: `${mode}:md:${air_}:${text}`};
}
function countNodes(n){ return 1 + (n.children || []).reduce((a, c) => a + countNodes(c), 0); }

async function preview(){
  if (mapFile && !replTree) return;         // todavia leyendo el .html
  if (!hasMap()){
    $('#pvInfo').textContent = t('pv.empty');
    $('#pvSize').textContent = '';
    return;
  }
  try{
    const {root, opts: o} = source();
    if (mm && mmMode !== mode){ mm.destroy(); mm = null; }
    if (!mm){ mm = mapClass(mode).create('#preview', o, root); mmMode = mode; }
    else mm.setOptions(o);
    // setData es ASINCRONO y markmap acomoda los nodos un cuadro despues: hay que
    // esperarlo o se mide el mapa a medio acomodar. El encuadre lo hace fitPaper,
    // una sola vez (el de markmap es una animacion y cada uno espera cuadros).
    await mm.setData(root);
    await Motor.settle($('#preview > g'));
    const n = replTree ? countNodes(replTree)
      : (mdText().match(/^\s*(#{1,6}\s|[-*+]\s)/gm) || []).length;
    $('#pvInfo').textContent = n ? t('pv.nodes', {n}) : t('pv.noNodes');
    await fitPaper();
    renderMini();
  }catch(e){ $('#pvInfo').textContent = t('pv.invalid'); }
}
function renderMini(){
  if (!mapCard) return;
  const svg = mapCard.querySelector('svg.mini');
  if (!svg || !hasMap()) return;
  try{
    const {root, opts} = source();
    // la miniatura es fija, como las de las paginas: sin zoom ni arrastre con la rueda
    const o = Object.assign(opts, {fitRatio: 0.92, zoom: false, pan: false});
    if (!mini || mini.svg.node() !== svg || miniMode !== mode){
      if (mini && mini.svg.node() === svg) mini.destroy();
      svg.innerHTML = ''; mini = mapClass(mode).create(svg, o, root); miniMode = mode;
    }
    else mini.setOptions(o);
    mini.setData(root)
      // fit() necesita el tamano final: la tarjeta entra con una animacion de escala.
      .then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
      .then(() => mini && mini.fit())
      .catch(() => {});
  }catch(e){ console.error('mini', e); }
}
let tmr;
const redraw = () => { clearTimeout(tmr); tmr = setTimeout(preview, 250); };
md.addEventListener('input', redraw);

/* La hoja de la vista previa toma la PROPORCION EXACTA del PDF que saldra.
   getBBox() sobre el <g> devuelve la caja del contenido sin el zoom aplicado,
   que es justo lo que mide el exportador. */
function pageSize(){
  const g = document.querySelector('#preview > g');
  if (!g) return null;
  try{
    const b = g.getBBox();
    if (!b.width || !b.height) return null;
    const pad = Math.max(0, +($('#pad').value || 20));
    return {w: Math.ceil(b.width + pad*2), h: Math.ceil(b.height + pad*2)};
  }catch(e){ return null; }
}
// el hueco real de la bandeja: al ampliar, el margen se encoge
function trayRoom(){
  const tray = $('#tray'), cs = getComputedStyle(tray);
  return {w: tray.clientWidth  - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
          h: tray.clientHeight - parseFloat(cs.paddingTop)  - parseFloat(cs.paddingBottom)};
}
async function fitPaper(){
  const sz = pageSize(); if (!sz) return;
  const paper = $('#paper'), {w: maxW, h: maxH} = trayRoom();
  if (maxW <= 0 || maxH <= 0) return;
  pvCard.classList.remove('inspect');           // vuelve la hoja
  if (pvCard.classList.contains('big')){
    // ampliado se viene a leer el mapa, no a medir la hoja: el papel se queda
    // con la bandeja entera y el mapa entra lo mas grande que se pueda
    paper.style.width = maxW + 'px';
    paper.style.height = maxH + 'px';
  } else {
    const k = Math.min(maxW / sz.w, maxH / sz.h);
    paper.style.width  = Math.max(28, Math.round(sz.w * k)) + 'px';
    paper.style.height = Math.max(28, Math.round(sz.h * k)) + 'px';
  }
  $('#pvSize').textContent =
    t('pv.sheet', {w: sz.w, h: sz.h, wi: (sz.w/96).toFixed(1), hi: (sz.h/96).toFixed(1)});
  await new Promise(r => requestAnimationFrame(r));
  await recenter();
  hint();
}

const pvCard = document.querySelector('.preview-card');

/* Encuadrar el mapa en la hoja y guardar ese encuadre: es la vista previa de
   la hoja que se imprime. En cuanto la persona mueve la vista (acerca, aleja
   o arrastra), la hoja estorba mas que ayuda: deja de recortar y la bandeja
   entera se vuelve papel (modo lupa). Solo centrar -el boton o doble clic-
   devuelve la hoja. */
let tFit = null;
async function recenter(){
  if (!mm) return;
  await mm.fit();
  tFit = d3.zoomTransform($('#preview'));
}
function lens(){
  const svg = $('#preview');
  // ampliado ya es todo papel, no hay hoja que estorbe
  if (!mm || !mm.g || !tFit || pvCard.classList.contains('big') || pvCard.classList.contains('inspect')) return;
  const t = d3.zoomTransform(svg);
  if (Math.abs(t.k / tFit.k - 1) < 0.005 && Math.abs(t.x - tFit.x) < 1 && Math.abs(t.y - tFit.y) < 1) return;
  /* La hoja crece a toda la bandeja (asi la rueda y el arrastre funcionan en
     todo el blanco) y el mapa se corre lo mismo que se movio la hoja, para
     que en pantalla se quede donde estaba. */
  const a = svg.getBoundingClientRect();
  pvCard.classList.add('inspect');
  const room = trayRoom();
  $('#paper').style.width = room.w + 'px';
  $('#paper').style.height = room.h + 'px';
  const b = svg.getBoundingClientRect();
  const moved = d3.zoomIdentity.translate(t.x + a.left - b.left, t.y + a.top - b.top).scale(t.k);
  /* Se pone directo, sin zoom.transform: a medio arrastre, d3 recalcularia el
     punto agarrado con la posicion vieja del raton y el mapa brincaria. d3
     guarda la transformacion actual en __zoom; los dibujantes la aplican a su <g>. */
  svg.__zoom = moved;
  mm.g.attr('transform', moved);
  hint();
}
// se revisa una vez por cuadro, aunque lleguen muchos eventos
let lensQueued = false;
function queueLens(){
  if (lensQueued) return;
  lensQueued = true;
  requestAnimationFrame(() => { lensQueued = false; lens(); });
}
function hint(){
  $('#pvHint').textContent =
    pvCard.classList.contains('inspect') ? t('pv.zoomed') :
    pvCard.classList.contains('big')     ? t('pv.esc') : '';
}
$('#pad').addEventListener('input', fitPaper);
// el espaciado cambia el layout: hay que volver a dibujar el mapa
['#spacing','#gap'].forEach(sel => $(sel).addEventListener('input', redraw));

/* controles de la vista previa: acercar, alejar, centrar y ampliar */
// el de markmap es una transicion: hay que esperar a que termine para medir
async function zoom(f){ if (mm && mm.rescale){ await mm.rescale(f); queueLens(); } }
$('#zIn').onclick  = () => zoom(1.25);
$('#zOut').onclick = () => zoom(0.8);
$('#zFit').onclick = () => fitPaper();
$('#preview').addEventListener('dblclick', () => fitPaper());
// la rueda acerca o aleja y arrastrar mueve el mapa: los dos sueltan la hoja
$('#preview').addEventListener('wheel', queueLens, {passive:true});
$('#preview').addEventListener('pointermove', e => { if (e.buttons) queueLens(); }, {passive:true});

/* ampliar: la vista previa ocupa la ventana entera (Esc o clic fuera para salir) */
function big(on){
  pvCard.classList.toggle('big', on);
  document.body.classList.toggle('big-on', on);
  $('#scrim').classList.toggle('hidden', !on);
  bigTitle();
  hint();
  requestAnimationFrame(fitPaper);
}
function bigTitle(){
  const k = pvCard.classList.contains('big') ? 'pv.small' : 'pv.big';
  $('#zBig').title = t(k);
  $('#zBig').setAttribute('aria-label', t(k));
}
$('#zBig').onclick = () => big(!pvCard.classList.contains('big'));
$('#scrim').onclick = () => big(false);
addEventListener('keydown', e => {
  if (e.key === 'Escape' && pvCard.classList.contains('big')) big(false);
});
/* La bandeja cambia de tamano al ampliar o al cambiar la ventana: la hoja se
   vuelve a ajustar sola. Varios avisos en el mismo cuadro se juntan en uno. */
let fitQueued = false;
function queueFit(){
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => { fitQueued = false; fitPaper(); });
}
if (window.ResizeObserver) new ResizeObserver(queueFit).observe($('#tray'));
else addEventListener('resize', queueFit);

/* ══════════════ segmented control ══════════════ */
const segBtns = [...document.querySelectorAll('.seg button')];
function movePill(){
  const b = segBtns.find(x => x.getAttribute('aria-selected') === 'true');
  $('#pill').style.width = b.offsetWidth + 'px';
  $('#pill').style.transform = `translateX(${b.offsetLeft - 3}px)`;
}
segBtns.forEach(b => b.onclick = () => {
  segBtns.forEach(x => x.setAttribute('aria-selected', x === b));
  $('#pane-write').classList.toggle('hidden', b.dataset.tab !== 'write');
  $('#pane-file').classList.toggle('hidden', b.dataset.tab !== 'file');
  movePill();
});
addEventListener('resize', movePill);

/* ══════════════ archivos ══════════════ */
function setMap(f){
  if (/\.(md|markdown|txt)$/i.test(f.name)){
    f.text().then(txt => { md.value = txt; segBtns[0].click(); preview(); refresh(); });
    return;
  }
  mapFile = f;
  $('#mapName').textContent = f.name;
  $('#mapIco').textContent = 'HTML';
  $('#mapInfo').classList.remove('hidden');
  $('#dropMap').classList.add('hidden');
  segBtns[1].click();
  refresh();
  const id = ++replId;
  $('#pvInfo').textContent = t('pv.readingFile');
  f.text().then(Motor.readRepl).then(tree => {
    if (id !== replId) return;              // ya subieron otro
    replTree = tree;
    preview(); refresh();
  }).catch(e => {
    if (id !== replId) return;
    clearMap();
    say(errText(e), 'err');
  });
}
function clearMap(){
  mapFile = null; replTree = null; replId++;
  $('#mapInfo').classList.add('hidden');
  $('#dropMap').classList.remove('hidden');
  $('#pickMap').value = '';
  preview(); refresh();
}
async function setDoc(f){
  docFile = f;
  $('#docName').textContent = f.name;
  $('#docSub').textContent = t('doc.reading');
  $('#docBox').classList.remove('hidden');
  $('#dropDoc').classList.add('hidden');
  refresh();
  Motor.preload('pdf');                     // lo mas probable: van a unir
  try{
    const pdfjsLib = await Motor.pdfjs();
    const pdf = await pdfjsLib.getDocument({data: await f.arrayBuffer()}).promise
      .catch(() => { throw Motor.fail('unreadable'); });
    const pages = pdf.numPages;
    const v = (await pdf.getPage(1)).getViewport({scale:1});
    const [w, h] = [v.width, v.height];
    docPages = pages; buildStrip(pages);
    paintThumbs(pdf);
    docInfo = {n: pages, w: Math.round(w/72*2.54), h: Math.round(h/72*2.54)};
    $('#docSub').textContent = docSubText();
  }catch(e){
    $('#docSub').textContent = errText(e);
    docFile = null; refresh();
  }
}
let docInfo = null;
function docSubText(){ return t(docInfo.n === 1 ? 'doc.pages1' : 'doc.pagesN', docInfo); }
function clearDoc(){
  docFile = null; docPages = 0; docInfo = null; mapCard = null; mini = null; ph = null; drag = null;
  strip.innerHTML = '';
  $('#docBox').classList.add('hidden');
  $('#dropDoc').classList.remove('hidden');
  $('#pickDoc').value = '';
  refresh();
}
$('#mapClear').onclick = clearMap;
$('#docClear').onclick = clearDoc;
$('#dropMap').onclick = () => $('#pickMap').click();
$('#dropDoc').onclick = () => $('#pickDoc').click();
$('#pickMap').onchange = e => e.target.files[0] && setMap(e.target.files[0]);
$('#pickDoc').onchange = e => e.target.files[0] && setDoc(e.target.files[0]);

/* ══════════════ tira de páginas ordenable ══════════════ */
// cada tarjeta que ya entro se queda sin animacion de entrada (ver .placed)
strip.addEventListener('animationend', e => { if (e.animationName === 'pop') e.target.classList.add('placed'); });
function buildStrip(pages){
  strip.innerHTML = '';
  for (let i = 1; i <= pages; i++){
    const c = document.createElement('div');
    c.className = 'pcard';
    c.style.animationDelay = (i * .035) + 's';
    c.innerHTML = `<div class="thumb"><div class="ph">${i}</div></div><div class="lbl" data-page="${i}">${t('strip.page', {i})}</div>`;
    strip.appendChild(c);
  }
  mapCard = document.createElement('div');
  mapCard.className = 'pcard map hint';
  mapCard.style.animationDelay = (pages * .035 + .05) + 's';
  mapCard.innerHTML =
    `<div class="thumb"><svg class="mini"></svg></div>
     <div class="lbl">
       <svg class="grip" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>
       <span data-i18n="strip.map">${t('strip.map')}</span>
     </div>
     <div class="hnd" data-i18n="strip.drag">${t('strip.drag')}</div>`;
  mapCard.tabIndex = 0;
  strip.appendChild(mapCard);

  // teclado: flechas izquierda/derecha cuando la tarjeta tiene el foco
  mapCard.addEventListener('keydown', e => {
    const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    const sib = d < 0 ? mapCard.previousElementSibling : mapCard.nextElementSibling;
    if (!sib) return;
    mapCard.classList.remove('hint');
    [mapCard, sib].forEach(el => el.classList.add('placed'));
    flip(() => d < 0 ? strip.insertBefore(mapCard, sib) : strip.insertBefore(sib, mapCard));
    mapCard.focus();                         // moverla en el DOM le quita el foco
    updateOrder();
  });
  wireDrag();
  renderMini();
  updateOrder();
}

async function paintThumbs(pdf){
  const cards = [...strip.querySelectorAll('.pcard:not(.map)')];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (let i = 1; i <= Math.min(pdf.numPages, 40); i++){
    try{
      const page = await pdf.getPage(i);
      const base = page.getViewport({scale:1});
      const vp = page.getViewport({scale: (132 / base.height) * dpr});
      const cv = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height;
      cv.style.height = '132px'; cv.style.width = (vp.width / dpr) + 'px';
      await page.render({canvasContext: cv.getContext('2d'), viewport: vp}).promise;
      const t = cards[i-1]?.querySelector('.thumb');
      if (t){ t.innerHTML = ''; t.appendChild(cv); }
    }catch(e){ break; }
  }
}

/* FLIP: mueve las tarjetas con una animación suave */
function flip(mutate){
  const els = [...strip.children];
  const before = new Map(els.map(el => [el, el.getBoundingClientRect()]));
  mutate();
  for (const el of strip.children){
    const b = before.get(el); if (!b) continue;
    const a = el.getBoundingClientRect();
    const dx = b.left - a.left, dy = b.top - a.top;
    if (!dx && !dy) continue;
    el.animate([{transform:`translate(${dx}px,${dy}px)`}, {transform:'none'}],
               {duration:340, easing:'cubic-bezier(.16,1,.3,1)'});
  }
}
let ph = null, drag = null;
// la tarjeta se levanta cuando el raton ya se movio esto (px): un clic suelto no la mueve
const LIFT = 4;
function wireDrag(){
  mapCard.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = {x: e.clientX, y: e.clientY, lifted: false};
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onUp);
  });
}
function lift(){
  mapCard.classList.remove('hint');
  mapCard.classList.add('placed');
  // donde se ve ahora, aunque todavia venga animandose
  const r = mapCard.getBoundingClientRect();
  /* Una animacion que siga corriendo (el aterrizaje del arrastre anterior o
     el reacomodo con el teclado) le gana al transform del arrastre: la
     tarjeta se iba arriba a la izquierda hasta que terminaba. Se cancela
     despues de medir, para que no brinque. */
  mapCard.getAnimations().forEach(a => a.cancel());
  Object.assign(drag, {dx: drag.x - r.left, dy: drag.y - r.top, lifted: true});

  ph = document.createElement('div');
  ph.className = 'slot';
  ph.style.width = r.width + 'px';
  ph.style.height = r.height + 'px';
  strip.insertBefore(ph, mapCard);

  mapCard.style.width = r.width + 'px';
  mapCard.classList.add('dragging');
  document.body.appendChild(mapCard);        // fuera del flujo de la tira
  document.body.classList.add('grabbing');
}
function follow(x, y){
  mapCard.style.transform =
    `translate(${x - drag.dx}px, ${y - drag.dy}px) scale(1.05) rotate(-1.6deg)`;
}
function onMove(e){
  if (!drag) return;
  if (!drag.lifted){
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < LIFT) return;
    lift();
  }
  follow(e.clientX, e.clientY);

  const r = strip.getBoundingClientRect();          // auto-scroll en los bordes
  if (e.clientX < r.left + 56) strip.scrollLeft -= 12;
  else if (e.clientX > r.right - 56) strip.scrollLeft += 12;

  const after = [...strip.querySelectorAll('.pcard')]
    .find(el => { const b = el.getBoundingClientRect(); return e.clientX < b.left + b.width/2; }) || null;
  if (after === ph.nextElementSibling || after === ph) return;
  flip(() => after ? strip.insertBefore(ph, after) : strip.appendChild(ph));
  updateOrder();
}
function onUp(){
  if (!drag) return;
  removeEventListener('pointermove', onMove);
  removeEventListener('pointerup', onUp);
  removeEventListener('pointercancel', onUp);
  if (!drag.lifted){ drag = null; return; }  // fue un clic: no hay nada que acomodar
  const from = mapCard.getBoundingClientRect();

  mapCard.classList.remove('dragging');
  mapCard.style.transform = '';
  mapCard.style.width = '';
  strip.insertBefore(mapCard, ph);
  ph.remove(); ph = null; drag = null;
  document.body.classList.remove('grabbing');

  const to = mapCard.getBoundingClientRect();       // aterrizaje suave
  mapCard.animate(
    [{transform:`translate(${from.left - to.left}px, ${from.top - to.top}px) scale(1.05)`},
     {transform:'none'}],
    {duration:380, easing:'cubic-bezier(.16,1,.3,1)'});
  updateOrder();
}
function mapIndex(){ return [...strip.children].indexOf(ph || mapCard); }
function updateOrder(){
  const i = mapIndex(), lbl = $('#orderLbl');
  lbl.textContent = i === 0 ? t('order.start')
    : i === docPages ? t('order.end')
    : t('order.at', {i: i + 1, n: docPages + 1});
  lbl.classList.add('bump'); setTimeout(() => lbl.classList.remove('bump'), 220);
}

/* ══════════════ soltar archivos en cualquier parte ══════════════ */
function route(files){
  for (const f of files){
    if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') setDoc(f);
    else if (/\.(md|markdown|txt|html?)$/i.test(f.name)) setMap(f);
  }
}
['dragenter','dragover'].forEach(ev => document.addEventListener(ev, e => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  e.target.closest?.('.drop')?.classList.add('over');
}));
document.addEventListener('dragleave', e => e.target.closest?.('.drop')?.classList.remove('over'));
document.addEventListener('drop', e => {
  if (!e.dataTransfer?.files.length) return;
  e.preventDefault();
  document.querySelectorAll('.drop.over').forEach(z => z.classList.remove('over'));
  route(e.dataTransfer.files);
});

/* ══════════════ descargas ══════════════ */
// nombre de archivo valido: sin caracteres prohibidos ni la extension repetida
function clean(n, fallback){
  return n.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\.(pdf|png|svg)$/i, '').trim() || fallback;
}
function mapName(){
  const n = $('#name').value.trim(); if (n) return n;
  const h = mdText().match(/^#\s+(.+)$/m); if (h && !mapFile) return h[1].trim().slice(0,60);
  if (mapFile) return mapFile.name.replace(/\.[^.]+$/,'');
  return t('name.map');
}
function baseName(){
  const n = $('#name').value.trim(); if (n) return n;
  return docFile ? docFile.name.replace(/\.pdf$/i,'') : mapName();
}
function num(sel, def, max){
  const v = parseFloat($(sel).value);
  return Number.isFinite(v) && v >= 0 ? Math.min(v, max) : def;
}
const pad = () => Math.round(num('#pad', 20, 400));
const TICK = '<svg class="tick" viewBox="0 0 24 24"><path d="m4 12.5 5.2 5.2L20 6.8"/></svg>';
// cada aviso nuevo invalida el borrado pendiente del anterior
let sayId = 0;
function say(html, cls=''){ sayId++; statusEl.className = cls; statusEl.innerHTML = html; }
function lock(on){ busy = on; document.querySelectorAll('.bar button').forEach(b => b.disabled = on); if (!on) refresh(); }
function save(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
// `make` arma el archivo y devuelve [blob, nombre]
async function go(label, make){
  if (busy) return;
  if (mapFile && !replTree) return say(t('st.wait'), 'err');
  if (!hasMap()) return say(t('st.noMap'), 'err');
  lock(true); say(`<span class="spin"></span>${label}`);
  try{
    await new Promise(r => requestAnimationFrame(r));   // que se vea el aviso
    const [blob, name] = await make();
    save(blob, name);
    say(TICK + t('st.done'), 'ok');
    const id = sayId;
    setTimeout(() => { if (!busy && sayId === id) say(''); }, 3500);
  }catch(e){ console.error(e); say(errText(e), 'err'); }
  finally{ lock(false); }
}
const PDF = 'application/pdf';
function onlyMap(fmt){
  const name = clean(mapName(), t('name.map'));
  go(t('st.making', {fmt: fmt.toUpperCase()}), async () => {
    const r = await Motor.render(source());
    if (fmt === 'svg') return [Motor.svg(r, pad()), `${name}.svg`];
    if (fmt === 'png') return [await Motor.png(r, pad(), +$('#scale').value || 3), `${name}.png`];
    const doc = await Motor.pdf(r, pad(), name);
    return [new Blob([await doc.save()], {type: PDF}), `${name}.pdf`];
  });
}
document.querySelectorAll('.bar [data-fmt]').forEach(b => b.onclick = () => onlyMap(b.dataset.fmt));
$('#btnMain').onclick = () => {
  if (!docFile) return onlyMap('pdf');
  const name = clean(baseName(), t('name.doc')), file = docFile, at = mapIndex();
  go(t('st.merging'), async () => {
    const r = await Motor.render(source());
    const map = await Motor.pdf(r, pad(), clean(mapName(), t('name.map')));
    const bytes = await Motor.merge(map, await file.arrayBuffer(), {
      at, fit: $('#fit').value, margin: num('#margin', 36, 200),
    });
    return [new Blob([bytes], {type: PDF}), `${t('name.merged', {name})}.pdf`];
  });
};
// en cuanto alguien apunta a un boton de PDF, se va bajando pdf-lib
['pointerenter', 'pointerdown', 'focusin'].forEach(ev =>
  ['#btnMain', '#btnPdf'].forEach(sel =>
    $(sel).addEventListener(ev, () => Motor.preload('pdf'), {once: true, passive: true})));

function refresh(){
  $('#btnMain').textContent = docFile ? t('bar.merge') : t('bar.pdf');
  $('#btnPdf').classList.toggle('hidden', !docFile);
  $('#name').placeholder = docFile ? baseName() : mapName();
}

/* ══════════════ idioma ══════════════ */
document.querySelectorAll('.lang button').forEach(b => b.onclick = () => I18N.set(b.dataset.lang));
// i18n.js ya cambio los textos fijos (y el ejemplo del editor, si nadie lo
// toco); aqui se rehace lo que la pagina arma sobre la marcha
I18N.onChange(() => {
  movePill();                                   // las pestanas cambian de ancho
  refresh(); hint(); bigTitle(); say('');
  strip.querySelectorAll('.lbl[data-page]').forEach(l => { l.textContent = t('strip.page', {i: l.dataset.page}); });
  if (mapCard) updateOrder();
  if (docFile && docInfo) $('#docSub').textContent = docSubText();
  showPrompt();
  preview();                                    // nodos, hoja y el ejemplo
});

/* ══════════════ tipo de mapa ══════════════ */
const modesBox = $('.modes');
function showMode(){
  modesBox.dataset.active = mode;
  modesBox.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  // cada grupo de botones solo le sirve a un tipo de mapa
  $('#orient').classList.toggle('hidden', mode !== 'timeline');
  $('#cmLayout').classList.toggle('hidden', mode !== 'concept');
  /* Cada tipo trae su ejemplo. Un textarea que nadie ha tocado sigue a su
     texto de fabrica: cambiarlo aqui cambia el ejemplo, y si la persona ya
     escribio (o subio un archivo) lo suyo se queda. i18n.js usa la misma
     clave para cambiarlo de idioma. */
  md.dataset.i18n = 'md.example.' + mode;
  md.textContent = t(md.dataset.i18n);
}
modesBox.querySelectorAll('button').forEach(b => b.onclick = () => {
  if (b.dataset.mode === mode) return;
  mode = b.dataset.mode;
  try { localStorage.setItem('mapType', mode); } catch (e) { /* no se recuerda */ }
  showMode(); showPrompt(); preview();
});

/* ══════════════ botones junto a "Vista previa" ══════════════ */
/* Opciones con una pildora que se desliza: la direccion de la linea del
   tiempo y el acomodo del mapa conceptual. `get`/`set` leen y cambian la
   variable; la eleccion se guarda en localStorage con la clave `key`.
   Devuelve la funcion que pinta el boton elegido. */
function segmented(box, key, get, set){
  const show = () => {
    box.dataset.active = get();
    box.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === get())));
  };
  box.querySelectorAll('button').forEach(b => b.onclick = () => {
    if (b.dataset.value === get()) return;
    set(b.dataset.value);
    try { localStorage.setItem(key, get()); } catch (e) { /* no se recuerda */ }
    show(); preview();
  });
  return show;
}
const showDir = segmented($('#orient'), 'tlDir', () => tlDir, v => { tlDir = v; });
const showLayout = segmented($('#cmLayout'), 'cmLayout', () => cmLayout, v => { cmLayout = v; });

/* ══════════════ prompt para IA ══════════════ */
// la linea del tiempo tiene sus propias reglas (fechas y orden)
const promptText = () => mode === 'timeline' ? t('guide.promptTimeline') : t('guide.prompt', {kind: t('kind.' + mode)});
function showPrompt(){ $('#aiPrompt').textContent = promptText(); }
$('#copyPrompt').onclick = async () => {
  const btn = $('#copyPrompt'), lbl = btn.querySelector('span'), text = promptText();
  try { await navigator.clipboard.writeText(text); }
  catch (e) {                                   // sin permiso: a la antigua
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  btn.classList.add('ok'); lbl.textContent = t('guide.copied');
  clearTimeout(btn._done);
  btn._done = setTimeout(() => { btn.classList.remove('ok'); lbl.textContent = t('guide.copy'); }, 1800);
};

// las pildoras se colocan sin animarse la primera vez
const pills = [$('#pill'), $('.modes-pill'), ...document.querySelectorAll('.choice-pill')];
pills.forEach(el => { el.style.transition = 'none'; });
movePill(); showMode(); showDir(); showLayout(); showPrompt();
$('#pill').offsetWidth;
pills.forEach(el => { el.style.transition = ''; });
refresh(); preview();
