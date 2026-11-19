/* =====================================================================================
   Playfair – strumenti.js
   Aiuti comuni per gli strumenti Playfair-S/E/T/M/G/C: legge i colori dalle variabili
   dell'AREA DI LAVORO (assets/area.css: --area-*, --serie-*, --flusso-*), mai da quelle
   della cornice (tema.css), li converte nei formati che servono a Chart.js e al canvas, imposta i
   valori predefiniti di Chart.js (locale it-IT, colori di testi e griglie) e richiama le
   funzioni registrate dalle pagine quando cambia il tema (evento 'pf-tema' su window
   oppure cambio dell'attributo data-theme su <html>).
   Va caricato DOPO chart.umd.js e PRIMA dello script dello strumento.
   Nessun dato esce dal browser.
   ===================================================================================== */
(function () {
  'use strict';
  var PF = window.PF = window.PF || {};
  var radice = document.documentElement;

  /* ---- lettura delle variabili CSS (con memoria, svuotata al cambio di tema) ---- */
  var memo = {};
  function grezzo(nome) {
    return getComputedStyle(radice).getPropertyValue(nome).trim();
  }

  /* converte qualunque colore CSS in #rrggbb (o lascia rgba(...) se ha trasparenza) */
  var tela = document.createElement('canvas');
  tela.width = tela.height = 1;
  var ctx = tela.getContext('2d', { willReadFrequently: true });
  function inHex(valore) {
    if (!valore) return null;
    ctx.fillStyle = '#000000';
    ctx.fillStyle = valore;
    var f = ctx.fillStyle;
    if (/^#[0-9a-f]{6}$/i.test(f)) return f;
    // colori moderni (oklch, color-mix…): li disegno e leggo il pixel
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    var d = ctx.getImageData(0, 0, 1, 1).data;
    if (d[3] === 0) return null;
    return '#' + [d[0], d[1], d[2]].map(function (n) { return ('0' + n.toString(16)).slice(-2); }).join('');
  }
  function rgb(hex) {
    var h = inHex(hex) || '#808080';
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }

  /* Nomi della cornice → variabili dell'area: un PF.c('--inchiostro') rimasto (o scritto in futuro) dentro uno
     strumento legge comunque la palette fissa dell'area, non il tema. */
  var AREA = {
    '--carta': '--area-fondo', '--foglio': '--area-pannello', '--rialzo': '--area-rialzo', '--tinta': '--area-tinta',
    '--linea': '--area-linea', '--bordo': '--area-bordo', '--inchiostro': '--area-testo', '--tenue': '--area-tenue',
    '--primario': '--area-accento', '--primario-forte': '--area-accento-forte', '--su-primario': '--area-su-accento',
    '--profondo': '--area-titolo', '--segno': '--area-segno', '--successo': '--area-ok', '--successo-fondo': '--area-ok-fondo',
    '--attenzione': '--area-warn', '--attenzione-fondo': '--area-warn-fondo', '--errore': '--area-err', '--errore-fondo': '--area-err-fondo',
    '--testo': '--area-font', '--titoli': '--area-font-titoli', '--mono': '--area-font-mono'
  };
  PF.AREA = AREA;

  /* PF.c('--area-testo', '#000') → '#rrggbb' della modalità (chiara/scura) in uso */
  PF.c = function (nome, riserva) {
    if (nome.charAt(0) === '#' || nome.indexOf('(') > -1) return inHex(nome) || nome;
    if (nome.indexOf('--') !== 0) nome = '--' + nome;
    if (AREA[nome]) nome = AREA[nome];
    var k = nome + '|' + (riserva || '');
    if (memo[k]) return memo[k];
    var v = inHex(grezzo(nome)) || inHex(riserva) || '#808080';
    memo[k] = v;
    return v;
  };
  /* PF.rgba('--primario', .3) oppure PF.rgba('#336699', .3) */
  PF.rgba = function (colore, alfa) {
    var c = rgb(colore.indexOf('--') === 0 ? PF.c(colore) : colore);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alfa + ')';
  };
  /* mescola due colori: t=0 → a, t=1 → b */
  PF.mescola = function (a, b, t) {
    var x = rgb(a.indexOf('--') === 0 ? PF.c(a) : a), y = rgb(b.indexOf('--') === 0 ? PF.c(b) : b);
    return '#' + [0, 1, 2].map(function (i) {
      return ('0' + Math.round(x[i] + (y[i] - x[i]) * t).toString(16)).slice(-2);
    }).join('');
  };
  PF.scuro = function (c, t) { return PF.mescola(c, '#000000', t); };
  PF.chiaro = function (c, t) { return PF.mescola(c, '#ffffff', t); };
  /* tema scuro? (predefinito: scuro; chiaro con data-theme="light") */
  PF.scuroAttivo = function () { return radice.getAttribute('data-theme') !== 'light'; };
  /* colori ricorrenti */
  PF.testo = function () { return PF.c('--area-testo', '#181b20'); };
  PF.tenue = function () { return PF.c('--area-tenue', '#545b67'); };
  PF.griglia = function () { return PF.rgba(PF.testo(), PF.scuroAttivo() ? 0.10 : 0.09); };   /* = --area-griglia */
  /* numero all'italiana */
  PF.num = function (v, dec) {
    dec = dec || 0;
    return Number(v).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  /* PF.tavolozza({el:['--flusso-el','#2e9e4f'], scuro:function(){…}})
     restituisce un oggetto i cui campi leggono SEMPRE il colore del tema in uso */
  PF.tavolozza = function (mappa, bersaglio) {
    var o = bersaglio || {};
    Object.keys(mappa).forEach(function (k) {
      var m = mappa[k];
      Object.defineProperty(o, k, {
        configurable: true, enumerable: true,
        get: typeof m === 'function' ? m : function () { return PF.c(m[0], m[1]); }
      });
    });
    return o;
  };

  /* ---- valori predefiniti di Chart.js ---- */
  function impostaChart() {
    if (!window.Chart) return;
    var d = window.Chart.defaults;
    d.locale = 'it-IT';
    d.color = PF.tenue();
    d.borderColor = PF.griglia();
    var fam = grezzo('--area-font');
    if (fam) d.font.family = fam;
    if (d.plugins && d.plugins.tooltip) {
      d.plugins.tooltip.backgroundColor = PF.rgba(PF.c('--area-testo', '#181b20'), 0.94);
      d.plugins.tooltip.titleColor = PF.c('--area-fondo', '#f3f4f6');
      d.plugins.tooltip.bodyColor = PF.c('--area-fondo', '#f3f4f6');
    }
  }

  /* ---- cambio di tema ---- */
  var ascoltatori = [];
  var inAttesa = false;
  function cambiato() {
    if (inAttesa) return;
    inAttesa = true;
    requestAnimationFrame(function () {
      inAttesa = false;
      memo = {};
      impostaChart();
      ascoltatori.forEach(function (fn) {
        try { fn(); } catch (e) { console.error('Playfair: ridisegno dopo il cambio di tema', e); }
      });
    });
  }
  PF.alCambioTema = function (fn) { ascoltatori.push(fn); };
  window.addEventListener('pf-tema', cambiato);
  try {
    new MutationObserver(cambiato).observe(radice, { attributes: true, attributeFilter: ['data-theme', 'data-vestito'] });
  } catch (e) { /* browser molto vecchi */ }
  // se il tema segue il sistema, anche il cambio del sistema conta
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', cambiato); } catch (e) {}

  /* ------------------------------------------------------------------ zoom con la rotella
     PF.zoomRotella(elementi, grafici, opz): la rotella sopra uno degli elementi ingrandisce (su) o
     riduce (giù) l'asse x dei grafici, centrando sul punto sotto il mouse. `grafici` è una funzione che
     restituisce il grafico o un array di grafici (Chart.js) da tenere allineati: va letta a ogni evento
     perché le pagine ricreano i grafici. Non si va oltre l'estensione iniziale dell'asse: riducendo fino
     in fondo si torna alla vista completa. opz.min = ampiezza minima (default 2 per assi a categorie); opz.dopo() = da richiamare dopo ogni zoom.
     PF.zoomReimposta(grafico | array) torna alla vista iniziale. */
  function arr(g) { return (Array.isArray(g) ? g : [g]).filter(function (c) { return c && c.scales && c.scales.x; }); }
  function base(ch) {
    if (!ch.$pfZoom) {
      var o = ch.options.scales.x, s = ch.scales.x;
      ch.$pfZoom = { oMin: o.min, oMax: o.max, min: s.min, max: s.max, cat: s.type === 'category' };
    }
    return ch.$pfZoom;
  }
  function applica(ch, min, max) {
    var z = base(ch), o = ch.options.scales.x;
    if (min <= z.min && max >= z.max) { o.min = z.oMin; o.max = z.oMax; ch.$pfZoomato = false; }
    else { o.min = min; o.max = max; ch.$pfZoomato = true; }
    ch.update('none');
  }
  PF.zoomRotella = function (elementi, grafici, opz) {
    opz = opz || {};
    (Array.isArray(elementi) ? elementi : [elementi]).forEach(function (el) {
      if (!el || el.$pfRotella) return;
      el.$pfRotella = true;
      el.addEventListener('wheel', function (e) {
        var gs = arr(grafici());
        if (!gs.length) return;
        var ch = gs.filter(function (c) { return c.canvas === e.target; })[0] || gs.filter(function (c) { return el.contains(c.canvas); })[0] || gs[0];
        var s = ch.scales.x, ca = ch.chartArea, z = base(ch);
        if (!ca) return;
        e.preventDefault();
        var r = ch.canvas.getBoundingClientRect();
        var px = Math.max(ca.left, Math.min(ca.right, e.clientX - r.left));
        var f = (px - ca.left) / Math.max(1, ca.right - ca.left);
        var cur0 = s.min, cur1 = s.max, span = cur1 - cur0;
        var k = e.deltaY > 0 ? 1.25 : 0.8;
        var ns = span * k, minSpan = opz.min != null ? opz.min : (z.cat ? 2 : (z.max - z.min) / 500);
        if (ns < minSpan) ns = minSpan;
        var full = z.max - z.min;
        if (ns >= full) { gs.forEach(function (c) { var zc = base(c); applica(c, zc.min, zc.max); }); if (opz.dopo) opz.dopo(); return; }
        var centro = cur0 + f * span, a = centro - f * ns, b = a + ns;
        if (a < z.min) { a = z.min; b = a + ns; }
        if (b > z.max) { b = z.max; a = b - ns; }
        if (z.cat) { a = Math.round(a); b = Math.round(b); if (b - a < minSpan) b = Math.min(z.max, a + minSpan); }
        gs.forEach(function (c) { applica(c, a, b); });
        if (opz.dopo) opz.dopo();
      }, { passive: false });
    });
  };
  PF.zoomReimposta = function (grafici) {
    arr(grafici).forEach(function (c) { if (c.$pfZoom) { var z = c.$pfZoom; applica(c, z.min, z.max); } });
  };

  /* ------------------------------------------------------------------ messaggio breve
     PF.messaggio(testo, vicinoA): avviso che compare vicino all'elemento (es. la freccia premuta)
     e sparisce da solo dopo qualche secondo; letto anche dagli screen reader. */
  var avviso = null, timerAvviso = null;
  PF.messaggio = function (testo, vicinoA) {
    if (!avviso) {
      avviso = document.createElement('div');
      avviso.className = 'pf-messaggio';
      avviso.setAttribute('role', 'status');
      avviso.setAttribute('aria-live', 'polite');
      avviso.style.cssText = 'position:fixed;z-index:9999;max-width:320px;padding:6px 12px;border-radius:4px;font-size:13px;line-height:1.35;' +
        'pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:opacity .2s;opacity:0';
      document.body.appendChild(avviso);
    }
    avviso.style.background = PF.c('--area-testo', '#181b20');
    avviso.style.color = PF.c('--area-pannello', '#ffffff');
    avviso.textContent = testo;
    var r = vicinoA && vicinoA.getBoundingClientRect ? vicinoA.getBoundingClientRect() : null;
    avviso.style.opacity = '0'; avviso.style.display = 'block';
    var w = avviso.offsetWidth, h = avviso.offsetHeight;
    var x = r ? r.left + r.width / 2 - w / 2 : (innerWidth - w) / 2, y = r ? r.bottom + 8 : innerHeight - h - 24;
    if (r && y + h > innerHeight - 8) y = r.top - h - 8;
    avviso.style.left = Math.max(8, Math.min(innerWidth - w - 8, x)) + 'px';
    avviso.style.top = Math.max(8, y) + 'px';
    avviso.style.opacity = '1';
    clearTimeout(timerAvviso);
    timerAvviso = setTimeout(function () { avviso.style.opacity = '0'; }, 2600);
  };

  impostaChart();
  // i fogli di stile potrebbero finire di caricarsi dopo: riallinea una volta al load
  window.addEventListener('load', function () { memo = {}; impostaChart(); });
})();
