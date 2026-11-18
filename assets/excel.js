/* =====================================================================================================
   Playfair · excel.js — «Scarica in Excel»: una cartella .xlsx con un grafico per foglio.
   Caricato a richiesta da sito.js (Playfair.esportaExcel), insieme a JSZip (assets/vendor/jszip.min.js).
   - Legge i grafici Chart.js della pagina (anche quelli nelle schede non attive, se già creati) e li riscrive come
     grafici NATIVI di Excel (OOXML DrawingML: xl/charts/chartN.xml), modificabili: barre raggruppate/impilate
     orizzontali e verticali, linee, aree, dispersione, bolle, torta/ciambella, combinazioni barre+linea con asse
     secondario. Le linee di riferimento orizzontali (chartjs-plugin-annotation) diventano serie costanti.
   - Ciò che Excel non sa disegnare (carpet plot, box plot, diagrammi su tela libera, Sankey) entra come immagine PNG
     (xl/media) accanto alla tabella dei dati.
   - Ogni foglio: titolo, riga di fonte, tabella dei dati del grafico, grafico. Ultimo foglio «Fonte» con i dettagli.
   Le pagine possono personalizzare con window.PF_EXCEL = { strumento, prima(), tabelle: { idCanvas: fn(chart|canvas) },
   immagini: { idCanvas: fn(canvas) → canvas }, dopo(fogli) } e con gli attributi dei <canvas>:
   data-pf-titolo, data-pf-periodo (selettore del testo del periodo), data-pf-excel="no|immagine|entrambi|nativo".
   Nessun dato esce dal browser.
   ===================================================================================================== */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var EMU = 9525;   // EMU per pixel a 96 dpi

  /* ------------------------------------------------------------------------------- utilità XML */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function lettera(c) {   // 0 → A
    var s = ""; c += 1;
    while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
    return s;
  }
  function rif(c, r) { return lettera(c) + r; }
  function rifAss(nome, c, r1, r2) {
    var f = "'" + nome.replace(/'/g, "''") + "'!$" + lettera(c) + "$" + r1;
    return r2 != null && r2 !== r1 ? f + ":$" + lettera(c) + "$" + r2 : f;
  }
  function numXml(v) {
    var n = Number(v);
    if (!isFinite(n)) return null;
    var s = String(n);
    if (/e/.test(s)) s = n.toExponential(14).replace(/\.?0+e/, "E").replace("e", "E");
    return s;
  }
  function isNum(v) { return typeof v === "number" && isFinite(v); }

  /* ------------------------------------------------------------------------------- colori
     I grafici sono disegnati con i colori del tema in uso. In un foglio Excel (fondo bianco) si usano i colori del
     tema chiaro: ogni colore che coincide con una variabile del tema scuro diventa il valore chiaro della stessa. */
  var tela1 = doc.createElement("canvas"); tela1.width = tela1.height = 1;
  var g1 = tela1.getContext("2d", { willReadFrequently: true });
  function rgba(c) {
    if (c == null || typeof c !== "string") return null;
    if (/^transparent$/i.test(c.trim())) return { hex: "000000", a: 0 };
    g1.fillStyle = "#010203"; g1.fillStyle = c;
    var v = g1.fillStyle;
    if (v === "#010203" && !/^#?010203$/i.test(c.trim())) {   // colore non riconosciuto: lo disegno
      g1.clearRect(0, 0, 1, 1); g1.fillStyle = c; g1.fillRect(0, 0, 1, 1);
      var d = g1.getImageData(0, 0, 1, 1).data;
      return { hex: hex2(d[0]) + hex2(d[1]) + hex2(d[2]), a: d[3] / 255 };
    }
    if (v[0] === "#") return { hex: v.slice(1).toUpperCase(), a: 1 };
    var m = v.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(",").map(function (x) { return parseFloat(x); });
    return { hex: hex2(p[0]) + hex2(p[1]) + hex2(p[2]), a: p.length > 3 ? p[3] : 1 };
  }
  function hex2(n) { return ("0" + Math.round(n).toString(16)).slice(-2).toUpperCase(); }
  var mappaChiara = null;
  function preparaMappa() {
    mappaChiara = {};
    if (root.getAttribute("data-theme") === "light") return;
    var nomi = ["carta", "foglio", "rialzo", "tinta", "linea", "bordo", "inchiostro", "tenue", "primario", "primario-forte", "su-primario",
      "profondo", "segno", "successo", "attenzione", "errore", "serie-1", "serie-2", "serie-3", "serie-4", "serie-5", "serie-6",
      "flusso-el", "flusso-th", "flusso-acqua", "flusso-co2", "flusso-altro", "flusso-tep"];
    var d = doc.createElement("div");
    d.setAttribute("data-theme", "light"); d.style.display = "none";
    doc.body.appendChild(d);
    var cs = getComputedStyle(root), cl = getComputedStyle(d);
    nomi.forEach(function (n) {
      var a = rgba(cs.getPropertyValue("--" + n).trim()), b = rgba(cl.getPropertyValue("--" + n).trim());
      if (a && b && !mappaChiara[a.hex]) mappaChiara[a.hex] = b.hex;
    });
    d.remove();
  }
  /** colore di Chart.js → { hex, a } con i valori del tema chiaro; null se non è un colore semplice */
  function col(c) {
    var x = rgba(c);
    if (!x) return null;
    if (mappaChiara && mappaChiara[x.hex]) x = { hex: mappaChiara[x.hex], a: x.a };
    return x;
  }
  function primo(v, i) { return Array.isArray(v) ? v[i == null ? 0 : i % v.length] : v; }
  function riempimento(c) {
    if (!c) return "";
    if (c.a <= 0.01) return "<a:noFill/>";
    return '<a:solidFill><a:srgbClr val="' + c.hex + '">' + (c.a < 0.995 ? '<a:alpha val="' + Math.round(c.a * 100000) + '"/>' : "") + "</a:srgbClr></a:solidFill>";
  }
  function linea(c, larg, tratteggio) {
    if (!c || c.a <= 0.01 || larg === 0) return "<a:ln><a:noFill/></a:ln>";
    return '<a:ln w="' + Math.round(Math.max(0.25, larg || 1) * 12700) + '" cap="rnd">' + riempimento(c) +
      (tratteggio ? '<a:prstDash val="dash"/>' : "") + '<a:round/></a:ln>';
  }

  /* ------------------------------------------------------------------------------- titoli */
  function testo(t) { return Array.isArray(t) ? t.filter(Boolean).join(" ") : (t == null ? "" : String(t)); }
  function titoloDOM(cv) {
    var sel = ".ptitle,.panel-title,.eco-section-title,.chart-title,.titolo,h2,h3,h4";
    for (var n = cv.parentElement, k = 0; n && k < 7; n = n.parentElement, k++) {
      var cand = Array.prototype.slice.call(n.querySelectorAll(sel)).filter(function (e) {
        return !e.contains(cv) && (e.compareDocumentPosition(cv) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      if (cand.length) {
        var t = cand[cand.length - 1].cloneNode(true);
        t.querySelectorAll("button,small,.obtn,.hdr-btns").forEach(function (b) { b.remove(); });
        var s = t.textContent.replace(/\s+/g, " ").trim();
        if (s) return s;
      }
    }
    return "";
  }
  function titoloDi(cv, ch) {
    if (cv.dataset.pfTitolo) return cv.dataset.pfTitolo;
    var pt = ch && ch.options && ch.options.plugins && ch.options.plugins.title;
    if (pt && pt.display && testo(pt.text).trim()) return testo(pt.text).trim();
    return titoloDOM(cv) || "Grafico";
  }
  function periodoDi(cv) {
    var s = cv.dataset.pfPeriodo;
    if (!s) return "";
    var e = doc.querySelector(s);
    return e ? e.textContent.replace(/\s+/g, " ").trim().replace(/^[—–-]$/, "") : "";
  }
  function nomiFogli(fogli) {
    var usati = { fonte: 1 };
    fogli.forEach(function (f) {
      var base = String(f.nome || f.titolo || "Grafico").replace(/[\[\]:*?\/\\]/g, "-").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "") || "Grafico";
      var n = base.slice(0, 31).trim(), k = 2;
      while (usati[n.toLowerCase()]) { var suf = " (" + k++ + ")"; n = base.slice(0, 31 - suf.length).trim() + suf; }
      usati[n.toLowerCase()] = 1;
      f.nome = n;
    });
  }

  /* ------------------------------------------------------------------------------- da Chart.js a modello */
  function etichettaCat(ch, v, i) {
    var s = ch.scales && ch.scales.x, cb = ch.options && ch.options.scales && ch.options.scales.x && ch.options.scales.x.ticks && ch.options.scales.x.ticks.callback;
    if (typeof v === "number" && s && typeof cb === "function") {
      try { var t = cb.call(s, v, i, []); if (t != null && String(t).trim() !== "") return testo(t); } catch (e) { /* uso il numero */ }
    }
    return v;
  }
  function valY(p, oriz) {
    if (p == null) return null;
    if (typeof p === "number") return isFinite(p) ? p : null;
    if (typeof p === "object") { var v = oriz ? p.x : p.y; return isNum(v) ? v : null; }
    var n = Number(p); return isFinite(n) ? n : null;
  }
  function annotazioni(ch) {
    var a = ch.options && ch.options.plugins && ch.options.plugins.annotation && ch.options.plugins.annotation.annotations;
    if (!a) return [];
    var lista = Array.isArray(a) ? a : Object.keys(a).map(function (k) { return a[k]; });
    return lista.filter(function (x) { return x && x.type === "line" && x.display !== false; });
  }
  function nomeSerie(ds, i, titolo, n) {
    var l = testo(ds.label).trim();
    if (!l || /^_/.test(l)) return n === 1 && !l ? titolo : "Riferimento" + (i ? " " + i : "");
    return l;
  }
  /** tipo del grafico; i grafici misti senza 'type' generale prendono quello dei dataset (barre se ce ne sono) */
  function tipoChart(ch) {
    if (ch.config.type) return ch.config.type;
    var t = (ch.data.datasets || []).map(function (d) { return d.type; });
    return t.indexOf("bar") >= 0 ? "bar" : (t.filter(Boolean)[0] || "line");
  }
  function tipoDs(ch, ds) { return ds.type || tipoChart(ch); }
  function visibili(ch) {
    return ch.data.datasets.map(function (ds, i) { return { ds: ds, i: i }; }).filter(function (x) {
      var vis = true; try { vis = ch.isDatasetVisible(x.i); } catch (e) { vis = !x.ds.hidden; }
      return vis && Array.isArray(x.ds.data) && x.ds.data.some(function (p) { return p != null && (typeof p !== "object" || isNum(p.y) || isNum(p.x)); });
    }).map(function (x) { return x.ds; });
  }
  function simbolo(ps) {
    return { circle: "circle", rect: "square", rectRounded: "square", rectRot: "diamond", triangle: "triangle", cross: "plus", crossRot: "x", star: "star", line: "dash", dash: "dash" }[ps] || "circle";
  }
  function stileSerie(ch, ds, kind) {
    var bg = ds.backgroundColor, bd = ds.borderColor;
    var s = { kind: kind };
    var bgA = Array.isArray(bg), bdA = Array.isArray(bd);
    if (kind === "bar" || kind === "torta" || kind === "bolla") {
      s.fill = col(primo(bg)); s.line = col(primo(bd)); s.larg = isNum(primo(ds.borderWidth)) ? primo(ds.borderWidth) : 1;
      if (bgA && bg.length > 1) s.punti = bg.map(function (c, k) { return { fill: col(c), line: col(bdA ? bd[k % bd.length] : bd) }; });
    } else {   // line, area, scatter
      s.line = col(primo(bd)) || col(primo(bg)); s.larg = isNum(ds.borderWidth) ? ds.borderWidth : (kind === "scatter" ? 0 : 1.5);
      s.dash = Array.isArray(ds.borderDash) && ds.borderDash.length > 0;
      s.nolinea = ds.showLine === false || (kind === "scatter" && ds.type !== "line" && !ds.showLine);
      if (kind === "area") { var f = col(primo(bg)); s.fill = s.line ? { hex: s.line.hex, a: Math.max(0.25, f && f.hex === s.line.hex ? Math.min(f.a * 3, 0.5) : 0.3) } : f; }
      var r = ds.pointRadius != null ? ds.pointRadius : (ch.options.elements && ch.options.elements.point && ch.options.elements.point.radius);
      var rr = Array.isArray(r) ? r : [r];
      var raggio = rr.reduce(function (m, x) { return isNum(x) ? Math.max(m, x) : m; }, isNum(r) ? r : (r == null ? 3 : 0));
      s.marker = raggio > 0 ? { sym: simbolo(primo(ds.pointStyle) || "circle"), size: Math.max(2, Math.min(20, Math.round(raggio * 1.6))),
        fill: col(primo(ds.pointBackgroundColor)) || col(primo(bg)) || s.line, line: col(primo(ds.pointBorderColor)) || s.line } : null;
      var pbg = ds.pointBackgroundColor || (kind === "scatter" ? bg : null);
      if (Array.isArray(pbg) && pbg.length > 1 && s.marker) s.punti = pbg.map(function (c, k) { var pb = ds.pointBorderColor || bd; return { fill: col(c), line: col(Array.isArray(pb) ? pb[k % pb.length] : pb) }; });
    }
    return s;
  }

  /** modello di un foglio a partire da un grafico Chart.js */
  function daChart(ch, cv, modo, hook) {
    var tipo = tipoChart(ch), titolo = titoloDi(cv, ch), periodo = periodoDi(cv);
    var f = { nome: titolo, titolo: titolo + (periodo ? " — " + periodo : ""), tabella: null, grafico: null, immagine: null, nota: "" };
    var nativo = modo !== "immagine";
    if (["bar", "line", "scatter", "bubble", "pie", "doughnut"].indexOf(tipo) < 0) nativo = false;
    var m = null;
    try { m = nativo || !(hook.tabelle && hook.tabelle[cv.id]) ? modello(ch, titolo) : null; } catch (e) { m = null; if (window.console) console.warn("Playfair Excel:", e); }
    if (hook.tabelle && hook.tabelle[cv.id]) f.tabella = hook.tabelle[cv.id](ch, cv);
    else if (m) f.tabella = m.tabella;
    if (nativo && m && m.grafico) f.grafico = m.grafico;
    if (!nativo || modo === "entrambi" || !f.grafico) f.immagine = immagineChart(ch, cv, hook);
    if (!f.grafico) f.nota = "Grafico inserito come immagine: questo tipo di grafico non ha un equivalente nativo in Excel. I dati sono nella tabella.";
    else if (f.immagine) f.nota = "Grafico nativo di Excel (modificabile) e, sotto, l'immagine del grafico originale con tutte le annotazioni.";
    if (m && m.avviso && f.grafico) f.nota = (f.nota ? f.nota + " " : "") + m.avviso;
    if (!f.tabella) f.tabella = { colonne: [], righe: [] };
    return f;
  }

  function modello(ch, titolo) {
    var tipo = tipoChart(ch);
    var dss = visibili(ch);
    if (!dss.length) return null;
    if (tipo === "pie" || tipo === "doughnut") return modelloTorta(ch, dss, titolo);
    if (tipo === "scatter" || tipo === "bubble") return modelloXY(ch, dss, titolo);
    return modelloCategorie(ch, dss, titolo);
  }
  function titoloAsse(ch, id) {
    var sc = ch.options && ch.options.scales && ch.options.scales[id];
    if (!sc || !sc.title || !sc.title.display) return "";
    return testo(sc.title.text);
  }
  function limitiAsse(ch, id) {
    var sc = ch.options && ch.options.scales && ch.options.scales[id];
    if (!sc) return {};
    var o = {};
    var orig = ch.config._config && ch.config._config.options && ch.config._config.options.scales && ch.config._config.options.scales[id];
    if (orig && isNum(orig.min)) o.min = orig.min;
    if (orig && isNum(orig.max)) o.max = orig.max;
    if (sc.type === "logarithmic") o.log = true;
    if (sc.display === false) o.nascosto = true;
    if (isNum(o.min) && isNum(o.max) && o.min >= o.max) { delete o.min; delete o.max; }
    return o;
  }

  function modelloTorta(ch, dss, titolo) {
    var labels = (ch.data.labels || []).map(testo);
    var usa = ch.config.type === "pie" ? dss.slice(0, 1) : dss;
    var n = Math.max(labels.length, Math.max.apply(null, usa.map(function (d) { return d.data.length; })));
    var colonne = ["Voce"].concat(usa.map(function (d, i) { return nomeSerie(d, i, titolo, usa.length) || "Valore"; }));
    var righe = [];
    for (var k = 0; k < n; k++) righe.push([labels[k] != null ? labels[k] : "Voce " + (k + 1)].concat(usa.map(function (d) { return valY(d.data[k]); })));
    var cut = ch.options && ch.options.cutout;
    var buco = ch.config.type === "doughnut" ? Math.max(10, Math.min(90, parseFloat(cut) || 50)) : 0;
    return {
      tabella: { colonne: colonne, righe: righe },
      grafico: {
        famiglia: "torta", titolo: titolo, buco: buco, legenda: true, n: n,
        serie: usa.map(function (d, i) { return { col: i + 1, nome: colonne[i + 1], stile: stileSerie(ch, d, "torta") }; })
      }
    };
  }

  function modelloCategorie(ch, dss, titolo) {
    var oriz = ch.options && ch.options.indexAxis === "y";
    var catId = oriz ? "y" : "x", valIdDef = oriz ? "x" : "y";
    var labels = ch.data.labels && ch.data.labels.length ? ch.data.labels.slice() : null;
    var xs = null;
    if (!labels) {   // dati {x, y} su asse lineare: le x diventano categorie
      var set = {};
      dss.forEach(function (d) { d.data.forEach(function (p) { if (p && typeof p === "object" && isNum(oriz ? p.y : p.x)) set[oriz ? p.y : p.x] = 1; }); });
      xs = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
      labels = xs.map(function (x, i) { return etichettaCat(ch, x, i); });
    }
    var pos = {};
    if (xs) xs.forEach(function (x, i) { pos[x] = i; });
    var n = labels.length;
    var scale = (ch.options && ch.options.scales) || {};
    var idValore = function (d) { return (oriz ? d.xAxisID : d.yAxisID) || valIdDef; };
    var primario = valIdDef;
    if (!dss.some(function (d) { return idValore(d) === primario; })) primario = idValore(dss[0]);
    var secondario = null;
    var serie = [], colonne = [titoloAsse(ch, catId) || "Categoria"], valori = [];
    dss.forEach(function (d, i) {
      var t = tipoDs(ch, d);
      var kind = t === "bar" ? "bar" : (t === "line" && d.fill && d.fill !== false && d.fill !== "false") ? "area" : "line";
      var asse = idValore(d), sec = asse !== primario;
      if (sec) secondario = secondario || asse;
      if (sec && asse !== secondario) sec = false;
      var vals = new Array(n).fill(null);
      if (xs) d.data.forEach(function (p) { if (p && typeof p === "object") { var k = pos[oriz ? p.y : p.x]; if (k != null) vals[k] = valY(p, oriz); } });
      else for (var k = 0; k < n; k++) vals[k] = valY(d.data[k], oriz);
      colonne.push(nomeSerie(d, i, titolo, dss.length));
      valori.push(vals);
      serie.push({ col: colonne.length - 1, nome: colonne[colonne.length - 1], kind: kind, sec: sec, stile: stileSerie(ch, d, kind), stack: d.stack });
    });
    // linee di riferimento orizzontali (annotazioni) → serie costanti; le altre annotazioni non hanno equivalente
    var scartate = 0;
    annotazioni(ch).forEach(function (a) {
      var orizzontale = (isNum(a.yMin) && a.yMin === a.yMax && !isNum(a.xMin) && !isNum(a.xMax)) || (isNum(a.value) && (a.scaleID || "y").charAt(0) === "y");
      if (oriz || !orizzontale) { scartate++; return; }
      var v = isNum(a.value) ? a.value : a.yMin;
      var asse = a.yScaleID || a.scaleID || primario, sec = asse !== primario && (!secondario || secondario === asse);
      if (sec) secondario = secondario || asse;
      var nome = a.label && a.label.content && typeof a.label.content !== "function" ? testo(a.label.content) : "Riferimento";
      colonne.push(nome);
      valori.push(new Array(n).fill(v));
      serie.push({ col: colonne.length - 1, nome: nome, kind: "line", sec: sec,
        stile: { kind: "line", line: col(a.borderColor) || { hex: "1C1820", a: 1 }, larg: isNum(a.borderWidth) ? a.borderWidth : 1.5, dash: Array.isArray(a.borderDash) && a.borderDash.length > 0, marker: null } });
    });
    var righe = [];
    for (var r = 0; r < n; r++) righe.push([testo(labels[r]) === "" ? labels[r] : (typeof labels[r] === "number" ? labels[r] : testo(labels[r]))].concat(valori.map(function (v) { return v[r]; })));
    var sv = scale[primario] || {}, sc = scale[catId] || {};
    var impilato = !!(sv.stacked || sc.stacked);
    if (!impilato) {   // 'stack' comune a più serie di barre
      var st = {}; serie.forEach(function (s) { if (s.kind === "bar" && s.stack != null) st[s.stack] = (st[s.stack] || 0) + 1; });
      impilato = Object.keys(st).some(function (k) { return st[k] > 1; });
    }
    var leg = ch.options && ch.options.plugins && ch.options.plugins.legend;
    return {
      tabella: { colonne: colonne, righe: righe },
      avviso: scartate ? "Le annotazioni che non sono linee orizzontali (es. linee verticali, riquadri) non sono riportate nel grafico nativo." : "",
      grafico: {
        famiglia: "categorie", titolo: titolo, oriz: oriz, impilato: impilato, n: n,
        legenda: serie.length > 1 && (serie.length <= 30 || !(leg && leg.display === false)),
        assi: { cat: { titolo: titoloAsse(ch, catId), nascosto: sc.display === false }, val: Object.assign({ titolo: titoloAsse(ch, primario) }, limitiAsse(ch, primario)),
          val2: secondario ? Object.assign({ titolo: titoloAsse(ch, secondario) }, limitiAsse(ch, secondario)) : null },
        serie: serie
      }
    };
  }

  function modelloXY(ch, dss, titolo) {
    var colonne = [], righe = [], serie = [], c = 0, nmax = 0;
    var bolle = ch.config.type === "bubble" || dss.some(function (d) {
      return tipoDs(ch, d) !== "line" && Array.isArray(d.pointRadius) && d.pointRadius.some(function (r) { return r !== d.pointRadius[0]; });
    });
    var tx = titoloAsse(ch, "x") || "X", ty = titoloAsse(ch, "y") || "Y";
    var colonneDati = [];
    dss.forEach(function (d, i) {
      var nome = nomeSerie(d, i, titolo, dss.length);
      var isLinea = tipoDs(ch, d) === "line" || d.showLine;
      if (bolle && isLinea) return;   // Excel non combina bolle e linee
      var pts = d.data.map(function (p) { return p && typeof p === "object" ? p : null; });
      var xsv = pts.map(function (p) { return p && isNum(p.x) ? p.x : null; }), ysv = pts.map(function (p) { return p && isNum(p.y) ? p.y : null; });
      var cols = [nome + " – " + tx, nome + " – " + ty];
      var dati = [xsv, ysv];
      var sz = null;
      if (bolle) {
        sz = pts.map(function (p, k) { var r = p && isNum(p.r) ? p.r : (Array.isArray(d.pointRadius) ? d.pointRadius[k] : d.pointRadius); return isNum(r) ? Math.round(r * r * 100) / 100 : null; });
        cols.push(nome + " – dimensione bolla (r²)"); dati.push(sz);
      }
      colonne = colonne.concat(cols); colonneDati = colonneDati.concat(dati);
      nmax = Math.max(nmax, pts.length);
      serie.push({ colX: c, colY: c + 1, colS: bolle ? c + 2 : null, n: pts.length, nome: nome,
        stile: stileSerie(ch, d, bolle ? "bolla" : "scatter"), linea: isLinea });
      c += cols.length;
    });
    // annotazioni lineari → segmenti
    var scartate = 0;
    if (!bolle) {
      var tuttiX = [], tuttiY = [];
      dss.forEach(function (d) { d.data.forEach(function (p) { if (p && isNum(p.x)) tuttiX.push(p.x); if (p && isNum(p.y)) tuttiY.push(p.y); }); });
      var sx = ch.scales && ch.scales.x, sy = ch.scales && ch.scales.y;
      var x0 = sx && isNum(sx.min) && sx.max > sx.min ? sx.min : Math.min.apply(null, tuttiX.concat([0])), x1 = sx && isNum(sx.max) && sx.max > sx.min ? sx.max : Math.max.apply(null, tuttiX) * 1.05;
      var y0 = sy && isNum(sy.min) && sy.max > sy.min ? sy.min : Math.min.apply(null, tuttiY.concat([0])), y1 = sy && isNum(sy.max) && sy.max > sy.min ? sy.max : Math.max.apply(null, tuttiY) * 1.05;
      annotazioni(ch).forEach(function (a) {
        var seg = null;
        if (isNum(a.yMin) && a.yMin === a.yMax && !isNum(a.xMin)) seg = [[x0, a.yMin], [x1, a.yMin]];
        else if (isNum(a.xMin) && a.xMin === a.xMax && !isNum(a.yMin)) seg = [[a.xMin, y0], [a.xMin, y1]];
        if (!seg) { scartate++; return; }
        var nome = a.label && a.label.content && typeof a.label.content !== "function" ? testo(a.label.content) : "Riferimento";
        colonne.push(nome + " – " + tx, nome + " – " + ty);
        colonneDati.push([seg[0][0], seg[1][0]], [seg[0][1], seg[1][1]]);
        serie.push({ colX: c, colY: c + 1, n: 2, nome: nome, linea: true,
          stile: { kind: "scatter", line: col(a.borderColor) || { hex: "1C1820", a: 1 }, larg: isNum(a.borderWidth) ? a.borderWidth : 1.5, dash: Array.isArray(a.borderDash) && a.borderDash.length > 0, marker: null } });
        c += 2; nmax = Math.max(nmax, 2);
      });
    } else scartate = annotazioni(ch).length;
    for (var r = 0; r < nmax; r++) righe.push(colonneDati.map(function (v) { return v[r] != null ? v[r] : null; }));
    if (!serie.length) return null;
    return {
      tabella: { colonne: colonne, righe: righe },
      avviso: (scartate ? "Annotazioni (riquadri, etichette) non riportate nel grafico nativo." : "") + (bolle ? " Dimensione delle bolle = raggio² del punto nel grafico originale." : ""),
      grafico: { famiglia: bolle ? "bolle" : "xy", titolo: titolo, legenda: serie.length > 1, serie: serie,
        assi: { x: Object.assign({ titolo: titoloAsse(ch, "x") }, limitiAsse(ch, "x")), y: Object.assign({ titolo: titoloAsse(ch, "y") }, limitiAsse(ch, "y")) } }
    };
  }

  /* ------------------------------------------------------------------------------- immagini dei grafici */
  function sfondo() { return (window.Playfair && Playfair.colore("--foglio")) || "#ffffff"; }
  /** PNG (Uint8Array) con didascalia della fonte a partire da una tela */
  function pngDaTela(tela) {
    var c = window.Playfair && Playfair.telaConFonte ? Playfair.telaConFonte(tela, { sfondo: sfondo() }) : tela;
    var url = c.toDataURL("image/png");
    return { base64: url.split(",")[1], w: c.width, h: c.height };
  }
  /** ridisegna il grafico su una tela fuori schermo di dimensioni fisse (funziona anche per le schede nascoste) */
  function immagineChart(ch, cv, hook) {
    if (hook.immagini && hook.immagini[cv.id]) { var t = hook.immagini[cv.id](ch, cv); if (t) return pngDaTela(t); }
    var w = ch.width > 320 ? ch.width : 960, h = ch.height > 200 ? ch.height : 520;
    if (w < 900) { h = Math.round(h * 900 / w); w = 900; }
    var cfg = ch.config._config || ch.config;
    var tela = doc.createElement("canvas");
    tela.style.cssText = "position:fixed;left:-20000px;top:0;width:" + w + "px;height:" + h + "px";
    tela.width = w; tela.height = h;
    var box = doc.createElement("div"); box.style.cssText = "position:fixed;left:-20000px;top:0;width:" + w + "px;height:" + h + "px";
    box.appendChild(tela); doc.body.appendChild(box);
    var copia = null;
    try {
      var opz = Object.assign({}, cfg.options, { responsive: false, maintainAspectRatio: false, animation: false, devicePixelRatio: 1.5 });
      copia = new Chart(tela, {
        type: cfg.type,
        data: { labels: cfg.data.labels ? cfg.data.labels.slice() : undefined,
          datasets: cfg.data.datasets.map(function (d) { return Object.assign({}, d, { data: d.data.slice() }); }) },
        options: opz, plugins: cfg.plugins || []
      });
      copia.update("none");
      var r = pngDaTela(tela);
      return r;
    } catch (e) {
      return cv.width > 0 && cv.height > 0 ? pngDaTela(cv) : null;
    } finally {
      if (copia) copia.destroy();
      box.remove();
    }
  }

  /* ------------------------------------------------------------------------------- raccolta dalla pagina */
  function aspetta() { return new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(ok); }); }); }
  function raccogli() {
    var hook = window.PF_EXCEL || {};
    return Promise.resolve(hook.prima ? hook.prima() : null).then(aspetta).then(function () {
      preparaMappa();
      var fogli = [];
      Array.prototype.forEach.call(doc.querySelectorAll("canvas"), function (cv) {
        var modo = cv.dataset.pfExcel || "";
        if (modo === "no" || !cv.isConnected) return;
        var ch = window.Chart && Chart.getChart ? Chart.getChart(cv) : null;
        if (ch) { var f = daChart(ch, cv, modo, hook); if (f && (f.grafico || f.immagine)) fogli.push(f); return; }
        if (modo === "immagine" && cv.width > 1 && cv.height > 1) {
          var titolo = titoloDi(cv, null), periodo = periodoDi(cv);
          var tela = hook.immagini && hook.immagini[cv.id] ? hook.immagini[cv.id](null, cv) : cv;
          if (!tela) return;
          fogli.push({ nome: titolo, titolo: titolo + (periodo ? " — " + periodo : ""), grafico: null, immagine: pngDaTela(tela),
            tabella: hook.tabelle && hook.tabelle[cv.id] ? hook.tabelle[cv.id](null, cv) : { colonne: [], righe: [] },
            nota: "Grafico inserito come immagine: non ha un equivalente nativo in Excel. I dati sono nella tabella." });
        }
      });
      if (hook.dopo) fogli = hook.dopo(fogli) || fogli;
      return fogli;
    });
  }

  /* ------------------------------------------------------------------------------- OOXML: grafico */
  var NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart", NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main",
    NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  function rich(t, sz, b, verticale) {
    return "<c:tx><c:rich><a:bodyPr" + (verticale ? ' rot="-5400000" vert="horz"' : "") + "/><a:lstStyle/><a:p><a:pPr><a:defRPr sz=\"" + sz + "\" b=\"" + (b ? 1 : 0) + "\"/></a:pPr><a:r><a:rPr lang=\"it-IT\" sz=\"" + sz + "\" b=\"" + (b ? 1 : 0) + "\"/><a:t>" + esc(t) + "</a:t></a:r></a:p></c:rich></c:tx>";
  }
  function titoloXml(t, sz, b, vert) { return t ? "<c:title>" + rich(t, sz, b, vert) + '<c:overlay val="0"/></c:title>' : ""; }
  function strCache(vals) {
    return '<c:strCache><c:ptCount val="' + vals.length + '"/>' + vals.map(function (v, i) {
      return v == null || v === "" ? "" : '<c:pt idx="' + i + '"><c:v>' + esc(v) + "</c:v></c:pt>";
    }).join("") + "</c:strCache>";
  }
  function numCache(vals) {
    return '<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="' + vals.length + '"/>' + vals.map(function (v, i) {
      var s = isNum(v) ? numXml(v) : null; return s == null ? "" : '<c:pt idx="' + i + '"><c:v>' + s + "</c:v></c:pt>";
    }).join("") + "</c:numCache>";
  }
  function txSerie(L, s) { return "<c:tx><c:strRef><c:f>" + esc(rifAss(L.foglio, s.col != null ? s.col : s.colY, L.rTesta)) + "</c:f>" + strCache([s.nome]) + "</c:strRef></c:tx>"; }
  function txSerieXY(L, s) { return "<c:tx><c:strRef><c:f>" + esc(rifAss(L.foglio, s.colY, L.rTesta)) + "</c:f>" + strCache([s.nome]) + "</c:strRef></c:tx>"; }
  function colonnaVals(L, c, n) { return L.righe.slice(0, n).map(function (r) { return r[c]; }); }
  function refNum(L, c, n, tag) {
    var r1 = L.rTesta + 1, r2 = L.rTesta + Math.max(1, n);
    return "<c:" + tag + "><c:numRef><c:f>" + esc(rifAss(L.foglio, c, r1, r2)) + "</c:f>" + numCache(colonnaVals(L, c, n)) + "</c:numRef></c:" + tag + ">";
  }
  function refCat(L, c, n) {
    var vals = colonnaVals(L, c, n), r1 = L.rTesta + 1, r2 = L.rTesta + Math.max(1, n);
    var tuttiNum = vals.length && vals.every(isNum);
    if (tuttiNum) return "<c:cat><c:numRef><c:f>" + esc(rifAss(L.foglio, c, r1, r2)) + "</c:f>" + numCache(vals) + "</c:numRef></c:cat>";
    return "<c:cat><c:strRef><c:f>" + esc(rifAss(L.foglio, c, r1, r2)) + "</c:f>" + strCache(vals.map(function (v) { return v == null ? "" : String(v); })) + "</c:strRef></c:cat>";
  }
  function markerXml(m) {
    if (!m) return '<c:marker><c:symbol val="none"/></c:marker>';
    return '<c:marker><c:symbol val="' + m.sym + '"/><c:size val="' + m.size + '"/><c:spPr>' + riempimento(m.fill) + linea(m.line || m.fill, 0.75) + "</c:spPr></c:marker>";
  }
  function dPtXml(st, tipo) {
    if (!st.punti) return "";
    return st.punti.map(function (p, k) {
      if (tipo === "bar") return '<c:dPt><c:idx val="' + k + '"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>' + riempimento(p.fill) + linea(p.line || p.fill, st.larg) + "</c:spPr></c:dPt>";
      if (tipo === "torta") return '<c:dPt><c:idx val="' + k + '"/><c:bubble3D val="0"/><c:spPr>' + riempimento(p.fill) + linea({ hex: "FFFFFF", a: 1 }, 1.5) + "</c:spPr></c:dPt>";
      if (tipo === "bolla") return '<c:dPt><c:idx val="' + k + '"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr>' + riempimento(p.fill) + linea(p.line || p.fill, 1) + "</c:spPr></c:dPt>";
      // punti di linea/dispersione: colore del marcatore
      var m = Object.assign({}, st.marker || { sym: "circle", size: 6 }, { fill: p.fill, line: p.line || p.fill });
      return '<c:dPt><c:idx val="' + k + '"/>' + markerXml(m) + '<c:bubble3D val="0"/></c:dPt>';
    }).join("");
  }
  function serBar(L, s, idx) {
    var st = s.stile;
    return '<c:ser><c:idx val="' + idx + '"/><c:order val="' + idx + '"/>' + txSerie(L, s) + "<c:spPr>" + riempimento(st.fill || st.line) + linea(st.line, st.larg) +
      '</c:spPr><c:invertIfNegative val="0"/>' + dPtXml(st, "bar") + refCat(L, 0, L.n) + refNum(L, s.col, L.n, "val") + "</c:ser>";
  }
  function serLine(L, s, idx) {
    var st = s.stile;
    return '<c:ser><c:idx val="' + idx + '"/><c:order val="' + idx + '"/>' + txSerie(L, s) + "<c:spPr>" + (st.nolinea ? "<a:ln><a:noFill/></a:ln>" : linea(st.line, st.larg, st.dash)) + "</c:spPr>" +
      markerXml(st.marker) + dPtXml(st, "line") + refCat(L, 0, L.n) + refNum(L, s.col, L.n, "val") + '<c:smooth val="0"/></c:ser>';
  }
  function serArea(L, s, idx) {
    var st = s.stile;
    return '<c:ser><c:idx val="' + idx + '"/><c:order val="' + idx + '"/>' + txSerie(L, s) + "<c:spPr>" + riempimento(st.fill) + linea(st.line, st.larg, st.dash) + "</c:spPr>" +
      refCat(L, 0, L.n) + refNum(L, s.col, L.n, "val") + "</c:ser>";
  }
  function serPie(L, s, idx) {
    var st = s.stile;
    if (!st.punti) st = Object.assign({}, st, { punti: [{ fill: st.fill, line: st.line }] });
    return '<c:ser><c:idx val="' + idx + '"/><c:order val="' + idx + '"/>' + txSerie(L, s) + dPtXml(st, "torta") + refCat(L, 0, L.n) + refNum(L, s.col, L.n, "val") + "</c:ser>";
  }
  function serXY(L, s, idx) {
    var st = s.stile;
    var lin = s.linea && !st.nolinea ? linea(st.line, st.larg || 1.5, st.dash) : "<a:ln><a:noFill/></a:ln>";
    var mk = s.linea ? st.marker : (st.marker || { sym: "circle", size: 6, fill: st.fill || st.line, line: st.line });
    return '<c:ser><c:idx val="' + idx + '"/><c:order val="' + idx + '"/>' + txSerieXY(L, s) + "<c:spPr>" + lin + "</c:spPr>" + markerXml(mk) +
      dPtXml(Object.assign({}, st, { marker: mk }), "xy") + refNum(L, s.colX, s.n, "xVal") + refNum(L, s.colY, s.n, "yVal") + '<c:smooth val="0"/></c:ser>';
  }
  function serBolla(L, s, idx) {
    var st = s.stile;
    return '<c:ser><c:idx val="' + idx + '"/><c:order val="' + idx + '"/>' + txSerieXY(L, s) + "<c:spPr>" + riempimento(st.fill || st.line) + linea(st.line, 1) +
      '</c:spPr><c:invertIfNegative val="0"/>' + dPtXml(st, "bolla") + refNum(L, s.colX, s.n, "xVal") + refNum(L, s.colY, s.n, "yVal") + refNum(L, s.colS, s.n, "bubbleSize") + '<c:bubble3D val="0"/></c:ser>';
  }
  function scaling(a) {
    a = a || {};
    return "<c:scaling>" + (a.log ? '<c:logBase val="10"/>' : "") + '<c:orientation val="' + (a.inverti ? "maxMin" : "minMax") + '"/>' +
      (isNum(a.max) ? '<c:max val="' + numXml(a.max) + '"/>' : "") + (isNum(a.min) ? '<c:min val="' + numXml(a.min) + '"/>' : "") + "</c:scaling>";
  }
  var GRIGLIA = '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>';
  var LINEA_ASSE = '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="8C8C8C"/></a:solidFill></a:ln></c:spPr>';
  function catAx(id, cross, pos, a, opz) {
    a = a || {};
    return '<c:catAx><c:axId val="' + id + '"/>' + scaling({ inverti: opz.inverti }) + '<c:delete val="' + (opz.cancella || a.nascosto ? 1 : 0) + '"/><c:axPos val="' + pos + '"/>' +
      titoloXml(a.titolo, 1000, false, pos === "l" || pos === "r") + '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>' +
      LINEA_ASSE + '<c:crossAx val="' + cross + '"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>';
  }
  function valAx(id, cross, pos, a, opz) {
    a = a || {};
    return '<c:valAx><c:axId val="' + id + '"/>' + scaling(a) + '<c:delete val="' + (a.nascosto ? 1 : 0) + '"/><c:axPos val="' + pos + '"/>' + (opz.griglia ? GRIGLIA : "") +
      titoloXml(a.titolo, 1000, false, pos === "l" || pos === "r") + '<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
      LINEA_ASSE + '<c:crossAx val="' + cross + '"/>' + (opz.crosses === "max" ? '<c:crosses val="max"/>' : '<c:crosses val="autoZero"/>') +
      '<c:crossBetween val="' + (opz.midCat ? "midCat" : "between") + '"/></c:valAx>';
  }
  function xmlGrafico(g, L) {
    var corpo = "", assi = "", idx = 0;
    if (g.famiglia === "torta") {
      var buco = g.buco > 0;
      corpo = (buco ? "<c:doughnutChart>" : "<c:pieChart>") + '<c:varyColors val="1"/>' + g.serie.map(function (s) { return serPie(L, s, idx++); }).join("") +
        '<c:dLbls><c:numFmt formatCode="0.0%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>' +
        '<c:firstSliceAng val="0"/>' + (buco ? '<c:holeSize val="' + Math.round(g.buco) + '"/></c:doughnutChart>' : "</c:pieChart>");
    } else if (g.famiglia === "xy" || g.famiglia === "bolle") {
      if (g.famiglia === "xy") corpo = '<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>' + g.serie.map(function (s) { return serXY(L, s, idx++); }).join("") + '<c:axId val="500100"/><c:axId val="500200"/></c:scatterChart>';
      else corpo = '<c:bubbleChart><c:varyColors val="0"/>' + g.serie.map(function (s) { return serBolla(L, s, idx++); }).join("") + '<c:bubbleScale val="100"/><c:showNegBubbles val="0"/><c:sizeRepresents val="area"/><c:axId val="500100"/><c:axId val="500200"/></c:bubbleChart>';
      assi = valAx(500100, 500200, "b", g.assi.x, { midCat: true }) + valAx(500200, 500100, "l", g.assi.y, { griglia: true, midCat: true });
    } else {
      var gruppi = [["area", false], ["bar", false], ["line", false], ["area", true], ["bar", true], ["line", true]];
      gruppi.forEach(function (gr) {
        var ss = g.serie.filter(function (s) { return s.kind === gr[0] && !!s.sec === gr[1]; });
        if (!ss.length) return;
        var ids = gr[1] ? '<c:axId val="500300"/><c:axId val="500400"/>' : '<c:axId val="500100"/><c:axId val="500200"/>';
        if (gr[0] === "bar") {
          corpo += '<c:barChart><c:barDir val="' + (g.oriz ? "bar" : "col") + '"/><c:grouping val="' + (g.impilato ? "stacked" : "clustered") + '"/><c:varyColors val="0"/>' +
            ss.map(function (s) { return serBar(L, s, idx++); }).join("") + '<c:gapWidth val="' + (g.impilato ? 60 : 80) + '"/>' + (g.impilato ? '<c:overlap val="100"/>' : "") + ids + "</c:barChart>";
        } else if (gr[0] === "area") {
          corpo += '<c:areaChart><c:grouping val="' + (g.impilato ? "stacked" : "standard") + '"/><c:varyColors val="0"/>' + ss.map(function (s) { return serArea(L, s, idx++); }).join("") + ids + "</c:areaChart>";
        } else {
          corpo += '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' + ss.map(function (s) { return serLine(L, s, idx++); }).join("") + '<c:marker val="1"/>' + ids + "</c:lineChart>";
        }
      });
      var posCat = g.oriz ? "l" : "b", posVal = g.oriz ? "b" : "l";
      assi = catAx(500100, 500200, posCat, g.assi.cat, { inverti: g.oriz }) + valAx(500200, 500100, posVal, g.assi.val, { griglia: true, crosses: g.oriz ? "max" : null });
      if (g.serie.some(function (s) { return s.sec; })) {
        assi += catAx(500300, 500400, posCat, {}, { cancella: true, inverti: g.oriz }) + valAx(500400, 500300, g.oriz ? "t" : "r", g.assi.val2, { crosses: "max" });
      }
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<c:chartSpace xmlns:c="' + NS_C + '" xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '"><c:date1904 val="0"/><c:lang val="it-IT"/><c:roundedCorners val="0"/>' +
      "<c:chart>" + (g.titolo ? titoloXml(g.titolo, 1300, true) + '<c:autoTitleDeleted val="0"/>' : '<c:autoTitleDeleted val="1"/>') +
      "<c:plotArea><c:layout/>" + corpo + assi + '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>' +
      (g.legenda ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' : "") +
      '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>' +
      '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr>' +
      '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:solidFill><a:srgbClr val="404040"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="it-IT"/></a:p></c:txPr>' +
      "</c:chartSpace>";
  }

  /* ------------------------------------------------------------------------------- OOXML: foglio, disegno, cartella */
  var S_TESTA = 1, S_TITOLO = 2, S_FONTE = 3, S_NOTA = 4, S_A_CAPO = 5;
  function cella(c, r, v, s) {
    var ref = rif(c, r), st = s ? ' s="' + s + '"' : "";
    if (v == null || v === "") return s ? '<c r="' + ref + '"' + st + "/>" : "";
    if (isNum(v)) return '<c r="' + ref + '"' + st + "><v>" + numXml(v) + "</v></c>";
    if (typeof v === "boolean") return '<c r="' + ref + '"' + st + ' t="b"><v>' + (v ? 1 : 0) + "</v></c>";
    return '<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + "</t></is></c>";
  }
  function xmlFoglio(righeTesta, tab, rTesta, larghezze, conDisegno) {
    var out = [];
    righeTesta.forEach(function (rt, i) { if (rt) out.push('<row r="' + (i + 1) + '">' + cella(0, i + 1, rt[0], rt[1]) + "</row>"); });
    if (tab && tab.colonne.length) {
      out.push('<row r="' + rTesta + '">' + tab.colonne.map(function (c, j) { return cella(j, rTesta, c, S_TESTA); }).join("") + "</row>");
      tab.righe.forEach(function (riga, i) {
        var r = rTesta + 1 + i, cs = "";
        for (var j = 0; j < riga.length; j++) cs += cella(j, r, riga[j], 0);
        if (cs) out.push('<row r="' + r + '">' + cs + "</row>");
      });
    }
    var cols = larghezze.length ? "<cols>" + larghezze.map(function (w, j) { return '<col min="' + (j + 1) + '" max="' + (j + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("") + "</cols>" : "";
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + NS_R + '">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>' + cols + "<sheetData>" + out.join("") + "</sheetData>" +
      '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' + (conDisegno ? '<drawing r:id="rId1"/>' : "") + "</worksheet>";
  }
  function larghezzeTab(tab) {
    if (!tab || !tab.colonne.length) return [];
    return tab.colonne.map(function (c, j) {
      var m = String(c).length;
      for (var i = 0; i < Math.min(tab.righe.length, 400); i++) {
        var v = tab.righe[i][j]; if (v == null) continue;
        var l = isNum(v) ? String(Math.round(v * 100) / 100).length + 2 : String(v).length;
        if (l > m) m = l;
      }
      return Math.max(8, Math.min(42, m + 2));
    });
  }
  function ancora(col, riga, cx, cy) {
    return "<xdr:from><xdr:col>" + col + "</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>" + riga + "</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>" +
      '<xdr:ext cx="' + Math.round(cx) + '" cy="' + Math.round(cy) + '"/>';
  }
  function xmlDisegno(oggetti) {
    var corpo = oggetti.map(function (o, i) {
      var id = i + 2;
      if (o.tipo === "grafico") {
        return "<xdr:oneCellAnchor>" + ancora(o.col, o.riga, o.cx, o.cy) +
          '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + id + '" name="Grafico ' + (i + 1) + '" descr="' + esc(o.descr) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
          '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="' + NS_C + '"><c:chart xmlns:c="' + NS_C + '" r:id="' + o.rid + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>';
      }
      return "<xdr:oneCellAnchor>" + ancora(o.col, o.riga, o.cx, o.cy) +
        '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + id + '" name="Immagine ' + (i + 1) + '" descr="' + esc(o.descr) + '"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
        '<xdr:blipFill><a:blip r:embed="' + o.rid + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
        '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + Math.round(o.cx) + '" cy="' + Math.round(o.cy) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>';
    }).join("");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '">' + corpo + "</xdr:wsDr>";
  }
  function rels(lista) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      lista.map(function (r) { return '<Relationship Id="' + r[0] + '" Type="' + r[1] + '" Target="' + esc(r[2]) + '"/>'; }).join("") + "</Relationships>";
  }
  var T_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
  var STILI = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="5"><font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF1C1820"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="15"/><color rgb="FF8A1530"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><i/><sz val="9"/><color rgb="FF5F5868"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><sz val="10"/><color rgb="FF5F5868"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEFEDF1"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF847C8E"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';

  function nomeStrumento() {
    var h = window.PF_EXCEL && window.PF_EXCEL.strumento;
    if (h) return h;
    var m = location.pathname.match(/(playfair-[a-z]|sankey)\.html?$/i);
    if (m) return m[1].toLowerCase() === "sankey" ? "Playfair Sankey" : "Playfair-" + m[1].slice(-1).toUpperCase();
    return "Playfair";
  }
  function codiceFile() {
    var m = location.pathname.match(/playfair-([a-z])\.html?$/i);
    if (m) return "playfair-" + m[1].toLowerCase();
    if (/sankey\.html?$/i.test(location.pathname)) return "playfair-sankey";
    return "playfair";
  }
  function fileCaricati() {
    var nomi = [];
    Array.prototype.forEach.call(doc.querySelectorAll('input[type="file"]'), function (i) {
      Array.prototype.forEach.call(i.files || [], function (f) { nomi.push(f.__pfOrigine || f.name); });
    });
    return nomi;
  }

  /** crea il Blob .xlsx */
  function crea(fogli, meta) {
    meta = meta || {};
    var P = window.Playfair || {};
    var fonte = P.fonte ? P.fonte() : "Fonte: Playfair — playfair.statocritico.it";
    var oggi = new Date();
    nomiFogli(fogli);
    var zip = new JSZip();
    var ct = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>', '<Default Extension="png" ContentType="image/png"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'];
    var wbRels = [], sheets = [], nGraf = 0, nImg = 0, nDis = 0;
    var tutti = fogli.slice();
    var strumento = meta.strumento || nomeStrumento();
    var files = meta.file || fileCaricati();
    // foglio «Fonte»
    var righeFonte = [
      ["Fonte", fonte],
      ["Strumento", strumento + " — https://playfair.statocritico.it/" + (location.pathname.split("/").pop() || "")],
      ["Data dell'elaborazione", (P.dataIt ? P.dataIt(oggi) : oggi.toLocaleDateString("it-IT")) + " " + oggi.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })],
      ["Dati", "Forniti dall'utente" + (files.length ? " (file: " + files.join(", ") + ")" : "") + " ed elaborati nel suo browser: nessun dato è stato inviato a server. Playfair non ne verifica la correttezza."],
      ["Licenza del codice", "GNU Affero General Public License v3.0 (AGPL-3.0) con termini aggiuntivi — https://playfair.statocritico.it/licenza.html"],
      ["Come citare", "Fonte: Playfair — playfair.statocritico.it (elaborazione del " + (P.dataIt ? P.dataIt(oggi) : "") + ")"],
      ["Grafici", "Grafici nativi di Excel, modificabili, collegati alle tabelle di ciascun foglio; i grafici senza equivalente nativo sono inseriti come immagine PNG con la tabella dei dati."],
      ["Generato con", "Playfair (AGPL-3.0) · JSZip (MIT) · Chart.js (MIT) per le immagini dei grafici"]
    ];
    if (meta.righeFonte) righeFonte = righeFonte.concat(meta.righeFonte);
    righeFonte.push(["", ""], ["Fogli", ""]);
    tutti.forEach(function (f) { righeFonte.push([f.nome, (f.titolo || f.nome) + (f.grafico ? " — grafico nativo" : "") + (f.immagine ? (f.grafico ? " + immagine" : " — immagine") : "") + (f.solaTabella ? " — tabella" : "")]); });

    tutti.forEach(function (f, i) {
      var n = i + 1;
      var tab = f.tabella || { colonne: [], righe: [] };
      var testa = [[f.titolo || f.nome, S_TITOLO], [fonte, S_FONTE], f.nota ? [f.nota, S_NOTA] : null];
      var rTesta = 5;
      var larg = larghezzeTab(tab);
      var oggetti = [], relDis = [];
      var colDis = tab.colonne.length ? tab.colonne.length + 1 : 0;
      var rigaDis = rTesta - 1;
      if (f.grafico) {
        nGraf++;
        var L = { foglio: f.nome, rTesta: rTesta, righe: tab.righe, n: f.grafico.n != null ? f.grafico.n : tab.righe.length };
        zip.file("xl/charts/chart" + nGraf + ".xml", xmlGrafico(f.grafico, L));
        ct.push('<Override PartName="/xl/charts/chart' + nGraf + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>');
        relDis.push(["rId" + (relDis.length + 1), T_REL + "chart", "../charts/chart" + nGraf + ".xml"]);
        var gcx = f.grafico.famiglia === "torta" ? 560 : 760, gcy = f.grafico.famiglia === "torta" ? 400 : 430;
        oggetti.push({ tipo: "grafico", col: colDis, riga: rigaDis, cx: gcx * EMU, cy: gcy * EMU, rid: relDis[relDis.length - 1][0], descr: f.titolo || f.nome });
        rigaDis += Math.ceil(gcy / 20) + 2;
      }
      if (f.immagine) {
        nImg++;
        zip.file("xl/media/image" + nImg + ".png", f.immagine.base64, { base64: true });
        relDis.push(["rId" + (relDis.length + 1), T_REL + "image", "../media/image" + nImg + ".png"]);
        var maxW = 900, sc = Math.min(1, maxW / f.immagine.w);
        oggetti.push({ tipo: "immagine", col: colDis, riga: rigaDis, cx: f.immagine.w * sc * EMU, cy: f.immagine.h * sc * EMU, rid: relDis[relDis.length - 1][0], descr: f.titolo || f.nome });
      }
      if (oggetti.length) {
        nDis++;
        zip.file("xl/drawings/drawing" + nDis + ".xml", xmlDisegno(oggetti));
        zip.file("xl/drawings/_rels/drawing" + nDis + ".xml.rels", rels(relDis));
        ct.push('<Override PartName="/xl/drawings/drawing' + nDis + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>');
        zip.file("xl/worksheets/_rels/sheet" + n + ".xml.rels", rels([["rId1", T_REL + "drawing", "../drawings/drawing" + nDis + ".xml"]]));
      }
      zip.file("xl/worksheets/sheet" + n + ".xml", xmlFoglio(testa, tab, rTesta, larg, oggetti.length > 0));
      ct.push('<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
      sheets.push('<sheet name="' + esc(f.nome) + '" sheetId="' + n + '" r:id="rId' + n + '"/>');
      wbRels.push(["rId" + n, T_REL + "worksheet", "worksheets/sheet" + n + ".xml"]);
    });
    // foglio Fonte
    var nF = tutti.length + 1;
    var tabF = { colonne: ["Voce", "Dettaglio"], righe: righeFonte };
    var xmlF = xmlFoglio([["Fonte e licenza", S_TITOLO], [fonte, S_FONTE]], tabF, 4, [26, 110], false).replace(/<c r="B(\d+)" t="inlineStr">/g, '<c r="B$1" s="' + S_A_CAPO + '" t="inlineStr">');
    zip.file("xl/worksheets/sheet" + nF + ".xml", xmlF);
    ct.push('<Override PartName="/xl/worksheets/sheet' + nF + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
    sheets.push('<sheet name="Fonte" sheetId="' + nF + '" r:id="rId' + nF + '"/>');
    wbRels.push(["rId" + nF, T_REL + "worksheet", "worksheets/sheet" + nF + ".xml"]);
    wbRels.push(["rId" + (nF + 1), T_REL + "styles", "styles.xml"]);

    zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' + ct.join("") + "</Types>");
    zip.file("_rels/.rels", rels([["rId1", T_REL + "officeDocument", "xl/workbook.xml"],
      ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"],
      ["rId3", T_REL + "extended-properties", "docProps/app.xml"]]));
    zip.file("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + NS_R + '">' +
      '<workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000" activeTab="0"/></bookViews><sheets>' + sheets.join("") + "</sheets></workbook>");
    zip.file("xl/_rels/workbook.xml.rels", rels(wbRels));
    zip.file("xl/styles.xml", STILI);
    var iso = oggi.toISOString().replace(/\.\d+Z$/, "Z");
    zip.file("docProps/core.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>" + esc(meta.titolo || strumento + " — grafici") + "</dc:title><dc:subject>" + esc(fonte) + "</dc:subject><dc:creator>Playfair — playfair.statocritico.it</dc:creator><cp:keywords>Playfair; energia; grafici</cp:keywords>" +
      '<dc:description>' + esc(fonte) + '</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + iso + "</dcterms:modified></cp:coreProperties>");
    zip.file("docProps/app.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Playfair</Application><Company>Stato Critico</Company></Properties>');
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  /** raccoglie (o riceve) i fogli, crea il file e lo scarica: → { nome, fogli } oppure { vuoto: true } */
  function scarica(fogli, meta) {
    meta = meta || {};
    return Promise.resolve(fogli || raccogli()).then(function (lista) {
      if (!lista || !lista.length) return { vuoto: true };
      if (!mappaChiara) preparaMappa();
      return crea(lista, meta).then(function (blob) {
        var P = window.Playfair || {};
        var nome = (meta.nomeFile || codiceFile()) + "_" + (P.dataIso ? P.dataIso() : new Date().toISOString().slice(0, 10)) + ".xlsx";
        if (!meta.nonScaricare) (P.scarica || function () {})(blob, nome);
        window.PlayfairExcel.ultimo = { nome: nome, blob: blob, fogli: lista.map(function (f) { return { nome: f.nome, titolo: f.titolo, nativo: !!f.grafico, immagine: !!f.immagine, tipo: f.grafico && f.grafico.famiglia }; }) };
        return { nome: nome, fogli: lista.length + 1, blob: blob };
      });
    });
  }

  window.PlayfairExcel = { raccogli: raccogli, crea: crea, scarica: scarica, daChart: function (ch, titolo) { preparaMappa(); return daChart(ch, ch.canvas, "", {}); }, pngDaTela: pngDaTela, colore: col, preparaMappa: preparaMappa };
})();
