/* =====================================================================================
   Playfair – strumenti.js
   Aiuti comuni per gli strumenti Playfair-S/E/T/M/C: legge i colori dalle variabili di
   assets/tema.css, li converte nei formati che servono a Chart.js e al canvas, imposta i
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

  /* PF.c('--inchiostro', '#000') → '#rrggbb' del tema in uso */
  PF.c = function (nome, riserva) {
    if (nome.charAt(0) === '#' || nome.indexOf('(') > -1) return inHex(nome) || nome;
    if (nome.indexOf('--') !== 0) nome = '--' + nome;
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
  PF.testo = function () { return PF.c('--inchiostro', '#1c1820'); };
  PF.tenue = function () { return PF.c('--tenue', '#5f5868'); };
  PF.griglia = function () { return PF.rgba(PF.testo(), PF.scuroAttivo() ? 0.10 : 0.09); };
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
    var fam = grezzo('--testo');
    if (fam) d.font.family = fam;
    if (d.plugins && d.plugins.tooltip) {
      d.plugins.tooltip.backgroundColor = PF.rgba(PF.c('--inchiostro', '#1c1820'), 0.92);
      d.plugins.tooltip.titleColor = PF.c('--carta', '#f7f6f8');
      d.plugins.tooltip.bodyColor = PF.c('--carta', '#f7f6f8');
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

  impostaChart();
  // i fogli di stile potrebbero finire di caricarsi dopo: riallinea una volta al load
  window.addEventListener('load', function () { memo = {}; impostaChart(); });
})();
