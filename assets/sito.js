/* =====================================================================================================
   Playfair · sito.js — vanilla, senza dipendenze.
   - tema chiaro/scuro (localStorage 'pf-tema', evento 'pf-tema' su window)
   - menu del telefono, voce attiva automatica (aria-current)
   - tooltip accessibili da [data-tip]
   - trascinamento dei file automatico su ogni <input type="file"> (anche creati dopo: MutationObserver)
   - fogli di calcolo (.xlsx .xls .ods) convertiti in CSV prima che li veda lo strumento (SheetJS caricato solo se serve)
   - fonte uniforme nei file scaricati e pulsante «Scarica in Excel» ([data-pf-excel], JSZip + excel.js caricati a richiesta)
   API: window.Playfair = { tema, drop, colore, colori, annuncia, versione, fonte, scarica, scaricaImmagine, telaConFonte,
                            rigaFonteCsv, carica, esportaExcel, fogliDiCalcolo }
   ===================================================================================================== */
(function () {
  "use strict";
  if (window.Playfair && window.Playfair.versione) return;   // già caricato
  var doc = document, root = doc.documentElement;
  root.classList.add("pf-js");
  /* cartella assets/ ricavata dall'indirizzo di questo script: serve a caricare le librerie solo quando servono */
  var BASE = (function () {
    var sc = doc.currentScript || doc.querySelector('script[src*="sito.js"]');
    var src = sc && sc.src ? sc.src : "assets/sito.js";
    return src.replace(/sito\.js(?:[?#].*)?$/, "");
  })();

  /* ------------------------------------------------------------------------------- tema */
  function temaAttuale() {
    var t = root.dataset.theme;
    if (t === "light" || t === "dark") return t;
    return "dark";                                     // predefinito del sito
  }
  /** Playfair.tema() → 'dark' | 'light'; tema('light'|'dark') imposta; tema('cambia') alterna. */
  function tema(valore) {
    if (valore === undefined) return temaAttuale();
    var nuovo = valore === "cambia" || valore === "toggle" ? (temaAttuale() === "dark" ? "light" : "dark") : valore;
    if (nuovo !== "light" && nuovo !== "dark") return temaAttuale();
    root.dataset.theme = nuovo;
    try { localStorage.setItem("pf-tema", nuovo); } catch (e) { /* archiviazione non disponibile */ }
    aggiornaPulsantiTema();
    var ev;
    try { ev = new CustomEvent("pf-tema", { detail: { tema: nuovo } }); }
    catch (e) { ev = doc.createEvent("CustomEvent"); ev.initCustomEvent("pf-tema", false, false, { tema: nuovo }); }
    window.dispatchEvent(ev);
    return nuovo;
  }
  function aggiornaPulsantiTema() {
    var scuro = temaAttuale() === "dark";
    doc.querySelectorAll(".pf-tema").forEach(function (b) {
      b.setAttribute("aria-pressed", scuro ? "false" : "true");
      b.setAttribute("aria-label", scuro ? "Passa al tema chiaro" : "Passa al tema scuro");
      if (!b.hasAttribute("data-tip")) b.setAttribute("data-tip", scuro ? "Tema chiaro" : "Tema scuro");
      else b.setAttribute("data-tip", scuro ? "Tema chiaro" : "Tema scuro");
    });
  }
  /** valore calcolato di una variabile CSS, es. Playfair.colore('--flusso-el') */
  function colore(nome, el) {
    var n = nome.indexOf("--") === 0 ? nome : "--" + nome;
    return getComputedStyle(el || root).getPropertyValue(n).trim();
  }
  function colori() {
    var nomi = ["carta", "foglio", "rialzo", "tinta", "linea", "bordo", "inchiostro", "tenue", "primario", "primario-forte",
      "su-primario", "profondo", "segno", "successo", "attenzione", "errore", "serie-1", "serie-2", "serie-3", "serie-4",
      "serie-5", "serie-6", "flusso-el", "flusso-th", "flusso-acqua", "flusso-co2", "flusso-altro", "testo", "titoli", "mono"];
    var o = {};
    nomi.forEach(function (n) { o[n] = colore(n); });
    return o;
  }

  /* ------------------------------------------------------------------------------- annunci (aria-live) */
  var annuncio, timerAnnuncio;
  function annuncia(testo) {
    if (!annuncio) {
      annuncio = doc.createElement("div");
      annuncio.className = "pf-annuncio"; annuncio.setAttribute("role", "status"); annuncio.setAttribute("aria-live", "polite");
      doc.body.appendChild(annuncio);
    }
    annuncio.textContent = testo;
    annuncio.classList.add("visibile");
    clearTimeout(timerAnnuncio);
    timerAnnuncio = setTimeout(function () { annuncio.classList.remove("visibile"); }, 3200);
  }

  /* ------------------------------------------------------------------------------- testata */
  function nomePagina(href) {
    var a = doc.createElement("a"); a.href = href;
    var p = a.pathname.replace(/\/+$/, "/");
    var f = p.substring(p.lastIndexOf("/") + 1);
    return (f === "" ? "index.html" : f).replace(/\.html?$/, "").toLowerCase();
  }
  function voceAttiva() {
    var links = doc.querySelectorAll(".pf-menu a[href]");
    var gia = doc.querySelector(".pf-menu a[aria-current]");
    var qui = nomePagina(location.href);
    var marchio = doc.querySelector(".pf-marchio");
    if (marchio && qui === "index" && !marchio.hasAttribute("aria-current")) marchio.setAttribute("aria-current", "page");
    if (gia || !links.length) return;
    links.forEach(function (a) { if (nomePagina(a.href) === qui) a.setAttribute("aria-current", "page"); });
  }
  function menuMobile() {
    var btn = doc.querySelector(".pf-menu-apri"), menu = doc.getElementById("pf-menu");
    if (!btn || !menu) return;
    function chiudi(fuoco) { menu.classList.remove("aperto"); btn.setAttribute("aria-expanded", "false"); if (fuoco) btn.focus(); }
    btn.addEventListener("click", function () {
      var aperto = !menu.classList.contains("aperto");
      menu.classList.toggle("aperto", aperto); btn.setAttribute("aria-expanded", aperto ? "true" : "false");
      if (aperto) { var p = menu.querySelector("a"); if (p) p.focus(); }
    });
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu.classList.contains("aperto")) chiudi(true); });
    doc.addEventListener("click", function (e) {
      if (menu.classList.contains("aperto") && !menu.contains(e.target) && !btn.contains(e.target)) chiudi(false);
    });
    window.addEventListener("resize", function () { if (window.innerWidth > 960 && menu.classList.contains("aperto")) chiudi(false); });
  }
  function altezzaTestata() {
    var t = doc.querySelector(".pf-testata");
    if (!t) return;
    var f = function () { root.style.setProperty("--alto-testata", t.offsetHeight + "px"); };
    f();
    if ("ResizeObserver" in window) new ResizeObserver(f).observe(t); else window.addEventListener("resize", f);
  }

  /* ------------------------------------------------------------------------------- tooltip */
  var bolla, bersaglio = null, timerTip, idTip = 0;
  function preparaTip(el) {
    if (el.__pfTip) { aggiornaDescrizione(el); return; }
    el.__pfTip = true;
    aggiornaDescrizione(el);
  }
  function aggiornaDescrizione(el) {
    var testo = el.getAttribute("data-tip") || "";
    var id = el.getAttribute("data-pf-tip-id");
    var span = id && doc.getElementById(id);
    if (!span) {
      id = "pf-tipdesc-" + (++idTip);
      span = doc.createElement("span"); span.id = id; span.className = "solo-lettori"; span.hidden = true;
      el.setAttribute("data-pf-tip-id", id);
      (doc.body || root).appendChild(span);
      var gia = (el.getAttribute("aria-describedby") || "").trim();
      el.setAttribute("aria-describedby", (gia ? gia + " " : "") + id);
    }
    span.textContent = testo;
  }
  function mostraTip(el) {
    var testo = el.getAttribute("data-tip");
    if (!testo) return;
    if (!bolla) {
      bolla = doc.createElement("div"); bolla.className = "pf-tip"; bolla.setAttribute("role", "tooltip"); bolla.setAttribute("aria-hidden", "true");
      doc.body.appendChild(bolla);
    }
    bersaglio = el;
    bolla.textContent = testo;
    bolla.classList.remove("visibile", "sopra");
    var r = el.getBoundingClientRect(), vw = doc.documentElement.clientWidth, vh = window.innerHeight, m = 8;
    bolla.style.left = "0px"; bolla.style.top = "0px";
    var b = bolla.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var x = Math.max(m, Math.min(vw - b.width - m, cx - b.width / 2));
    var y = r.bottom + 10, sopra = false;
    if (y + b.height > vh - m && r.top - b.height - 10 > m) { y = r.top - b.height - 10; sopra = true; }
    bolla.style.left = Math.round(x) + "px"; bolla.style.top = Math.round(y) + "px";
    bolla.style.setProperty("--freccia-x", Math.max(12, Math.min(b.width - 12, cx - x)) + "px");
    bolla.classList.toggle("sopra", sopra);
    requestAnimationFrame(function () { if (bersaglio === el) bolla.classList.add("visibile"); });
  }
  function nascondiTip() {
    clearTimeout(timerTip); bersaglio = null;
    if (bolla) bolla.classList.remove("visibile");
  }
  function tooltip() {
    doc.querySelectorAll("[data-tip]").forEach(preparaTip);
    var ritardo = function () { return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350; };
    doc.addEventListener("mouseover", function (e) {
      var el = e.target.closest && e.target.closest("[data-tip]");
      if (!el || el === bersaglio) return;
      if (!el.__pfTip) preparaTip(el);
      clearTimeout(timerTip);
      var subito = bolla && bolla.classList.contains("visibile");
      timerTip = setTimeout(function () { mostraTip(el); }, subito ? 60 : ritardo());
      bersaglio = el;
    });
    doc.addEventListener("mouseout", function (e) {
      var el = e.target.closest && e.target.closest("[data-tip]");
      if (el && (!e.relatedTarget || !el.contains(e.relatedTarget))) nascondiTip();
    });
    doc.addEventListener("focusin", function (e) {
      var el = e.target.closest && e.target.closest("[data-tip]");
      if (!el) return;
      if (!el.__pfTip) preparaTip(el);
      // solo con focus da tastiera
      var tastiera = true;
      try { tastiera = el.matches(":focus-visible"); } catch (x) { /* browser vecchio */ }
      if (!tastiera) return;
      clearTimeout(timerTip); bersaglio = el;
      timerTip = setTimeout(function () { mostraTip(el); }, 150);
    });
    doc.addEventListener("focusout", nascondiTip);
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape") nascondiTip(); });
    window.addEventListener("scroll", nascondiTip, { passive: true });
    doc.addEventListener("mousedown", nascondiTip);
  }

  /* ------------------------------------------------------------------------------- trascinamento dei file */
  var zone = [];                      // { input, zona, nome, opz }
  var velo, timerVelo, trascinoInCorso = false;

  function attivi() {
    zone = zone.filter(function (z) { return z.input.isConnected; });
    return zone.filter(function (z) { return !z.input.disabled; });
  }
  function nascosto(el) {
    if (el.hidden || el.type === "hidden") return true;
    var cs = getComputedStyle(el);   // solo l'input stesso: dentro una scheda nascosta resta "visibile"
    return cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0 ||
      (parseFloat(cs.width) <= 1 && parseFloat(cs.height) <= 1);
  }
  function etichetta(input, opz) {
    if (opz.etichetta) return opz.etichetta;
    if (input.dataset.pfEtichetta) return input.dataset.pfEtichetta;
    var acc = (input.getAttribute("accept") || "").toLowerCase();
    if ((acc.indexOf(".csv") >= 0 || acc.indexOf("text/csv") >= 0) && /\.(xlsx|ods)/.test(acc)) return "il file CSV, Excel o LibreOffice";
    if (acc.indexOf(".csv") >= 0 || acc.indexOf("text/csv") >= 0) return "il file CSV";
    if (acc.indexOf(".json") >= 0) return "il file JSON";
    if (acc.indexOf("image") >= 0) return "l'immagine";
    return "il file";
  }
  function accetta(input, file) {
    var acc = (input.getAttribute("accept") || "").trim();
    if (!acc) return true;
    var nome = file.name.toLowerCase(), tipo = (file.type || "").toLowerCase();
    return acc.split(",").some(function (a) {
      a = a.trim().toLowerCase();
      if (!a) return false;
      if (a[0] === ".") return nome.slice(-a.length) === a;
      if (a.slice(-2) === "/*") return tipo.indexOf(a.slice(0, -1)) === 0;
      return tipo === a;
    });
  }
  function pattern(z) {
    var p = z.opz.pattern || z.input.getAttribute("data-pf-pattern");
    if (!p) return null;
    if (p instanceof RegExp) return p;
    try { return new RegExp(p, "i"); } catch (e) { return null; }
  }
  function mostraNome(z) {
    var f = z.input.files;
    var testo = f && f.length ? Array.prototype.map.call(f, function (x) { return (x.__pfOrigine) || x.name; }).join(", ") : (z.testoVuoto || "");
    if (z.nome) z.nome.textContent = testo;
    z.zona.classList.toggle("pieno", !!(f && f.length));
  }
  /** assegna dei File a un input come se li avesse scelti l'utente, poi lancia 'change' */
  function imposta(z, files) {
    if (!files.length) return false;
    var dt;
    try { dt = new DataTransfer(); } catch (e) { dt = null; }
    if (dt) {
      (z.input.multiple ? files : files.slice(0, 1)).forEach(function (f) { dt.items.add(f); });
      try { z.input.files = dt.files; } catch (e) { return false; }
    } else return false;
    z.input.dispatchEvent(new Event("change", { bubbles: true }));
    mostraNome(z);
    return true;
  }

  /**
   * Playfair.drop(inputEl, opzioni) — rende un input file una zona di trascinamento.
   * opzioni: { zona: elemento|selettore, pattern: RegExp|stringa, etichetta: 'il file CSV', testo: 'Scegli…',
   *            leggera: bool (non ristilare: solo evidenziazione), nome: elemento dove scrivere il nome }
   * Restituisce { input, zona, imposta(files) }. Gli input con data-pf-drop="no" sono ignorati dall'automatismo.
   */
  function drop(input, opz) {
    if (typeof input === "string") input = doc.querySelector(input);
    if (!input || input.type !== "file") return null;
    opz = opz || {};
    var esistente = zone.filter(function (z) { return z.input === input; })[0];
    if (esistente) { Object.keys(opz).forEach(function (k) { esistente.opz[k] = opz[k]; }); return esistente.api; }

    var zona = opz.zona ? (typeof opz.zona === "string" ? doc.querySelector(opz.zona) : opz.zona) : null;
    if (!zona && input.dataset.pfZona) zona = doc.querySelector(input.dataset.pfZona);
    if (!zona) zona = input.closest(".pf-drop");
    var leggera = !!opz.leggera || input.dataset.pfDrop === "leggera";
    var nome = opz.nome || null;
    var testoVuoto = "";
    if (!zona) {
      var lab = input.closest("label") || (input.id && doc.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(input.id) : input.id) + '"]'));
      if (leggera || nascosto(input)) {
        // input nascosto con il suo pulsante: la zona è il contenitore, aspetto invariato
        zona = (lab && lab.contains(input) ? lab : input.parentElement) || doc.body;
        leggera = true;
      } else if (lab && lab.contains(input)) {
        zona = lab;
      } else {
        // input visibile e "nudo": lo avvolgo in una zona in stile EuGEnio
        zona = doc.createElement("label");
        input.parentNode.insertBefore(zona, input);
        zona.appendChild(input);
        var t = doc.createElement("span"); t.className = "pf-drop-titolo";
        t.textContent = opz.testo || input.dataset.pfTesto || "Scegli o trascina qui " + etichetta(input, opz);
        zona.appendChild(t);
        testoVuoto = "nessun file scelto";
      }
    }
    zona.classList.add(leggera ? "pf-drop-leggera" : "pf-drop");
    if (!nome) nome = zona.querySelector("[data-pf-nome], .pf-drop-nome");
    if (!nome) {
      nome = doc.createElement("span"); nome.className = "pf-drop-nome"; nome.setAttribute("aria-live", "polite");
      if (testoVuoto) nome.textContent = testoVuoto;
      zona.appendChild(nome);
    }
    var z = { input: input, zona: zona, nome: nome, opz: opz, leggera: leggera, testoVuoto: testoVuoto };
    z.api = { input: input, zona: zona, imposta: function (files) { return imposta(z, Array.prototype.slice.call(files || [])); } };
    zone.push(z);
    input.__pfDrop = true;
    input.addEventListener("change", function () { mostraNome(z); });
    if (input.files && input.files.length) mostraNome(z);
    return z.api;
  }

  function cercaInput(radice) {
    if (doc.body && doc.body.dataset.pfDrop === "no") return;
    var lista = [];
    if (radice.matches && radice.matches('input[type="file"]')) lista.push(radice);
    if (radice.querySelectorAll) lista = lista.concat(Array.prototype.slice.call(radice.querySelectorAll('input[type="file"]')));
    lista.forEach(function (i) {
      if (i.__pfDrop || i.dataset.pfDrop === "no" || i.closest("[data-pf-drop='no']")) return;
      drop(i);
    });
  }

  function haFile(e) {
    var t = e.dataTransfer && e.dataTransfer.types;
    if (!t) return false;
    for (var i = 0; i < t.length; i++) if (t[i] === "Files") return true;
    return false;
  }
  function zonaDi(el) {
    var a = attivi();
    for (var n = el; n && n !== doc; n = n.parentNode) {
      for (var i = 0; i < a.length; i++) if (a[i].zona === n) return a[i];
    }
    return null;
  }
  function mostraVelo(e) {
    var a = attivi();
    if (!a.length) return;
    if (!velo) {
      velo = doc.createElement("div"); velo.className = "pf-velo"; velo.setAttribute("aria-hidden", "true");
      velo.innerHTML = '<div class="pf-velo-riquadro"><b></b><span></span></div>';
      doc.body.appendChild(velo);
    }
    var b = velo.querySelector("b"), s = velo.querySelector("span");
    if (a.length === 1) {
      var et = etichetta(a[0].input, a[0].opz);
      b.textContent = "Rilascia " + et;
      s.textContent = "Puoi lasciarlo ovunque nella pagina: verrà caricato nello strumento. Resta nel tuo browser.";
    } else {
      b.textContent = "Rilascia i file";
      s.textContent = "Lasciali sulla zona giusta, oppure ovunque: vengono smistati in base al nome del file.";
    }
    velo.classList.add("visibile");
    clearTimeout(timerVelo);
    timerVelo = setTimeout(nascondiVelo, 220);
  }
  function nascondiVelo() {
    trascinoInCorso = false;
    if (velo) velo.classList.remove("visibile");
    zone.forEach(function (z) { z.zona.classList.remove("sopra"); });
  }

  function smista(files, zonaBersaglio) {
    var a = attivi(), assegnati = new Map(), scartati = [];
    if (!a.length) return;
    files.forEach(function (f) {
      var scelta = null;
      if (zonaBersaglio && files.length === 1) scelta = zonaBersaglio;
      if (!scelta) {   // 1) pattern sul nome
        for (var i = 0; i < a.length; i++) { var p = pattern(a[i]); if (p && p.test(f.name) && accetta(a[i].input, f)) { scelta = a[i]; break; } }
      }
      if (!scelta && zonaBersaglio && accetta(zonaBersaglio.input, f)) scelta = zonaBersaglio;   // 2) la zona su cui è caduto
      if (!scelta && a.length === 1) scelta = a[0];                                               // 3) l'unico input
      if (!scelta) {   // 4) il primo input (senza pattern che lo escluda) ancora libero che accetta il formato
        for (var j = 0; j < a.length; j++) {
          if (!assegnati.has(a[j]) && accetta(a[j].input, f) && !pattern(a[j])) { scelta = a[j]; break; }
        }
        if (!scelta) for (var k = 0; k < a.length; k++) if (!assegnati.has(a[k]) && accetta(a[k].input, f)) { scelta = a[k]; break; }
      }
      if (scelta && !accetta(scelta.input, f)) { scartati.push(f.name + " (formato non accettato)"); return; }
      if (!scelta) { scartati.push(f.name); return; }
      if (!assegnati.has(scelta)) assegnati.set(scelta, []);
      var arr = assegnati.get(scelta);
      if (scelta.input.multiple || !arr.length) arr.push(f); else scartati.push(f.name);
    });
    var caricati = [];
    assegnati.forEach(function (lista, z) { if (imposta(z, lista)) caricati.push(lista.map(function (f) { return f.name; }).join(", ")); });
    if (scartati.length) annuncia("Non caricato: " + scartati.join(", "));
    else if (caricati.length) annuncia("Caricato: " + caricati.join(" · "));
  }

  function trascinamento() {
    doc.addEventListener("dragenter", function (e) { if (haFile(e) && attivi().length) { e.preventDefault(); trascinoInCorso = true; mostraVelo(e); } });
    doc.addEventListener("dragover", function (e) {
      if (!haFile(e) || !attivi().length) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = "copy"; } catch (x) { /* ignorato */ }
      mostraVelo(e);
      var z = zonaDi(e.target);
      zone.forEach(function (q) { q.zona.classList.toggle("sopra", q === z); });
    });
    doc.addEventListener("dragleave", function (e) {
      if (!e.relatedTarget) { clearTimeout(timerVelo); timerVelo = setTimeout(nascondiVelo, 80); }
    });
    doc.addEventListener("drop", function (e) {
      if (!haFile(e) || !attivi().length) return;
      e.preventDefault();
      var files = Array.prototype.slice.call(e.dataTransfer.files || []);
      var z = zonaDi(e.target);
      nascondiVelo();
      smista(files, z);
    });
    if ("MutationObserver" in window) {
      new MutationObserver(function (lista) {
        lista.forEach(function (m) {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType !== 1) return;
            cercaInput(n);
            if (n.matches && n.matches("[data-tip]")) preparaTip(n);
            if (n.querySelectorAll) n.querySelectorAll("[data-tip]").forEach(preparaTip);
          });
          if (m.type === "attributes" && m.target.hasAttribute && m.target.hasAttribute("data-tip") && m.target.__pfTip) aggiornaDescrizione(m.target);
        });
      }).observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tip"] });
    }
    cercaInput(doc);
  }


  /* ------------------------------------------------------------------------------- caricamento pigro delle librerie */
  var promesseScript = {};
  /** Playfair.carica('vendor/jszip.min.js') → Promise: carica (una volta sola) uno script di assets/. */
  function carica(rel) {
    var url = /^(https?:)?\/\/|^\//.test(rel) ? rel : BASE + rel;
    if (promesseScript[url]) return promesseScript[url];
    promesseScript[url] = new Promise(function (ok, ko) {
      var s = doc.createElement("script");
      s.src = url; s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () { delete promesseScript[url]; ko(new Error("impossibile caricare " + rel)); };
      doc.head.appendChild(s);
    });
    return promesseScript[url];
  }

  /* ------------------------------------------------------------------------------- fonte nei file scaricati */
  function dataIt(d) {
    d = d || new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }
  function dataIso(d) {
    d = d || new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  /** Playfair.fonte() → la riga di fonte comune a tutti i file generati dal sito. */
  function fonte(d) {
    return "Fonte: Playfair — playfair.statocritico.it · elaborazione del " + dataIt(d) + " su dati forniti dall'utente · licenza AGPL-3.0";
  }
  /** riga di commento da mettere in fondo ai CSV: gli strumenti la scartano quando il file viene ricaricato */
  function rigaFonteCsv() { return "# " + fonte(); }
  var RE_FONTE_CSV = /^﻿?#\s*Fonte: Playfair\b.*$/gm;

  /** Playfair.scarica(blob | dataURL, nome): scarica un file generato nel browser. */
  function scarica(dati, nome) {
    var url = typeof dati === "string" ? dati : URL.createObjectURL(dati);
    var a = doc.createElement("a");
    a.href = url; a.download = nome; a.rel = "noopener"; a.style.display = "none";
    doc.body.appendChild(a); a.click();
    setTimeout(function () { if (typeof dati !== "string") URL.revokeObjectURL(url); a.remove(); }, 2000);
  }
  /** Playfair.telaConFonte(canvas, {sfondo, testo}) → nuova tela con sfondo pieno e didascalia della fonte in basso. */
  function telaConFonte(sorgente, opz) {
    opz = opz || {};
    var w = sorgente.width, h = sorgente.height;
    var corpo = Math.max(11, Math.round(Math.min(w, 2400) / 95));
    var alto = Math.round(corpo * 2.1);
    var c = doc.createElement("canvas");
    c.width = w; c.height = h + alto;
    var g = c.getContext("2d");
    g.fillStyle = opz.sfondo || colore("--foglio") || "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(sorgente, 0, 0);
    g.fillStyle = opz.inchiostro || colore("--tenue") || "#5f5868";
    g.font = corpo + "px " + (colore("--testo") || "sans-serif");
    g.textBaseline = "middle";
    var testo = opz.testo || fonte(), x = Math.round(corpo * 0.9);
    while (testo.length > 20 && g.measureText(testo).width > w - 2 * x) testo = testo.slice(0, -2);
    if (testo !== (opz.testo || fonte())) testo = testo.replace(/\s*\S*$/, "") + "…";
    g.fillText(testo, x, h + alto / 2);
    return c;
  }
  /** Playfair.scaricaImmagine(canvas, nome, opz): PNG (o JPG con opz.tipo) con sfondo e didascalia della fonte. */
  function scaricaImmagine(sorgente, nome, opz) {
    opz = opz || {};
    var c = telaConFonte(sorgente, opz);
    var tipo = opz.tipo || (/\.jpe?g$/i.test(nome) ? "image/jpeg" : "image/png");
    return new Promise(function (ok) {
      c.toBlob(function (b) { scarica(b, nome); ok(b); }, tipo, opz.qualita || 0.93);
    });
  }

  /* ------------------------------------------------------------------------------- fogli di calcolo → CSV
     Un file .xlsx/.xlsm/.xls/.ods scelto con il pulsante o trascinato viene letto con SheetJS (caricato solo ora),
     il foglio (il primo non vuoto, o quello scelto) diventa un CSV con separatore ';' e lo strumento riceve quel CSV
     con un nuovo evento 'change': il codice degli strumenti non cambia. Numeri senza separatore delle migliaia,
     decimali con la virgola (o con il punto se l'input ha data-pf-decimali="punto"), date gg/mm/aaaa [hh:mm].
     Anche i CSV passano di qui: si tolgono le righe «# Fonte: Playfair …» messe dal sito nei CSV scaricati. */
  var RE_FOGLIO = /\.(xlsx|xlsm|xlsb|xls|ods|fods)$/i;
  var RE_TESTO = /\.(csv|txt|tsv)$/i;
  var codaScelte = Promise.resolve();

  function numeroCsv(v, punto) {
    if (!isFinite(v)) return "";
    var n = Number(Number(v).toPrecision(15));
    var s = String(n);
    if (/e/i.test(s)) {
      s = Math.abs(n) < 1 ? n.toFixed(20).replace(/0+$/, "").replace(/\.$/, "") : n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 0 });
    }
    return punto ? s : s.replace(".", ",");
  }
  function due(n) { return (n < 10 ? "0" : "") + n; }
  function dataCsv(y, m, d, H, M, soloOra) {
    var ora = due(H) + ":" + due(M);
    if (soloOra) return ora;
    return due(d) + "/" + due(m) + "/" + y + (H || M ? " " + ora : "");
  }
  function cellaCsv(cella, punto, date1904) {
    if (!cella || cella.t === "z" || cella.t === "e") return "";
    var v = cella.v;
    if (cella.t === "s") return String(v == null ? "" : v).replace(/\r\n?|\n/g, " ");
    if (cella.t === "b") return v ? "VERO" : "FALSO";
    if (cella.t === "d" && v instanceof Date) {
      return dataCsv(v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes(), false);
    }
    if (cella.t === "n") {
      var fmt = cella.z || "General";
      var X = window.XLSX;
      if (typeof fmt === "number") fmt = (X.SSF._table || X.SSF.get_table())[fmt] || "General";
      if (X && X.SSF && X.SSF.is_date(fmt)) {
        var r = Math.round(v * 1440) / 1440;   // al minuto: niente errori di arrotondamento o di fuso
        var p = X.SSF.parse_date_code(r, { date1904: !!date1904 });
        if (p) return dataCsv(p.y, p.m, p.d, p.H, p.M, r < 1);
      }
      if (/%/.test(String(fmt).replace(/"[^"]*"/g, ""))) v = v * 100;   // 8% → 8, come appare
      return numeroCsv(v, punto);
    }
    return String(v == null ? "" : v);
  }
  function campoCsv(s) { return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function righeFoglio(ws, punto, date1904) {
    var X = window.XLSX;
    if (!ws || !ws["!ref"]) return [];
    var rg = X.utils.decode_range(ws["!ref"]), righe = [], maxC = -1;
    for (var r = rg.s.r; r <= rg.e.r; r++) {
      var riga = [], piena = false;
      for (var c = rg.s.c; c <= rg.e.c; c++) {
        var t = cellaCsv(ws[X.utils.encode_cell({ r: r, c: c })], punto, date1904);
        if (t !== "") { piena = true; if (c - rg.s.c > maxC) maxC = c - rg.s.c; }
        riga.push(t);
      }
      if (piena) righe.push(riga);
    }
    return righe.map(function (r) { return r.slice(0, maxC + 1); });
  }
  function scegliFoglio(fogli, nomeFile) {
    return new Promise(function (ok) {
      var d = doc.createElement("dialog");
      d.className = "pf-dialogo";
      d.setAttribute("aria-labelledby", "pf-dialogo-titolo");
      var h = '<h2 id="pf-dialogo-titolo">Quale foglio vuoi usare?</h2><p>Il file <b></b> contiene più fogli con dati. Scegli quello da caricare nello strumento.</p><div class="pf-dialogo-scelte"></div><div class="pf-dialogo-piede"><button type="button" class="pf-btn secondario piccolo" value="">Annulla</button></div>';
      d.innerHTML = h;
      d.querySelector("b").textContent = nomeFile;
      var box = d.querySelector(".pf-dialogo-scelte");
      fogli.forEach(function (f, i) {
        var b = doc.createElement("button");
        b.type = "button"; b.className = "pf-btn piccolo"; b.value = String(i);
        b.textContent = f.nome + " · " + f.righe.length + (f.righe.length === 1 ? " riga" : " righe");
        box.appendChild(b);
      });
      var fatto = false;
      function chiudi(v) { if (fatto) return; fatto = true; try { d.close(); } catch (e) { /* già chiuso */ } d.remove(); ok(v === "" || v == null ? null : fogli[+v]); }
      d.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) chiudi(b.value); });
      d.addEventListener("cancel", function (e) { e.preventDefault(); chiudi(""); });
      doc.body.appendChild(d);
      if (d.showModal) d.showModal(); else d.setAttribute("open", "");
      var primo = box.querySelector("button"); if (primo) primo.focus();
    });
  }
  /** converte un foglio di calcolo in un File CSV; null se l'utente annulla la scelta del foglio */
  function foglioInCsv(file, input) {
    var punto = (input && input.dataset.pfDecimali) === "punto";
    return Promise.all([carica("vendor/xlsx.full.min.js"), file.arrayBuffer()]).then(function (r) {
      var X = window.XLSX;
      var wb = X.read(new Uint8Array(r[1]), { type: "array", cellNF: true, cellDates: false, cellText: false });
      var date1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
      var info = (wb.Workbook && wb.Workbook.Sheets) || [];
      var fogli = wb.SheetNames.map(function (n, i) {
        return { nome: n, nascosto: !!(info[i] && info[i].Hidden), righe: righeFoglio(wb.Sheets[n], punto, date1904) };
      }).filter(function (f) { return f.righe.length && !f.nascosto; });
      if (!fogli.length) throw new Error("nel file non ci sono fogli con dati");
      var scelta = fogli.length === 1 ? Promise.resolve(fogli[0]) : (codaScelte = codaScelte.then(function () { return scegliFoglio(fogli, file.name); }));
      return scelta.then(function (f) {
        if (!f) return null;
        var testo = f.righe.map(function (r) { return r.map(campoCsv).join(";"); }).join("\r\n") + "\r\n";
        var nome = file.name.replace(/\.[^.]+$/, "") + ".csv";
        var nuovo = new File([testo], nome, { type: "text/csv", lastModified: file.lastModified || Date.now() });
        nuovo.__pfOrigine = file.name + (fogli.length > 1 ? " (foglio «" + f.nome + "»)" : "");
        nuovo.__pfFoglio = f.nome;
        return nuovo;
      });
    });
  }
  /** CSV scaricati dal sito: tolgo la riga di fonte prima di passarli allo strumento */
  function pulisciCsv(file) {
    if (!file.text || file.size > 60 * 1024 * 1024) return Promise.resolve(file);
    return file.text().then(function (t) {
      RE_FONTE_CSV.lastIndex = 0;
      if (!RE_FONTE_CSV.test(t)) return file;
      var pulito = t.replace(RE_FONTE_CSV, "").replace(/(\r?\n){2,}$/, "$1");
      var f = new File([pulito], file.name, { type: file.type || "text/csv", lastModified: file.lastModified || Date.now() });
      return f;
    }, function () { return file; });
  }
  function fogliDiCalcolo() {
    doc.addEventListener("change", function (e) {
      var input = e.target;
      if (!input || input.type !== "file" || e.__pfPronto || input.dataset.pfFogli === "no") return;
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      var foglio = files.some(function (f) { return RE_FOGLIO.test(f.name); });
      var testo = files.some(function (f) { return RE_TESTO.test(f.name); });
      if (!foglio && !testo) return;
      e.stopImmediatePropagation();          // lo strumento riceverà il CSV con un nuovo 'change'
      if (foglio) annuncia("Lettura del foglio di calcolo…");
      Promise.all(files.map(function (f) {
        if (RE_FOGLIO.test(f.name)) return foglioInCsv(f, input);
        if (RE_TESTO.test(f.name)) return pulisciCsv(f);
        return f;
      })).then(function (nuovi) {
        if (nuovi.some(function (f) { return f === null; })) { annuncia("Caricamento annullato."); return; }
        var cambiati = nuovi.some(function (f, i) { return f !== files[i]; });
        if (cambiati) {
          var dt = new DataTransfer();
          nuovi.forEach(function (f) { dt.items.add(f); });
          // DataTransfer copia i File: riporto il nome originale per la zona di trascinamento
          input.files = dt.files;
          Array.prototype.forEach.call(input.files, function (f, i) { if (nuovi[i].__pfOrigine) f.__pfOrigine = nuovi[i].__pfOrigine; });
        }
        var ev = new Event("change", { bubbles: true });
        ev.__pfPronto = true;
        input.dispatchEvent(ev);
        var conv = nuovi.filter(function (f) { return f.__pfOrigine; });
        if (conv.length) annuncia("Convertito in CSV: " + conv.map(function (f) { return f.__pfOrigine; }).join(", "));
      }).catch(function (err) {
        annuncia("Impossibile leggere il file: " + (err && err.message ? err.message : "formato non riconosciuto"));
      });
    }, true);
  }

  /* ------------------------------------------------------------------------------- esportazione in Excel */
  /** Playfair.esportaExcel(fogli?, meta?) → Promise: senza fogli raccoglie i grafici della pagina. */
  function esportaExcel(fogli, meta) {
    return carica("vendor/jszip.min.js").then(function () { return carica("excel.js"); }).then(function () {
      return window.PlayfairExcel.scarica(fogli || null, meta || {});
    });
  }
  function pulsantiExcel() {
    doc.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-pf-excel-scarica]");
      if (!b) return;
      e.preventDefault();
      if (b.getAttribute("aria-busy") === "true") return;
      b.setAttribute("aria-busy", "true");
      annuncia("Preparo il file Excel…");
      esportaExcel().then(function (r) {
        if (r && r.vuoto) annuncia("Non ci sono ancora grafici da esportare: carica prima i dati.");
        else if (r) annuncia("Scaricato " + r.nome + " (" + r.fogli + (r.fogli === 1 ? " foglio" : " fogli") + ")");
      }).catch(function (err) {
        annuncia("Esportazione in Excel non riuscita: " + (err && err.message ? err.message : err));
      }).then(function () { b.removeAttribute("aria-busy"); });
    });
  }

  /* ------------------------------------------------------------------------------- avvio */
  function avvia() {
    doc.querySelectorAll(".pf-tema").forEach(function (b) { b.addEventListener("click", function () { tema("cambia"); }); });
    aggiornaPulsantiTema();
    voceAttiva();
    menuMobile();
    altezzaTestata();
    tooltip();
    fogliDiCalcolo();
    trascinamento();
    pulsantiExcel();
  }

  window.Playfair = {
    versione: "1.1",
    tema: tema,
    drop: drop,
    colore: colore,
    colori: colori,
    annuncia: annuncia,
    fonte: fonte,
    rigaFonteCsv: rigaFonteCsv,
    dataIt: dataIt,
    dataIso: dataIso,
    scarica: scarica,
    telaConFonte: telaConFonte,
    scaricaImmagine: scaricaImmagine,
    carica: carica,
    esportaExcel: esportaExcel,
    fogliDiCalcolo: { inCsv: foglioInCsv }
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", avvia); else avvia();
})();
