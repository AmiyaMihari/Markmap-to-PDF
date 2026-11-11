/* i18n.js — textos de la interfaz en espanol e ingles.

   El HTML viene escrito en espanol; cada texto traducible lleva su clave:
     data-i18n="clave"         el texto del elemento
     data-i18n-ph="clave"      el placeholder
     data-i18n-title="clave"   el tooltip
     data-i18n-aria="clave"    la etiqueta para lectores de pantalla
   Lo que la pagina arma sobre la marcha usa t('clave', {variables}).

   Se carga sin `defer` al final del <body>: si la persona eligio ingles, la
   pagina ya se pinta traducida, sin parpadeo en espanol. */
(function (global) {
  'use strict';

  const ES = {
    'hero.sub': 'Tu mapa, recortado y con fondo blanco. Solo, o dentro de tu tarea.',
    'lang.label': 'Idioma',

    'mode.label': 'Tipo de mapa',
    'mode.synoptic': 'Cuadro sinóptico',
    'mode.concept': 'Mapa conceptual',
    'mode.mind': 'Mapa mental',
    'mode.timeline': 'Línea del tiempo',
    'kind.synoptic': 'un cuadro sinóptico',
    'kind.concept': 'un mapa conceptual',
    'kind.mind': 'un mapa mental',

    'guide.title': '¿Cómo se usa?',
    'guide.hint': 'el formato del mapa y un prompt para IA',
    'guide.format': 'El formato',
    'guide.formatIntro': 'Cada línea es un nodo, y el mismo texto sirve para los cuatro tipos de mapa. Lo que pones al inicio decide dónde va:',
    'guide.h1': 'el tema central (solo uno)',
    'guide.h2': 'las ramas principales',
    'guide.h3': 'los subtemas de cada rama',
    'guide.deeper': 'sub-ramas dentro de un subtema: cada # extra baja un nivel (hasta ######)',
    'guide.li': 'las ideas',
    'guide.indent': '4 espacios + -',
    'guide.indentDesc': 'una idea dentro de la de arriba, sin límite de niveles',
    'guide.bold': '**negrita**',
    'guide.italic': '*cursiva*',
    'guide.styles': 'también funcionan',
    'guide.example':
      '# Fotosíntesis\n' +
      '## Etapas\n' +
      '### Fase luminosa\n' +
      '#### Dónde ocurre\n' +
      '- En los tilacoides\n' +
      '#### Qué produce\n' +
      '- ATP\n' +
      '    - Energía para la célula\n' +
      '- NADPH\n' +
      '### Ciclo de Calvin\n' +
      '- Fija el dióxido de carbono\n' +
      '## Factores\n' +
      '- Luz, agua y temperatura',
    'guide.ai': 'Con IA',
    'guide.aiIntro': '¿Usas ChatGPT, Claude, Gemini u otra IA? Copia este prompt, cambia el tema y ' +
      'pega aquí lo que te responda (con el botón de copiar de su bloque de código).',
    'guide.copy': 'Copiar prompt',
    'guide.copied': '¡Copiado!',
    'guide.prompt':
      'Hazme {kind} sobre: [ESCRIBE AQUÍ EL TEMA O PEGA TUS APUNTES]\n' +
      '\n' +
      'Respóndeme solo con el mapa en Markdown compatible con markmap, dentro de un ' +
      'bloque de código, siguiendo estas reglas:\n' +
      '- Una sola línea con # para el tema central.\n' +
      '- ## para las ramas principales (entre 3 y 6).\n' +
      '- ### para los subtemas de cada rama, y #### (o más #, hasta ######) para ' +
      'sub-ramas dentro de ellos cuando el tema lo pida.\n' +
      '- Viñetas con - para las ideas. Para poner una idea dentro de otra, agrégale ' +
      '4 espacios al inicio.\n' +
      '- Frases cortas, de unas 10 palabras como máximo, sin párrafos.\n' +
      '- Sin texto antes ni después del bloque, sin tablas, sin imágenes y sin emojis.',
    'guide.promptTimeline':
      'Hazme una línea del tiempo sobre: [ESCRIBE AQUÍ EL TEMA O PEGA TUS APUNTES]\n' +
      '\n' +
      'Respóndeme solo con la línea del tiempo en Markdown compatible con markmap, dentro ' +
      'de un bloque de código, siguiendo estas reglas:\n' +
      '- Una sola línea con # para el título.\n' +
      '- Un ## por cada evento, en orden cronológico (entre 4 y 10), que empiece con su ' +
      'fecha, una raya y un título corto. Por ejemplo: ## 1810 — Inicio de la Independencia\n' +
      '- Debajo de cada evento, de 1 a 3 viñetas con - que lo expliquen.\n' +
      '- Frases cortas, de unas 10 palabras como máximo, sin párrafos.\n' +
      '- Sin texto antes ni después del bloque, sin tablas, sin imágenes y sin emojis.',
    'guide.tlCode': '## 1810 — …',
    'guide.tl': 'en la línea del tiempo, cada ## es un evento; si empieza con su fecha, la fecha va sobre el eje',

    'card.map': 'Tu mapa',
    'tab.write': 'Escribir',
    'tab.file': 'Subir archivo',
    'md.placeholder': '# Título del mapa\n\n## Tema 1\n- Idea\n- Otra idea',
    // el ejemplo del editor, uno por tipo de mapa
    'md.example.synoptic':
      '# Clasificación de los seres vivos\n' +
      '\n' +
      '## Animales\n' +
      '### Vertebrados\n' +
      '- Mamíferos\n' +
      '- Aves\n' +
      '- Peces\n' +
      '### Invertebrados\n' +
      '- Insectos\n' +
      '- Moluscos\n' +
      '\n' +
      '## Plantas\n' +
      '### Con flor\n' +
      '- Árboles frutales\n' +
      '- Pastos\n' +
      '### Sin flor\n' +
      '- Helechos\n' +
      '- Musgos\n' +
      '\n' +
      '## Hongos\n' +
      '- Levaduras\n' +
      '- Mohos\n' +
      '- Setas',
    'md.example.concept':
      '# El ecosistema\n' +
      '\n' +
      '## Factores bióticos\n' +
      '### Productores\n' +
      '- Plantas y algas\n' +
      '### Consumidores\n' +
      '- Herbívoros\n' +
      '- Carnívoros\n' +
      '### Descomponedores\n' +
      '- Hongos y bacterias\n' +
      '\n' +
      '## Factores abióticos\n' +
      '### Clima\n' +
      '- Temperatura\n' +
      '- Lluvia\n' +
      '### Suelo\n' +
      '- Minerales',
    'md.example.mind':
      '# Técnicas de estudio\n' +
      '\n' +
      '## Organización\n' +
      '- Horario fijo\n' +
      '- Lugar sin distracciones\n' +
      '\n' +
      '## Memoria\n' +
      '- Repaso espaciado\n' +
      '- Mnemotecnia\n' +
      '- Explicarlo a alguien más\n' +
      '\n' +
      '## Comprensión\n' +
      '- Mapas y esquemas\n' +
      '- Resúmenes con tus palabras\n' +
      '\n' +
      '## Bienestar\n' +
      '- Dormir bien\n' +
      '- Pausas cada 25 minutos\n' +
      '\n' +
      '## Práctica\n' +
      '- Exámenes de prueba\n' +
      '- Resolver ejercicios',
    'md.example.timeline':
      '# Historia de la computación\n' +
      '\n' +
      '## 1936 — Máquina de Turing\n' +
      '- Modelo teórico de la computación\n' +
      '\n' +
      '## 1946 — ENIAC\n' +
      '- Primera computadora electrónica de uso general\n' +
      '\n' +
      '## 1971: Primer microprocesador\n' +
      '- Intel 4004\n' +
      '\n' +
      '## 1981 — PC de IBM\n' +
      '- La computadora llega a las casas\n' +
      '\n' +
      '## 1991 — World Wide Web\n' +
      '- Se publica la primera página web\n' +
      '\n' +
      '## 2007 — Teléfonos inteligentes\n' +
      '- Internet en el bolsillo\n' +
      '\n' +
      '## Hoy — Inteligencia artificial\n' +
      '- Asistentes que entienden lenguaje natural',
    'drop.map': 'Arrastra tu .md o el .html de markmap',
    'drop.or': 'o haz clic para elegirlo',
    'file.used': 'se usará este archivo',
    'file.remove': 'Quitar',

    'card.doc': 'Unir con tu tarea',
    'card.optional': '— opcional',
    'drop.doc': 'Arrastra aquí el PDF de tu tarea',
    'doc.reading': 'leyendo…',
    'doc.pages1': '1 página · {w}×{h} cm',
    'doc.pagesN': '{n} páginas · {w}×{h} cm',
    'order.help': 'Arrastra el mapa para colocarlo donde quieras',
    'order.start': 'al inicio',
    'order.end': 'al final',
    'order.at': 'como página {i} de {n}',
    'strip.page': 'Página {i}',
    'strip.map': 'TU MAPA',
    'strip.drag': 'arrástrame',
    'fit.label': 'Tamaño de la hoja',
    'fit.exact': 'del tamaño del mapa',
    'fit.doc': 'igual que tu documento',
    'fit.landscape': 'horizontal, para que salga más grande',

    'set.title': 'Ajustes',
    'set.spacing': 'Separación entre ramas',
    'set.spacingUnit': 'px entre nodos',
    'set.gap': 'Aire entre ramas principales',
    'set.gapUnit': 'px extra, solo en el primer nivel',
    'set.pad': 'Margen del mapa',
    'set.padUnit': 'px alrededor',
    'set.margin': 'Margen de la hoja',
    'set.marginUnit': 'pt · solo si la hoja no es del tamaño del mapa',
    'set.scale': 'Calidad del PNG',
    'set.name': 'Nombre del archivo',

    'pv.title': 'Vista previa',
    'gh.label': 'Amiya Mihari en GitHub',
    'kofi': 'Donar en Ko-fi',
    'kofi.note': '¿Te sirvió? Es gratis, y puedes apoyarlo con una donación.',
    'kofi.thanks': '¡Gracias por donar!',
    'pv.dir': 'Dirección de la línea del tiempo',
    'pv.dirH': 'Horizontal',
    'pv.dirV': 'Vertical',
    'pv.zoomOut': 'Alejar',
    'pv.zoomIn': 'Acercar',
    'pv.center': 'Centrar el mapa (o doble clic)',
    'pv.centerAria': 'Centrar el mapa',
    'pv.big': 'Ver el mapa en grande',
    'pv.small': 'Volver al tamaño normal (Esc)',
    'pv.empty': 'Escribe tu mapa',
    'pv.nodes': '{n} nodos',
    'pv.noNodes': 'Mapa vacío',
    'pv.invalid': 'Markdown no válido',
    'pv.readingFile': 'Leyendo el archivo…',
    'pv.sheet': 'hoja {w} × {h} px · {wi}″ × {hi}″',
    'pv.zoomed': 'acercado · centra para ver la hoja',
    'pv.esc': 'Esc para salir',

    'bar.pdf': 'Descargar PDF',
    'bar.merge': 'Descargar tarea + mapa',
    'bar.mapOnly': 'Solo el mapa · PDF',
    'st.making': 'Generando {fmt}…',
    'st.merging': 'Uniendo PDF…',
    'st.done': 'Listo',
    'st.noMap': 'Escribe o sube un mapa primero',
    'st.wait': 'Espera, todavía estoy leyendo el archivo',

    'name.map': 'mapa',
    'name.doc': 'tarea',
    'name.merged': '{name} con mapa',

    'err.generic': 'Algo salió mal',
    'err.net': 'No se pudo descargar una parte de la página; revisa tu conexión.',
    'err.tooBig': 'El mapa es demasiado grande para un PNG; usa el PDF o el SVG.',
    'err.tainted': 'Tu navegador no deja exportar el PNG; prueba con Chrome, Edge o Firefox.',
    'err.protected': 'Ese PDF está protegido: quítale la contraseña y vuelve a intentar.',
    'err.unreadable': 'No pude leer ese PDF',
    'err.noPages': 'Ese PDF no tiene páginas.',
    'err.noRepl': 'No encontré ningún mapa en ese HTML. Asegúrate de que sea el archivo de ' +
      '"Download as interactive HTML" del REPL de markmap.',
  };

  const EN = {
    'hero.sub': 'Your map, cropped and on a white background. On its own, or inside your assignment.',
    'lang.label': 'Language',

    'mode.label': 'Map type',
    'mode.synoptic': 'Brace map',
    'mode.concept': 'Concept map',
    'mode.mind': 'Mind map',
    'mode.timeline': 'Timeline',
    'kind.synoptic': 'a brace map (synoptic chart)',
    'kind.concept': 'a concept map',
    'kind.mind': 'a mind map',

    'guide.title': 'How does it work?',
    'guide.hint': 'the map format and a prompt for AI',
    'guide.format': 'The format',
    'guide.formatIntro': 'Each line is a node, and the same text works for all four map types. What you put at the start decides where it goes:',
    'guide.h1': 'the central topic (only one)',
    'guide.h2': 'the main branches',
    'guide.h3': 'the subtopics of each branch',
    'guide.deeper': 'sub-branches inside a subtopic: each extra # goes one level deeper (up to ######)',
    'guide.li': 'the ideas',
    'guide.indent': '4 spaces + -',
    'guide.indentDesc': 'an idea inside the one above, as deep as you like',
    'guide.bold': '**bold**',
    'guide.italic': '*italic*',
    'guide.styles': 'work too',
    'guide.example':
      '# Photosynthesis\n' +
      '## Stages\n' +
      '### Light reactions\n' +
      '#### Where they happen\n' +
      '- In the thylakoids\n' +
      '#### What they produce\n' +
      '- ATP\n' +
      '    - Energy for the cell\n' +
      '- NADPH\n' +
      '### Calvin cycle\n' +
      '- Fixes carbon dioxide\n' +
      '## Factors\n' +
      '- Light, water and temperature',
    'guide.ai': 'With AI',
    'guide.aiIntro': 'Using ChatGPT, Claude, Gemini or another AI? Copy this prompt, change the topic and ' +
      'paste its answer here (with the copy button on its code block).',
    'guide.copy': 'Copy prompt',
    'guide.copied': 'Copied!',
    'guide.prompt':
      'Make me {kind} about: [WRITE THE TOPIC HERE OR PASTE YOUR NOTES]\n' +
      '\n' +
      'Reply only with the map in markmap-compatible Markdown, inside a code block, ' +
      'following these rules:\n' +
      '- A single line with # for the central topic.\n' +
      '- ## for the main branches (between 3 and 6).\n' +
      '- ### for the subtopics of each branch, and #### (or more #, up to ######) for ' +
      'sub-branches inside them when the topic calls for it.\n' +
      '- Bullets with - for the ideas. To put an idea inside another, add 4 spaces ' +
      'at the start.\n' +
      '- Short phrases, about 10 words at most, no paragraphs.\n' +
      '- No text before or after the block, no tables, no images and no emojis.',
    'guide.promptTimeline':
      'Make me a timeline about: [WRITE THE TOPIC HERE OR PASTE YOUR NOTES]\n' +
      '\n' +
      'Reply only with the timeline in markmap-compatible Markdown, inside a code block, ' +
      'following these rules:\n' +
      '- A single line with # for the title.\n' +
      '- One ## per event, in chronological order (between 4 and 10), starting with its ' +
      'date, a dash and a short title. For example: ## 1969 — Moon landing\n' +
      '- Under each event, 1 to 3 bullets with - that explain it.\n' +
      '- Short phrases, about 10 words at most, no paragraphs.\n' +
      '- No text before or after the block, no tables, no images and no emojis.',
    'guide.tlCode': '## 1969 — …',
    'guide.tl': 'in the timeline, each ## is an event; if it starts with its date, the date goes on the axis',

    'card.map': 'Your map',
    'tab.write': 'Write',
    'tab.file': 'Upload file',
    'md.placeholder': '# Map title\n\n## Topic 1\n- Idea\n- Another idea',
    // el ejemplo del editor, uno por tipo de mapa
    'md.example.synoptic':
      '# Classification of living things\n' +
      '\n' +
      '## Animals\n' +
      '### Vertebrates\n' +
      '- Mammals\n' +
      '- Birds\n' +
      '- Fish\n' +
      '### Invertebrates\n' +
      '- Insects\n' +
      '- Mollusks\n' +
      '\n' +
      '## Plants\n' +
      '### Flowering\n' +
      '- Fruit trees\n' +
      '- Grasses\n' +
      '### Non-flowering\n' +
      '- Ferns\n' +
      '- Mosses\n' +
      '\n' +
      '## Fungi\n' +
      '- Yeasts\n' +
      '- Molds\n' +
      '- Mushrooms',
    'md.example.concept':
      '# The ecosystem\n' +
      '\n' +
      '## Biotic factors\n' +
      '### Producers\n' +
      '- Plants and algae\n' +
      '### Consumers\n' +
      '- Herbivores\n' +
      '- Carnivores\n' +
      '### Decomposers\n' +
      '- Fungi and bacteria\n' +
      '\n' +
      '## Abiotic factors\n' +
      '### Climate\n' +
      '- Temperature\n' +
      '- Rainfall\n' +
      '### Soil\n' +
      '- Minerals',
    'md.example.mind':
      '# Study techniques\n' +
      '\n' +
      '## Organization\n' +
      '- Fixed schedule\n' +
      '- Distraction-free space\n' +
      '\n' +
      '## Memory\n' +
      '- Spaced repetition\n' +
      '- Mnemonics\n' +
      '- Explain it to someone\n' +
      '\n' +
      '## Understanding\n' +
      '- Maps and outlines\n' +
      '- Summaries in your own words\n' +
      '\n' +
      '## Well-being\n' +
      '- Sleep well\n' +
      '- Breaks every 25 minutes\n' +
      '\n' +
      '## Practice\n' +
      '- Practice exams\n' +
      '- Solve exercises',
    'md.example.timeline':
      '# History of computing\n' +
      '\n' +
      '## 1936 — Turing machine\n' +
      '- Theoretical model of computation\n' +
      '\n' +
      '## 1946 — ENIAC\n' +
      '- First general-purpose electronic computer\n' +
      '\n' +
      '## 1971: First microprocessor\n' +
      '- Intel 4004\n' +
      '\n' +
      '## 1981 — IBM PC\n' +
      '- Computers arrive at home\n' +
      '\n' +
      '## 1991 — World Wide Web\n' +
      '- The first web page goes online\n' +
      '\n' +
      '## 2007 — Smartphones\n' +
      '- The internet in your pocket\n' +
      '\n' +
      '## Today — Artificial intelligence\n' +
      '- Assistants that understand natural language',
    'drop.map': 'Drop your .md or the markmap .html',
    'drop.or': 'or click to choose it',
    'file.used': 'this file will be used',
    'file.remove': 'Remove',

    'card.doc': 'Merge with your assignment',
    'card.optional': '— optional',
    'drop.doc': 'Drop your assignment PDF here',
    'doc.reading': 'reading…',
    'doc.pages1': '1 page · {w}×{h} cm',
    'doc.pagesN': '{n} pages · {w}×{h} cm',
    'order.help': 'Drag the map to place it wherever you want',
    'order.start': 'at the start',
    'order.end': 'at the end',
    'order.at': 'as page {i} of {n}',
    'strip.page': 'Page {i}',
    'strip.map': 'YOUR MAP',
    'strip.drag': 'drag me',
    'fit.label': 'Sheet size',
    'fit.exact': 'same size as the map',
    'fit.doc': 'same as your document',
    'fit.landscape': 'landscape, so the map comes out bigger',

    'set.title': 'Settings',
    'set.spacing': 'Branch spacing',
    'set.spacingUnit': 'px between nodes',
    'set.gap': 'Space between main branches',
    'set.gapUnit': 'extra px, first level only',
    'set.pad': 'Map margin',
    'set.padUnit': 'px around',
    'set.margin': 'Sheet margin',
    'set.marginUnit': 'pt · only if the sheet isn’t map-sized',
    'set.scale': 'PNG quality',
    'set.name': 'File name',

    'pv.title': 'Preview',
    'gh.label': 'Amiya Mihari on GitHub',
    'kofi': 'Donate on Ko-fi',
    'kofi.note': 'Found it useful? It’s free, and you can support it with a donation.',
    'kofi.thanks': 'Thank you for donating!',
    'pv.dir': 'Timeline direction',
    'pv.dirH': 'Horizontal',
    'pv.dirV': 'Vertical',
    'pv.zoomOut': 'Zoom out',
    'pv.zoomIn': 'Zoom in',
    'pv.center': 'Center the map (or double-click)',
    'pv.centerAria': 'Center the map',
    'pv.big': 'View the map larger',
    'pv.small': 'Back to normal size (Esc)',
    'pv.empty': 'Write your map',
    'pv.nodes': '{n} nodes',
    'pv.noNodes': 'Empty map',
    'pv.invalid': 'Invalid Markdown',
    'pv.readingFile': 'Reading the file…',
    'pv.sheet': 'sheet {w} × {h} px · {wi}″ × {hi}″',
    'pv.zoomed': 'zoomed in · center to see the sheet',
    'pv.esc': 'Esc to exit',

    'bar.pdf': 'Download PDF',
    'bar.merge': 'Download assignment + map',
    'bar.mapOnly': 'Map only · PDF',
    'st.making': 'Generating {fmt}…',
    'st.merging': 'Merging PDF…',
    'st.done': 'Done',
    'st.noMap': 'Write or upload a map first',
    'st.wait': 'Hold on, I’m still reading the file',

    'name.map': 'map',
    'name.doc': 'assignment',
    'name.merged': '{name} with map',

    'err.generic': 'Something went wrong',
    'err.net': 'Part of the page couldn’t be downloaded; check your connection.',
    'err.tooBig': 'The map is too big for a PNG; use the PDF or the SVG.',
    'err.tainted': 'Your browser won’t export the PNG; try Chrome, Edge or Firefox.',
    'err.protected': 'That PDF is password-protected: remove the password and try again.',
    'err.unreadable': 'I couldn’t read that PDF',
    'err.noPages': 'That PDF has no pages.',
    'err.noRepl': 'I couldn’t find a map in that HTML. Make sure it’s the file from ' +
      '"Download as interactive HTML" in the markmap REPL.',
  };

  const DICT = {es: ES, en: EN};
  const listeners = [];
  let lang = 'es';
  try {
    const saved = localStorage.getItem('lang');
    if (DICT[saved]) lang = saved;
  } catch (e) { /* sin almacenamiento: espanol */ }

  function text(l, key, vars) {
    let s = DICT[l][key];
    if (s == null) s = ES[key];
    if (s == null) return key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s;
  }
  const t = (key, vars) => text(lang, key, vars);

  function apply(root) {
    root = root || document;
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    root.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    const box = document.querySelector('.lang');
    if (box) box.dataset.active = lang;
  }

  function set(l) {
    if (!DICT[l] || l === lang) return;
    const before = lang;
    lang = l;
    try { localStorage.setItem('lang', l); } catch (e) { /* no se recuerda, no pasa nada */ }
    apply();
    listeners.forEach(fn => fn(l, before));
  }

  global.I18N = {
    t, text, apply, set,
    get lang() { return lang; },
    onChange(fn) { listeners.push(fn); },
  };
  global.t = t;
  apply();
})(window);
