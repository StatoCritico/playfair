/* =====================================================================================================
   Playfair · sito.js — vanilla, senza dipendenze.
   - tema chiaro/scuro (localStorage 'pf-tema', evento 'pf-tema' su window)
   - menu del telefono, voce attiva automatica (aria-current)
   - tooltip accessibili da [data-tip]
   - trascinamento dei file automatico su ogni <input type="file"> (anche creati dopo: MutationObserver)
   API: window.Playfair = { tema, drop, colore, colori, annuncia, versione }
   ===================================================================================================== */
(function () {
  "use strict";
  if (window.Playfair && window.Playfair.versione) return;   // già caricato
  var doc = document, root = doc.documentElement;
  root.classList.add("pf-js");

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
    var testo = f && f.length ? Array.prototype.map.call(f, function (x) { return x.name; }).join(", ") : (z.testoVuoto || "");
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
        t.textContent = opz.testo || input.dataset.pfTesto || "Scegli " + etichetta(input, opz) + " o trascinalo qui";
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

  /* ------------------------------------------------------------------------------- avvio */
  function avvia() {
    doc.querySelectorAll(".pf-tema").forEach(function (b) { b.addEventListener("click", function () { tema("cambia"); }); });
    aggiornaPulsantiTema();
    voceAttiva();
    menuMobile();
    altezzaTestata();
    tooltip();
    trascinamento();
  }

  window.Playfair = {
    versione: "1.0",
    tema: tema,
    drop: drop,
    colore: colore,
    colori: colori,
    annuncia: annuncia
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", avvia); else avvia();
})();
