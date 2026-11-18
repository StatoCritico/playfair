/* =====================================================================
   Playfair · Sankey — editor di diagrammi di flusso energetico
   Vanilla JS, nessuna dipendenza esterna (jsPDF solo per il PDF).
   Struttura:
     1. costanti e utilità           5. disegno SVG (schermo ed esportazione)
     2. modello dati e storia         6. interazione (puntatore, tastiera)
     3. bilanci e risoluzione         7. pannello delle proprietà
     4. impaginazione e tubi          8. file, esportazioni, esempi, guida
   Nessun dato lascia il browser: salvataggio automatico in localStorage.
   ===================================================================== */
(function () {
  'use strict';

  /* ================= 1. COSTANTI E UTILITÀ ================= */
  const GRIGLIA = 10, TESTA = 30, RIGA = 26, PADX = 12, PADB = 10, LARG_MIN = 130, STUB = 8, GAP_TUBI = 2;
  const CHIAVE_DOC = 'pf-sankey-progetto', CHIAVE_TUT = 'pf-sankey-guida-vista';
  const FONT_EXP = 'Helvetica, Arial, "Liberation Sans", sans-serif';

  const UNITA = {
    kWh:    { etichetta: 'kWh (elettrici)', breve: 'kWh',     vettore: 'el',    f: 1,    nomeDato: 'Elettricità' },
    MWh_el: { etichetta: 'MWh el.',         breve: 'MWh el.', vettore: 'el',    f: 1000, nomeDato: 'Elettricità' },
    Sm3:    { etichetta: 'Sm³ (gas)',       breve: 'Sm³',     vettore: 'th',    f: null, nomeDato: 'Gas naturale' },
    MWh_th: { etichetta: 'MWh termici',     breve: 'MWh th',  vettore: 'th',    f: 1000, nomeDato: 'Calore' },
    kWh_th: { etichetta: 'kWh termici',     breve: 'kWh th',  vettore: 'th',    f: 1,    nomeDato: 'Calore' },
    m3:     { etichetta: 'm³ acqua',        breve: 'm³',      vettore: 'acqua', f: 1,    nomeDato: 'Acqua' },
    tCO2:   { etichetta: 't CO₂',           breve: 't CO₂',   vettore: 'co2',   f: 1,    nomeDato: 'CO₂' },
    altro:  { etichetta: 'altro (libera)…', breve: '',        vettore: 'altro', f: 1,    nomeDato: 'Dato' }
  };
  const ORDINE_UNITA = ['kWh', 'MWh_el', 'Sm3', 'MWh_th', 'kWh_th', 'm3', 'tCO2', 'altro'];
  const VETTORI = {
    el:    { nome: 'Elettricità (kWh, MWh el.)',          v: 'flusso-el' },
    th:    { nome: 'Gas e calore (Sm³, MWh e kWh termici)', v: 'flusso-th' },
    acqua: { nome: 'Acqua (m³)',                          v: 'flusso-acqua' },
    co2:   { nome: 'CO₂ (t)',                             v: 'flusso-co2' },
    altro: { nome: 'Altro / senza unità',                 v: 'flusso-altro' }
  };
  const NOMI_COLORI = ['carta', 'foglio', 'rialzo', 'linea', 'bordo', 'inchiostro', 'tenue', 'primario', 'segno', 'successo', 'errore', 'errore-fondo', 'attenzione', 'flusso-el', 'flusso-th', 'flusso-acqua', 'flusso-co2', 'flusso-altro'];
  const RISERVA_CHIARA = { carta: '#ffffff', foglio: '#ffffff', rialzo: '#efedf1', linea: '#e1dde6', bordo: '#847c8e', inchiostro: '#1c1820', tenue: '#5f5868', primario: '#c4452b', segno: '#3f4fd6', successo: '#2e7d32', errore: '#c62828', 'errore-fondo': '#fdecec', attenzione: '#b7791f', 'flusso-el': '#2e9e4f', 'flusso-th': '#e8870e', 'flusso-acqua': '#2f9fd8', 'flusso-co2': '#8b5a2b', 'flusso-altro': '#8d8d8d' };

  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const aggancia = (v) => (doc && doc.opzioni.aggancio ? Math.round(v / GRIGLIA) * GRIGLIA : Math.round(v));
  let contatoreId = 0;
  const uid = (p) => p + Math.random().toString(36).slice(2, 7) + (++contatoreId).toString(36);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Numero all'italiana: punto per le migliaia, virgola per i decimali. */
  function numIt(v, dec) {
    const neg = v < 0; const s = Math.abs(v).toFixed(dec);
    let [int, fr] = s.split('.');
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (fr) { fr = fr.replace(/0+$/, ''); }
    return (neg && Number(s) !== 0 ? '−' : '') + int + (fr ? ',' + fr : '');
  }
  function fmt(v) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    return numIt(v, a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a === 0 ? 0 : 3);
  }
  /** Numero per i campi di modifica: virgola decimale, niente separatore delle migliaia. */
  function fmtCampo(v) {
    if (v == null || !isFinite(v)) return '';
    let s = String(Math.round(v * 1e6) / 1e6);
    if (/e/i.test(s)) s = v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('-', '−').replace('.', ',');
  }
  /** Legge un numero scritto all'italiana (1.234,5) o all'inglese (1234.5). null = vuoto, NaN = non valido. */
  function leggiNumero(s) {
    s = String(s == null ? '' : s).trim().replace(/[\s'’]/g, '').replace(/−/g, '-');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const v = Number(s);
    return isFinite(v) ? v : NaN;
  }
  const unitaOk = (u, ua) => !!u && !!UNITA[u] && (u !== 'altro' || String(ua || '').trim() !== '');
  const testoUnita = (u, ua) => (!u || !UNITA[u]) ? '' : (u === 'altro' ? String(ua || '').trim() : UNITA[u].breve);
  const vettoreDi = (u) => (u && UNITA[u]) ? UNITA[u].vettore : 'altro';

  /** Gruppo di bilancio di un'unità: le quantità dello stesso gruppo si sommano (convertite con il fattore f). */
  function gruppo(u, ua, opz) {
    const def = UNITA[u]; const conv = !!opz.conversione; const pci = opz.pci > 0 ? opz.pci : 9.59;
    if (u === 'altro') { const t = String(ua || '').trim(); return { g: 'altro:' + t.toLowerCase(), f: 1, base: t, nome: t }; }
    if (def.vettore === 'el') return conv ? { g: 'energia', f: def.f, base: 'kWh', nome: 'energia' } : { g: 'el', f: def.f, base: 'kWh', nome: 'elettricità' };
    if (u === 'Sm3') return conv ? { g: 'energia', f: pci, base: 'kWh', nome: 'energia' } : { g: 'Sm3', f: 1, base: 'Sm³', nome: 'gas (Sm³)' };
    if (def.vettore === 'th') return conv ? { g: 'energia', f: def.f, base: 'kWh', nome: 'energia' } : { g: 'th', f: def.f, base: 'kWh th', nome: 'energia termica' };
    if (u === 'm3') return { g: 'm3', f: 1, base: 'm³', nome: 'acqua' };
    return { g: 'tCO2', f: 1, base: 't CO₂', nome: 'CO₂' };
  }
  function fmtBase(v, G) {
    if ((G.base === 'kWh' || G.base === 'kWh th') && Math.abs(v) >= 10000) {
      return fmt(v / 1000) + (G.g === 'th' ? ' MWh th' : G.g === 'el' ? ' MWh el.' : ' MWh');
    }
    return fmt(v) + (G.base ? ' ' + G.base : '');
  }

  /* ================= 2. MODELLO DATI E STORIA ================= */
  function docVuoto() {
    return {
      formato: 'playfair-sankey', versione: 1, titolo: 'Diagramma di Sankey',
      blocchi: [], collegamenti: [],
      opzioni: { conversione: false, pci: 9.59, spessoreMax: 40, proporzionale: false, aggancio: true }
    };
  }
  function nuovoDato(p) {
    p = p || {};
    const u = p.u !== undefined ? p.u : 'kWh';
    return { id: uid('d'), etichetta: p.etichetta != null ? p.etichetta : (UNITA[u] ? UNITA[u].nomeDato : 'Dato'), valore: p.valore != null ? p.valore : null, calc: null, u, ua: p.ua || '', ruolo: p.ruolo === 'perdita' ? 'perdita' : 'valore' };
  }
  const pulisciId = (s, p) => { s = String(s == null ? '' : s).replace(/[^\w-]/g, ''); return s || uid(p); };
  const numONull = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);

  /** Valida e normalizza un progetto caricato da file o da localStorage. */
  function normalizza(o) {
    if (!o || typeof o !== 'object') throw new Error('il file non contiene un progetto valido');
    if (o.doc && Array.isArray(o.doc.blocchi)) o = o.doc;
    if (!Array.isArray(o.blocchi)) throw new Error('il file non contiene blocchi: non sembra un progetto Sankey di Playfair');
    const d = docVuoto();
    d.titolo = String(o.titolo || d.titolo).slice(0, 120);
    const op = o.opzioni || {};
    d.opzioni.conversione = !!op.conversione;
    if (isFinite(op.pci) && op.pci > 0) d.opzioni.pci = Number(op.pci);
    if (isFinite(op.spessoreMax)) d.opzioni.spessoreMax = clamp(Number(op.spessoreMax), 6, 120);
    d.opzioni.proporzionale = !!op.proporzionale;
    d.opzioni.aggancio = op.aggancio !== false;
    const idB = new Set();
    o.blocchi.forEach((b) => {
      if (!b || typeof b !== 'object') return;
      let id = pulisciId(b.id, 'b'); if (idB.has(id)) id = uid('b'); idB.add(id);
      const idD = new Set();
      const dati = (Array.isArray(b.dati) ? b.dati : []).filter((x) => x && typeof x === 'object').map((x) => {
        let did = pulisciId(x.id, 'd'); if (idD.has(did)) did = uid('d'); idD.add(did);
        return { id: did, etichetta: String(x.etichetta == null ? '' : x.etichetta).slice(0, 80), valore: numONull(x.valore), calc: numONull(x.calc), u: UNITA[x.u] ? x.u : '', ua: String(x.ua || '').slice(0, 30), ruolo: x.ruolo === 'perdita' ? 'perdita' : 'valore' };
      });
      d.blocchi.push({ id, nome: String(b.nome == null ? 'Blocco' : b.nome).slice(0, 80), x: Number(b.x) || 0, y: Number(b.y) || 0, dati });
    });
    const mb = new Map(d.blocchi.map((b) => [b.id, b]));
    const idL = new Set();
    (Array.isArray(o.collegamenti) ? o.collegamenti : []).forEach((l) => {
      if (!l || !l.da || !l.a) return;
      const bs = mb.get(String(l.da.b)), bt = mb.get(String(l.a.b));
      if (!bs || !bt || bs === bt) return;
      let id = pulisciId(l.id, 'l'); if (idL.has(id)) id = uid('l'); idL.add(id);
      d.collegamenti.push({
        id, da: { b: bs.id, d: bs.dati.some((x) => x.id === l.da.d) ? l.da.d : null }, a: { b: bt.id, d: bt.dati.some((x) => x.id === l.a.d) ? l.a.d : null },
        valore: numONull(l.valore), calc: numONull(l.calc), u: UNITA[l.u] ? l.u : '', ua: String(l.ua || '').slice(0, 30), etichetta: String(l.etichetta || '').slice(0, 80)
      });
    });
    if (o.vista && isFinite(o.vista.s) && isFinite(o.vista.tx) && isFinite(o.vista.ty)) d.vista = { tx: +o.vista.tx, ty: +o.vista.ty, s: clamp(+o.vista.s, 0.15, 4) };
    return d;
  }

  const mappaBlocchi = (d) => new Map(d.blocchi.map((b) => [b.id, b]));
  const datoDi = (b, did) => (b && did) ? b.dati.find((x) => x.id === did) || null : null;
  /** Unità effettiva di un collegamento: la sua, oppure quella del dato di partenza, oppure del dato d'arrivo. */
  function unitaEffettiva(l, mb) {
    if (unitaOk(l.u, l.ua)) return { u: l.u, ua: l.ua, propria: true };
    const ds = datoDi(mb.get(l.da.b), l.da.d), dt = datoDi(mb.get(l.a.b), l.a.d);
    if (ds && unitaOk(ds.u, ds.ua)) return { u: ds.u, ua: ds.ua, propria: false };
    if (dt && unitaOk(dt.u, dt.ua)) return { u: dt.u, ua: dt.ua, propria: false };
    return null;
  }

  let doc = docVuoto();
  const stato = {
    modo: 'seleziona', selB: new Set(), selL: new Set(), collega: null, drag: null, spazio: false, mouse: null,
    verifica: null, obsoleto: false, vista: { tx: 60, ty: 40, s: 1 }, puntatori: new Map(), pinch: null, timerMsg: 0
  };
  const storia = { annulla: [], ripeti: [], ultima: null };

  function registra(unione) {
    const ora = Date.now();
    if (unione && storia.ultima && storia.ultima.k === unione && ora - storia.ultima.t < 1500) { storia.ultima.t = ora; return; }
    storia.annulla.push(JSON.stringify(doc));
    if (storia.annulla.length > 200) storia.annulla.shift();
    storia.ripeti.length = 0;
    storia.ultima = unione ? { k: unione, t: ora } : null;
  }
  /** Ogni modifica passa da qui: istantanea per Annulla, salvataggio automatico, ridisegno. */
  function modifica(fn, opz) {
    opz = opz || {};
    registra(opz.unione);
    fn();
    dopoModifica(opz);
  }
  function dopoModifica(opz) {
    opz = opz || {};
    if (opz.dati !== false) segnaObsoleto();
    salvaPresto();
    richiediDisegno();
    if (opz.pannello) disegnaPannello();
    aggiornaPulsanti();
  }
  function ripristina(da, verso, testo) {
    if (!da.length) { messaggio(verso === 'ripeti' ? 'Niente da ripetere' : 'Niente da annullare'); return; }
    (verso === 'ripeti' ? storia.annulla : storia.ripeti).push(JSON.stringify(doc));
    doc = JSON.parse(da.pop());
    storia.ultima = null;
    pulisciSelezione();
    stato.collega = null;
    segnaObsoleto();
    salvaPresto();
    disegnaTutto();
    messaggio(testo);
  }
  const annulla = () => ripristina(storia.annulla, 'annulla', 'Annullato');
  const ripeti = () => ripristina(storia.ripeti, 'ripeti', 'Ripetuto');
  function pulisciSelezione() {
    const ib = new Set(doc.blocchi.map((b) => b.id)), il = new Set(doc.collegamenti.map((l) => l.id));
    stato.selB.forEach((id) => { if (!ib.has(id)) stato.selB.delete(id); });
    stato.selL.forEach((id) => { if (!il.has(id)) stato.selL.delete(id); });
  }
  function segnaObsoleto() { if (stato.verifica) stato.obsoleto = true; }

  /* ================= 3. BILANCI E RISOLUZIONE =================
     Semantica (spiegata anche nel pannello «Diagramma»):
     (1) Dato con collegamenti: il valore del dato è uguale alla somma dei collegamenti che
         ARRIVANO a quella riga e, separatamente, alla somma di quelli che PARTONO da quella riga.
     (2) Blocco, per ogni vettore (unità; con la conversione attiva tutta l'energia in kWh):
         se ha sia ingressi sia uscite, Σ ingressi = Σ uscite + Σ dati con ruolo «Perdita».
         Senza ingressi è una sorgente, senza uscite un'utenza: nessun vincolo di blocco.
     (3) Dati senza collegamenti (e non «Perdita") sono informativi.
     Le caselle vuote sono incognite: il sistema lineare viene ridotto a scala (Gauss-Jordan)
     e si ricavano solo le incognite determinate in modo univoco. */
  function risolviSistema(A, b, n) {
    const m = A.length; const piv = []; let r = 0;
    for (let c = 0; c < n && r < m; c++) {
      let best = r, bv = Math.abs(A[r][c]);
      for (let i = r + 1; i < m; i++) { const v = Math.abs(A[i][c]); if (v > bv) { bv = v; best = i; } }
      if (bv < 1e-10) continue;
      [A[r], A[best]] = [A[best], A[r]]; [b[r], b[best]] = [b[best], b[r]];
      const p = A[r][c];
      for (let j = 0; j < n; j++) A[r][j] /= p;
      b[r] /= p;
      for (let i = 0; i < m; i++) {
        if (i === r) continue;
        const f = A[i][c]; if (Math.abs(f) < 1e-14) continue;
        for (let j = 0; j < n; j++) A[i][j] -= f * A[r][j];
        b[i] -= f * b[r];
      }
      piv.push(c); r++;
    }
    const val = new Array(n).fill(null);
    piv.forEach((c, k) => {
      let libero = false;
      for (let j = 0; j < n; j++) if (j !== c && Math.abs(A[k][j]) > 1e-9) { libero = true; break; }
      if (!libero) { const v = b[k]; val[c] = Math.abs(v) < 1e-9 ? 0 : Number(v.toPrecision(12)); }
    });
    return val;
  }

  function analizza(d) {
    const opz = d.opzioni; const mb = mappaBlocchi(d);
    const vars = [], idxVar = new Map(), eqs = [];
    const msgB = new Map(), msgL = new Map();
    const giaDetto = new Set();
    const nota = (mappa, id, liv, testo) => { const k = id + '|' + testo; if (giaDetto.has(k)) return; giaDetto.add(k); if (!mappa.has(id)) mappa.set(id, []); mappa.get(id).push({ liv, testo }); };
    const links = d.collegamenti.filter((l) => mb.has(l.da.b) && mb.has(l.a.b));
    const unL = new Map(links.map((l) => [l.id, unitaEffettiva(l, mb)]));

    function termine(tipo, ogg, segno, un, bid) {
      const G = gruppo(un.u, un.ua, opz);
      const t = { coef: segno * G.f, tipo, id: ogg.id, G };
      if (ogg.valore != null && isFinite(ogg.valore)) t.val = ogg.valore;
      else {
        const k = tipo + ':' + ogg.id;
        if (!idxVar.has(k)) { idxVar.set(k, vars.length); vars.push({ tipo, id: ogg.id, b: bid, ogg }); }
        t.v = idxVar.get(k);
      }
      return t;
    }
    links.forEach((l) => { if (!unL.get(l.id)) nota(msgL, l.id, 'warn', 'Collegamento senza unità di misura: escluso dai bilanci.'); });

    d.blocchi.forEach((b) => {
      // (1) equazioni di riga
      b.dati.forEach((dt) => {
        if (!unitaOk(dt.u, dt.ua)) return;
        const Gd = gruppo(dt.u, dt.ua, opz);
        [['in', links.filter((l) => l.a.b === b.id && l.a.d === dt.id)], ['out', links.filter((l) => l.da.b === b.id && l.da.d === dt.id)]].forEach(([verso, lista]) => {
          if (!lista.length) return;
          const termini = [];
          lista.forEach((l) => {
            const ul = unL.get(l.id); if (!ul) return;
            const Gl = gruppo(ul.u, ul.ua, opz);
            if (Gl.g !== Gd.g) {
              const t = `Unità del collegamento (${testoUnita(ul.u, ul.ua)}) non confrontabile con il dato «${dt.etichetta}» (${testoUnita(dt.u, dt.ua)}).`;
              nota(msgL, l.id, 'err', t); nota(msgB, b.id, 'err', t); return;
            }
            termini.push(termine('l', l, +1, ul, null));
          });
          if (!termini.length) return;
          termini.push(termine('d', dt, -1, dt, b.id));
          eqs.push({ b: b.id, tipo: 'riga', verso, dato: dt, G: Gd, termini });
        });
      });
      // (2) equazioni di blocco per gruppo
      const gr = new Map();
      const prendi = (G) => { if (!gr.has(G.g)) gr.set(G.g, { G, ins: [], outs: [], perdite: [] }); return gr.get(G.g); };
      links.forEach((l) => {
        const ul = unL.get(l.id); if (!ul) return;
        const G = gruppo(ul.u, ul.ua, opz);
        if (l.a.b === b.id) prendi(G).ins.push(termine('l', l, +1, ul, null));
        if (l.da.b === b.id) prendi(G).outs.push(termine('l', l, -1, ul, null));
      });
      b.dati.forEach((dt) => {
        if (dt.ruolo !== 'perdita' || !unitaOk(dt.u, dt.ua)) return;
        const G = gruppo(dt.u, dt.ua, opz);
        const grp = gr.get(G.g);
        if (grp && grp.ins.length && grp.outs.length) grp.perdite.push(termine('d', dt, -1, dt, b.id));
        else nota(msgB, b.id, 'info', `«${dt.etichetta}» è una perdita ma il blocco non ha sia ingressi sia uscite di ${G.nome}: non entra nel bilancio.`);
      });
      gr.forEach((x) => {
        if (x.ins.length && x.outs.length) eqs.push({ b: b.id, tipo: 'blocco', G: x.G, termini: [...x.ins, ...x.outs, ...x.perdite], nIn: x.ins.length, nOut: x.outs.length });
      });
    });

    // sistema lineare
    const n = vars.length; const A = [], bv = [];
    eqs.forEach((eq) => {
      const row = new Array(n).fill(0); let c = 0;
      eq.termini.forEach((t) => { if (t.v != null) row[t.v] += t.coef; else c += t.coef * t.val; });
      if (row.some((x) => Math.abs(x) > 1e-14)) { A.push(row); bv.push(-c); }
    });
    const sol = n ? risolviSistema(A, bv, n) : [];
    const valT = (t) => (t.v != null ? sol[t.v] : t.val);

    // valutazione
    const stB = new Map(), stL = new Map();
    const alza = (mappa, id, liv) => { const o = { err: 3, warn: 2, ok: 1 }; const c = mappa.get(id); if (!c || o[liv] > o[c]) mappa.set(id, liv); };
    const nomeB = (id) => (mb.get(id) || {}).nome || '';
    eqs.forEach((eq) => {
      const indet = eq.termini.some((t) => t.v != null && sol[t.v] == null);
      if (indet) { eq.esito = 'indet'; alza(stB, eq.b, 'warn'); return; }
      let res = 0, scala = 0;
      eq.termini.forEach((t) => { const x = t.coef * valT(t); res += x; scala = Math.max(scala, Math.abs(x)); });
      const ok = Math.abs(res) <= Math.max(1e-6, 1e-3 * scala);
      eq.esito = ok ? 'ok' : 'err'; eq.scarto = res;
      if (ok) { alza(stB, eq.b, 'ok'); eq.termini.forEach((t) => { if (t.tipo === 'l') alza(stL, t.id, 'ok'); }); return; }
      alza(stB, eq.b, 'err');
      const somma = (f) => eq.termini.filter(f).reduce((s, t) => s + Math.abs(t.coef * valT(t)), 0);
      let testo;
      if (eq.tipo === 'riga') {
        const sl = somma((t) => t.tipo === 'l'), sd = somma((t) => t.tipo === 'd');
        testo = `«${eq.dato.etichetta}»: ${eq.verso === 'in' ? 'entrano' : 'escono'} ${fmtBase(sl, eq.G)} ma il dato vale ${fmtBase(sd, eq.G)} (scarto ${fmtBase(Math.abs(res), eq.G)}).`;
      } else {
        const si = somma((t) => t.coef > 0), so = somma((t) => t.coef < 0 && t.tipo === 'l'), sp = somma((t) => t.tipo === 'd');
        testo = `Bilancio ${eq.G.nome}: ingressi ${fmtBase(si, eq.G)} ≠ uscite ${fmtBase(so, eq.G)}${sp ? ' + perdite ' + fmtBase(sp, eq.G) : ''} (scarto ${fmtBase(Math.abs(res), eq.G)}).`;
      }
      nota(msgB, eq.b, 'err', testo);
      eq.termini.forEach((t) => { if (t.tipo === 'l') { alza(stL, t.id, 'err'); nota(msgL, t.id, 'err', `Fa parte di un bilancio non rispettato in «${nomeB(eq.b)}».`); } });
    });
    const calcLink = new Map(), calcDato = new Map();
    let nCalc = 0, nIndet = 0;
    vars.forEach((v, i) => {
      const x = sol[i];
      const dove = v.tipo === 'l' ? null : v.b;
      if (x == null) {
        nIndet++;
        if (v.tipo === 'l') { alza(stL, v.id, 'warn'); nota(msgL, v.id, 'warn', 'Valore non determinabile: mancano dati (sistema sotto-determinato).'); }
        else { alza(stB, dove, 'warn'); nota(msgB, dove, 'warn', `«${v.ogg.etichetta}»: valore non determinabile, mancano dati.`); }
        return;
      }
      nCalc++;
      (v.tipo === 'l' ? calcLink : calcDato).set(v.id, x);
      if (x < -1e-9) {
        if (v.tipo === 'l') { alza(stL, v.id, 'warn'); nota(msgL, v.id, 'warn', `Valore calcolato negativo (${fmt(x)}): controlla il verso o i dati.`); }
        else { alza(stB, dove, 'warn'); nota(msgB, dove, 'warn', `«${v.ogg.etichetta}»: valore calcolato negativo (${fmt(x)}), controlla i dati.`); }
      }
    });
    // errori di unità
    msgB.forEach((l, id) => l.forEach((m) => { if (m.liv === 'err') alza(stB, id, 'err'); }));
    msgL.forEach((l, id) => l.forEach((m) => { if (m.liv === 'err') alza(stL, id, 'err'); else if (m.liv === 'warn') alza(stL, id, 'warn'); }));
    const conta = { ok: 0, warn: 0, err: 0 };
    stB.forEach((v) => { conta[v]++; });
    return { stB, stL, msgB, msgL, calcLink, calcDato, nCalc, nIndet, conta, nEq: eqs.length };
  }

  /* ================= 4. IMPAGINAZIONE E TUBI ================= */
  const tela2d = document.createElement('canvas').getContext('2d');
  let famigliaPagina = 'system-ui, sans-serif';
  function misuratore(fam) {
    const cache = new Map();
    return (t, peso, px) => {
      const k = peso + '|' + px + '|' + t;
      if (cache.has(k)) return cache.get(k);
      tela2d.font = `${peso} ${px}px ${fam}`;
      const w = tela2d.measureText(String(t)).width;
      cache.set(k, w); return w;
    };
  }
  function testoValoreDato(dt) {
    const ut = testoUnita(dt.u, dt.ua);
    if (dt.valore != null) return { testo: fmt(dt.valore) + (ut ? ' ' + ut : ''), cls: '' };
    if (dt.calc != null) return { testo: fmt(dt.calc) + (ut ? ' ' + ut : ''), cls: 'calc' };
    return { testo: ut ? '? ' + ut : '—', cls: 'vuoto' };
  }

  /** Dimensioni automatiche: 1 dato → più largo che alto; 2 → quadrato; 3+ → più alto che largo. */
  function geometriaBlocco(b, fasci, M) {
    const n = b.dati.length;
    const fa = (k) => fasci.get(b.id + '|' + k) || { L: 0, R: 0 };
    let cw = M(b.nome || 'Blocco', 700, 13) + 2 * PADX + 14;
    const righe = b.dati.map((dt) => {
      const et = dt.etichetta || '—'; const tv = testoValoreDato(dt);
      cw = Math.max(cw, PADX + 14 + M(et, 400, 12) + 18 + M(tv.testo, 600, 12) + PADX);
      const f = fa(dt.id);
      return { dt, et, tv, p: Math.max(RIGA, Math.max(f.L, f.R) + 8) };
    });
    cw = Math.max(LARG_MIN, cw);
    const fc = fa('_'); const minC = Math.max(fc.L, fc.R) + 16;
    let w, h;
    if (n === 0) { h = Math.max(50, minC); w = Math.max(cw, h * 1.8); }
    else {
      const somma = righe.reduce((s, r) => s + r.p, 0);
      const hc = Math.max(TESTA + somma + PADB, minC);
      if (n === 1) { h = hc; w = Math.max(cw, h * 1.6); }
      else if (n === 2) { w = h = Math.max(cw, hc); }
      else { w = cw; h = Math.max(hc, w * 1.3); }
    }
    w = Math.ceil(w / GRIGLIA) * GRIGLIA; h = Math.ceil(h / GRIGLIA) * GRIGLIA;
    if (n === 2) w = h = Math.max(w, h);
    if (n >= 3 && h <= w) h = w + GRIGLIA * 2;
    if (n) {
      const somma = righe.reduce((s, r) => s + r.p, 0);
      const extra = (h - TESTA - PADB - somma) / n;
      let y = TESTA;
      righe.forEach((r) => { const pp = r.p + extra; r.cy = y + pp / 2; r.alto = pp; y += pp; });
    }
    return { w, h, righe, cyCentro: n ? (TESTA + h) / 2 : h / 2 };
  }

  function larghezzeTubi(d, mb) {
    const opz = d.opzioni; const info = new Map(); const maxG = new Map();
    d.collegamenti.forEach((l) => {
      const un = unitaEffettiva(l, mb);
      const v = l.valore != null ? l.valore : l.calc;
      const G = un ? gruppo(un.u, un.ua, opz) : null;
      const q = (G && v != null) ? Math.abs(v * G.f) : null;
      info.set(l.id, { un, G, v, q, calc: l.valore == null && l.calc != null });
      if (q != null) maxG.set(G.g, Math.max(maxG.get(G.g) || 0, q));
    });
    info.forEach((i) => {
      if (!opz.proporzionale) i.w = 10;
      else if (i.q == null) i.w = 4;
      else { const mx = maxG.get(i.G.g) || 0; i.w = mx > 0 ? Math.max(2, opz.spessoreMax * i.q / mx) : 2; }
      i.w = Math.round(i.w * 10) / 10;
    });
    return info;
  }

  function segInRett(a, b, r, inf) {
    const x1 = r.x - inf, x2 = r.x + r.w + inf, y1 = r.y - inf, y2 = r.y + r.h + inf;
    if (Math.abs(a.y - b.y) < 0.01) { if (a.y <= y1 || a.y >= y2) return false; return Math.max(a.x, b.x) > x1 && Math.min(a.x, b.x) < x2; }
    if (a.x <= x1 || a.x >= x2) return false;
    return Math.max(a.y, b.y) > y1 && Math.min(a.y, b.y) < y2;
  }
  function costoRotta(pts, ost, idA, idB, w) {
    let L = 0, colpi = 0; const ns = pts.length - 1;
    for (let i = 0; i < ns; i++) {
      const a = pts[i], b = pts[i + 1];
      L += Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      for (const o of ost) {
        let inf;
        if ((o.id === idA && i === 0) || (o.id === idB && i === ns - 1)) inf = -1;
        else if (o.id === idA || o.id === idB) inf = 3 + w / 2;
        else inf = 8 + w / 2;
        if (segInRett(a, b, o, inf)) colpi++;
      }
    }
    return L + (pts.length - 2) * 25 + colpi * 10000;
  }
  /** Percorsi ortogonali candidati tra porta P (lato sA) e porta Q (lato sB). */
  function candidati(P, sA, Q, sB, rA, rB, w) {
    const dA = sA === 'R' ? 1 : -1, dB = sB === 'L' ? 1 : -1;
    const P1 = P.x + dA * STUB, Q1 = Q.x - dB * STUB;
    const out = [];
    if (dA === dB) {
      if ((Q1 - P1) * dA >= 0) {
        if (Math.abs(P.y - Q.y) < 0.5) out.push({ pts: [P, Q], pen: 0 });
        const lo = Math.min(P1, Q1), hi = Math.max(P1, Q1), mid = (P1 + Q1) / 2;
        const passo = Math.max(6, (hi - lo) / 20);
        const xs = [mid];
        for (let k = 1; k <= 20; k++) { const a = mid + k * passo, b = mid - k * passo; if (a <= hi) xs.push(a); if (b >= lo) xs.push(b); }
        xs.forEach((x) => out.push({ pts: [P, { x, y: P.y }, { x, y: Q.y }, Q], pen: Math.abs(x - mid) * 0.05 }));
      }
      const m = 22 + w / 2;
      const top = Math.min(rA.y, rB.y) - m, bot = Math.max(rA.y + rA.h, rB.y + rB.h) + m;
      const ys = [top, bot, top - 50, bot + 50, top - 120, bot + 120, top - 220, bot + 220];
      if (rA.y + rA.h < rB.y) ys.push((rA.y + rA.h + rB.y) / 2);
      if (rB.y + rB.h < rA.y) ys.push((rB.y + rB.h + rA.y) / 2);
      ys.forEach((y) => out.push({ pts: [P, { x: P1, y: P.y }, { x: P1, y }, { x: Q1, y }, { x: Q1, y: Q.y }, Q], pen: 0 }));
    } else {
      const base = dA > 0 ? Math.max(P1, Q1) + 6 : Math.min(P1, Q1) - 6;
      for (let k = 0; k < 10; k++) { const x = base + dA * k * 24; out.push({ pts: [P, { x, y: P.y }, { x, y: Q.y }, Q], pen: k * 3 }); }
    }
    return out;
  }
  function migliorRotta(P, sA, Q, sB, rA, rB, ost, w) {
    let best = null;
    for (const c of candidati(P, sA, Q, sB, rA, rB, w)) {
      const k = costoRotta(c.pts, ost, rA.id, rB.id, w) + c.pen;
      if (!best || k < best.costo) best = { pts: c.pts.map((p) => ({ x: p.x, y: p.y })), costo: k };
    }
    return best;
  }
  function incroci(pa, pb) {
    let n = 0; const e = 0.01;
    for (let i = 0; i < pa.length - 1; i++) for (let j = 0; j < pb.length - 1; j++) {
      const a1 = pa[i], a2 = pa[i + 1], b1 = pb[j], b2 = pb[j + 1];
      const aH = Math.abs(a1.y - a2.y) < e, bH = Math.abs(b1.y - b2.y) < e;
      if (aH === bH) continue;
      const h1 = aH ? a1 : b1, h2 = aH ? a2 : b2, v1 = aH ? b1 : a1, v2 = aH ? b2 : a2;
      if (v1.x > Math.min(h1.x, h2.x) + e && v1.x < Math.max(h1.x, h2.x) - e && h1.y > Math.min(v1.y, v2.y) + e && h1.y < Math.max(v1.y, v2.y) - e) n++;
    }
    return n;
  }
  /** Separa i tratti interni sovrapposti (tubi paralleli nello stesso corridoio), ordinandoli per ridurre gli incroci. */
  function districa(rotte) {
    for (let giro = 0; giro < 2; giro++) {
      const segs = [];
      rotte.forEach((r) => {
        for (let i = 1; i < r.pts.length - 2; i++) {
          const a = r.pts[i], b = r.pts[i + 1];
          const vert = Math.abs(a.x - b.x) < 0.01;
          const lo = vert ? Math.min(a.y, b.y) : Math.min(a.x, b.x), hi = vert ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
          if (hi - lo < 0.5) continue;
          segs.push({ r, i, vert, c: vert ? a.x : a.y, lo, hi, w: r.w });
        }
      });
      const padre = segs.map((_, i) => i);
      const trova = (i) => (padre[i] === i ? i : (padre[i] = trova(padre[i])));
      for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
        const s = segs[i], t = segs[j];
        if (s.vert !== t.vert || s.r === t.r) continue;
        if (Math.abs(s.c - t.c) < (s.w + t.w) / 2 + GAP_TUBI && Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 1) padre[trova(i)] = trova(j);
      }
      const gruppi = new Map();
      segs.forEach((s, i) => { const k = trova(i); if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(s); });
      let mosso = false;
      gruppi.forEach((g) => {
        if (g.length < 2) return;
        const media = g.reduce((s, x) => s + x.c, 0) / g.length;
        const prova = (s, cs, t, ct) => {
          const ps = s.r.pts.map((p) => ({ ...p })), pt = t.r.pts.map((p) => ({ ...p }));
          const imposta = (pp, seg, c) => { if (seg.vert) { pp[seg.i].x = c; pp[seg.i + 1].x = c; } else { pp[seg.i].y = c; pp[seg.i + 1].y = c; } };
          imposta(ps, s, cs); imposta(pt, t, ct);
          return incroci(ps, pt);
        };
        g.sort((s, t) => {
          const dlt = (s.w + t.w) / 4 + 1;
          const k1 = prova(s, media - dlt, t, media + dlt), k2 = prova(s, media + dlt, t, media - dlt);
          return k1 !== k2 ? k1 - k2 : (s.c - t.c) || (s.r.l.id < t.r.l.id ? -1 : 1);
        });
        const tot = g.reduce((s, x) => s + x.w, 0) + GAP_TUBI * (g.length - 1);
        let c = media - tot / 2;
        g.forEach((s) => {
          const nc = c + s.w / 2; c += s.w + GAP_TUBI;
          const pp = s.r.pts;
          if (s.vert) { pp[s.i].x = nc; pp[s.i + 1].x = nc; } else { pp[s.i].y = nc; pp[s.i + 1].y = nc; }
          mosso = true;
        });
      });
      if (!mosso) break;
    }
  }
  function semplifica(pts) {
    const out = [];
    pts.forEach((p) => { const u = out[out.length - 1]; if (!u || Math.abs(u.x - p.x) > 0.01 || Math.abs(u.y - p.y) > 0.01) out.push({ x: p.x, y: p.y }); });
    for (let i = out.length - 2; i >= 1; i--) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      if ((Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01)) out.splice(i, 1);
    }
    return out;
  }
  /** Converte la spezzata in comandi M/L/C con angoli smussati (raggio proporzionale allo spessore). */
  function operazioniPercorso(pts, w) {
    const r0 = Math.max(8, 1.25 * w); const K = 0.5523;
    const ops = [['M', pts[0].x, pts[0].y]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1], p = pts[i], p1 = pts[i + 1];
      const l1 = Math.hypot(p.x - p0.x, p.y - p0.y), l2 = Math.hypot(p1.x - p.x, p1.y - p.y);
      const r = Math.min(r0, i - 1 === 0 ? l1 : l1 / 2, i + 1 === pts.length - 1 ? l2 : l2 / 2);
      const u1 = { x: (p.x - p0.x) / l1, y: (p.y - p0.y) / l1 }, u2 = { x: (p1.x - p.x) / l2, y: (p1.y - p.y) / l2 };
      const s = { x: p.x - u1.x * r, y: p.y - u1.y * r }, e = { x: p.x + u2.x * r, y: p.y + u2.y * r };
      ops.push(['L', s.x, s.y]);
      ops.push(['C', s.x + u1.x * r * K, s.y + u1.y * r * K, e.x - u2.x * r * K, e.y - u2.y * r * K, e.x, e.y]);
    }
    const u = pts[pts.length - 1]; ops.push(['L', u.x, u.y]);
    return ops;
  }
  const r2 = (v) => Math.round(v * 100) / 100;
  const opsInD = (ops) => ops.map((o) => o[0] + o.slice(1).map(r2).join(' ')).join(' ');

  /** Calcola la «scena»: geometria di blocchi e tubi in coordinate del mondo. Pura funzione del documento. */
  function calcolaScena(d, opz) {
    const M = misuratore(opz.famiglia);
    const mb = mappaBlocchi(d);
    const tubi = larghezzeTubi(d, mb);
    const rett = (b, g) => ({ id: b.id, x: b.x, y: b.y, w: g.w, h: g.h });
    const chiaveDato = (b, did) => (did && b.dati.some((x) => x.id === did)) ? did : '_';
    const portaY = (b, g, k) => { if (k === '_') return b.y + g.cyCentro; const r = g.righe.find((rr) => rr.dt.id === k); return b.y + (r ? r.cy : g.cyCentro); };
    const links = d.collegamenti.filter((l) => mb.has(l.da.b) && mb.has(l.a.b) && l.da.b !== l.a.b);

    // passo 1: geometria senza fasci → scelta dei lati
    const geo1 = new Map(d.blocchi.map((b) => [b.id, geometriaBlocco(b, new Map(), M)]));
    let ost = d.blocchi.map((b) => rett(b, geo1.get(b.id)));
    const lati = new Map();
    links.forEach((l) => {
      const bs = mb.get(l.da.b), bt = mb.get(l.a.b), gs = geo1.get(bs.id), gt = geo1.get(bt.id);
      const ys = portaY(bs, gs, chiaveDato(bs, l.da.d)), yt = portaY(bt, gt, chiaveDato(bt, l.a.d));
      const w = tubi.get(l.id).w; let best = null;
      for (const sA of ['R', 'L']) for (const sB of ['L', 'R']) {
        const P = { x: sA === 'R' ? bs.x + gs.w : bs.x, y: ys }, Q = { x: sB === 'L' ? bt.x : bt.x + gt.w, y: yt };
        const c = migliorRotta(P, sA, Q, sB, rett(bs, gs), rett(bt, gt), ost, w);
        const k = c.costo + (sA === 'L' ? 70 : 0) + (sB === 'R' ? 70 : 0);
        if (!best || k < best.k) best = { k, sA, sB };
      }
      lati.set(l.id, best);
    });
    // passo 2: fasci di tubi per riga e lato → geometria definitiva
    const fasci = new Map();
    const somma = (k, lato, w) => { const o = fasci.get(k) || { L: 0, R: 0, nL: 0, nR: 0 }; o[lato] += w + (o['n' + lato]++ ? GAP_TUBI : 0); fasci.set(k, o); };
    links.forEach((l) => {
      const bs = mb.get(l.da.b), bt = mb.get(l.a.b), L = lati.get(l.id), w = tubi.get(l.id).w;
      somma(bs.id + '|' + chiaveDato(bs, l.da.d), L.sA, w);
      somma(bt.id + '|' + chiaveDato(bt, l.a.d), L.sB, w);
    });
    const geo = new Map(d.blocchi.map((b) => [b.id, geometriaBlocco(b, fasci, M)]));
    ost = d.blocchi.map((b) => rett(b, geo.get(b.id)));
    // passo 3: porte (tubi affiancati, ordinati secondo la posizione dell'altro estremo)
    const gruppiPorte = new Map();
    links.forEach((l) => {
      const bs = mb.get(l.da.b), bt = mb.get(l.a.b), L = lati.get(l.id), w = tubi.get(l.id).w;
      const ks = chiaveDato(bs, l.da.d), kt = chiaveDato(bt, l.a.d);
      const ys = portaY(bs, geo.get(bs.id), ks), yt = portaY(bt, geo.get(bt.id), kt);
      const add = (k, o) => { if (!gruppiPorte.has(k)) gruppiPorte.set(k, []); gruppiPorte.get(k).push(o); };
      add(bs.id + '|' + ks + '|' + L.sA, { l, estremo: 'da', w, altroY: yt, altroX: bt.x });
      add(bt.id + '|' + kt + '|' + L.sB, { l, estremo: 'a', w, altroY: ys, altroX: bs.x });
    });
    const porte = new Map(); const affollato = new Map();
    gruppiPorte.forEach((lista, k) => {
      lista.forEach((p) => affollato.set(p.l.id + '|' + p.estremo, lista.length > 1));
      const [bid, dk, lato] = k.split('|'); const b = mb.get(bid), g = geo.get(bid);
      const cy = portaY(b, g, dk);
      lista.sort((p, q) => (p.altroY - q.altroY) || (p.altroX - q.altroX));
      const tot = lista.reduce((s, p) => s + p.w, 0) + GAP_TUBI * (lista.length - 1);
      let y = cy - tot / 2; const x = lato === 'R' ? b.x + g.w : b.x;
      lista.forEach((p) => { porte.set(p.l.id + '|' + p.estremo, { x, y: y + p.w / 2 }); y += p.w + GAP_TUBI; });
    });
    // passo 4: percorsi definitivi
    const rotte = links.map((l) => {
      const bs = mb.get(l.da.b), bt = mb.get(l.a.b), L = lati.get(l.id), w = tubi.get(l.id).w;
      const r = migliorRotta(porte.get(l.id + '|da'), L.sA, porte.get(l.id + '|a'), L.sB, rett(bs, geo.get(bs.id)), rett(bt, geo.get(bt.id)), ost, w);
      return { l, pts: r.pts, w, attraversa: r.costo >= 10000 };
    });
    districa(rotte);
    // passo 5: tubi pronti da disegnare
    const scTubi = rotte.map((r) => {
      const pts = semplifica(r.pts); const info = tubi.get(r.l.id);
      const ops = operazioniPercorso(pts, r.w);
      const info0 = tubi.get(r.l.id); const ut0 = info0.un ? testoUnita(info0.un.u, info0.un.ua) : '';
      const lungTesto = M((r.l.etichetta ? r.l.etichetta + ': ' : '') + (info0.v != null ? fmt(info0.v) : '?') + ' ' + ut0, 600, 11.5);
      let best = null;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]; const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        const oriz = Math.abs(a.y - b.y) < 0.01; let k = len * (oriz ? (len >= lungTesto + 2 * Math.max(8, 1.25 * r.w) ? 1.6 : 0.3) : 1);
        if ((i === 0 && affollato.get(r.l.id + '|da')) || (i === pts.length - 2 && affollato.get(r.l.id + '|a'))) k *= 0.45;
        if (!best || k > best.k) best = { k, a, b, len, oriz };
      }
      const mid = { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
      const dir = { x: Math.sign(best.b.x - best.a.x), y: Math.sign(best.b.y - best.a.y) };
      const un = info.un; const ut = un ? testoUnita(un.u, un.ua) : '';
      let testo = '';
      if (info.v != null) testo = fmt(info.v) + (ut ? ' ' + ut : '');
      else if (ut) testo = '? ' + ut;
      if (r.l.etichetta) testo = r.l.etichetta + (testo ? ': ' + testo : '');
      const etich = testo ? (best.oriz ? { x: mid.x, y: mid.y - r.w / 2 - 6, anc: 'middle', testo } : { x: mid.x + r.w / 2 + 6, y: mid.y, anc: 'start', testo }) : null;
      if (etich) etich.calc = info.calc;
      let freccia = null;
      if (r.w >= 5 && best.len > 46) {
        const s = clamp(r.w * 0.32, 3, 9), px = -dir.y, py = dir.x;
        const c = { x: mid.x + dir.x * (best.oriz ? 0 : 0), y: mid.y };
        freccia = [[c.x + dir.x * s, c.y + dir.y * s], [c.x - dir.x * s + px * s, c.y - dir.y * s + py * s], [c.x - dir.x * s * 0.35, c.y - dir.y * s * 0.35], [c.x - dir.x * s - px * s, c.y - dir.y * s - py * s]];
      }
      return { l: r.l, pts, w: r.w, ops, d: opsInD(ops), vettore: info.un ? vettoreDi(info.un.u) : 'altro', mancante: info.v == null, etich, freccia, attraversa: r.attraversa };
    });
    const scBlocchi = d.blocchi.map((b) => ({ b, g: geo.get(b.id) }));
    return { blocchi: scBlocchi, tubi: scTubi, geo };
  }

  function confiniScena(sc) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    sc.blocchi.forEach(({ b, g }) => { x1 = Math.min(x1, b.x - 12); y1 = Math.min(y1, b.y - 12); x2 = Math.max(x2, b.x + g.w + 12); y2 = Math.max(y2, b.y + g.h + 12); });
    sc.tubi.forEach((t) => {
      t.pts.forEach((p) => { x1 = Math.min(x1, p.x - t.w / 2); y1 = Math.min(y1, p.y - t.w / 2); x2 = Math.max(x2, p.x + t.w / 2); y2 = Math.max(y2, p.y + t.w / 2); });
      if (t.etich) { y1 = Math.min(y1, t.etich.y - 14); x2 = Math.max(x2, t.etich.x + (t.etich.anc === 'start' ? t.etich.testo.length * 7 : t.etich.testo.length * 3.5)); x1 = Math.min(x1, t.etich.x - (t.etich.anc === 'middle' ? t.etich.testo.length * 3.5 : 0)); }
    });
    if (!isFinite(x1)) return null;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  /* ================= 5. DISEGNO SVG ================= */
  function svgCorpo(sc, modo, ctx) {
    const schermo = modo === 'schermo';
    const col = (nome) => (schermo ? `var(--${nome})` : ctx.pal[nome]);
    const ver = ctx.esito ? stato.verifica : null;
    let s = '<g class="sk-tubi">';
    sc.tubi.forEach((t) => {
      const l = t.l; const st = ver && ver.r.stL.get(l.id);
      const sel = schermo && stato.selL.has(l.id);
      const cls = 'sk-tubo' + (sel ? ' sel' : '') + (st ? ' st-' + st : '');
      const nomeV = VETTORI[t.vettore].nome;
      const aria = schermo ? ` tabindex="0" role="button" aria-label="Collegamento ${esc(etichettaLink(l))}${t.etich ? ', ' + esc(t.etich.testo) : ''}"` : '';
      s += `<g class="${cls}" data-link="${l.id}"${aria}>`;
      if (schermo) s += `<path class="sk-tubo-colpo" d="${t.d}" style="stroke-width:${Math.max(t.w + 8, 16)}px"/><path class="sk-tubo-alone" d="${t.d}" style="stroke-width:${t.w + 7}px"/>`;
      if (st === 'err') s += `<path class="sk-tubo-err" d="${t.d}" style="stroke-width:${t.w + 7}px"/>`;
      else if (st === 'warn') s += `<path class="sk-tubo-warn" d="${t.d}" style="stroke-width:${t.w + 5}px"/>`;
      const tratt = t.mancante ? `;stroke-dasharray:${Math.max(6, t.w)} ${Math.max(4, t.w * 0.6)}` : '';
      s += `<path class="sk-tubo-corpo" d="${t.d}" style="stroke:${col(VETTORI[t.vettore].v)};stroke-width:${t.w}px${tratt}"><title>${esc(nomeV)}</title></path>`;
      if (t.freccia) s += `<path class="sk-freccia" d="M${t.freccia.map((p) => r2(p[0]) + ' ' + r2(p[1])).join('L')}Z"/>`;
      s += '</g>';
    });
    s += '</g><g class="sk-etichette">';
    sc.tubi.forEach((t) => {
      if (t.etich) s += `<text class="sk-tubo-etich${t.etich.calc ? ' calc' : ''}" x="${r2(t.etich.x)}" y="${r2(t.etich.y)}" text-anchor="${t.etich.anc}" dominant-baseline="${t.etich.anc === 'middle' ? 'auto' : 'central'}">${esc(t.etich.testo)}</text>`;
    });
    s += '</g><g class="sk-blocchi">';
    sc.blocchi.forEach(({ b, g }) => {
      const st = ver && ver.r.stB.get(b.id);
      const sel = schermo && stato.selB.has(b.id);
      const sorg = schermo && stato.collega && stato.collega.b === b.id;
      const cls = 'sk-blocco' + (sel ? ' sel' : '') + (st ? ' st-' + st : '') + (sorg ? ' sorgente' : '') + (ver && stato.obsoleto ? ' obsoleto' : '');
      const msgs = ver ? (ver.r.msgB.get(b.id) || []) : [];
      const descr = st === 'ok' ? 'bilancio coerente' : st === 'err' ? 'bilancio incoerente' : st === 'warn' ? 'valori non determinabili' : '';
      const aria = schermo ? ` tabindex="0" role="button" aria-label="Blocco ${esc(b.nome)}, ${b.dati.length} dati${descr ? ', ' + descr : ''}"` : '';
      s += `<g class="${cls}" data-blocco="${b.id}" transform="translate(${r2(b.x)} ${r2(b.y)})"${aria}>`;
      if (schermo && msgs.length) s += `<title>${esc(msgs.map((m) => m.testo).join('\n'))}</title>`;
      if (schermo) s += `<rect class="sk-blocco-sel" x="-5" y="-5" width="${g.w + 10}" height="${g.h + 10}" rx="11"/>`;
      s += `<rect class="sk-blocco-fondo" width="${g.w}" height="${g.h}" rx="8"/>`;
      if (b.dati.length) s += `<path class="sk-blocco-testa" d="M0 8a8 8 0 0 1 8-8h${g.w - 16}a8 8 0 0 1 8 8v${TESTA - 8}H0z"/><line class="sk-blocco-div" x1="0" x2="${g.w}" y1="${TESTA}" y2="${TESTA}"/>`;
      s += `<rect class="sk-blocco-corpo" width="${g.w}" height="${g.h}" rx="8"/>`;
      if (b.dati.length) s += `<text class="sk-blocco-nome" x="${PADX}" y="${TESTA / 2 + 1}" dominant-baseline="central">${esc(b.nome)}</text>`;
      else s += `<text class="sk-blocco-nome" x="${g.w / 2}" y="${g.h / 2}" text-anchor="middle" dominant-baseline="central">${esc(b.nome)}</text>`;
      g.righe.forEach((r) => {
        const c = col(VETTORI[unitaOk(r.dt.u, r.dt.ua) ? vettoreDi(r.dt.u) : 'altro'].v);
        const attiva = schermo && stato.collega && stato.collega.b === b.id && stato.collega.d === r.dt.id;
        s += `<g class="sk-riga${attiva ? ' sorgente' : ''}" data-dato="${r.dt.id}">`;
        if (schermo) s += `<rect class="sk-riga-hit" x="2" y="${r2(r.cy - r.alto / 2)}" width="${g.w - 4}" height="${r2(r.alto)}" rx="4"/>`;
        s += r.dt.ruolo === 'perdita'
          ? `<circle cx="${PADX + 4}" cy="${r2(r.cy)}" r="3.6" style="fill:none;stroke:${c};stroke-width:1.8px"/>`
          : `<circle cx="${PADX + 4}" cy="${r2(r.cy)}" r="4.2" style="fill:${c}"/>`;
        s += `<text class="sk-riga-etich" x="${PADX + 14}" y="${r2(r.cy)}" dominant-baseline="central">${esc(r.et)}</text>`;
        s += `<text class="sk-riga-val ${r.tv.cls}" x="${g.w - PADX}" y="${r2(r.cy)}" text-anchor="end" dominant-baseline="central">${esc(r.tv.testo)}</text></g>`;
      });
      if (st) {
        const cc = col(st === 'ok' ? 'successo' : st === 'err' ? 'errore' : 'attenzione');
        s += `<g class="sk-badge" transform="translate(${g.w - 3} 3)"><circle r="9.5" style="fill:${cc}"/>`;
        s += st === 'ok' ? '<path d="M-4.2 0.3l2.8 2.8 5.4-5.6" style="fill:none;stroke-width:2.4px;stroke-linecap:round;stroke-linejoin:round" class="sk-badge-segno"/>' : `<text text-anchor="middle" dominant-baseline="central" y="0.5">${st === 'err' ? '!' : '?'}</text>`;
        s += '</g>';
      }
      s += '</g>';
    });
    s += '</g>';
    return s;
  }
  function etichettaLink(l) {
    const mb = mappaBlocchi(doc); const bs = mb.get(l.da.b), bt = mb.get(l.a.b);
    const ds = datoDi(bs, l.da.d), dt = datoDi(bt, l.a.d);
    return `da ${bs ? bs.nome : '?'}${ds ? ' (' + ds.etichetta + ')' : ''} a ${bt ? bt.nome : '?'}${dt ? ' (' + dt.etichetta + ')' : ''}`;
  }

  /* ---- riferimenti DOM ---- */
  let tela, mondo, contenuto, sovra, griglia, pannello, corpoPannello, app;
  let disegnoRichiesto = false, scenaCorrente = null;
  function richiediDisegno() {
    if (disegnoRichiesto) return; disegnoRichiesto = true;
    requestAnimationFrame(() => { disegnoRichiesto = false; disegna(); });
  }
  function disegna() {
    const att = document.activeElement;
    const fB = att && att.closest && contenuto.contains(att) ? att.getAttribute('data-blocco') : null;
    const fL = att && att.closest && contenuto.contains(att) ? att.getAttribute('data-link') : null;
    scenaCorrente = calcolaScena(doc, { famiglia: famigliaPagina });
    contenuto.innerHTML = svgCorpo(scenaCorrente, 'schermo', { esito: true });
    if (fB) { const el = contenuto.querySelector(`[data-blocco="${fB}"]`); if (el) el.focus({ preventScroll: true }); }
    if (fL) { const el = contenuto.querySelector(`[data-link="${fL}"]`); if (el) el.focus({ preventScroll: true }); }
    tela.classList.toggle('obsoleto-tutto', !!(stato.verifica && stato.obsoleto));
    $('#sk-vuoto').hidden = doc.blocchi.length > 0;
    disegnaSovra(); aggiornaLegenda(); aggiornaInfo();
  }
  function disegnaTutto() { $('#sk-titolo').value = doc.titolo; disegna(); disegnaPannello(); aggiornaPulsanti(); aggiornaModo(); }

  function disegnaSovra() {
    let s = '';
    const dr = stato.drag;
    if (stato.modo === 'collegamento' && stato.collega && stato.mouse && scenaCorrente) {
      const b = doc.blocchi.find((x) => x.id === stato.collega.b);
      const g = b && scenaCorrente.geo.get(b.id);
      if (g) {
        const r = g.righe.find((x) => x.dt.id === stato.collega.d);
        const y = b.y + (r ? r.cy : g.cyCentro); const m = stato.mouse;
        const x0 = m.x >= b.x + g.w / 2 ? b.x + g.w : b.x; const xm = (x0 + m.x) / 2;
        s += `<path class="sk-anteprima" d="M${r2(x0)} ${r2(y)}H${r2(xm)}V${r2(m.y)}H${r2(m.x)}"/><circle cx="${r2(m.x)}" cy="${r2(m.y)}" r="4" style="fill:var(--primario)"/>`;
      }
    }
    if (dr && dr.tipo === 'riquadro' && dr.mosso) {
      const x = Math.min(dr.w0.x, dr.w1.x), y = Math.min(dr.w0.y, dr.w1.y);
      s += `<rect class="sk-riquadro" x="${x}" y="${y}" width="${Math.abs(dr.w1.x - dr.w0.x)}" height="${Math.abs(dr.w1.y - dr.w0.y)}"/>`;
    }
    sovra.innerHTML = s;
  }
  function aggiornaLegenda() {
    const presenti = new Set((scenaCorrente ? scenaCorrente.tubi : []).map((t) => t.vettore));
    doc.blocchi.forEach((b) => b.dati.forEach((dt) => { if (unitaOk(dt.u, dt.ua)) presenti.add(vettoreDi(dt.u)); }));
    const chiavi = Object.keys(VETTORI).filter((k) => presenti.size === 0 || presenti.has(k));
    let h = chiavi.map((k) => `<span><i style="background:var(--${VETTORI[k].v})"></i>${esc(VETTORI[k].nome)}</span>`).join('');
    h += '<span class="sk-leg-nota">tratteggio = valore mancante</span><span class="sk-leg-calc">corsivo = calcolato</span>';
    $('#sk-legenda').innerHTML = h;
  }
  function aggiornaInfo() {
    $('#sk-stato-info').textContent = `${doc.blocchi.length} blocchi · ${doc.collegamenti.length} collegamenti · zoom ${Math.round(stato.vista.s * 100)}%`;
  }

  /* ---- vista: zoom e spostamento ---- */
  function applicaVista() {
    const v = stato.vista;
    mondo.setAttribute('transform', `translate(${r2(v.tx)} ${r2(v.ty)}) scale(${v.s})`);
    const W = tela.clientWidth || 1000, H = tela.clientHeight || 700;
    griglia.setAttribute('x', Math.floor((-v.tx / v.s - 200) / 100) * 100);
    griglia.setAttribute('y', Math.floor((-v.ty / v.s - 200) / 100) * 100);
    griglia.setAttribute('width', Math.ceil(W / v.s + 600));
    griglia.setAttribute('height', Math.ceil(H / v.s + 600));
    tela.classList.toggle('zoom-lontano', v.s < 0.6);
    $('#sk-zoom-100').textContent = Math.round(v.s * 100) + '%';
    aggiornaInfo(); salvaPresto();
  }
  function zoomA(s, cx, cy) {
    const v = stato.vista; s = clamp(s, 0.15, 4);
    if (cx == null) { cx = tela.clientWidth / 2; cy = tela.clientHeight / 2; }
    v.tx = cx - (cx - v.tx) * s / v.s; v.ty = cy - (cy - v.ty) * s / v.s; v.s = s;
    applicaVista();
  }
  function adatta() {
    const sc = scenaCorrente || calcolaScena(doc, { famiglia: famigliaPagina });
    const bb = confiniScena(sc);
    const W = tela.clientWidth || 1000, H = tela.clientHeight || 700;
    if (!bb) { stato.vista = { tx: 60, ty: 40, s: 1 }; applicaVista(); return; }
    const s = clamp(Math.min((W - 80) / bb.w, (H - 110) / bb.h), 0.15, 1.5);
    stato.vista = { s, tx: (W - bb.w * s) / 2 - bb.x * s, ty: (H - 50 - bb.h * s) / 2 - bb.y * s };
    applicaVista();
  }
  function aMondo(cx, cy) {
    const r = tela.getBoundingClientRect(); const v = stato.vista;
    return { x: (cx - r.left - v.tx) / v.s, y: (cy - r.top - v.ty) / v.s, sx: cx - r.left, sy: cy - r.top };
  }

  /* ================= 6. INTERAZIONE ================= */
  function impostaModo(m) {
    if (stato.modo === m && m !== 'seleziona') m = 'seleziona';
    stato.modo = m; stato.collega = null;
    aggiornaModo(); richiediDisegno();
  }
  function aggiornaModo() {
    document.querySelectorAll('.sk-prim').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === stato.modo)));
    tela.classList.remove('modo-seleziona', 'modo-blocco', 'modo-collegamento');
    tela.classList.add('modo-' + stato.modo);
    mostraSuggerimento(true);
  }
  function suggerimento() {
    if (stato.modo === 'blocco') return 'Modalità Blocco: clicca nell\'area per creare un blocco · trascina i blocchi per spostarli · Esc per uscire';
    if (stato.modo === 'collegamento') {
      if (!stato.collega) return 'Modalità Collegamento: clicca la riga del dato (o il blocco) da cui PARTE il flusso · Esc per uscire';
      const b = doc.blocchi.find((x) => x.id === stato.collega.b); const dt = datoDi(b, stato.collega.d);
      return `Partenza: «${b ? b.nome : ''}${dt ? ' · ' + dt.etichetta : ''}». Ora clicca il blocco di destinazione (o la riga del dato d'arrivo) · Esc per annullare`;
    }
    if (!doc.blocchi.length) return 'Premi B (o il pulsante Blocco) e clicca nell\'area per creare il primo blocco, oppure carica un esempio.';
    if (stato.selB.size + stato.selL.size === 1) return 'Modifica nel pannello a destra · trascina per spostare · Canc per eliminare · Ctrl+D per duplicare';
    return 'Clicca un blocco o un tubo per modificarlo · trascina lo sfondo per spostare la vista · rotellina per lo zoom · Maiusc+trascina per selezionare più blocchi';
  }
  function mostraSuggerimento(forza) {
    if (forza) { clearTimeout(stato.timerMsg); stato.timerMsg = 0; }
    if (stato.timerMsg) return;
    const el = $('#sk-stato'); el.classList.remove('avviso', 'errore', 'successo');
    $('#sk-stato-testo').textContent = suggerimento();
  }
  function messaggio(testo, liv, durata) {
    const el = $('#sk-stato'); el.classList.remove('avviso', 'errore', 'successo');
    if (liv) el.classList.add(liv);
    $('#sk-stato-testo').textContent = testo;
    clearTimeout(stato.timerMsg);
    stato.timerMsg = setTimeout(() => { stato.timerMsg = 0; mostraSuggerimento(); }, durata || 4500);
  }

  function seleziona(blocchi, link, aggiungi) {
    if (!aggiungi) { stato.selB.clear(); stato.selL.clear(); }
    (blocchi || []).forEach((id) => stato.selB.add(id));
    (link || []).forEach((id) => stato.selL.add(id));
    richiediDisegno(); disegnaPannello(); aggiornaPulsanti();
    if (!stato.timerMsg) mostraSuggerimento();
  }
  function nomeUnico(base) {
    const nomi = new Set(doc.blocchi.map((b) => b.nome));
    let i = doc.blocchi.length + 1; while (nomi.has(base + ' ' + i)) i++;
    return base + ' ' + i;
  }
  function creaBlocco(wx, wy) {
    const b = { id: uid('b'), nome: nomeUnico('Blocco'), x: aggancia(wx - 70), y: aggancia(wy - 25), dati: [] };
    modifica(() => { doc.blocchi.push(b); });
    seleziona([b.id]);
    messaggio(`Creato «${b.nome}». Aggiungi i dati nel pannello a destra, oppure continua a cliccare per altri blocchi.`, 'successo');
    apriPannelloSeStretto();
    return b;
  }
  function autoDato(b, ruolo, rif) {
    if (!b.dati.length) return null;
    if (ruolo === 'a' && rif && unitaOk(rif.u, rif.ua)) {
      const G = gruppo(rif.u, rif.ua, { conversione: false });
      const usato = new Set(doc.collegamenti.filter((l) => l.a.b === b.id).map((l) => l.a.d));
      const comp = b.dati.filter((x) => unitaOk(x.u, x.ua) && gruppo(x.u, x.ua, { conversione: false }).g === G.g);
      if (comp.length) return (comp.find((x) => !usato.has(x.id)) || comp[0]).id;
    }
    if (ruolo === 'da') {
      const usato = new Set(doc.collegamenti.filter((l) => l.da.b === b.id).map((l) => l.da.d));
      const conU = b.dati.filter((x) => unitaOk(x.u, x.ua));
      if (conU.length) return (conU.find((x) => !usato.has(x.id)) || conU[0]).id;
    }
    return b.dati[0].id;
  }
  function creaCollegamento(da, a) {
    if (da.b === a.b) { messaggio('Un collegamento deve unire due blocchi diversi.', 'avviso'); return; }
    if (doc.collegamenti.some((l) => l.da.b === da.b && l.da.d === da.d && l.a.b === a.b && l.a.d === a.d)) { messaggio('Questo collegamento esiste già.', 'avviso'); stato.collega = null; richiediDisegno(); return; }
    const l = { id: uid('l'), da: { b: da.b, d: da.d }, a: { b: a.b, d: a.d }, valore: null, calc: null, u: '', ua: '', etichetta: '' };
    modifica(() => { doc.collegamenti.push(l); });
    stato.collega = null;
    seleziona([], [l.id]);
    messaggio('Collegamento creato. Inserisci valore e unità nel pannello (o lascia vuoto: lo calcola Aggiorna). Puoi continuare a collegare.', 'successo', 6000);
  }
  function eliminaSelezione() {
    if (!stato.selB.size && !stato.selL.size) { messaggio('Niente di selezionato da eliminare.'); return; }
    const nb = stato.selB.size, nl = stato.selL.size;
    modifica(() => {
      doc.blocchi = doc.blocchi.filter((b) => !stato.selB.has(b.id));
      doc.collegamenti = doc.collegamenti.filter((l) => !stato.selL.has(l.id) && !stato.selB.has(l.da.b) && !stato.selB.has(l.a.b));
    });
    seleziona([], []);
    messaggio(`Eliminati ${nb ? nb + (nb === 1 ? ' blocco' : ' blocchi') : ''}${nb && nl ? ' e ' : ''}${nl ? nl + (nl === 1 ? ' collegamento' : ' collegamenti') : ''}. Ctrl+Z per annullare.`);
  }
  function duplicaSelezione() {
    if (!stato.selB.size) { messaggio('Seleziona uno o più blocchi da duplicare.'); return; }
    const mappaB = new Map(), mappaD = new Map(); const nuovi = [], nuoviL = [];
    doc.blocchi.filter((b) => stato.selB.has(b.id)).forEach((b) => {
      const nb = JSON.parse(JSON.stringify(b)); nb.id = uid('b'); mappaB.set(b.id, nb.id);
      nb.nome = b.nome + ' (copia)'; nb.x += 40; nb.y += 40;
      nb.dati.forEach((dt) => { const n = uid('d'); mappaD.set(dt.id, n); dt.id = n; });
      nuovi.push(nb);
    });
    doc.collegamenti.filter((l) => mappaB.has(l.da.b) && mappaB.has(l.a.b)).forEach((l) => {
      const nl = JSON.parse(JSON.stringify(l)); nl.id = uid('l');
      nl.da = { b: mappaB.get(l.da.b), d: l.da.d ? mappaD.get(l.da.d) : null }; nl.a = { b: mappaB.get(l.a.b), d: l.a.d ? mappaD.get(l.a.d) : null };
      nuoviL.push(nl);
    });
    modifica(() => { doc.blocchi.push(...nuovi); doc.collegamenti.push(...nuoviL); });
    seleziona(nuovi.map((b) => b.id), []);
    messaggio(`Duplicati ${nuovi.length} blocchi.`, 'successo');
  }
  function spostaSelezione(dx, dy) {
    if (!stato.selB.size) return false;
    modifica(() => { doc.blocchi.forEach((b) => { if (stato.selB.has(b.id)) { b.x += dx; b.y += dy; } }); }, { unione: 'frecce', dati: false });
    return true;
  }

  /** AGGIORNA: spessori proporzionali + verifica dei bilanci + compilazione delle caselle vuote. */
  function aggiorna() {
    if (!doc.blocchi.length) { messaggio('Il diagramma è vuoto: crea qualche blocco prima di aggiornare.', 'avviso'); return null; }
    let r;
    modifica(() => {
      r = analizza(doc);
      doc.collegamenti.forEach((l) => { l.calc = (l.valore == null && r.calcLink.has(l.id)) ? r.calcLink.get(l.id) : null; });
      doc.blocchi.forEach((b) => b.dati.forEach((dt) => { dt.calc = (dt.valore == null && r.calcDato.has(dt.id)) ? r.calcDato.get(dt.id) : null; }));
      doc.opzioni.proporzionale = true;
    }, { dati: false });
    stato.verifica = { r, quando: new Date() };
    stato.obsoleto = false;
    disegna(); disegnaPannello(); aggiornaPulsanti();
    const c = r.conta;
    const parti = [];
    if (c.ok) parti.push(`${c.ok} ${c.ok === 1 ? 'blocco coerente' : 'blocchi coerenti'}`);
    if (c.err) parti.push(`${c.err} ${c.err === 1 ? 'incoerente' : 'incoerenti'}`);
    if (c.warn) parti.push(`${c.warn} da completare`);
    if (r.nCalc) parti.push(`${r.nCalc} ${r.nCalc === 1 ? 'valore calcolato' : 'valori calcolati'}`);
    if (r.nIndet) parti.push(`${r.nIndet} non determinabil${r.nIndet === 1 ? 'e' : 'i'}`);
    if (!r.nEq) parti.push('nessun bilancio da verificare (servono unità e collegamenti)');
    messaggio('Aggiornato: ' + parti.join(' · ') + '.', c.err ? 'errore' : (c.warn || r.nIndet || !r.nEq) ? 'avviso' : 'successo', 8000);
    return r;
  }

  function aggiornaPulsanti() {
    $('#sk-annulla').disabled = !storia.annulla.length;
    $('#sk-ripeti').disabled = !storia.ripeti.length;
    $('#sk-duplica').disabled = !stato.selB.size;
    $('#sk-elimina').disabled = !stato.selB.size && !stato.selL.size;
    $('#sk-aggiorna').classList.toggle('da-aggiornare', doc.blocchi.length > 0 && (!stato.verifica || stato.obsoleto));
  }

  /* ---- puntatore ---- */
  function suSfondo(t) { return !t.closest('[data-blocco]') && !t.closest('[data-link]'); }
  function giu(e) {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    stato.puntatori.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (stato.puntatori.size === 2) { iniziaPinch(); return; }
    if (stato.puntatori.size > 2) return;
    try { tela.setPointerCapture(e.pointerId); } catch (_) { /* ignora */ }
    const w = aMondo(e.clientX, e.clientY); stato.mouse = w;
    const elB = e.target.closest('[data-blocco]'), elL = e.target.closest('[data-link]'), elR = e.target.closest('[data-dato]');
    const base = { id: e.pointerId, x0: e.clientX, y0: e.clientY, w0: w, mosso: false };
    if (e.button === 1 || stato.spazio) { e.preventDefault(); stato.drag = { ...base, tipo: 'pan', tx0: stato.vista.tx, ty0: stato.vista.ty }; tela.classList.add('pan-attivo'); return; }
    if (stato.modo === 'collegamento' && elB) {
      e.preventDefault();
      const b = doc.blocchi.find((x) => x.id === elB.dataset.blocco); if (!b) return;
      const did = elR ? elR.dataset.dato : null;
      if (!stato.collega) {
        stato.collega = { b: b.id, d: did || autoDato(b, 'da') };
        stato.drag = { ...base, tipo: 'collega' };
        mostraSuggerimento(true); richiediDisegno();
      } else if (stato.collega.b === b.id) {
        if (did) { stato.collega.d = did; mostraSuggerimento(true); richiediDisegno(); }
      } else {
        const src = datoDi(doc.blocchi.find((x) => x.id === stato.collega.b), stato.collega.d);
        creaCollegamento(stato.collega, { b: b.id, d: did || autoDato(b, 'a', src) });
      }
      return;
    }
    if (elB) {
      const id = elB.dataset.blocco;
      if (e.shiftKey || e.ctrlKey || e.metaKey) { if (stato.selB.has(id)) stato.selB.delete(id); else stato.selB.add(id); seleziona([...stato.selB], [...stato.selL]); }
      else if (!stato.selB.has(id)) seleziona([id]);
      const orig = new Map(doc.blocchi.filter((b) => stato.selB.has(b.id)).map((b) => [b.id, { x: b.x, y: b.y }]));
      stato.drag = { ...base, tipo: 'sposta', bid: id, orig, cliccato: id, shift: e.shiftKey };
      return;
    }
    if (elL && stato.modo !== 'collegamento') {
      const id = elL.dataset.link;
      if (e.shiftKey || e.ctrlKey || e.metaKey) { if (stato.selL.has(id)) stato.selL.delete(id); else stato.selL.add(id); seleziona([...stato.selB], [...stato.selL]); }
      else seleziona([], [id]);
      apriPannelloSeStretto();
      stato.drag = { ...base, tipo: 'nulla' };
      return;
    }
    // sfondo
    if (e.shiftKey && stato.modo !== 'collegamento') { stato.drag = { ...base, tipo: 'riquadro', w1: w, prima: new Set(stato.selB) }; return; }
    stato.drag = { ...base, tipo: stato.modo === 'blocco' ? 'crea' : 'vuoto', tx0: stato.vista.tx, ty0: stato.vista.ty };
  }
  function muovi(e) {
    if (stato.puntatori.has(e.pointerId)) stato.puntatori.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (stato.pinch) { gestisciPinch(); return; }
    const w = aMondo(e.clientX, e.clientY); stato.mouse = w;
    const dr = stato.drag;
    if (!dr || dr.id !== e.pointerId) { if (stato.modo === 'collegamento' && stato.collega) disegnaSovra(); return; }
    const dx = e.clientX - dr.x0, dy = e.clientY - dr.y0;
    if (!dr.mosso && Math.hypot(dx, dy) > (e.pointerType === 'touch' ? 8 : 4)) {
      dr.mosso = true;
      if (dr.tipo === 'crea' || dr.tipo === 'vuoto') { dr.tipo = 'pan'; tela.classList.add('pan-attivo'); }
      if (dr.tipo === 'sposta') registra(null);
    }
    if (!dr.mosso) return;
    if (dr.tipo === 'pan') { stato.vista.tx = dr.tx0 + dx; stato.vista.ty = dr.ty0 + dy; applicaVista(); }
    else if (dr.tipo === 'sposta') {
      const o = dr.orig.get(dr.bid) || { x: 0, y: 0 };
      const nx = aggancia(o.x + dx / stato.vista.s), ny = aggancia(o.y + dy / stato.vista.s);
      const ddx = nx - o.x, ddy = ny - o.y;
      doc.blocchi.forEach((b) => { const p = dr.orig.get(b.id); if (p) { b.x = p.x + ddx; b.y = p.y + ddy; } });
      richiediDisegno();
    } else if (dr.tipo === 'riquadro') {
      dr.w1 = w; disegnaSovra();
    } else if (dr.tipo === 'collega') disegnaSovra();
  }
  function su(e) {
    stato.puntatori.delete(e.pointerId);
    if (stato.pinch) { if (stato.puntatori.size < 2) stato.pinch = null; return; }
    const dr = stato.drag; if (!dr || dr.id !== e.pointerId) return;
    stato.drag = null; tela.classList.remove('pan-attivo');
    const w = aMondo(e.clientX, e.clientY);
    if (dr.tipo === 'crea' && !dr.mosso) creaBlocco(w.x, w.y);
    else if (dr.tipo === 'vuoto' && !dr.mosso) { if (stato.selB.size || stato.selL.size) seleziona([], []); }
    else if (dr.tipo === 'sposta') {
      if (dr.mosso) { storia.ultima = null; salvaPresto(); disegnaPannello(); aggiornaPulsanti(); }
      else { if (!dr.shift && stato.selB.size > 1) seleziona([dr.cliccato]); apriPannelloSeStretto(); }
    } else if (dr.tipo === 'riquadro') {
      const x1 = Math.min(dr.w0.x, dr.w1.x), x2 = Math.max(dr.w0.x, dr.w1.x), y1 = Math.min(dr.w0.y, dr.w1.y), y2 = Math.max(dr.w0.y, dr.w1.y);
      const dentro = scenaCorrente.blocchi.filter(({ b, g }) => b.x < x2 && b.x + g.w > x1 && b.y < y2 && b.y + g.h > y1).map(({ b }) => b.id);
      const ids = new Set([...dr.prima, ...dentro]);
      const links = doc.collegamenti.filter((l) => ids.has(l.da.b) && ids.has(l.a.b)).map((l) => l.id);
      seleziona([...ids], links);
      if (dentro.length) messaggio(`${ids.size} blocchi selezionati.`);
      disegnaSovra();
    } else if (dr.tipo === 'collega' && dr.mosso) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const elB = el && el.closest && el.closest('[data-blocco]');
      if (elB && stato.collega && elB.dataset.blocco !== stato.collega.b) {
        const b = doc.blocchi.find((x) => x.id === elB.dataset.blocco);
        const elR = el.closest('[data-dato]');
        const src = datoDi(doc.blocchi.find((x) => x.id === stato.collega.b), stato.collega.d);
        creaCollegamento(stato.collega, { b: b.id, d: elR ? elR.dataset.dato : autoDato(b, 'a', src) });
      }
    }
  }
  function annullaPuntatore(e) { stato.puntatori.delete(e.pointerId); if (stato.puntatori.size < 2) stato.pinch = null; if (stato.drag && stato.drag.id === e.pointerId) { stato.drag = null; tela.classList.remove('pan-attivo'); disegnaSovra(); } }
  function iniziaPinch() {
    const [a, b] = [...stato.puntatori.values()];
    if (stato.drag && stato.drag.tipo === 'sposta' && stato.drag.mosso) { storia.ultima = null; salvaPresto(); }
    stato.drag = null;
    const r = tela.getBoundingClientRect();
    stato.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: stato.vista.s, m0: { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }, tx0: stato.vista.tx, ty0: stato.vista.ty };
  }
  function gestisciPinch() {
    const [a, b] = [...stato.puntatori.values()]; if (!a || !b) return;
    const p = stato.pinch; const r = tela.getBoundingClientRect();
    const d = Math.hypot(a.x - b.x, a.y - b.y); const m = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    const s = clamp(p.s0 * d / p.d0, 0.15, 4);
    const wx = (p.m0.x - p.tx0) / p.s0, wy = (p.m0.y - p.ty0) / p.s0;
    stato.vista = { s, tx: m.x - wx * s, ty: m.y - wy * s };
    applicaVista();
  }
  function rotella(e) {
    e.preventDefault();
    const r = tela.getBoundingClientRect();
    const k = e.ctrlKey ? 0.01 : 0.0015;
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    zoomA(stato.vista.s * Math.exp(-dy * k), e.clientX - r.left, e.clientY - r.top);
  }

  /* ---- tastiera ---- */
  function inCampo(t) { return t && (t.closest('input, textarea, select, [contenteditable="true"]') || false); }
  function tasto(e) {
    if ($('#sk-tutorial').open) return;
    const t = e.target; const ctrl = e.ctrlKey || e.metaKey; const k = e.key;
    if (k === 'Escape') {
      if (inCampo(t) || pannello.contains(t)) { tela.focus({ preventScroll: true }); chiudiPannelloSeStretto(); e.preventDefault(); return; }
      if (stato.collega) { stato.collega = null; mostraSuggerimento(); richiediDisegno(); messaggio('Collegamento annullato.'); }
      else if (stato.modo !== 'seleziona') impostaModo('seleziona');
      else if (stato.selB.size || stato.selL.size) seleziona([], []);
      return;
    }
    if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); salvaJSON(); return; }
    if (inCampo(t)) return;
    if (ctrl && !e.shiftKey && (k === 'z' || k === 'Z')) { e.preventDefault(); annulla(); return; }
    if (ctrl && (k === 'y' || k === 'Y' || (e.shiftKey && (k === 'z' || k === 'Z')))) { e.preventDefault(); ripeti(); return; }
    if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); duplicaSelezione(); return; }
    if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); seleziona(doc.blocchi.map((b) => b.id), doc.collegamenti.map((l) => l.id)); return; }
    if (ctrl || e.altKey) return;
    const suTela = t === document.body || tela.contains(t) || t === tela;
    if (k === ' ' && suTela) { e.preventDefault(); if (!stato.spazio) { stato.spazio = true; tela.classList.add('spazio'); } return; }
    if (t.closest && t.closest('button, a, summary, label') && (k === 'Enter' || k === ' ')) return;
    const lk = k.length === 1 ? k.toLowerCase() : k;
    if (lk === 'b') { impostaModo('blocco'); e.preventDefault(); }
    else if (lk === 'l') { impostaModo('collegamento'); e.preventDefault(); }
    else if (lk === 'v') { impostaModo('seleziona'); e.preventDefault(); }
    else if (lk === 'a') { aggiorna(); e.preventDefault(); }
    else if (k === 'Delete' || k === 'Backspace') { eliminaSelezione(); e.preventDefault(); }
    else if (k === '+' || k === '=') { zoomA(stato.vista.s * 1.2); e.preventDefault(); }
    else if (k === '-' || k === '_') { zoomA(stato.vista.s / 1.2); e.preventDefault(); }
    else if (k === '0') { adatta(); e.preventDefault(); }
    else if (k === 'F2' || (k === 'Enter' && suTela)) {
      if (stato.selB.size + stato.selL.size === 1) { e.preventDefault(); apriPannelloSeStretto(); const f = corpoPannello.querySelector('input, select'); if (f) { f.focus(); if (f.select) f.select(); } }
      else if (k === 'Enter' && document.activeElement && document.activeElement.dataset && document.activeElement.dataset.blocco) { e.preventDefault(); }
    } else if (k.startsWith('Arrow')) {
      const p = e.shiftKey ? GRIGLIA * 5 : GRIGLIA;
      const dx = k === 'ArrowLeft' ? -p : k === 'ArrowRight' ? p : 0, dy = k === 'ArrowUp' ? -p : k === 'ArrowDown' ? p : 0;
      e.preventDefault();
      if (!spostaSelezione(dx, dy)) { stato.vista.tx -= dx * 4; stato.vista.ty -= dy * 4; applicaVista(); }
    }
  }
  function tastoSu(e) { if (e.key === ' ') { stato.spazio = false; tela.classList.remove('spazio'); } }

  /* ================= 7. PANNELLO DELLE PROPRIETÀ ================= */
  function opzioniUnita(sel, vuota) {
    let h = vuota != null ? `<option value=""${!sel ? ' selected' : ''}>${esc(vuota)}</option>` : '';
    ORDINE_UNITA.forEach((u) => { h += `<option value="${u}"${sel === u ? ' selected' : ''}>${esc(UNITA[u].etichetta)}</option>`; });
    return h;
  }
  const pastiglia = (u) => `<span class="sk-pastiglia" style="background:var(--${VETTORI[u ? vettoreDi(u) : 'altro'].v})" aria-hidden="true"></span>`;
  const iconaSt = (st) => st ? `<span class="sk-icona-st ${st}" aria-hidden="true">${st === 'ok' ? '✓' : st === 'err' ? '!' : '?'}</span>` : '';
  const testoSt = { ok: 'coerente', err: 'incoerente', warn: 'da completare' };
  function elencoMsg(msgs) {
    return msgs.map((m) => `<div class="sk-msg ${m.liv}">${esc(m.testo)}</div>`).join('');
  }

  function disegnaPannello() {
    if (!corpoPannello) return;
    const att = document.activeElement;
    let fuoco = null;
    if (att && corpoPannello.contains(att) && att.dataset) fuoco = { campo: att.dataset.campo, azione: att.dataset.azione, dato: att.dataset.dato, id: att.dataset.id, ss: att.selectionStart, se: att.selectionEnd };
    const nB = stato.selB.size, nL = stato.selL.size;
    let h;
    if (nB === 1 && nL === 0) h = pannelloBlocco(doc.blocchi.find((b) => stato.selB.has(b.id)));
    else if (nL === 1 && nB === 0) h = pannelloLink(doc.collegamenti.find((l) => stato.selL.has(l.id)));
    else if (nB + nL > 1) h = pannelloMulti(nB, nL);
    else h = pannelloDiagramma();
    corpoPannello.innerHTML = h;
    if (fuoco) {
      let sel = fuoco.campo ? `[data-campo="${fuoco.campo}"]` : fuoco.azione ? `[data-azione="${fuoco.azione}"]` : null;
      if (sel) {
        if (fuoco.dato) sel += `[data-dato="${fuoco.dato}"]`;
        if (fuoco.id) sel += `[data-id="${fuoco.id}"]`;
        const el = corpoPannello.querySelector(sel);
        if (el) { el.focus({ preventScroll: true }); try { if (fuoco.ss != null && el.setSelectionRange) el.setSelectionRange(fuoco.ss, fuoco.se); } catch (_) { /* select */ } }
      }
    }
  }
  function chiudiBtn() { return '<button type="button" class="sk-btn sk-piccolo sk-chiudi-pannello" data-azione="chiudi-pannello" aria-label="Chiudi il pannello">✕</button>'; }

  function pannelloDiagramma() {
    const o = doc.opzioni; const v = stato.verifica;
    let h = `<h2>Diagramma ${chiudiBtn()}</h2>`;
    h += '<p class="sk-nota">Nessun elemento selezionato: clicca un blocco o un tubo per modificarlo. Qui trovi le opzioni di calcolo e l\'esito della verifica.</p>';
    h += '<h3>Calcolo e spessori</h3>';
    h += `<label class="sk-check"><input type="checkbox" data-campo="o-conv"${o.conversione ? ' checked' : ''}> Converti in energia (kWh)</label>`;
    h += '<p class="sk-nota">Con la conversione MWh → kWh, Sm³ → kWh (con il PCI), elettricità e calore entrano nello stesso bilancio energetico e nella stessa scala degli spessori. Senza, ogni unità ha il suo bilancio e la sua scala (kWh e MWh dello stesso vettore restano sempre confrontabili).</p>';
    h += `<label class="sk-campo"><span>PCI del gas naturale (kWh/Sm³)</span><input class="sk-num" inputmode="decimal" data-campo="o-pci" value="${fmtCampo(o.pci)}"${o.conversione ? '' : ' disabled'}></label>`;
    h += `<label class="sk-check"><input type="checkbox" data-campo="o-prop"${o.proporzionale ? ' checked' : ''}> Spessore proporzionale ai valori</label>`;
    h += `<label class="sk-campo"><span>Spessore massimo dei tubi: <output id="sk-spess-val">${o.spessoreMax}</output> px</span><input type="range" min="10" max="90" step="2" data-campo="o-spess" value="${o.spessoreMax}"></label>`;
    h += `<label class="sk-check"><input type="checkbox" data-campo="o-aggancio"${o.aggancio ? ' checked' : ''}> Aggancio alla griglia (10 px)</label>`;
    h += '<h3>Verifica dei bilanci</h3>';
    if (!v) h += '<div class="sk-msg info">Premi <strong>Aggiorna</strong> (tasto A) per verificare i bilanci, calcolare le caselle vuote e rendere gli spessori proporzionali.</div>';
    else {
      if (stato.obsoleto) h += '<div class="sk-msg warn">Hai modificato il diagramma dopo l\'ultima verifica: premi Aggiorna.</div>';
      const c = v.r.conta;
      h += `<p class="sk-conteggi"><span>${iconaSt('ok')} ${c.ok} coerenti</span><span>${iconaSt('err')} ${c.err} incoerenti</span><span>${iconaSt('warn')} ${c.warn} da completare</span></p>`;
      h += `<p class="sk-nota">${v.r.nCalc} valori calcolati, ${v.r.nIndet} non determinabili · verifica delle ${v.quando.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</p>`;
      const righe = [];
      doc.blocchi.forEach((b) => (v.r.msgB.get(b.id) || []).forEach((m) => { if (m.liv !== 'ok') righe.push(`<li>${iconaSt(m.liv === 'info' ? '' : m.liv)}<span><button type="button" class="sk-link" data-azione="sel-blocco" data-id="${b.id}">${esc(b.nome)}</button>: ${esc(m.testo)}</span></li>`); }));
      doc.collegamenti.forEach((l) => (v.r.msgL.get(l.id) || []).forEach((m) => { if (m.liv === 'warn' || (m.liv === 'err' && !/Fa parte/.test(m.testo))) righe.push(`<li>${iconaSt(m.liv)}<span><button type="button" class="sk-link" data-azione="sel-link" data-id="${l.id}">Collegamento ${esc(etichettaLink(l))}</button>: ${esc(m.testo)}</span></li>`); }));
      if (righe.length) h += `<ul class="sk-elenco">${righe.join('')}</ul>`;
      else if (v.r.nEq) h += '<div class="sk-msg ok">Tutti i bilanci sono rispettati.</div>';
    }
    const nCalc = doc.collegamenti.filter((l) => l.calc != null).length + doc.blocchi.reduce((s, b) => s + b.dati.filter((d) => d.calc != null).length, 0);
    if (nCalc) h += `<div class="sk-azioni"><button type="button" class="sk-btn sk-piccolo" data-azione="fissa-tutti" data-tip="Trasforma i ${nCalc} valori calcolati in valori inseriti">Fissa i ${nCalc} calcolati</button><button type="button" class="sk-btn sk-piccolo" data-azione="cancella-calc">Cancella i calcolati</button></div>`;
    h += `<details class="sk-semantica"><summary>Come vengono verificati i bilanci</summary><ol>
      <li><strong>Dato collegato.</strong> Il valore di un dato (riga) è uguale alla somma dei tubi che arrivano a quella riga e, separatamente, alla somma dei tubi che partono da quella riga.</li>
      <li><strong>Blocco.</strong> Per ogni vettore (unità di misura o, con la conversione, energia in kWh): se il blocco ha sia ingressi sia uscite, Σ ingressi = Σ uscite + Σ dati con ruolo «Perdita». Un blocco senza ingressi è una <em>sorgente</em>, senza uscite è un'<em>utenza</em>: non ha vincoli di blocco.</li>
      <li><strong>Caselle vuote.</strong> Un dato o un tubo con l'unità ma senza valore è un'incognita: Aggiorna risolve il sistema lineare dei bilanci e scrive in <em style="color:var(--segno)">corsivo colorato</em> i valori determinati in modo univoco. Se i dati non bastano, segnala «non determinabile». «Fissa» trasforma un valore calcolato in inserito.</li>
      <li>Dati senza tubi e non «Perdita» sono solo informativi. Tolleranza: 0,1% del termine più grande.</li></ol></details>`;
    return h;
  }

  function pannelloBlocco(b) {
    if (!b) return pannelloDiagramma();
    const v = stato.verifica; const st = v ? v.r.stB.get(b.id) : null;
    let h = `<h2>${iconaSt(st)} Blocco ${chiudiBtn()}</h2>`;
    h += `<label class="sk-campo"><span>Nome del blocco</span><input type="text" data-campo="b-nome" value="${esc(b.nome)}" maxlength="80"></label>`;
    h += `<h3>Dati del blocco (${b.dati.length})</h3>`;
    if (!b.dati.length) h += '<p class="sk-nota">Ogni dato diventa una riga di testo nel blocco; i tubi partono e arrivano all\'altezza della sua riga. Con un dato il blocco è più largo che alto, con due è quadrato, con tre o più è più alto che largo.</p>';
    b.dati.forEach((dt, i) => {
      const nl = doc.collegamenti.filter((l) => (l.da.b === b.id && l.da.d === dt.id) || (l.a.b === b.id && l.a.d === dt.id)).length;
      const ut = testoUnita(dt.u, dt.ua);
      h += `<div class="sk-dato" data-dato="${dt.id}" role="group" aria-label="Dato ${i + 1}">`;
      h += `<div class="sk-dato-testa">${pastiglia(dt.u)}<input type="text" data-campo="d-etich" data-dato="${dt.id}" value="${esc(dt.etichetta)}" aria-label="Etichetta del dato ${i + 1}" maxlength="80">`;
      h += `<button type="button" class="sk-btn sk-icona" data-azione="d-su" data-dato="${dt.id}" aria-label="Sposta su" data-tip="Sposta su"${i === 0 ? ' disabled' : ''}>↑</button>`;
      h += `<button type="button" class="sk-btn sk-icona" data-azione="d-giu" data-dato="${dt.id}" aria-label="Sposta giù" data-tip="Sposta giù"${i === b.dati.length - 1 ? ' disabled' : ''}>↓</button>`;
      h += `<button type="button" class="sk-btn sk-icona sk-pericolo" data-azione="d-elimina" data-dato="${dt.id}" aria-label="Elimina il dato" data-tip="Elimina il dato">×</button></div>`;
      h += `<label>Valore<input type="text" class="sk-num${dt.calc != null ? ' calc' : ''}" inputmode="decimal" data-campo="d-val" data-dato="${dt.id}" value="${fmtCampo(dt.valore)}" placeholder="${dt.calc != null ? '≈ ' + esc(fmt(dt.calc)) : 'vuoto = da calcolare'}" autocomplete="off"></label>`;
      h += `<label>Unità<select data-campo="d-u" data-dato="${dt.id}">${opzioniUnita(dt.u, '(nessuna)')}</select></label>`;
      if (dt.u === 'altro') h += `<label class="sk-larga">Unità libera<input type="text" data-campo="d-ua" data-dato="${dt.id}" value="${esc(dt.ua)}" maxlength="30" placeholder="es. kg vapore, %"></label>`;
      h += `<label class="sk-larga">Ruolo<select data-campo="d-ruolo" data-dato="${dt.id}"><option value="valore"${dt.ruolo !== 'perdita' ? ' selected' : ''}>Valore della riga (totale dei tubi collegati)</option><option value="perdita"${dt.ruolo === 'perdita' ? ' selected' : ''}>Perdita (esce dal bilancio senza tubi)</option></select></label>`;
      if (dt.calc != null) h += `<div class="sk-val-calc">Calcolato: ${esc(fmt(dt.calc))} ${esc(ut)}<button type="button" class="sk-btn" data-azione="d-fissa" data-dato="${dt.id}">Fissa</button></div>`;
      h += `<p class="sk-nota sk-larga" style="margin:0">${nl ? nl + (nl === 1 ? ' tubo agganciato' : ' tubi agganciati') : 'nessun tubo agganciato'}</p>`;
      h += '</div>';
    });
    h += '<button type="button" class="sk-btn sk-piccolo" data-azione="d-aggiungi" data-tip="Aggiunge una riga di dati al blocco">+ Aggiungi dato</button>';
    const ent = doc.collegamenti.filter((l) => l.a.b === b.id), usc = doc.collegamenti.filter((l) => l.da.b === b.id);
    h += '<h3>Collegamenti</h3>';
    if (!ent.length && !usc.length) h += '<p class="sk-nota">Nessun collegamento. Usa «Collega da qui» o premi L.</p>';
    else {
      const mb = mappaBlocchi(doc);
      const voce = (l, verso) => { const altro = mb.get(verso === 'in' ? l.da.b : l.a.b); const val = l.valore != null ? l.valore : l.calc; const un = unitaEffettiva(l, mb); return `<li>${pastiglia(un && un.u)}<span>${verso === 'in' ? 'da' : 'verso'} <button type="button" class="sk-link" data-azione="sel-link" data-id="${l.id}">${esc(altro ? altro.nome : '?')}</button>${val != null ? ' · ' + esc(fmt(val)) + ' ' + esc(un ? testoUnita(un.u, un.ua) : '') : ''}</span></li>`; };
      h += `<ul class="sk-elenco">${ent.map((l) => voce(l, 'in')).join('')}${usc.map((l) => voce(l, 'out')).join('')}</ul>`;
    }
    if (v) {
      h += '<h3>Verifica</h3>';
      const msgs = v.r.msgB.get(b.id) || [];
      if (stato.obsoleto) h += '<div class="sk-msg warn">Modificato dopo l\'ultima verifica: premi Aggiorna.</div>';
      if (msgs.length) h += elencoMsg(msgs);
      else if (st === 'ok') h += '<div class="sk-msg ok">Bilancio coerente: ingressi e uscite tornano.</div>';
      else h += '<div class="sk-msg info">Nessun bilancio da verificare per questo blocco.</div>';
      if (st) h += `<p class="sk-sr">Esito: ${testoSt[st]}</p>`;
    }
    h += '<div class="sk-azioni"><button type="button" class="sk-btn sk-piccolo" data-azione="b-collega" data-tip="Entra in modalità Collegamento partendo da questo blocco">Collega da qui</button><button type="button" class="sk-btn sk-piccolo" data-azione="duplica">Duplica</button><button type="button" class="sk-btn sk-piccolo sk-pericolo" data-azione="elimina">Elimina blocco</button></div>';
    return h;
  }

  function pannelloLink(l) {
    if (!l) return pannelloDiagramma();
    const mb = mappaBlocchi(doc); const bs = mb.get(l.da.b), bt = mb.get(l.a.b);
    const v = stato.verifica; const st = v ? v.r.stL.get(l.id) : null;
    const un = unitaEffettiva(l, mb);
    const ereditata = (() => { const ds = datoDi(bs, l.da.d), dt = datoDi(bt, l.a.d); const x = (ds && unitaOk(ds.u, ds.ua)) ? ds : (dt && unitaOk(dt.u, dt.ua)) ? dt : null; return x ? testoUnita(x.u, x.ua) : null; })();
    let h = `<h2>${iconaSt(st)} Collegamento ${chiudiBtn()}</h2>`;
    h += `<p>Da <button type="button" class="sk-link sk-btn-testo" data-azione="sel-blocco" data-id="${bs.id}">${esc(bs.nome)}</button> a <button type="button" class="sk-link sk-btn-testo" data-azione="sel-blocco" data-id="${bt.id}">${esc(bt.nome)}</button></p>`;
    const opzDati = (b, sel) => (b.dati.length ? b.dati.map((dt) => `<option value="${dt.id}"${dt.id === sel ? ' selected' : ''}>${esc(dt.etichetta || '—')}${unitaOk(dt.u, dt.ua) ? ' (' + esc(testoUnita(dt.u, dt.ua)) + ')' : ''}</option>`).join('') : '') + `<option value=""${!sel ? ' selected' : ''}>(centro del blocco)</option>`;
    h += `<label class="sk-campo"><span>Parte dal dato di «${esc(bs.nome)}»</span><select data-campo="l-da-d">${opzDati(bs, l.da.d)}</select></label>`;
    h += `<label class="sk-campo"><span>Arriva al dato di «${esc(bt.nome)}»</span><select data-campo="l-a-d">${opzDati(bt, l.a.d)}</select></label>`;
    h += '<div class="sk-due">';
    h += `<label class="sk-campo"><span>Valore del flusso</span><input type="text" class="sk-num${l.calc != null ? ' calc' : ''}" inputmode="decimal" data-campo="l-val" value="${fmtCampo(l.valore)}" placeholder="${l.calc != null ? '≈ ' + esc(fmt(l.calc)) : 'vuoto = da calcolare'}" autocomplete="off"></label>`;
    h += `<label class="sk-campo"><span>Unità</span><select data-campo="l-u">${opzioniUnita(l.u, ereditata ? 'come il dato (' + ereditata + ')' : '(scegli)')}</select></label>`;
    h += '</div>';
    if (l.u === 'altro') h += `<label class="sk-campo"><span>Unità libera</span><input type="text" data-campo="l-ua" value="${esc(l.ua)}" maxlength="30"></label>`;
    if (!un) h += '<div class="sk-msg warn">Scegli un\'unità (qui o nel dato collegato): senza unità il tubo è grigio e non entra nei bilanci.</div>';
    if (l.calc != null) h += `<div class="sk-val-calc">Calcolato: ${esc(fmt(l.calc))} ${esc(un ? testoUnita(un.u, un.ua) : '')}<button type="button" class="sk-btn" data-azione="l-fissa">Fissa</button></div>`;
    h += `<label class="sk-campo"><span>Etichetta (facoltativa)</span><input type="text" data-campo="l-etich" value="${esc(l.etichetta)}" maxlength="80" placeholder="es. cessione in rete"></label>`;
    if (v) {
      h += '<h3>Verifica</h3>';
      const msgs = v.r.msgL.get(l.id) || [];
      if (msgs.length) h += elencoMsg(msgs);
      else if (st === 'ok') h += '<div class="sk-msg ok">Il tubo rispetta i bilanci dei blocchi che collega.</div>';
      else h += '<div class="sk-msg info">Nessun bilancio coinvolge questo tubo.</div>';
    }
    h += '<div class="sk-azioni"><button type="button" class="sk-btn sk-piccolo" data-azione="l-inverti">Inverti verso</button><button type="button" class="sk-btn sk-piccolo sk-pericolo" data-azione="elimina">Elimina collegamento</button></div>';
    return h;
  }

  function pannelloMulti(nB, nL) {
    let h = `<h2>Selezione multipla ${chiudiBtn()}</h2><p>${nB} blocchi e ${nL} collegamenti selezionati.</p>`;
    h += '<p class="sk-nota">Trascina uno dei blocchi per spostarli tutti insieme, oppure usa le frecce (Maiusc per passi più lunghi).</p>';
    if (nB > 1) h += '<h3>Allinea</h3><div class="sk-azioni"><button type="button" class="sk-btn sk-piccolo" data-azione="allinea-sx">A sinistra</button><button type="button" class="sk-btn sk-piccolo" data-azione="allinea-alto">In alto</button><button type="button" class="sk-btn sk-piccolo" data-azione="distribuisci-v">Distribuisci in verticale</button></div>';
    h += '<div class="sk-azioni"><button type="button" class="sk-btn sk-piccolo" data-azione="duplica">Duplica</button><button type="button" class="sk-btn sk-piccolo sk-pericolo" data-azione="elimina">Elimina selezione</button></div>';
    return h;
  }

  function bloccoSel() { return doc.blocchi.find((b) => stato.selB.has(b.id)); }
  function linkSel() { return doc.collegamenti.find((l) => stato.selL.has(l.id)); }
  function campoPannello(e) {
    const el = e.target; const c = el.dataset.campo; if (!c) return;
    const tipoEv = e.type;
    const b = bloccoSel(), l = linkSel();
    const dt = b && el.dataset.dato ? b.dati.find((x) => x.id === el.dataset.dato) : null;
    const leggiVal = () => { const v = leggiNumero(el.value); const bad = Number.isNaN(v); el.setAttribute('aria-invalid', String(bad)); if (bad) messaggio('Numero non valido: usa la virgola per i decimali (es. 1.234,5).', 'avviso'); return bad ? undefined : v; };
    switch (c) {
      case 'b-nome': if (tipoEv === 'input' && b) modifica(() => { b.nome = el.value; }, { unione: 'b-nome' + b.id, dati: false }); break;
      case 'd-etich': if (tipoEv === 'input' && dt) modifica(() => { dt.etichetta = el.value; }, { unione: 'd-etich' + dt.id, dati: false }); break;
      case 'd-val': if (tipoEv === 'input' && dt) { const v = leggiVal(); if (v !== undefined) modifica(() => { dt.valore = v; if (v != null) dt.calc = null; }, { unione: 'd-val' + dt.id }); } break;
      case 'd-u': if (tipoEv === 'change' && dt) {
        modifica(() => {
          const vecchio = UNITA[dt.u] ? UNITA[dt.u].nomeDato : null;
          if (!dt.etichetta || dt.etichetta === vecchio || /^Dato( \d+)?$/.test(dt.etichetta)) dt.etichetta = UNITA[el.value] ? UNITA[el.value].nomeDato : dt.etichetta;
          dt.u = el.value;
        }, { pannello: true });
      } break;
      case 'd-ua': if (tipoEv === 'input' && dt) modifica(() => { dt.ua = el.value; }, { unione: 'd-ua' + dt.id }); break;
      case 'd-ruolo': if (tipoEv === 'change' && dt) modifica(() => { dt.ruolo = el.value; }); break;
      case 'l-val': if (tipoEv === 'input' && l) { const v = leggiVal(); if (v !== undefined) modifica(() => { l.valore = v; if (v != null) l.calc = null; }, { unione: 'l-val' + l.id }); } break;
      case 'l-u': if (tipoEv === 'change' && l) modifica(() => { l.u = el.value; }, { pannello: true }); break;
      case 'l-ua': if (tipoEv === 'input' && l) modifica(() => { l.ua = el.value; }, { unione: 'l-ua' + l.id }); break;
      case 'l-etich': if (tipoEv === 'input' && l) modifica(() => { l.etichetta = el.value; }, { unione: 'l-etich' + l.id, dati: false }); break;
      case 'l-da-d': if (tipoEv === 'change' && l) modifica(() => { l.da.d = el.value || null; }, { pannello: true }); break;
      case 'l-a-d': if (tipoEv === 'change' && l) modifica(() => { l.a.d = el.value || null; }, { pannello: true }); break;
      case 'o-conv': if (tipoEv === 'change') modifica(() => { doc.opzioni.conversione = el.checked; }, { pannello: true }); break;
      case 'o-pci': if (tipoEv === 'input') { const v = leggiVal(); if (v != null && v > 0) modifica(() => { doc.opzioni.pci = v; }, { unione: 'o-pci' }); } break;
      case 'o-prop': if (tipoEv === 'change') modifica(() => { doc.opzioni.proporzionale = el.checked; }, { dati: false }); break;
      case 'o-spess': if (tipoEv === 'input') { const o = $('#sk-spess-val'); if (o) o.textContent = el.value; modifica(() => { doc.opzioni.spessoreMax = Number(el.value); doc.opzioni.proporzionale = true; }, { unione: 'o-spess', dati: false }); } break;
      case 'o-aggancio': if (tipoEv === 'change') modifica(() => { doc.opzioni.aggancio = el.checked; }, { dati: false }); break;
      default: break;
    }
  }
  function azionePannello(e) {
    const el = e.target.closest('[data-azione]'); if (!el || el.disabled) return;
    const a = el.dataset.azione; const b = bloccoSel(), l = linkSel();
    const idx = b && el.dataset.dato ? b.dati.findIndex((x) => x.id === el.dataset.dato) : -1;
    switch (a) {
      case 'chiudi-pannello': chiudiPannelloSeStretto(); tela.focus({ preventScroll: true }); break;
      case 'd-aggiungi': if (b) {
        const ult = b.dati[b.dati.length - 1];
        const nd = nuovoDato({ u: ult ? ult.u : 'kWh', ua: ult ? ult.ua : '' });
        modifica(() => { b.dati.push(nd); }, { pannello: true });
        const f = corpoPannello.querySelector(`[data-campo="d-etich"][data-dato="${nd.id}"]`); if (f) { f.focus(); f.select(); }
      } break;
      case 'd-elimina': if (b && idx >= 0) {
        const id = b.dati[idx].id;
        modifica(() => { b.dati.splice(idx, 1); doc.collegamenti.forEach((x) => { if (x.da.b === b.id && x.da.d === id) x.da.d = null; if (x.a.b === b.id && x.a.d === id) x.a.d = null; }); }, { pannello: true });
        messaggio('Dato eliminato (i tubi agganciati passano al centro del blocco). Ctrl+Z per annullare.');
      } break;
      case 'd-su': case 'd-giu': if (b && idx >= 0) {
        const j = a === 'd-su' ? idx - 1 : idx + 1; if (j < 0 || j >= b.dati.length) break;
        modifica(() => { const t = b.dati[idx]; b.dati[idx] = b.dati[j]; b.dati[j] = t; }, { pannello: true, dati: false });
      } break;
      case 'd-fissa': if (b && idx >= 0) { const dt = b.dati[idx]; modifica(() => { dt.valore = dt.calc; dt.calc = null; }, { pannello: true, dati: false }); } break;
      case 'l-fissa': if (l) modifica(() => { l.valore = l.calc; l.calc = null; }, { pannello: true, dati: false }); break;
      case 'l-inverti': if (l) modifica(() => { const t = l.da; l.da = l.a; l.a = t; }, { pannello: true }); break;
      case 'b-collega': if (b) { stato.modo = 'collegamento'; stato.collega = { b: b.id, d: autoDato(b, 'da') }; aggiornaModo(); richiediDisegno(); chiudiPannelloSeStretto(); tela.focus({ preventScroll: true }); } break;
      case 'duplica': duplicaSelezione(); break;
      case 'elimina': eliminaSelezione(); break;
      case 'sel-blocco': seleziona([el.dataset.id], []); centraSu(el.dataset.id); break;
      case 'sel-link': seleziona([], [el.dataset.id]); break;
      case 'fissa-tutti': modifica(() => { doc.collegamenti.forEach((x) => { if (x.calc != null) { x.valore = x.calc; x.calc = null; } }); doc.blocchi.forEach((bb) => bb.dati.forEach((x) => { if (x.calc != null) { x.valore = x.calc; x.calc = null; } })); }, { pannello: true, dati: false }); messaggio('Valori calcolati fissati come inseriti.', 'successo'); break;
      case 'cancella-calc': modifica(() => { doc.collegamenti.forEach((x) => { x.calc = null; }); doc.blocchi.forEach((bb) => bb.dati.forEach((x) => { x.calc = null; })); }, { pannello: true }); break;
      case 'allinea-sx': case 'allinea-alto': case 'distribuisci-v': {
        const sel = doc.blocchi.filter((x) => stato.selB.has(x.id)); if (sel.length < 2) break;
        modifica(() => {
          if (a === 'allinea-sx') { const m = Math.min(...sel.map((x) => x.x)); sel.forEach((x) => { x.x = m; }); }
          else if (a === 'allinea-alto') { const m = Math.min(...sel.map((x) => x.y)); sel.forEach((x) => { x.y = m; }); }
          else {
            sel.sort((p, q) => p.y - q.y);
            const geo = scenaCorrente.geo; const top = sel[0].y, fondo = sel[sel.length - 1].y + geo.get(sel[sel.length - 1].id).h;
            const tot = sel.reduce((s, x) => s + geo.get(x.id).h, 0); const gap = Math.max(10, (fondo - top - tot) / (sel.length - 1));
            let y = top; sel.forEach((x) => { x.y = aggancia(y); y += geo.get(x.id).h + gap; });
          }
        }, { dati: false });
      } break;
      default: break;
    }
  }
  function centraSu(id) {
    const g = scenaCorrente && scenaCorrente.geo.get(id); const b = doc.blocchi.find((x) => x.id === id); if (!g || !b) return;
    const v = stato.vista; const W = tela.clientWidth, H = tela.clientHeight;
    const sx = b.x * v.s + v.tx, sy = b.y * v.s + v.ty;
    if (sx < 0 || sy < 0 || sx + g.w * v.s > W || sy + g.h * v.s > H) { v.tx = W / 2 - (b.x + g.w / 2) * v.s; v.ty = H / 2 - (b.y + g.h / 2) * v.s; applicaVista(); }
  }
  const stretto = () => window.matchMedia('(max-width: 1180px)').matches;
  function apriPannelloSeStretto() { if (stretto()) { app.classList.add('pannello-aperto'); $('#sk-pannello-apri').setAttribute('aria-expanded', 'true'); } }
  function chiudiPannelloSeStretto() { app.classList.remove('pannello-aperto'); $('#sk-pannello-apri').setAttribute('aria-expanded', 'false'); }

  /* ================= 8. FILE, ESPORTAZIONI, ESEMPI, GUIDA ================= */
  let timerSalva = 0;
  function salvaPresto() {
    clearTimeout(timerSalva);
    timerSalva = setTimeout(() => {
      try {
        localStorage.setItem(CHIAVE_DOC, JSON.stringify({ ...doc, vista: stato.vista }));
        $('#sk-salvato').textContent = 'Salvato nel browser alle ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      } catch (_) { $('#sk-salvato').textContent = 'Salvataggio automatico non disponibile'; }
    }, 400);
  }
  const slug = (s) => (String(s || 'sankey').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sankey').slice(0, 60);
  const oggi = () => new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  function scarica(blob, nome) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function salvaJSON() {
    const dati = { ...doc, vista: stato.vista, salvato: new Date().toISOString() };
    scarica(new Blob([JSON.stringify(dati, null, 2)], { type: 'application/json' }), slug(doc.titolo) + '.json');
    messaggio('Progetto salvato come ' + slug(doc.titolo) + '.json', 'successo');
  }
  function caricaDoc(nuovo, testo) {
    modifica(() => { doc = nuovo; });
    stato.selB.clear(); stato.selL.clear(); stato.collega = null; stato.verifica = null; stato.obsoleto = false;
    storia.ultima = null;
    disegnaTutto();
    if (nuovo.vista) { stato.vista = { ...nuovo.vista }; applicaVista(); } else requestAnimationFrame(adatta);
    delete doc.vista;
    if (testo) messaggio(testo, 'successo', 6000);
  }
  function apriFile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try { caricaDoc(normalizza(JSON.parse(String(r.result))), `Aperto «${file.name}». Premi Aggiorna per verificare i bilanci. (Ctrl+Z per tornare al diagramma precedente)`); }
      catch (err) { messaggio('Impossibile aprire il file: ' + (err && err.message ? err.message : 'formato non valido') + '.', 'errore', 8000); }
    };
    r.onerror = () => messaggio('Errore di lettura del file.', 'errore');
    r.readAsText(file);
  }

  /* ---- palette per le esportazioni (sempre tema chiaro: si stampa su carta bianca) ---- */
  function normalizzaColore(c, riserva) {
    if (!c) return riserva;
    tela2d.fillStyle = '#000'; tela2d.fillStyle = c;
    const v = tela2d.fillStyle;
    if (v.startsWith('#')) return v;
    const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return riserva;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return '#' + p.slice(0, 3).map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
  }
  function paletteChiara() {
    const html = document.documentElement; const prec = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'light');
    const cs = getComputedStyle(html); const p = {};
    NOMI_COLORI.forEach((n) => { p[n] = normalizzaColore(cs.getPropertyValue('--' + n).trim(), RISERVA_CHIARA[n]); });
    if (prec == null) html.removeAttribute('data-theme'); else html.setAttribute('data-theme', prec);
    p.foglio = '#ffffff'; p.carta = '#ffffff';
    return p;
  }
  function stileExport(p) {
    return `text{font-family:${FONT_EXP}}
.sk-blocco-fondo{fill:${p.foglio}}.sk-blocco-testa{fill:${p.rialzo}}.sk-blocco-div{stroke:${p.linea};stroke-width:1}
.sk-blocco-corpo{fill:none;stroke:${p.bordo};stroke-width:1.5}
.st-ok .sk-blocco-corpo{stroke:${p.successo};stroke-width:2.5}.st-warn .sk-blocco-corpo{stroke:${p.attenzione};stroke-width:2.5}.st-err .sk-blocco-corpo{stroke:${p.errore};stroke-width:3.5}
.st-err .sk-blocco-fondo,.st-err .sk-blocco-testa{fill:${p['errore-fondo']}}
.sk-blocco-nome{fill:${p.inchiostro};font-weight:700;font-size:13px}.sk-riga-etich{fill:${p.inchiostro};font-size:12px}
.sk-riga-val{fill:${p.inchiostro};font-size:12px;font-weight:600}.sk-riga-val.calc{fill:${p.segno};font-style:italic}.sk-riga-val.vuoto{fill:${p.tenue};font-weight:400}
.sk-tubo-corpo{fill:none;opacity:.9}.sk-tubo-err{fill:none;stroke:${p.errore};stroke-dasharray:7 5}.sk-tubo-warn{fill:none;stroke:${p.attenzione};stroke-dasharray:3 4}
.sk-freccia{fill:#fff;opacity:.6}.sk-tubo-etich{font-size:11.5px;font-weight:600;fill:${p.inchiostro};paint-order:stroke;stroke:#fff;stroke-width:3.5px;stroke-linejoin:round}
.sk-tubo-etich.calc{fill:${p.segno};font-style:italic}.sk-badge text{font-size:12px;font-weight:800;fill:#fff}.sk-badge-segno{stroke:#fff}.sk-badge circle{stroke:#fff;stroke-width:2}`;
  }
  function vettoriPresenti(sc) {
    const s = new Set(sc.tubi.map((t) => t.vettore));
    doc.blocchi.forEach((b) => b.dati.forEach((dt) => { if (unitaOk(dt.u, dt.ua)) s.add(vettoreDi(dt.u)); }));
    return Object.keys(VETTORI).filter((k) => s.has(k));
  }
  /** Prepara il materiale comune alle esportazioni: scena, confini, palette, legenda. */
  function preparaExport() {
    const esito = $('#sk-esp-esito').checked && !!stato.verifica;
    const sc = calcolaScena(doc, { famiglia: FONT_EXP });
    const bb = confiniScena(sc);
    if (!bb) { messaggio('Il diagramma è vuoto: niente da esportare.', 'avviso'); return null; }
    return { sc, bb, esito, pal: paletteChiara(), vett: vettoriPresenti(sc) };
  }
  function costruisciSVG(x) {
    const { sc, bb, pal, vett } = x; const M = misuratore(FONT_EXP);
    const margine = 40, testa = 78;
    const W = Math.max(Math.ceil(bb.w + margine * 2), 720);
    // legenda su più righe se serve
    const voci = vett.map((k) => ({ k, t: VETTORI[k].nome, w: 30 + M(VETTORI[k].nome, 400, 12) + 22 }));
    voci.push({ k: null, t: 'tratteggio = valore mancante · corsivo = valore calcolato', w: M('tratteggio = valore mancante · corsivo = valore calcolato', 400, 12) + 10 });
    const righeLeg = []; let riga = [], lr = 0;
    voci.forEach((v) => { if (lr + v.w > W - margine * 2 && riga.length) { righeLeg.push(riga); riga = []; lr = 0; } riga.push(v); lr += v.w; });
    if (riga.length) righeLeg.push(riga);
    const altLeg = righeLeg.length * 22 + 26;
    const H = Math.ceil(testa + bb.h + altLeg + 20);
    const ox = (W - bb.w) / 2 - bb.x, oy = testa - bb.y;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${stileExport(pal)}</style>`;
    s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
    s += `<text x="${margine}" y="38" style="font-size:22px;font-weight:700;fill:${pal.inchiostro}">${esc(doc.titolo)}</text>`;
    s += `<text x="${margine}" y="58" style="font-size:12px;fill:${pal.tenue}">${oggi()} · Playfair Sankey (playfair.statocritico.it)</text>`;
    s += `<line x1="${margine}" x2="${W - margine}" y1="68" y2="68" stroke="${pal.linea}"/>`;
    s += `<g transform="translate(${r2(ox)} ${r2(oy)})">${svgCorpo(sc, 'export', { pal, esito: x.esito })}</g>`;
    let y = testa + bb.h + 30;
    s += `<line x1="${margine}" x2="${W - margine}" y1="${y - 14}" y2="${y - 14}" stroke="${pal.linea}"/>`;
    righeLeg.forEach((r) => {
      let xx = margine;
      r.forEach((v) => {
        if (v.k) s += `<rect x="${xx}" y="${y - 5}" width="22" height="9" rx="2" fill="${pal[VETTORI[v.k].v]}"/><text x="${xx + 30}" y="${y}" dominant-baseline="central" style="font-size:12px;fill:${pal.inchiostro}">${esc(v.t)}</text>`;
        else s += `<text x="${xx}" y="${y}" dominant-baseline="central" style="font-size:12px;fill:${pal.tenue}">${esc(v.t)}</text>`;
        xx += v.w;
      });
      y += 22;
    });
    s += '</svg>';
    return { svg: s, W, H, ox, oy, righeLeg };
  }
  function esportaSVG() {
    const x = preparaExport(); if (!x) return;
    const r = costruisciSVG(x);
    scarica(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + r.svg], { type: 'image/svg+xml' }), slug(doc.titolo) + '.svg');
    messaggio('Esportato SVG.', 'successo');
  }
  function svgInCanvas(svg, W, H, scala) {
    return new Promise((ok, ko) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = Math.round(W * scala); c.height = Math.round(H * scala);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c);
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('rendering SVG non riuscito')); };
      img.src = url;
    });
  }
  async function esportaJPG() {
    const x = preparaExport(); if (!x) return;
    const r = costruisciSVG(x);
    const scala = clamp(3600 / r.W, 1.5, 4);
    try {
      const c = await svgInCanvas(r.svg, r.W, r.H, scala);
      await new Promise((ok) => c.toBlob((b) => { scarica(b, slug(doc.titolo) + '.jpg'); ok(); }, 'image/jpeg', 0.93));
      messaggio(`Esportato JPG (${c.width} × ${c.height} px).`, 'successo');
    } catch (err) { messaggio('Esportazione JPG non riuscita: ' + err.message, 'errore'); }
  }
  const pdfTesto = (s) => String(s).replace(/₂/g, '2').replace(/³/g, '3').replace(/²/g, '2').replace(/≠/g, '!=').replace(/≈/g, '~').replace(/−/g, '-').replace(/→/g, '->').replace(/[^\x00-\xFF—–…·€‘’“”•]/g, '');
  /** PDF vettoriale disegnato con le primitive di jsPDF a partire dalla stessa scena. */
  function esportaPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) { messaggio('Libreria PDF non disponibile.', 'errore'); return; }
    const x = preparaExport(); if (!x) return;
    const { sc, bb, pal, vett, esito } = x; const ver = esito ? stato.verifica : null;
    const formato = $('#sk-formato').value === 'a3' ? 'a3' : 'a4';
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: formato, compress: true });
    pdf.setProperties({ title: doc.titolo, subject: 'Diagramma di Sankey', creator: 'Playfair · playfair.statocritico.it' });
    const PW = pdf.internal.pageSize.getWidth(), PH = pdf.internal.pageSize.getHeight(); const mg = 12;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(formato === 'a3' ? 20 : 16); pdf.setTextColor(pal.inchiostro);
    pdf.text(pdfTesto(doc.titolo), mg, mg + 4, { baseline: 'middle' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(pal.tenue);
    pdf.text(pdfTesto(`${oggi()} · Playfair Sankey (playfair.statocritico.it)`), mg, mg + 10, { baseline: 'middle' });
    pdf.setDrawColor(pal.linea); pdf.setLineWidth(0.2); pdf.line(mg, mg + 14, PW - mg, mg + 14);
    const top = mg + 19, fondo = PH - mg - 12;
    const k = Math.min((PW - 2 * mg) / bb.w, (fondo - top) / bb.h, 0.42);
    const ox = mg + ((PW - 2 * mg) - bb.w * k) / 2, oy = top + ((fondo - top) - bb.h * k) / 2;
    const X = (v) => ox + (v - bb.x) * k, Y = (v) => oy + (v - bb.y) * k;
    const pt = (px) => px * k * 72 / 25.4;
    const percorso = (ops) => { ops.forEach((o) => { if (o[0] === 'M') pdf.moveTo(X(o[1]), Y(o[2])); else if (o[0] === 'L') pdf.lineTo(X(o[1]), Y(o[2])); else pdf.curveTo(X(o[1]), Y(o[2]), X(o[3]), Y(o[4]), X(o[5]), Y(o[6])); }); };
    pdf.setLineCap('butt'); pdf.setLineJoin('round');
    // tubi
    sc.tubi.forEach((t) => {
      const st = ver && ver.r.stL.get(t.l.id);
      if (st === 'err' || st === 'warn') { pdf.setDrawColor(st === 'err' ? pal.errore : pal.attenzione); pdf.setLineWidth((t.w + 6) * k); pdf.setLineDashPattern([2, 1.4], 0); percorso(t.ops); pdf.stroke(); }
      pdf.setDrawColor(pal[VETTORI[t.vettore].v]); pdf.setLineWidth(t.w * k);
      pdf.setLineDashPattern(t.mancante ? [Math.max(6, t.w) * k, Math.max(4, t.w * 0.6) * k] : [], 0);
      percorso(t.ops); pdf.stroke();
      pdf.setLineDashPattern([], 0);
      if (t.freccia) { pdf.setFillColor('#ffffff'); const f = t.freccia; pdf.triangle(X(f[0][0]), Y(f[0][1]), X(f[1][0]), Y(f[1][1]), X(f[2][0]), Y(f[2][1]), 'F'); pdf.triangle(X(f[0][0]), Y(f[0][1]), X(f[2][0]), Y(f[2][1]), X(f[3][0]), Y(f[3][1]), 'F'); }
    });
    sc.tubi.forEach((t) => {
      if (!t.etich) return;
      pdf.setFont('helvetica', t.etich.calc ? 'bolditalic' : 'bold'); pdf.setFontSize(pt(11.5)); pdf.setTextColor(t.etich.calc ? pal.segno : pal.inchiostro);
      const txt = pdfTesto(t.etich.testo); const tw = pdf.getTextWidth(txt);
      const xx = X(t.etich.x) - (t.etich.anc === 'middle' ? tw / 2 : 0); const yy = Y(t.etich.y) - (t.etich.anc === 'middle' ? pt(11.5) * 25.4 / 72 * 0.35 : 0);
      pdf.setFillColor('#ffffff'); pdf.rect(xx - 0.5, yy - pt(11.5) * 0.18, tw + 1, pt(11.5) * 0.36, 'F');
      pdf.text(txt, xx, yy, { baseline: 'middle' });
    });
    // blocchi
    sc.blocchi.forEach(({ b, g }) => {
      const st = ver && ver.r.stB.get(b.id);
      const x0 = X(b.x), y0 = Y(b.y), w = g.w * k, h = g.h * k, rr = 8 * k;
      pdf.setFillColor(st === 'err' ? pal['errore-fondo'] : '#ffffff');
      pdf.setDrawColor(st === 'ok' ? pal.successo : st === 'err' ? pal.errore : st === 'warn' ? pal.attenzione : pal.bordo);
      pdf.setLineWidth((st ? (st === 'err' ? 3.5 : 2.5) : 1.5) * k);
      pdf.roundedRect(x0, y0, w, h, rr, rr, 'FD');
      if (b.dati.length) {
        pdf.setFillColor(st === 'err' ? pal['errore-fondo'] : pal.rialzo);
        const ins = 0.75 * k * (st ? 2 : 1);
        pdf.moveTo(x0 + ins, y0 + rr); pdf.curveTo(x0 + ins, y0 + rr * 0.45, x0 + rr * 0.45, y0 + ins, x0 + rr, y0 + ins); pdf.lineTo(x0 + w - rr, y0 + ins);
        pdf.curveTo(x0 + w - rr * 0.45, y0 + ins, x0 + w - ins, y0 + rr * 0.45, x0 + w - ins, y0 + rr); pdf.lineTo(x0 + w - ins, y0 + TESTA * k); pdf.lineTo(x0 + ins, y0 + TESTA * k); pdf.close(); pdf.fill();
        pdf.setDrawColor(pal.linea); pdf.setLineWidth(0.6 * k); pdf.line(x0, y0 + TESTA * k, x0 + w, y0 + TESTA * k);
      }
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(pt(13)); pdf.setTextColor(pal.inchiostro);
      if (b.dati.length) pdf.text(pdfTesto(b.nome), x0 + PADX * k, y0 + (TESTA / 2 + 1) * k, { baseline: 'middle' });
      else pdf.text(pdfTesto(b.nome), x0 + w / 2, y0 + h / 2, { baseline: 'middle', align: 'center' });
      g.righe.forEach((r) => {
        const c = pal[VETTORI[unitaOk(r.dt.u, r.dt.ua) ? vettoreDi(r.dt.u) : 'altro'].v];
        const cy = y0 + r.cy * k;
        if (r.dt.ruolo === 'perdita') { pdf.setDrawColor(c); pdf.setLineWidth(1.8 * k); pdf.circle(x0 + (PADX + 4) * k, cy, 3.6 * k, 'S'); }
        else { pdf.setFillColor(c); pdf.circle(x0 + (PADX + 4) * k, cy, 4.2 * k, 'F'); }
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(pt(12)); pdf.setTextColor(pal.inchiostro);
        pdf.text(pdfTesto(r.et), x0 + (PADX + 14) * k, cy, { baseline: 'middle' });
        pdf.setFont('helvetica', r.tv.cls === 'calc' ? 'bolditalic' : r.tv.cls === 'vuoto' ? 'normal' : 'bold');
        pdf.setTextColor(r.tv.cls === 'calc' ? pal.segno : r.tv.cls === 'vuoto' ? pal.tenue : pal.inchiostro);
        pdf.text(pdfTesto(r.tv.testo), x0 + w - PADX * k, cy, { baseline: 'middle', align: 'right' });
      });
      if (st) {
        const cx = x0 + w - 3 * k, cyb = y0 + 3 * k;
        pdf.setFillColor(st === 'ok' ? pal.successo : st === 'err' ? pal.errore : pal.attenzione); pdf.setDrawColor('#ffffff'); pdf.setLineWidth(2 * k);
        pdf.circle(cx, cyb, 9.5 * k, 'FD');
        if (st === 'ok') { pdf.setLineWidth(2.4 * k); pdf.lines([[2.8 * k, 2.8 * k], [5.4 * k, -5.6 * k]], cx - 4.2 * k, cyb + 0.3 * k, [1, 1], 'S'); }
        else { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(pt(12)); pdf.setTextColor('#ffffff'); pdf.text(st === 'err' ? '!' : '?', cx, cyb, { baseline: 'middle', align: 'center' }); }
      }
    });
    // legenda
    pdf.setDrawColor(pal.linea); pdf.setLineWidth(0.2); pdf.line(mg, PH - mg - 8, PW - mg, PH - mg - 8);
    let lx = mg; const ly = PH - mg - 3;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    vett.forEach((kk) => {
      pdf.setFillColor(pal[VETTORI[kk].v]); pdf.roundedRect(lx, ly - 1.4, 7, 2.8, 0.6, 0.6, 'F');
      pdf.setTextColor(pal.inchiostro); const t = pdfTesto(VETTORI[kk].nome); pdf.text(t, lx + 9, ly, { baseline: 'middle' }); lx += 9 + pdf.getTextWidth(t) + 6;
    });
    pdf.setTextColor(pal.tenue);
    const notaLeg = 'tratteggio = valore mancante · corsivo = valore calcolato';
    const notaPie = 'Pagina generata nel browser: nessun dato inviato a server.';
    // evita la sovrapposizione: se le due note non stanno sulla stessa riga, vanno a capo
    let lyNota = ly;
    if (lx + pdf.getTextWidth(notaLeg) > PW - mg) { lx = mg; lyNota = ly + 4; }
    pdf.text(notaLeg, lx, lyNota, { baseline: 'middle' });
    const sovrappone = lx + pdf.getTextWidth(notaLeg) + 6 > PW - mg - pdf.getTextWidth(notaPie);
    pdf.text(notaPie, PW - mg, sovrappone ? lyNota + 4 : lyNota, { baseline: 'middle', align: 'right' });
    const blob = pdf.output('blob');
    scarica(blob, slug(doc.titolo) + '.pdf');
    messaggio(`Esportato PDF vettoriale ${formato.toUpperCase()} orizzontale.`, 'successo');
    return blob;
  }

  /* ---- esempi ---- */
  function costruisciEsempio(titolo, opz, blocchi, links) {
    const d = docVuoto(); d.titolo = titolo; Object.assign(d.opzioni, opz);
    const per = {};
    blocchi.forEach(([k, nome, x, y, dati]) => {
      const b = { id: uid('b'), nome, x, y, dati: dati.map(([et, val, u, ruolo, ua]) => ({ id: uid('d'), etichetta: et, valore: val, calc: null, u, ua: ua || '', ruolo: ruolo || 'valore' })) };
      per[k] = b; d.blocchi.push(b);
    });
    links.forEach(([da, a, val, u, et]) => {
      const [kb, i] = da.split('.'), [kb2, j] = a.split('.');
      d.collegamenti.push({ id: uid('l'), da: { b: per[kb].id, d: i != null ? per[kb].dati[+i].id : null }, a: { b: per[kb2].id, d: j != null ? per[kb2].dati[+j].id : null }, valore: val == null ? null : val, calc: null, u: u || '', ua: '', etichetta: et || '' });
    });
    return d;
  }
  const ESEMPI = {
    cogenerazione: () => costruisciEsempio('Centrale di cogenerazione — bilancio annuo', { conversione: true }, [
      ['gas', 'Rete gas', 0, 170, [['Gas naturale', 500000, 'Sm3']]],
      ['cog', 'Cogeneratore', 380, 90, [['Gas in ingresso', null, 'Sm3'], ['Elettricità', 1700, 'MWh_el'], ['Calore utile', 2200, 'MWh_th'], ['Perdite', null, 'MWh_th', 'perdita'], ['CO₂ emessa', 985, 'tCO2']]],
      ['stab', 'Stabilimento', 840, 0, [['Elettricità', 1200, 'MWh_el']]],
      ['rete', 'Rete elettrica (cessione)', 840, 130, [['Elettricità', null, 'MWh_el']]],
      ['ut', 'Utenze termiche', 840, 270, [['Calore', null, 'MWh_th']]],
      ['atm', 'Atmosfera', 840, 410, [['CO₂', null, 'tCO2']]]
    ], [['gas.0', 'cog.0'], ['cog.1', 'stab.0'], ['cog.1', 'rete.0'], ['cog.2', 'ut.0'], ['cog.4', 'atm.0']]),
    ospedale: () => costruisciEsempio('Ospedale — elettricità, gas, acqua e CO₂', { conversione: true }, [
      ['el', 'Rete elettrica', 0, 20, [['Prelievo', 3200000, 'kWh']]],
      ['gas', 'Rete gas', 0, 220, [['Gas naturale', 450000, 'Sm3']]],
      ['acq', 'Acquedotto', 0, 540, [['Acqua', 60000, 'm3']]],
      ['cab', 'Cabina MT/BT', 400, 10, [['Elettricità', null, 'kWh']]],
      ['ct', 'Centrale termica', 400, 170, [['Gas', null, 'Sm3'], ['Calore prodotto', 3900000, 'kWh_th'], ['Acqua di reintegro', null, 'm3'], ['Perdite', null, 'kWh_th', 'perdita'], ['CO₂ emessa', 886.5, 'tCO2']]],
      ['rep', 'Reparti di degenza', 900, 20, [['Elettricità', 2100000, 'kWh'], ['Calore', null, 'kWh_th'], ['Acqua', 45000, 'm3']]],
      ['hvac', 'Servizi e HVAC', 900, 330, [['Elettricità', null, 'kWh']]],
      ['atm', 'Atmosfera', 900, 480, [['CO₂', null, 'tCO2']]]
    ], [['el.0', 'cab.0'], ['cab.0', 'rep.0'], ['cab.0', 'hvac.0'], ['gas.0', 'ct.0'], ['ct.1', 'rep.1'], ['acq.0', 'rep.2'], ['acq.0', 'ct.2'], ['ct.4', 'atm.0']]),
    vapore: () => costruisciEsempio('Macchina a vapore — omaggio a Sankey (1898), su 100 kWh di carbone', { conversione: true }, [
      ['carb', 'Carbone', -80, 150, [['Energia del combustibile', 100, 'kWh_th']]],
      ['cald', 'Caldaia', 320, 120, [['Combustibile', null, 'kWh_th'], ['Fumi al camino', 20, 'kWh_th'], ['Vapore', null, 'kWh_th']]],
      ['mot', 'Motore a vapore', 700, 90, [['Vapore', null, 'kWh_th'], ['Scarico al condensatore', null, 'kWh_th'], ['Attriti e irraggiamento', 5, 'kWh_th'], ['Lavoro all\'albero', 11, 'kWh']]],
      ['cam', 'Camino', 700, 470, [['Fumi', null, 'kWh_th']]],
      ['cond', 'Condensatore', 1110, 40, [['Calore scaricato', null, 'kWh_th']]],
      ['amb', 'Ambiente', 1110, 190, [['Dispersioni', null, 'kWh_th']]],
      ['alb', 'Lavoro utile', 1110, 330, [['Lavoro meccanico', null, 'kWh']]]
    ], [['carb.0', 'cald.0'], ['cald.1', 'cam.0'], ['cald.2', 'mot.0'], ['mot.1', 'cond.0'], ['mot.2', 'amb.0'], ['mot.3', 'alb.0']]),
    minimo: () => costruisciEsempio('Esempio minimo: A → B → C, D', { conversione: false }, [
      ['a', 'A', 0, 100, [['Elettricità', null, 'kWh']]],
      ['b', 'B', 300, 100, [['Elettricità', null, 'kWh']]],
      ['c', 'C', 600, 20, [['Elettricità', null, 'kWh']]],
      ['d', 'D', 600, 200, [['Elettricità', null, 'kWh']]]
    ], [['a.0', 'b.0', 100], ['b.0', 'c.0'], ['b.0', 'd.0', 30]])
  };
  function caricaEsempio(nome) {
    const f = ESEMPI[nome]; if (!f) return;
    const sel = $('#sk-esempio'); const etich = sel && sel.querySelector(`option[value="${nome}"]`);
    caricaDoc(f(), `Caricato l'esempio «${etich ? etich.textContent : nome}». Premi Aggiorna (A) per calcolare i valori mancanti e verificare i bilanci. Ctrl+Z per tornare indietro.`);
  }

  /* ---- guida introduttiva ---- */
  const PASSI = [
    ['Benvenuto nell\'editor Sankey', '<p>Qui disegni <strong>diagrammi di flusso energetico</strong>: blocchi (impianti, reparti, utenze) uniti da <strong>tubi</strong> il cui spessore è proporzionale al flusso, come nel celebre diagramma della macchina a vapore di Matthew Sankey (1898).</p><p>Tutto resta nel tuo browser: il lavoro si salva da solo e puoi esportarlo in JPG, PDF o SVG.</p>'],
    ['1 · Crea i blocchi', '<p>Premi <strong>Blocco</strong> nel menu a sinistra (o il tasto <kbd>B</kbd>) e clicca nell\'area di disegno: ogni clic crea un blocco. Trascinali per spostarli; <kbd>Esc</kbd> esce dalla modalità.</p><p>Rotellina per lo zoom, trascina lo sfondo per spostare la vista, <kbd>0</kbd> per adattare.</p>'],
    ['2 · Inserisci i dati', '<p>Clicca un blocco: nel pannello a destra dai un nome e aggiungi <strong>uno o più dati</strong> con etichetta, valore e unità (kWh, MWh el., Sm³, MWh o kWh termici, m³ acqua, t CO₂ o libera). Ogni dato è una riga del blocco.</p><p>Puoi lasciare vuoto il valore e indicare solo l\'unità: lo calcolerà il programma.</p>'],
    ['3 · Collega i blocchi', '<p>Premi <strong>Collegamento</strong> (<kbd>L</kbd>), clicca la <strong>riga del dato</strong> di partenza e poi quella di arrivo. Il tubo esce e arriva all\'altezza di quella riga e prende il colore del vettore: <span style="color:var(--flusso-el)">verde</span> elettricità, <span style="color:var(--flusso-th)">arancione</span> gas e calore, <span style="color:var(--flusso-acqua)">azzurro</span> acqua, <span style="color:var(--flusso-co2)">marrone</span> CO₂.</p>'],
    ['4 · Aggiorna ed esporta', '<p>Premi <strong>Aggiorna</strong> (<kbd>A</kbd>): gli spessori diventano proporzionali ai valori, i bilanci vengono verificati (bordo <span style="color:var(--successo)">verde</span> se tornano, <span style="color:var(--errore)">rosso</span> con lo scarto se no) e le caselle vuote vengono compilate <em style="color:var(--segno)">in corsivo</em>.</p><p>Per iniziare puoi caricare un esempio dal menu «Progetto». Buon lavoro!</p>']
  ];
  let passo = 0;
  function mostraPasso() {
    $('#sk-tut-passo').textContent = (passo + 1) + ' / ' + PASSI.length;
    $('#sk-tut-tit').textContent = PASSI[passo][0];
    $('#sk-tut-testo').innerHTML = PASSI[passo][1];
    $('#sk-tut-indietro').disabled = passo === 0;
    $('#sk-tut-avanti').textContent = passo === PASSI.length - 1 ? 'Inizia' : 'Avanti';
  }
  function apriTutorial() {
    const d = $('#sk-tutorial'); passo = 0; mostraPasso();
    if (typeof d.showModal === 'function') { try { d.showModal(); } catch (_) { d.setAttribute('open', ''); } } else d.setAttribute('open', '');
    $('#sk-tut-avanti').focus();
  }

  /* ================= AVVIO ================= */
  function avvia() {
    app = $('#sk-app'); tela = $('#sk-tela'); mondo = $('#sk-mondo'); contenuto = $('#sk-contenuto'); sovra = $('#sk-sovra'); griglia = $('#sk-griglia');
    pannello = $('#sk-pannello'); corpoPannello = $('#sk-pannello-corpo');
    famigliaPagina = getComputedStyle(tela).fontFamily || famigliaPagina;

    let caricato = false;
    try {
      const s = localStorage.getItem(CHIAVE_DOC);
      if (s) { doc = normalizza(JSON.parse(s)); if (doc.vista) { stato.vista = doc.vista; delete doc.vista; } caricato = true; }
    } catch (_) { caricato = false; }
    if (!caricato) doc = ESEMPI.cogenerazione();

    tela.addEventListener('pointerdown', giu);
    tela.addEventListener('pointermove', muovi);
    tela.addEventListener('pointerup', su);
    tela.addEventListener('pointercancel', annullaPuntatore);
    tela.addEventListener('pointerleave', () => { if (!stato.drag && stato.collega) { stato.mouse = null; disegnaSovra(); } });
    tela.addEventListener('wheel', rotella, { passive: false });
    tela.addEventListener('dblclick', (e) => {
      // il DOM può essere stato ridisegnato tra i due clic: si guarda cosa c'è sotto il puntatore
      const sotto = document.elementFromPoint(e.clientX, e.clientY) || e.target;
      if (!tela.contains(sotto)) return;
      const elB = sotto.closest('[data-blocco]');
      if (elB) { seleziona([elB.dataset.blocco]); apriPannelloSeStretto(); const f = corpoPannello.querySelector('[data-campo="b-nome"]'); if (f) { f.focus(); f.select(); } return; }
      if (suSfondo(sotto) && stato.modo === 'seleziona') { const w = aMondo(e.clientX, e.clientY); creaBlocco(w.x, w.y); }
    });
    tela.addEventListener('focusin', (e) => {
      const elB = e.target.closest && e.target.closest('[data-blocco]'), elL = e.target.closest && e.target.closest('[data-link]');
      if (stato.drag) return;
      if (elB && !(stato.selB.size === 1 && stato.selB.has(elB.dataset.blocco) && !stato.selL.size)) seleziona([elB.dataset.blocco]);
      else if (elL && !(stato.selL.size === 1 && stato.selL.has(elL.dataset.link) && !stato.selB.size)) seleziona([], [elL.dataset.link]);
    });
    tela.addEventListener('contextmenu', (e) => { if (stato.collega) { e.preventDefault(); stato.collega = null; mostraSuggerimento(); richiediDisegno(); } });
    document.addEventListener('keydown', tasto);
    document.addEventListener('keyup', tastoSu);
    window.addEventListener('blur', () => { stato.spazio = false; tela.classList.remove('spazio'); });
    window.addEventListener('resize', applicaVista);

    document.querySelectorAll('.sk-prim').forEach((b) => b.addEventListener('click', () => impostaModo(b.dataset.modo)));
    $('#sk-aggiorna').addEventListener('click', aggiorna);
    $('#sk-annulla').addEventListener('click', annulla);
    $('#sk-ripeti').addEventListener('click', ripeti);
    $('#sk-duplica').addEventListener('click', duplicaSelezione);
    $('#sk-elimina').addEventListener('click', eliminaSelezione);
    $('#sk-nuovo').addEventListener('click', () => { const d = docVuoto(); caricaDoc(d, 'Nuovo diagramma vuoto. Il precedente si recupera con Ctrl+Z.'); stato.vista = { tx: 60, ty: 40, s: 1 }; applicaVista(); });
    $('#sk-salva').addEventListener('click', salvaJSON);
    $('#sk-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; apriFile(f); });
    $('#sk-carica-esempio').addEventListener('click', () => caricaEsempio($('#sk-esempio').value));
    $('#sk-esp-jpg').addEventListener('click', esportaJPG);
    $('#sk-esp-pdf').addEventListener('click', esportaPDF);
    $('#sk-esp-svg').addEventListener('click', esportaSVG);
    $('#sk-zoom-piu').addEventListener('click', () => zoomA(stato.vista.s * 1.25));
    $('#sk-zoom-meno').addEventListener('click', () => zoomA(stato.vista.s / 1.25));
    $('#sk-zoom-100').addEventListener('click', () => zoomA(1));
    $('#sk-adatta').addEventListener('click', adatta);
    $('#sk-titolo').addEventListener('input', (e) => modifica(() => { doc.titolo = e.target.value; }, { unione: 'titolo', dati: false }));
    $('#sk-titolo').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tela.focus({ preventScroll: true }); } });
    $('#sk-pannello-apri').addEventListener('click', () => { if (app.classList.contains('pannello-aperto')) chiudiPannelloSeStretto(); else { app.classList.add('pannello-aperto'); $('#sk-pannello-apri').setAttribute('aria-expanded', 'true'); const f = corpoPannello.querySelector('input, select, button'); if (f) f.focus(); } });
    corpoPannello.addEventListener('input', campoPannello);
    corpoPannello.addEventListener('change', (e) => { campoPannello(e); if (e.target.dataset.campo === 'd-val' || e.target.dataset.campo === 'l-val') disegnaPannello(); });
    corpoPannello.addEventListener('click', azionePannello);
    corpoPannello.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type="text"]')) { e.preventDefault(); e.target.blur(); disegnaPannello(); } });

    const dlg = $('#sk-tutorial');
    $('#sk-tut-avanti').addEventListener('click', () => { if (passo < PASSI.length - 1) { passo++; mostraPasso(); } else dlg.close(); });
    $('#sk-tut-indietro').addEventListener('click', () => { if (passo > 0) { passo--; mostraPasso(); } });
    dlg.addEventListener('close', () => { try { if ($('#sk-tut-nonpiu').checked) localStorage.setItem(CHIAVE_TUT, '1'); else localStorage.removeItem(CHIAVE_TUT); } catch (_) { /* nulla */ } tela.focus({ preventScroll: true }); });
    $('#sk-tutorial-apri').addEventListener('click', apriTutorial);

    $('#sk-titolo').value = doc.titolo;
    applicaVista();
    disegnaTutto();
    if (!caricato) requestAnimationFrame(adatta);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { famigliaPagina = getComputedStyle(tela).fontFamily || famigliaPagina; richiediDisegno(); });
    let vista = false; try { vista = localStorage.getItem(CHIAVE_TUT) === '1'; } catch (_) { vista = true; }
    if (!vista) setTimeout(apriTutorial, 250);

    // API per test e integrazioni (nessun dato esce dal browser)
    window.PlayfairSankey = {
      get doc() { return doc; }, carica: (o) => caricaDoc(normalizza(o)), esempio: caricaEsempio, aggiorna, analizza: () => analizza(doc),
      scena: () => calcolaScena(doc, { famiglia: famigliaPagina }), esportaPDF, esportaJPG, esportaSVG, svg: () => { const x = preparaExport(); return x ? costruisciSVG(x).svg : null; },
      vista: () => ({ ...stato.vista }), adatta, leggiNumero, fmt
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
