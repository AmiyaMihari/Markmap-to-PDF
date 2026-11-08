/* Aire entre ramas
   ================
   Archivo unico: lo cargan la pagina (docs/index.html) y el CLI de Python
   (markmap2pdf.py lo lee e inyecta en su plantilla), asi que el mapa sale
   igual en los dos.

   markmap acomoda el arbol lo mas apretado que puede: entre dos nodos de
   ramas distintas solo deja `spacingVertical * 2` px, y los mapas grandes
   salen amontonados.

   Este parche corre DESPUES del layout de markmap (`_relayout`) y separa las
   ramas principales -las hijas de la raiz- moviendo cada subarbol completo,
   la mitad hacia arriba y la mitad hacia abajo para que el mapa siga
   centrado en la raiz. Como solo las ALEJA, nunca se encima nada.

   Ademas acorta la union de un nodo con su UNICO hijo. markmap deja a todos
   los hijos a la misma distancia (`spacingHorizontal`, 80 px); con varios
   hijos ese espacio lo llenan las curvas, pero con uno solo queda una recta
   larga y el texto se ve lejisimos (tipico: "Termino -> su definicion").

   Opciones que entiende, ademas de las de markmap:
     branchGap        px extra entre ramas principales
     singleLink       largo en px de la union con un hijo unico (default 32)
   (`spacingVertical` es de markmap y afecta a todos los niveles.)          */
(function (global) {
  // Recorre el subarbol igual que el layout: lo que esta plegado no cuenta,
  // sus hijos conservan coordenadas viejas y no hay que moverlos.
  function walk(node, fn) {
    fn(node);
    if (node.payload && node.payload.fold) return;
    (node.children || []).forEach(function (child) { walk(child, fn); });
  }

  function kidsOf(n) {
    if (n.payload && n.payload.fold) return [];
    return (n.children || []).filter(function (k) { return k.state && k.state.rect; });
  }

  // alguna pareja de nodos se toca (con un margen para que el texto respire)
  function overlaps(root) {
    var rs = [], m = 6;
    walk(root, function (n) { if (n.state && n.state.rect) rs.push(n.state.rect); });
    for (var i = 0; i < rs.length; i++) {
      var a = rs[i];
      for (var j = i + 1; j < rs.length; j++) {
        var b = rs[j];
        if (a.x < b.x + b.width + m && b.x < a.x + a.width + m &&
            a.y < b.y + b.height && b.y < a.y + a.height) return true;
      }
    }
    return false;
  }

  /* Acerca al padre cada hijo unico (con todo lo que cuelga de el). Se
     acumula hacia abajo: en una cadena A -> B -> C cada union queda corta.
     Si en algun caso raro eso encimara dos nodos, se deshace todo. */
  function compact(root, o) {
    var link = o.singleLink == null ? 32 : +o.singleLink;
    var cut = (+o.spacingHorizontal || 80) - link;
    if (!(cut > 0)) return false;
    var saved = [];
    (function go(n, acc) {
      var r = n.state.rect;
      if (acc) { saved.push([r, r.x]); r.x -= acc; }
      var kids = kidsOf(n);
      var next = acc + (kids.length === 1 ? cut : 0);
      kids.forEach(function (k) { go(k, next); });
    })(root, 0);
    if (saved.length && overlaps(root)) {
      saved.forEach(function (s) { s[0].x = s[1]; });
      return false;
    }
    return saved.length > 0;
  }

  // separa las ramas principales: la mitad sube y la mitad baja
  function spread(root, gap) {
    var kids = kidsOf(root);
    if (gap <= 0 || kids.length < 2) return false;
    kids.forEach(function (kid, i) {
      var dy = (i - (kids.length - 1) / 2) * gap;
      if (!dy) return;
      walk(kid, function (n) {
        if (n.state && n.state.rect) n.state.rect.y += dy;
      });
    });
    return true;
  }

  function wrap(base) {
    return function () {
      base.call(this);
      var o = this.options || {};
      var root = this.state && this.state.data;
      if (!root || !root.state || !root.state.rect) return;

      var moved = compact(root, o);
      moved = spread(root, +o.branchGap || 0) || moved;
      if (!moved) return;

      // La caja del mapa cambio, y markmap la usa para encuadrar y exportar.
      var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      walk(root, function (n) {
        var r = n.state && n.state.rect;
        if (!r) return;
        x1 = Math.min(x1, r.x);              y1 = Math.min(y1, r.y);
        x2 = Math.max(x2, r.x + r.width);    y2 = Math.max(y2, r.y + r.height);
      });
      this.state.rect = {x1: x1, y1: y1, x2: x2, y2: y2};
    };
  }

  function patch(ns) {
    var proto = ns && ns.Markmap && ns.Markmap.prototype;
    if (!proto || typeof proto._relayout !== 'function') return false;
    if (!proto.__branchGap) {
      proto._relayout = wrap(proto._relayout);
      proto.__branchGap = true;
    }
    return true;
  }

  global.mmSpacing = {
    patch: patch,
    /* Opciones listas para Markmap.create() o setOptions(). */
    opts: function (spacing, gap, base) {
      var o = Object.assign({}, base);
      if (spacing != null && spacing !== '') o.spacingVertical = +spacing;
      o.branchGap = +gap || 0;
      return o;
    }
  };

  patch(global.markmap);   // si markmap ya cargo, queda parcheado aqui mismo
})(window);
