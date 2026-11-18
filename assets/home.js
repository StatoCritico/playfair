/* Playfair · home.js — macchina di Sankey animata, riquadri al neon, manometro degli schemi.
   La sequenza dei flussi gira solo quando nessun riquadro è acceso: 1 s spenta, poi 8 tratti uno dopo l'altro
   (0,1 s tra uno e l'altro), 9 s per ciclo. Lo schema scelto vale per tutto il sito (localStorage 'pf-schema'). */
(function () {
  "use strict";
  var home = document.querySelector(".sp-home"); if (!home) return;
  var root = document.documentElement;
  var NOMI = { fredda: "Fredda", aliena: "Aliena", calda: "Calda" }, ORDINE = ["fredda", "aliena", "calda"];
  var PASSI = [[[0, 1], "grate"], [[7, 13], "boiler"], [[2, 14], "pipe"], [[3, 5, 6, 10], "engine"], [[4, 9, 11], "condenser"], [[12, 15], "feedpump"], [[16, 17], "economiser"], [[8], "radiation"]];

  /* ---- manometro: sceglie lo schema */
  var gauge = document.getElementById("sp-gauge");
  function schemaAttuale() { var s = root.dataset.schema; return ORDINE.indexOf(s) < 0 ? "aliena" : s; }
  function etichetta() {
    var s = schemaAttuale(), p = ORDINE[(ORDINE.indexOf(s) + 1) % 3];
    gauge.setAttribute("aria-label", "Schema grafico: " + NOMI[s] + ". Clicca per passare a " + NOMI[p]);
  }
  gauge.addEventListener("click", function () {
    var s = ORDINE[(ORDINE.indexOf(schemaAttuale()) + 1) % 3];
    root.dataset.schema = s;
    try { localStorage.setItem("pf-schema", s); } catch (e) { /* archiviazione non disponibile */ }
    etichetta();
  });
  etichetta();

  /* ---- flussi */
  var flussi = Array.prototype.slice.call(home.querySelectorAll(".f"));
  var maschere = flussi.map(function (f) { return document.querySelector("#sp-mk" + f.dataset.i + " .mkp"); });
  var marcatori = {};
  home.querySelectorAll(".marcatore").forEach(function (m) { marcatori[m.dataset.parte] = m; });
  var passoDi = [], partePasso = [];
  PASSI.forEach(function (p, k) { p[0].forEach(function (i) { passoDi[i] = k; }); partePasso[k] = p[1]; });
  var CICLO = 9000, PAUSA = 1000, GAP = 100, N = PASSI.length, DUR = (CICLO - PAUSA - GAP * (N - 1)) / N;
  var ridotto = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var caldo = null, t0 = performance.now(), ultimo = [];
  function imposta(i, p) { if (ultimo[i] !== p) { maschere[i].setAttribute("stroke-dashoffset", (1 - p).toFixed(4)); ultimo[i] = p; } }
  function ciclo(now) {
    if (caldo || ridotto) {
      for (var i = 0; i < flussi.length; i++) imposta(i, 1);
      if (!caldo) for (var k in marcatori) marcatori[k].classList.remove("lit");
    } else {
      var t = (now - t0) % CICLO, acceso = {};
      for (var j = 0; j < flussi.length; j++) {
        var k2 = passoDi[j], inizio = PAUSA + k2 * (DUR + GAP);
        var p = Math.max(0, Math.min(1, (t - inizio) / DUR));
        imposta(j, Math.round(p * 1000) / 1000);
        if (p > 0) acceso[partePasso[k2]] = true;
      }
      for (var m in marcatori) marcatori[m].classList.toggle("lit", !!acceso[m]);
    }
    requestAnimationFrame(ciclo);
  }
  requestAnimationFrame(ciclo);

  /* ---- riquadri accesi (mouse, tastiera, voci del menu) e raggi verso i numeri */
  var richiami = document.getElementById("sp-richiami"), layout = document.getElementById("sp-layout");
  var NS = "http://www.w3.org/2000/svg", carte = {};
  home.querySelectorAll(".nota[data-parte]").forEach(function (c) { carte[c.getAttribute("href")] = c; });
  function voci() { return document.querySelectorAll(".pf-menu a"); }
  function accendi(href) {
    var c = carte[href]; spegni(); if (!c) return;
    caldo = c.dataset.parte;
    c.classList.add("acceso"); home.classList.add("caldo");
    flussi.forEach(function (f) { f.classList.toggle("rel", f.classList.contains("p-" + caldo)); });
    for (var m in marcatori) marcatori[m].classList.toggle("lit", m === caldo);
    voci().forEach(function (a) { a.classList.toggle("sp-acceso", a.getAttribute("href") === href); });
    traccia(c);
  }
  function spegni() {
    if (caldo) t0 = performance.now();
    caldo = null; home.classList.remove("caldo");
    document.querySelectorAll(".sp-home .nota.acceso, .pf-menu a.sp-acceso").forEach(function (x) { x.classList.remove("acceso", "sp-acceso"); });
    flussi.forEach(function (f) { f.classList.remove("rel"); });
    while (richiami.firstChild) richiami.removeChild(richiami.firstChild);
  }
  function traccia(c) {
    if (getComputedStyle(richiami).display === "none") return;
    var mk = marcatori[c.dataset.parte]; if (!mk) return;
    var L = layout.getBoundingClientRect(), R = c.getBoundingClientRect();
    var fig = home.querySelector(".cornice-tav").getBoundingClientRect(), s = fig.width / 1920;
    var mx = fig.left - L.left + (+mk.dataset.x) * s, my = fig.top - L.top + (+mk.dataset.y) * s, rr = 54 * s + 2;
    var ax = R.left - L.left + R.width / 2, ay = R.top - L.top + R.height / 2;
    var dx = mx - ax, dy = my - ay, d = Math.sqrt(dx * dx + dy * dy) || 1;
    richiami.setAttribute("viewBox", "0 0 " + L.width + " " + L.height);
    var p = document.createElementNS(NS, "path");
    p.setAttribute("class", "richiamo");
    p.setAttribute("d", "M" + ax + " " + ay + " L" + (mx - dx / d * rr) + " " + (my - dy / d * rr));
    p.style.setProperty("--l", (d - rr).toFixed(1));
    richiami.appendChild(p);
  }
  Object.keys(carte).forEach(function (href) {
    var c = carte[href];
    c.addEventListener("mouseenter", function () { accendi(href); });
    c.addEventListener("focus", function () { accendi(href); });
    c.addEventListener("mouseleave", spegni); c.addEventListener("blur", spegni);
  });
  voci().forEach(function (a) {
    var href = a.getAttribute("href");
    if (!carte[href]) return;
    a.addEventListener("mouseenter", function () { accendi(href); });
    a.addEventListener("focus", function () { accendi(href); });
    a.addEventListener("mouseleave", spegni); a.addEventListener("blur", spegni);
  });
  window.addEventListener("resize", function () {
    var c = home.querySelector(".nota.acceso");
    if (c) { while (richiami.firstChild) richiami.removeChild(richiami.firstChild); traccia(c); }
  });
})();
