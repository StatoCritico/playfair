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

  /* dim e s: dimensione fisica e scala rispetto all'unità base della dimensione
     (energia → kWh, CO₂ → kg): servono ai blocchi di conversione per gestire da soli i prefissi. */
  const UNITA = {
    kWh:    { etichetta: 'kWh (elettrici)', breve: 'kWh',     vettore: 'el',    f: 1,    nomeDato: 'Elettricità',      dim: 'energia', s: 1 },
    MWh_el: { etichetta: 'MWh el.',         breve: 'MWh el.', vettore: 'el',    f: 1000, nomeDato: 'Elettricità',      dim: 'energia', s: 1000 },
    Sm3:    { etichetta: 'Sm³ (gas)',       breve: 'Sm³',     vettore: 'th',    f: null, nomeDato: 'Gas naturale',     dim: 'gas',     s: 1 },
    MWh_th: { etichetta: 'MWh termici',     breve: 'MWh th',  vettore: 'th',    f: 1000, nomeDato: 'Calore',           dim: 'energia', s: 1000 },
    kWh_th: { etichetta: 'kWh termici',     breve: 'kWh th',  vettore: 'th',    f: 1,    nomeDato: 'Calore',           dim: 'energia', s: 1 },
    m3:     { etichetta: 'm³ acqua',        breve: 'm³',      vettore: 'acqua', f: 1,    nomeDato: 'Acqua',            dim: 'acqua',   s: 1 },
    tCO2:   { etichetta: 't CO₂',           breve: 't CO₂',   vettore: 'co2',   f: 1,    nomeDato: 'CO₂',              dim: 'co2',     s: 1000 },
    kgCO2:  { etichetta: 'kg CO₂',          breve: 'kg CO₂',  vettore: 'co2',   f: 1,    nomeDato: 'CO₂',              dim: 'co2',     s: 1 },
    tep:    { etichetta: 'tep (energia primaria)', breve: 'tep', vettore: 'tep', f: 1,   nomeDato: 'Energia primaria', dim: 'tep',     s: 1 },
    kg:     { etichetta: 'kg (combustibile solido)', breve: 'kg', vettore: 'altro', f: 1, nomeDato: 'Combustibile',    dim: 'massa',   s: 1 },
    altro:  { etichetta: 'altro (libera)…', breve: '',        vettore: 'altro', f: 1,    nomeDato: 'Dato',             dim: 'altro',   s: 1 }
  };
  const ORDINE_UNITA = ['kWh', 'MWh_el', 'Sm3', 'MWh_th', 'kWh_th', 'm3', 'tCO2', 'kgCO2', 'tep', 'kg', 'altro'];
  const VETTORI = {
    el:    { nome: 'Elettricità (kWh, MWh el.)',          v: 'flusso-el' },
    th:    { nome: 'Gas e calore (Sm³, MWh e kWh termici)', v: 'flusso-th' },
    acqua: { nome: 'Acqua (m³)',                          v: 'flusso-acqua' },
    co2:   { nome: 'CO₂ (t, kg)',                         v: 'flusso-co2' },
    tep:   { nome: 'Energia primaria (tep)',              v: 'flusso-tep' },
    altro: { nome: 'Altro (kg di combustibile, unità libere)', v: 'flusso-altro' }
  };
  /** Libreria «Fattore tipico» (coerente con Playfair-S): uscita [num] = f × ingresso [den].
      Copiata in ogni progetto (doc.fattori) e modificabile dal pannello «Diagramma». */
  const FATTORI_TIPICI = [
    { id: 'el-tep',    nome: 'Elettricità → TEP',                       f: 0.187,    num: 'tep',    den: 'MWh_el' },
    { id: 'gas-tep',   nome: 'Gas naturale → TEP',                      f: 0.000836, num: 'tep',    den: 'Sm3' },
    { id: 'th-tep',    nome: 'Calore / teleriscaldamento → TEP',        f: 0.086,    num: 'tep',    den: 'MWh_th' },
    { id: 'el-co2',    nome: 'Elettricità → CO₂',                       f: 0.216,    num: 'kgCO2',  den: 'kWh' },
    { id: 'gas-co2',   nome: 'Gas naturale → CO₂',                      f: 1.96,     num: 'kgCO2',  den: 'Sm3' },
    { id: 'th-co2',    nome: 'Teleriscaldamento → CO₂',                 f: 106,      num: 'kgCO2',  den: 'MWh_th' },
    { id: 'gas-pci',   nome: 'Gas naturale → energia termica (PCI)',    f: 9.59,     num: 'kWh_th', den: 'Sm3' },
    { id: 'cald-trad', nome: 'Gas → calore, caldaia tradizionale (PCI)', f: 9.59,    num: 'kWh_th', den: 'Sm3', eta: 0.90 },
    { id: 'cald-cond', nome: 'Gas → calore, caldaia a condensazione (PCI)', f: 9.59, num: 'kWh_th', den: 'Sm3', eta: 1.05 },
    { id: 'kwh-mwh',   nome: 'kWh → MWh',                               f: 0.001,    num: 'MWh_el', den: 'kWh' },
    { id: 'mwh-kwh',   nome: 'MWh → kWh',                               f: 1000,     num: 'kWh',    den: 'MWh_el' },
    { id: 'carb-pci',  nome: 'Carbone → energia termica (PCI 7.000 kcal/kg)', f: 8.14, num: 'kWh_th', den: 'kg' },
    { id: 'carb-tep',  nome: 'Carbone → TEP',                           f: 0.0007,   num: 'tep',    den: 'kg' }
  ];
  const copiaFattori = () => FATTORI_TIPICI.map((x) => ({ ...x }));
  const NOMI_COLORI = ['carta', 'foglio', 'rialzo', 'linea', 'bordo', 'inchiostro', 'tenue', 'primario', 'segno', 'successo', 'errore', 'errore-fondo', 'attenzione', 'flusso-el', 'flusso-th', 'flusso-acqua', 'flusso-co2', 'flusso-tep', 'flusso-altro'];
  const RISERVA_CHIARA = { carta: '#ffffff', foglio: '#ffffff', rialzo: '#efedf1', linea: '#e1dde6', bordo: '#847c8e', inchiostro: '#1c1820', tenue: '#5f5868', primario: '#c4452b', segno: '#3f4fd6', successo: '#2e7d32', errore: '#c62828', 'errore-fondo': '#fdecec', attenzione: '#b7791f', 'flusso-el': '#2e9e4f', 'flusso-th': '#e8870e', 'flusso-acqua': '#2f9fd8', 'flusso-co2': '#8b5a2b', 'flusso-tep': '#7b2fa8', 'flusso-altro': '#8d8d8d' };

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
    if (u === 'tep') return { g: 'tep', f: 1, base: 'tep', nome: 'energia primaria (tep)' };
    if (u === 'kg') return { g: 'kg', f: 1, base: 'kg', nome: 'combustibile (kg)' };
    return { g: 'tCO2', f: u === 'kgCO2' ? 0.001 : 1, base: 't CO₂', nome: 'CO₂' };
  }
  /** Fattore con molte cifre decimali, all'italiana (0,000836 · 0,216 · 9,59 · 106). */
  function fmtFattore(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v === 0) return '0';
    const dec = clamp(3 - Math.floor(Math.log10(Math.abs(v))), 0, 9);
    return numIt(v, dec);
  }
  /** Rendimento come percentuale all'italiana: 0,9 → «90%», 1,0297 → «102,97%». */
  const fmtPct = (eta) => numIt(eta * 100, 2) + '%';
  const breveU = (u, ua) => (u === 'altro' ? (String(ua || '').trim() || '?') : (UNITA[u] ? UNITA[u].breve : '?'));
  const dimU = (u, ua) => (u === 'altro' ? 'altro:' + String(ua || '').trim().toLowerCase() : (UNITA[u] ? UNITA[u].dim : ''));
  /** Unità consigliata per la riga d'uscita quando si sceglie un fattore tipico (kg CO₂ → t CO₂, più leggibile nei bilanci). */
  const unitaUscitaPreferita = (num) => (num === 'kgCO2' ? 'tCO2' : num);

  function fmtBase(v, G) {
    if ((G.base === 'kWh' || G.base === 'kWh th') && Math.abs(v) >= 10000) {
      return fmt(v / 1000) + (G.g === 'th' ? ' MWh th' : G.g === 'el' ? ' MWh el.' : ' MWh');
    }
    return fmt(v) + (G.base ? ' ' + G.base : '');
  }

  /* ================= 2. MODELLO DATI E STORIA =================
     Formato JSON versione 4 (le versioni 1-3 vengono migrate in automatico da normalizza()):
       opzioni { conversione, pci, proporzionale, aggancio, scalaUnica (spessore in tep), scalaBlocchi, scalaTubi (0,5–2), spessoreMax }
       doc   { formato, versione: 4, titolo, nota, blocchi[], collegamenti[], opzioni{}, fattori[] }
       blocco{ id, nome, x, y, tipo: 'bilancio' | 'conversione' | 'confronto', dati[] }
       dato  { id, etichetta, valore, calc, u, ua, ruolo, conv, cmp }
       conv  null | { da: riga d'ingresso, f: fattore delle unità di misura, num, den: unità del fattore, eta: rendimento (1 = 100%), lib: fattore tipico }
       cmp   null | { a: riga A (riferimento), b: riga B (alternativa) }
     Conversione: riga con conv → valore = f × eta × riga «da» (prefissi gestiti da coefConversione).
     Confronto:   riga con cmp  → valore = A − B («riduzione» se positivo, «aumento» se negativo). */
  const VERSIONE = 4;
  const TIPI_BLOCCO = ['bilancio', 'conversione', 'confronto'];
  function docVuoto() {
    return {
      formato: 'playfair-sankey', versione: VERSIONE, titolo: 'Diagramma di Sankey', nota: '',
      blocchi: [], collegamenti: [],
      opzioni: { conversione: false, pci: 9.59, spessoreMax: 40, proporzionale: false, aggancio: true, scalaUnica: true, scalaBlocchi: 1, scalaTubi: 1 },
      fattori: copiaFattori()
    };
  }
  function nuovoDato(p) {
    p = p || {};
    const u = p.u !== undefined ? p.u : 'kWh';
    return { id: uid('d'), etichetta: p.etichetta != null ? p.etichetta : (UNITA[u] ? UNITA[u].nomeDato : 'Dato'), valore: p.valore != null ? p.valore : null, calc: null, u, ua: p.ua || '', ruolo: p.ruolo === 'perdita' ? 'perdita' : 'valore', conv: null, cmp: null };
  }
  const pulisciId = (s, p) => { s = String(s == null ? '' : s).replace(/[^\w-]/g, ''); return s || uid(p); };
  const numONull = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
  const unitaONull = (u) => (UNITA[u] ? u : null);

  /** Migrazione dei progetti salvati con versioni precedenti (oggetto grezzo → oggetto in versione 2). */
  function migra(o) {
    const v = Number(o.versione) || 1;
    if (v > VERSIONE) throw new Error(`il progetto è in un formato più recente (versione ${v}) di quello supportato (${VERSIONE})`);
    if (v < 2) {
      // v1 → v2: blocchi tutti «bilancio», nessuna conversione, libreria dei fattori tipici, nota vuota
      o = { ...o, versione: 2, nota: '', fattori: copiaFattori() };
      o.blocchi = (o.blocchi || []).map((b) => ({ ...b, tipo: 'bilancio', dati: (b && Array.isArray(b.dati) ? b.dati : []).map((x) => ({ ...x, conv: null })) }));
    }
    if (v < 3) {
      // v2 → v3: rendimento esplicito (mancante = 100%), nessun confronto
      o = { ...o, versione: 3 };
      o.blocchi = (o.blocchi || []).map((b) => ({ ...b, dati: (b && Array.isArray(b.dati) ? b.dati : []).map((x) => ({ ...x, conv: x && x.conv ? { ...x.conv, eta: x.conv.eta == null ? 1 : x.conv.eta } : null, cmp: null })) }));
    }
    if (v < 4) {
      // v3 → v4: scala unica degli spessori (equivalente tep) attiva; lo «spessore massimo» diventa la scala dei tubi
      const op = { ...(o.opzioni || {}) };
      const sm = Number(op.spessoreMax);
      op.scalaTubi = isFinite(sm) && sm > 0 ? clamp(sm / 40, 0.5, 2) : 1; op.spessoreMax = 40;
      op.scalaBlocchi = 1; op.scalaUnica = true;
      o = { ...o, versione: 4, opzioni: op };
    }
    if (v < VERSIONE) o.migrato = v;
    return o;
  }

  /** Valida e normalizza un progetto caricato da file o da localStorage. */
  function normalizza(o) {
    if (!o || typeof o !== 'object') throw new Error('il file non contiene un progetto valido');
    if (o.doc && Array.isArray(o.doc.blocchi)) o = o.doc;
    if (!Array.isArray(o.blocchi)) throw new Error('il file non contiene blocchi: non sembra un progetto Sankey di Playfair');
    o = migra(o);
    const d = docVuoto();
    d.titolo = String(o.titolo || d.titolo).slice(0, 120);
    d.nota = String(o.nota || '').slice(0, 2000);
    const op = o.opzioni || {};
    d.opzioni.conversione = !!op.conversione;
    if (isFinite(op.pci) && op.pci > 0) d.opzioni.pci = Number(op.pci);
    if (isFinite(op.spessoreMax)) d.opzioni.spessoreMax = clamp(Number(op.spessoreMax), 6, 120);
    d.opzioni.proporzionale = !!op.proporzionale;
    d.opzioni.aggancio = op.aggancio !== false;
    d.opzioni.scalaUnica = op.scalaUnica !== false;
    d.opzioni.scalaBlocchi = isFinite(op.scalaBlocchi) && op.scalaBlocchi > 0 ? clamp(Number(op.scalaBlocchi), 0.5, 2) : 1;
    d.opzioni.scalaTubi = isFinite(op.scalaTubi) && op.scalaTubi > 0 ? clamp(Number(op.scalaTubi), 0.5, 2) : 1;
    if (Array.isArray(o.fattori)) {
      // libreria: si parte dai tipici e si sovrascrivono i valori salvati; i fattori aggiunti dall'utente restano
      const salvati = new Map(o.fattori.filter((x) => x && x.id).map((x) => [String(x.id), x]));
      d.fattori.forEach((x) => { const y = salvati.get(x.id); if (y && isFinite(y.f) && Number(y.f) > 0) x.f = Number(y.f); salvati.delete(x.id); });
      salvati.forEach((y, id) => { if (isFinite(y.f) && unitaONull(y.num) && unitaONull(y.den)) d.fattori.push({ id: pulisciId(id, 'f'), nome: String(y.nome || id).slice(0, 80), f: Number(y.f), num: y.num, den: y.den }); });
    }
    const idB = new Set();
    o.blocchi.forEach((b) => {
      if (!b || typeof b !== 'object') return;
      let id = pulisciId(b.id, 'b'); if (idB.has(id)) id = uid('b'); idB.add(id);
      const idD = new Set();
      const dati = (Array.isArray(b.dati) ? b.dati : []).filter((x) => x && typeof x === 'object').map((x) => {
        let did = pulisciId(x.id, 'd'); if (idD.has(did)) did = uid('d'); idD.add(did);
        const c = x.conv && typeof x.conv === 'object' ? x.conv : null;
        const eta = c ? numONull(c.eta) : null;
        const conv = c ? { da: c.da ? String(c.da) : null, f: numONull(c.f), num: unitaONull(c.num), den: unitaONull(c.den), eta: eta != null && eta > 0 ? eta : 1, lib: String(c.lib || '').slice(0, 40) } : null;
        const m = x.cmp && typeof x.cmp === 'object' ? x.cmp : null;
        const cmp = m ? { a: m.a ? String(m.a) : null, b: m.b ? String(m.b) : null } : null;
        return { id: did, etichetta: String(x.etichetta == null ? '' : x.etichetta).slice(0, 80), valore: numONull(x.valore), calc: numONull(x.calc), u: UNITA[x.u] ? x.u : '', ua: String(x.ua || '').slice(0, 30), ruolo: x.ruolo === 'perdita' ? 'perdita' : 'valore', conv, cmp, _vecchioId: x.id };
      });
      // i riferimenti «da» delle conversioni seguono gli id eventualmente rinominati
      const rinomina = new Map(dati.map((x) => [String(x._vecchioId), x.id]));
      dati.forEach((x) => {
        if (x.conv) { x.conv.da = rinomina.get(x.conv.da) || null; if (x.conv.da === x.id) x.conv.da = null; }
        if (x.cmp) { x.cmp.a = rinomina.get(x.cmp.a) || null; x.cmp.b = rinomina.get(x.cmp.b) || null; if (x.cmp.a === x.id) x.cmp.a = null; if (x.cmp.b === x.id) x.cmp.b = null; }
      });
      dati.forEach((x) => { delete x._vecchioId; });
      d.blocchi.push({ id, nome: String(b.nome == null ? 'Blocco' : b.nome).slice(0, 80), x: Number(b.x) || 0, y: Number(b.y) || 0, tipo: TIPI_BLOCCO.includes(b.tipo) ? b.tipo : 'bilancio', dati });
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
    if (o.migrato) d.migrato = o.migrato;
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
     (4) Blocco di CONVERSIONE: niente bilancio (2) tra unità diverse; per ogni riga d'uscita
         vale  uscita = k × riga d'ingresso, con k = fattore UdM × rendimento, riportato alle unità
         delle due righe (kg↔t, kWh↔MWh). Le righe in m³ d'acqua sono trascurate con un avviso.
     (5) Blocco CONFRONTA: niente bilancio; per ogni riga di risultato  R = A − B  (stessa grandezza;
         R > 0 = riduzione, R < 0 = aumento). La percentuale (A − B)/A è derivata dopo la soluzione.
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

  /** Coefficiente effettivo di una conversione tra le unità delle righe: k = f · s(ingresso)/s(den) · s(num)/s(uscita). */
  function coefConversione(conv, src, dt) {
    const num = conv.num && conv.num !== 'altro' ? conv.num : dt.u, numUa = num === 'altro' ? dt.ua : '';
    const den = conv.den && conv.den !== 'altro' ? conv.den : src.u, denUa = den === 'altro' ? src.ua : '';
    const testo = breveU(num, numUa) + '/' + breveU(den, denUa);
    if (dimU(den, denUa) !== dimU(src.u, src.ua)) return { err: `il fattore è espresso in ${testo} ma la riga d'ingresso «${src.etichetta}» è in ${breveU(src.u, src.ua)}: scegli un fattore adatto o cambia l'unità.`, testo };
    if (dimU(num, numUa) !== dimU(dt.u, dt.ua)) return { err: `il fattore è espresso in ${testo} ma la riga «${dt.etichetta}» è in ${breveU(dt.u, dt.ua)}: scegli un fattore adatto o cambia l'unità.`, testo };
    const sc = (u) => (UNITA[u] ? UNITA[u].s : 1);
    const eta = conv.eta > 0 ? conv.eta : 1;
    const k = conv.f * eta * sc(src.u) / sc(den) * sc(num) / sc(dt.u);
    return { k, testo, num, den, eta };
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
    /** Termine con coefficiente «grezzo» (nelle unità del dato), stessa incognita delle equazioni di riga. */
    function termineGrezzo(dt, coef, bid) {
      const t = { coef, tipo: 'd', id: dt.id };
      if (dt.valore != null && isFinite(dt.valore)) t.val = dt.valore;
      else {
        const k = 'd:' + dt.id;
        if (!idxVar.has(k)) { idxVar.set(k, vars.length); vars.push({ tipo: 'd', id: dt.id, b: bid, ogg: dt }); }
        t.v = idxVar.get(k);
      }
      return t;
    }
    const alzaDopo = [];
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
      // (4) blocco di conversione: equazioni uscita = k × ingresso, nessun bilancio tra unità diverse
      if (b.tipo === 'conversione') {
        const ACQUA = 'L\'acqua (m³) non è convertibile in energia né in emissioni';
        b.dati.forEach((dt) => {
          const collegata = links.some((l) => (l.a.b === b.id && l.a.d === dt.id) || (l.da.b === b.id && l.da.d === dt.id));
          if (dt.u === 'm3' && (collegata || (dt.conv && dt.conv.da))) { nota(msgB, b.id, 'warn', `${ACQUA}: la riga «${dt.etichetta}» è trascurata dal blocco di conversione.`); alzaDopo.push(b.id); }
          if (!dt.conv || !dt.conv.da) {
            if (dt.ruolo === 'perdita' && unitaOk(dt.u, dt.ua) && dt.u !== 'm3') nota(msgB, b.id, 'info', `«${dt.etichetta}» è una perdita senza fattore: in un blocco di conversione indicala come uscita = fattore × ingresso.`);
            return;
          }
          const src = b.dati.find((x) => x.id === dt.conv.da);
          if (!src || src === dt) { nota(msgB, b.id, 'warn', `«${dt.etichetta}»: la riga d'ingresso della conversione non esiste più.`); alzaDopo.push(b.id); return; }
          if (dt.u === 'm3' || src.u === 'm3') { if (src.u === 'm3' && dt.u !== 'm3') { nota(msgB, b.id, 'warn', `${ACQUA}: «${dt.etichetta}» non può essere ottenuta da «${src.etichetta}» ed è trascurata.`); alzaDopo.push(b.id); } return; }
          if (!unitaOk(dt.u, dt.ua) || !unitaOk(src.u, src.ua)) { nota(msgB, b.id, 'warn', `«${dt.etichetta}»: scegli l'unità di misura della riga e di quella d'ingresso.`); alzaDopo.push(b.id); return; }
          if (dt.conv.f == null) { nota(msgB, b.id, 'warn', `«${dt.etichetta}»: manca il fattore di conversione.`); alzaDopo.push(b.id); return; }
          const c = coefConversione(dt.conv, src, dt);
          if (c.err) { nota(msgB, b.id, 'err', `«${dt.etichetta}»: ${c.err}`); return; }
          eqs.push({ b: b.id, tipo: 'conv', dato: dt, src, k: c.k, fattore: dt.conv.f, eta: c.eta, unitaF: c.testo, termini: [termineGrezzo(dt, 1, b.id), termineGrezzo(src, -c.k, b.id)] });
        });
        return;
      }
      // (5) blocco Confronta: R = A − B
      if (b.tipo === 'confronto') {
        b.dati.forEach((dt) => {
          if (!dt.cmp) return;
          const A = b.dati.find((x) => x.id === dt.cmp.a), B = b.dati.find((x) => x.id === dt.cmp.b);
          if (!A || !B || A === dt || B === dt || A === B) { nota(msgB, b.id, 'warn', `«${dt.etichetta}»: scegli due righe diverse da confrontare (A e B).`); alzaDopo.push(b.id); return; }
          if (!unitaOk(dt.u, dt.ua) || !unitaOk(A.u, A.ua) || !unitaOk(B.u, B.ua)) { nota(msgB, b.id, 'warn', `«${dt.etichetta}»: le righe A, B e il risultato devono avere un'unità di misura.`); alzaDopo.push(b.id); return; }
          const gR = gruppo(dt.u, dt.ua, opz), gA = gruppo(A.u, A.ua, opz), gB = gruppo(B.u, B.ua, opz);
          if (gR.g !== gA.g || gA.g !== gB.g) { nota(msgB, b.id, 'err', `«${dt.etichetta}»: A (${testoUnita(A.u, A.ua)}), B (${testoUnita(B.u, B.ua)}) e il risultato (${testoUnita(dt.u, dt.ua)}) devono essere della stessa grandezza.`); return; }
          eqs.push({ b: b.id, tipo: 'cmp', dato: dt, A, B, G: gR, termini: [termine('d', dt, +1, dt, b.id), termine('d', A, -1, A, b.id), termine('d', B, +1, B, b.id)] });
        });
        return;
      }
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
      if (eq.tipo === 'cmp') {
        const [tR, tA, tB] = eq.termini; const u = testoUnita(eq.dato.u, eq.dato.ua);
        const atteso = (valT(tA) * -tA.coef - valT(tB) * tB.coef) / tR.coef;
        testo = `Confronto incoerente: «${eq.dato.etichetta}» = A − B = ${fmt(atteso)} ${u}, ma vale ${fmt(valT(tR))} ${u}.`;
      } else if (eq.tipo === 'conv') {
        const vs = valT(eq.termini[1]), vd = valT(eq.termini[0]); const ud = testoUnita(eq.dato.u, eq.dato.ua);
        testo = `Conversione incoerente: «${eq.dato.etichetta}» = ${fmtFattore(eq.fattore)} ${eq.unitaF}${eq.eta !== 1 ? ' × η ' + fmtPct(eq.eta) : ''} × «${eq.src.etichetta}» ${fmt(vs)} ${testoUnita(eq.src.u, eq.src.ua)} = ${fmt(eq.k * vs)} ${ud}, ma vale ${fmt(vd)} ${ud} (scarto ${numIt(Math.abs(res) / Math.max(Math.abs(eq.k * vs), Math.abs(vd), 1e-12) * 100, 2)}%).`;
      } else if (eq.tipo === 'riga') {
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
    alzaDopo.forEach((id) => alza(stB, id, 'warn'));
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

  /** Testo del fattore accanto all'etichetta di una riga d'uscita di un blocco di conversione. */
  function testoFattoreRiga(b, dt) {
    if (b.tipo === 'confronto') return testoConfronto(b, dt).fx;
    if (b.tipo !== 'conversione') return '';
    if (dt.u === 'm3') return '(non convertibile)';
    if (!dt.conv || !dt.conv.da || dt.conv.f == null) return '';
    const src = b.dati.find((x) => x.id === dt.conv.da); if (!src) return '';
    const num = dt.conv.num || dt.u, den = dt.conv.den || src.u;
    const eta = dt.conv.eta > 0 ? dt.conv.eta : 1;
    return '× ' + fmtFattore(dt.conv.f) + ' ' + breveU(num, dt.ua) + '/' + breveU(den, src.ua) + (eta !== 1 ? ' · η ' + fmtPct(eta) : '');
  }
  const valDato = (dt) => (dt ? (dt.valore != null ? dt.valore : dt.calc) : null);
  /** Riga di risultato di un Confronta: valore assoluto e dicitura «riduzione»/«aumento» con la percentuale su A. */
  function testoConfronto(b, dt) {
    if (!dt.cmp) return { fx: '' };
    const A = b.dati.find((x) => x.id === dt.cmp.a), B = b.dati.find((x) => x.id === dt.cmp.b);
    const r = valDato(dt), va = valDato(A);
    if (r == null) return { fx: 'A − B' };
    const pct = va ? Math.abs(r / va) * 100 : null;
    const p = pct != null ? ' ' + numIt(pct, 1) + '%' : '';
    const fx = Math.abs(r) < 1e-12 ? 'nessuna variazione' : (r > 0 ? 'riduzione' : 'aumento') + p;
    const ut = testoUnita(dt.u, dt.ua);
    return { fx, valore: fmt(Math.abs(r)) + (ut ? ' ' + ut : ''), A, B };
  }
  const ICONA_CONV = 'M0 3.5H12M9 0.5L12 3.5L9 6.5M14 9.5H2M5 6.5L2 9.5L5 12.5';
  const RAGGIO = { bilancio: 4, conversione: 22, confronto: 0 };
  const INCL = 22; // inclinazione (px) dei lati del parallelogramma «Confronta»
  /** Forma del blocco, condivisa da SVG e PDF: rettangolo (raggio per tipo) o parallelogramma (Confronta). */
  function formaBlocco(b, g) {
    if (b.tipo !== 'confronto') return { r: RAGGIO[b.tipo] != null ? RAGGIO[b.tipo] : 4, ox: 0 };
    const s = INCL, w = g.w, h = g.h, t = s * TESTA / h;
    return { para: true, ox: s, pts: [[s, 0], [w, 0], [w - s, h], [0, h]], testa: [[s, 0], [w, 0], [w - t, TESTA], [s - t, TESTA]], div: [s - t, TESTA, w - t, TESTA] };
  }
  /** x del bordo effettivo del blocco all'altezza yRel (per il Confronta i lati sono inclinati). */
  function bordoX(b, g, lato, yRel) {
    if (b.tipo !== 'confronto') return lato === 'R' ? b.x + g.w : b.x;
    const t = clamp(yRel / g.h, 0, 1), s = g.incl != null ? g.incl : INCL;
    return lato === 'R' ? b.x + g.w - s * t : b.x + s * (1 - t);
  }

  /** Dimensioni automatiche: 1 dato → più largo che alto; 2 → quadrato; 3+ → più alto che largo.
      Con «compatto» (esportazioni) le proporzioni non si forzano: il blocco è grande quanto il contenuto. */
  function geometriaBlocco(b, fasci, M, compatto) {
    const n = b.dati.length; const conv = b.tipo === 'conversione', cmp = b.tipo === 'confronto';
    const incl = cmp ? INCL : 0;
    const fa = (k) => fasci.get(b.id + '|' + k) || { L: 0, R: 0 };
    let cw = M(b.nome || 'Blocco', 700, 13) + 2 * PADX + 14 + (conv || cmp ? 30 : 0) + 2 * incl;
    const righe = b.dati.map((dt) => {
      const et = dt.etichetta || '—'; const tv = testoValoreDato(dt); const fx = testoFattoreRiga(b, dt);
      if (cmp && dt.cmp) { const tc = testoConfronto(b, dt); if (tc.valore) tv.testo = tc.valore; }
      // compatto: il testo del fattore va su una seconda riga, così il blocco è più stretto
      const fx2 = compatto && !!fx;
      if (fx2) cw = Math.max(cw, PADX + 14 + M(et, 400, 12) + 18 + M(tv.testo, 600, 12) + PADX + 2 * incl, PADX + 14 + M(fx, 400, 11) + PADX + 2 * incl);
      else cw = Math.max(cw, PADX + 14 + M(et, 400, 12) + (fx ? 6 + M(fx, 400, 10.5) : 0) + 18 + M(tv.testo, 600, 12) + PADX + 2 * incl);
      const f = fa(dt.id);
      const uscita = (conv && !!(dt.conv && dt.conv.da && b.dati.some((x) => x.id === dt.conv.da))) || (cmp && !!dt.cmp);
      return { dt, et, tv, fx, fx2, uscita, p: Math.max(fx2 ? RIGA + 12 : RIGA, Math.max(f.L, f.R) + 8) };
    });
    cw = Math.max(compatto ? 110 : LARG_MIN, cw);
    const fc = fa('_'); const minC = Math.max(fc.L, fc.R) + 16;
    let w, h;
    if (n === 0) { h = Math.max(50, minC); w = Math.max(cw, compatto ? 0 : h * 1.8); }
    else {
      const somma = righe.reduce((s, r) => s + r.p, 0);
      const hc = Math.max(TESTA + somma + PADB, minC);
      if (compatto) { w = cw; h = hc; }
      else if (n === 1) { h = hc; w = Math.max(cw, h * 1.6); }
      else if (n === 2) { w = h = Math.max(cw, hc); }
      else { w = cw; h = Math.max(hc, w * 1.3); }
    }
    w = Math.ceil(w / GRIGLIA) * GRIGLIA; h = Math.ceil(h / GRIGLIA) * GRIGLIA;
    if (!compatto && n === 2) w = h = Math.max(w, h);
    if (!compatto && n >= 3 && h <= w) h = w + GRIGLIA * 2;
    if (n) {
      const somma = righe.reduce((s, r) => s + r.p, 0);
      const extra = (h - TESTA - PADB - somma) / n;
      let y = TESTA;
      righe.forEach((r) => { const pp = r.p + extra; r.cy = y + pp / 2; r.alto = pp; y += pp; });
    }
    return { w, h, righe, incl, cyCentro: n ? (TESTA + h) / 2 : h / 2 };
  }

  /* ---- equivalente di riferimento (tep) per lo spessore dei tubi ----
     Regola (spiegata anche nel pannello «Diagramma»): ogni flusso ha un equivalente in tep.
     · unità energetiche: elettricità 0,187 tep/MWh, gas 0,000836 tep/Sm³, calore 0,086 tep/MWh, tep = sé stesso
       (fattori presi dalla libreria del progetto, quindi modificabili);
     · unità non energetiche (t/kg CO₂, kg, altro): l'equivalente si eredita lungo i tubi e attraverso i blocchi di
       conversione: uscita = ingresso × rendimento (il fattore delle unità non conta); una riga con più tubi in arrivo
       vale la somma; il risultato di un Confronta vale |A − B|; l'ingresso di una conversione può ricavarlo
       all'indietro da un'uscita energetica (uscita ÷ rendimento);
     · acqua (m³): mai convertita, scala separata; flussi senza equivalente ricavabile: scala propria per unità. */
  function fattoreEq(d, u) {
    const f = (id) => { const x = (d.fattori || []).find((y) => y.id === id) || FATTORI_TIPICI.find((y) => y.id === id); return x ? x.f : null; };
    switch (u) {
      case 'kWh': return f('el-tep') / 1000; case 'MWh_el': return f('el-tep');
      case 'Sm3': return f('gas-tep');
      case 'MWh_th': return f('th-tep'); case 'kWh_th': return f('th-tep') / 1000;
      case 'tep': return 1;
      default: return null;
    }
  }
  function equivalenti(d, mb) {
    const val = (x) => (x.valore != null ? x.valore : x.calc);
    const eqR = new Map(), eqL = new Map();
    const links = d.collegamenti.filter((l) => mb.has(l.da.b) && mb.has(l.a.b));
    const unL = new Map(links.map((l) => [l.id, unitaEffettiva(l, mb)]));
    d.blocchi.forEach((b) => b.dati.forEach((dt) => { const f = fattoreEq(d, dt.u), v = val(dt); if (f != null && v != null) eqR.set(dt.id, Math.abs(v) * f); }));
    links.forEach((l) => { const un = unL.get(l.id); const f = un ? fattoreEq(d, un.u) : null, v = val(l); if (f != null && v != null) eqL.set(l.id, Math.abs(v) * f); });
    const acqua = (dt) => dt && dt.u === 'm3';
    for (let giro = 0; giro < 40; giro++) {
      let cambiato = false;
      const metti = (m, id, v) => { if (v != null && isFinite(v) && !m.has(id)) { m.set(id, v); cambiato = true; } };
      links.forEach((l) => {
        if (eqL.has(l.id)) return; const un = unL.get(l.id); if (un && un.u === 'm3') return;
        for (const [bid, did, verso] of [[l.da.b, l.da.d, 'out'], [l.a.b, l.a.d, 'in']]) {
          if (!did || !eqR.has(did)) continue;
          const dt = datoDi(mb.get(bid), did); if (acqua(dt)) continue;
          const fratelli = links.filter((x) => (verso === 'out' ? x.da.b === bid && x.da.d === did : x.a.b === bid && x.a.d === did));
          if (fratelli.length === 1) { metti(eqL, l.id, eqR.get(did)); break; }
          const v = val(l), vr = val(dt); if (v != null && vr) { metti(eqL, l.id, eqR.get(did) * Math.abs(v / vr)); break; }
        }
      });
      d.blocchi.forEach((b) => b.dati.forEach((dt) => {
        if (eqR.has(dt.id) || acqua(dt)) return;
        const ins = links.filter((x) => x.a.b === b.id && x.a.d === dt.id), outs = links.filter((x) => x.da.b === b.id && x.da.d === dt.id);
        const eta = (x) => (x.conv && x.conv.eta > 0 ? x.conv.eta : 1);
        if (ins.length && ins.every((x) => eqL.has(x.id))) return metti(eqR, dt.id, ins.reduce((t, x) => t + eqL.get(x.id), 0));
        if (b.tipo === 'conversione' && dt.conv && dt.conv.da && eqR.has(dt.conv.da)) return metti(eqR, dt.id, eqR.get(dt.conv.da) * eta(dt));
        if (b.tipo === 'confronto' && dt.cmp && eqR.has(dt.cmp.a) && eqR.has(dt.cmp.b)) return metti(eqR, dt.id, Math.abs(eqR.get(dt.cmp.a) - eqR.get(dt.cmp.b)));
        if (outs.length && outs.every((x) => eqL.has(x.id))) return metti(eqR, dt.id, outs.reduce((t, x) => t + eqL.get(x.id), 0));
        if (b.tipo === 'conversione') { const o = b.dati.find((x) => x.conv && x.conv.da === dt.id && eqR.has(x.id)); if (o) metti(eqR, dt.id, eqR.get(o.id) / eta(o)); }
      }));
      if (!cambiato) break;
    }
    return { eqR, eqL };
  }

  /** Spessore dei tubi. Scala unica (predefinita): proporzionale all'equivalente in tep, una sola scala per tutto il
      diagramma; acqua e flussi senza equivalente su scale proprie. Senza scala unica: una scala per unità (o per energia). */
  function larghezzeTubi(d, mb) {
    const opz = d.opzioni; const info = new Map(); const maxG = new Map();
    const unica = opz.scalaUnica !== false;
    const eq = unica && opz.proporzionale ? equivalenti(d, mb) : null;
    d.collegamenti.forEach((l) => {
      const un = unitaEffettiva(l, mb);
      const v = l.valore != null ? l.valore : l.calc;
      const G = un ? gruppo(un.u, un.ua, opz) : null;
      let q = (G && v != null) ? Math.abs(v * G.f) : null, scala = G ? G.g : null;
      if (eq && un && un.u !== 'm3' && eq.eqL.has(l.id)) { q = eq.eqL.get(l.id); scala = '*tep'; }
      else if (eq && un && un.u === 'm3') scala = '*acqua';
      else if (eq && un) scala = '*propria:' + (G ? G.g : '');
      info.set(l.id, { un, G, v, q, scala, calc: l.valore == null && l.calc != null });
      if (q != null && scala) maxG.set(scala, Math.max(maxG.get(scala) || 0, q));
    });
    const max = (opz.spessoreMax || 40) * (opz.scalaTubi > 0 ? opz.scalaTubi : 1);
    info.forEach((i) => {
      if (!opz.proporzionale) i.w = 10 * (opz.scalaTubi > 0 ? opz.scalaTubi : 1);
      else if (i.q == null) i.w = 4;
      else { const mx = maxG.get(i.scala) || 0; i.w = mx > 0 ? Math.max(1.5, max * i.q / mx) : 2; }
      i.w = Math.round(i.w * 10) / 10;
    });
    info.scale = new Set([...info.values()].map((i) => i.scala).filter(Boolean));
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
        if ((o.id === idA && i === 0) || (o.id === idB && i === ns - 1)) continue; // tratto d'aggancio (anche sui lati inclinati)
        if ((o.id === idA && i <= 1) || (o.id === idB && i >= ns - 2)) inf = -1;
        else if (o.id === idA || o.id === idB) inf = 3 + w / 2;
        else inf = 8 + w / 2;
        if (segInRett(a, b, o, inf)) colpi++;
      }
    }
    return L + (pts.length - 2) * 25 + colpi * 10000;
  }
  /** Percorsi ortogonali candidati tra porta P (lato sA) e porta Q (lato sB). */
  function candidati(P, sA, Q, sB, rA, rB, w, ost) {
    const dA = sA === 'R' ? 1 : -1, dB = sB === 'L' ? 1 : -1;
    const st = STUB + w / 2 + 2; // il tratto verticale non deve sfiorare il blocco
    const P1 = P.x + dA * st, Q1 = Q.x - dB * st;
    const out = [];
    if (dA === dB) {
      if ((Q1 - P1) * dA >= 0) {
        if (Math.abs(P.y - Q.y) < 0.5) out.push({ pts: [P, { x: Q.x, y: P.y }], pen: 0 }); // dritto: esattamente orizzontale
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
      // giri attorno ai blocchi intermedi (sopra e sotto ciascuno), così un tubo lungo non passa dietro un blocco
      const xl = Math.min(P1, Q1), xr = Math.max(P1, Q1);
      (ost || []).forEach((o) => { if (o.id !== rA.id && o.id !== rB.id && o.x < xr && o.x + o.w > xl) { ys.push(o.y - m, o.y + o.h + m); } });
      ys.forEach((y) => out.push({ pts: [P, { x: P1, y: P.y }, { x: P1, y }, { x: Q1, y }, { x: Q1, y: Q.y }, Q], pen: 0 }));
    } else {
      const base = dA > 0 ? Math.max(P1, Q1) + 6 : Math.min(P1, Q1) - 6;
      for (let k = 0; k < 10; k++) { const x = base + dA * k * 24; out.push({ pts: [P, { x, y: P.y }, { x, y: Q.y }, Q], pen: k * 3 }); }
    }
    return out;
  }
  function migliorRotta(P, sA, Q, sB, rA, rB, ost, w) {
    let best = null;
    for (const c of candidati(P, sA, Q, sB, rA, rB, w, ost)) {
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
    // scala dei blocchi: la geometria si calcola a scala 1 (con i fasci di tubi riportati a scala 1) e poi si ingrandisce
    // attorno al centro del blocco, così le posizioni (i centri) restano fisse
    const sb = d.opzioni.scalaBlocchi > 0 ? d.opzioni.scalaBlocchi : 1;
    const geoS = (b, fasci) => {
      const f2 = sb === 1 ? fasci : new Map([...fasci].map(([k, o]) => [k, { ...o, L: o.L / sb, R: o.R / sb }]));
      const g0 = geometriaBlocco(b, f2, M, opz.compatto);
      if (sb === 1) return { ...g0, s: 1, base: g0 };
      const g1 = geometriaBlocco(b, fasci, M, opz.compatto); // ancoraggio: il centro del blocco a scala 1
      return { ...g0, w: g0.w * sb, h: g0.h * sb, incl: g0.incl * sb, cyCentro: g0.cyCentro * sb, righe: g0.righe.map((r) => ({ ...r, cy: r.cy * sb, alto: r.alto * sb })), s: sb, base: g0, ancora: g1 };
    };
    const posa = (geoM) => d.blocchi.forEach((b) => { const g = geoM.get(b.id); mb.set(b.id, sb === 1 ? b : { ...b, x: b.x + (g.ancora.w - g.w) / 2, y: b.y + (g.ancora.h - g.h) / 2 }); });
    const rett = (b, g) => ({ id: b.id, x: b.x, y: b.y, w: g.w, h: g.h });
    const chiaveDato = (b, did) => (did && b.dati.some((x) => x.id === did)) ? did : '_';
    const portaY = (b, g, k) => { if (k === '_') return b.y + g.cyCentro; const r = g.righe.find((rr) => rr.dt.id === k); return b.y + (r ? r.cy : g.cyCentro); };
    const links = d.collegamenti.filter((l) => mb.has(l.da.b) && mb.has(l.a.b) && l.da.b !== l.a.b);

    // passo 1: geometria senza fasci → scelta dei lati
    const geo1 = new Map(d.blocchi.map((b) => [b.id, geoS(b, new Map())]));
    posa(geo1);
    let ost = d.blocchi.map((b) => rett(mb.get(b.id), geo1.get(b.id)));
    const lati = new Map();
    links.forEach((l) => {
      const bs = mb.get(l.da.b), bt = mb.get(l.a.b), gs = geo1.get(bs.id), gt = geo1.get(bt.id);
      const ys = portaY(bs, gs, chiaveDato(bs, l.da.d)), yt = portaY(bt, gt, chiaveDato(bt, l.a.d));
      const w = tubi.get(l.id).w; let best = null;
      for (const sA of ['R', 'L']) for (const sB of ['L', 'R']) {
        const P = { x: bordoX(bs, gs, sA, ys - bs.y), y: ys }, Q = { x: bordoX(bt, gt, sB, yt - bt.y), y: yt };
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
    const geo = new Map(d.blocchi.map((b) => [b.id, geoS(b, fasci)]));
    posa(geo);
    ost = d.blocchi.map((b) => rett(mb.get(b.id), geo.get(b.id)));
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
      let y = cy - tot / 2;
      lista.forEach((p) => { const yy = y + p.w / 2; porte.set(p.l.id + '|' + p.estremo, { x: bordoX(b, g, lato, yy - b.y), y: yy }); y += p.w + GAP_TUBI; });
    });
    // passo 4: percorsi definitivi
    const rotte = links.map((l) => {
      const bs = mb.get(l.da.b), bt = mb.get(l.a.b), L = lati.get(l.id), w = tubi.get(l.id).w;
      const r = migliorRotta(porte.get(l.id + '|da'), L.sA, porte.get(l.id + '|a'), L.sB, rett(bs, geo.get(bs.id)), rett(bt, geo.get(bt.id)), ost, w);
      return { l, pts: r.pts, w, attraversa: r.costo >= 10000 };
    });
    districa(rotte);
    const contaRiga = new Map();
    links.forEach((l) => { ['da|' + l.da.b + '|' + l.da.d, 'a|' + l.a.b + '|' + l.a.d].forEach((k) => contaRiga.set(k, (contaRiga.get(k) || 0) + 1)); });
    // passo 5: tubi pronti da disegnare
    const scTubi = rotte.map((r) => {
      const pts = semplifica(r.pts); const info = tubi.get(r.l.id);
      const ops = operazioniPercorso(pts, r.w);
      let best = null;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]; const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        const oriz = Math.abs(a.y - b.y) < Math.abs(a.x - b.x); let k = len * (oriz ? 1.6 : 1);
        if ((i === 0 && affollato.get(r.l.id + '|da')) || (i === pts.length - 2 && affollato.get(r.l.id + '|a'))) k *= 0.45;
        if (!best || k > best.k) best = { k, a, b, len, oriz };
      }
      const mid = { x: (best.a.x + best.b.x) / 2, y: (best.a.y + best.b.y) / 2 };
      const dir = best.oriz ? { x: Math.sign(best.b.x - best.a.x) || 1, y: 0 } : { x: 0, y: Math.sign(best.b.y - best.a.y) || 1 };
      const un = info.un; const ut = un ? testoUnita(un.u, un.ua) : '';
      let testo = '';
      if (info.v != null) testo = fmt(info.v) + (ut ? ' ' + ut : '');
      else if (ut) testo = '? ' + ut;
      if (r.l.etichetta) testo = r.l.etichetta + (testo ? ': ' + testo : '');
      // stampa compatta: il valore di un tubo che è l'unico a lasciare (o a raggiungere) la sua riga è già scritto nella riga
      const ridondante = opz.compatto && !r.l.etichetta && info.v != null && (contaRiga.get('da|' + r.l.da.b + '|' + r.l.da.d) === 1 || contaRiga.get('a|' + r.l.a.b + '|' + r.l.a.d) === 1) && r.l.da.d && r.l.a.d;
      const etich = testo && !ridondante ? { testo, calc: info.calc, tw: M(testo, 600, 11.5) } : null;
      let freccia = null;
      if (r.w >= 5 && best.len > 46) {
        const s = clamp(r.w * 0.32, 3, 9), px = -dir.y, py = dir.x;
        const c = { x: mid.x + dir.x * (best.oriz ? 0 : 0), y: mid.y };
        freccia = [[c.x + dir.x * s, c.y + dir.y * s], [c.x - dir.x * s + px * s, c.y - dir.y * s + py * s], [c.x - dir.x * s * 0.35, c.y - dir.y * s * 0.35], [c.x - dir.x * s - px * s, c.y - dir.y * s - py * s]];
      }
      return { l: r.l, pts, w: r.w, ops, d: opsInD(ops), vettore: info.un ? vettoreDi(info.un.u) : 'altro', mancante: info.v == null, etich, freccia, attraversa: r.attraversa };
    });
    piazzaEtichette(scTubi, ost, affollato);
    const scBlocchi = d.blocchi.map((b) => ({ b: mb.get(b.id), g: geo.get(b.id) }));
    return { blocchi: scBlocchi, tubi: scTubi, geo, scale: tubi.scale, unica: d.opzioni.scalaUnica !== false && d.opzioni.proporzionale };
  }

  /** Colloca le etichette dei tubi evitando blocchi, altre etichette e (se possibile) gli altri tubi:
      per ogni tubo si provano più posizioni (sopra/sotto i tratti orizzontali, a destra/sinistra dei verticali)
      e si sceglie quella con il costo minore; i tubi più spessi scelgono per primi. */
  function piazzaEtichette(tubi, blocchi, affollato) {
    const sovrap = (p, q) => p.x1 < q.x2 && p.x2 > q.x1 && p.y1 < q.y2 && p.y2 > q.y1;
    const segRett = tubi.map((t) => {
      const out = [];
      for (let i = 0; i < t.pts.length - 1; i++) {
        const a = t.pts[i], b = t.pts[i + 1], m = t.w / 2 + 1;
        out.push({ x1: Math.min(a.x, b.x) - m, x2: Math.max(a.x, b.x) + m, y1: Math.min(a.y, b.y) - m, y2: Math.max(a.y, b.y) + m });
      }
      return out;
    });
    const rettB = blocchi.map((o) => ({ x1: o.x - 3, y1: o.y - 3, x2: o.x + o.w + 3, y2: o.y + o.h + 3 }));
    const piazzate = [];
    const ordine = tubi.map((t, i) => i).filter((i) => tubi[i].etich).sort((i, j) => tubi[j].w - tubi[i].w);
    ordine.forEach((ti) => {
      const t = tubi[ti], e = t.etich, tw = e.tw, w = t.w, n = t.pts.length - 1;
      let best = null;
      for (let i = 0; i < n; i++) {
        const a = t.pts[i], b = t.pts[i + 1]; const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (len < 4) continue;
        const oriz = Math.abs(a.y - b.y) < Math.abs(a.x - b.x); const rc = Math.max(8, 1.25 * w);
        const estremo = (i === 0 && affollato.get(t.l.id + '|da')) || (i === n - 1 && affollato.get(t.l.id + '|a'));
        const prove = [];
        if (oriz) {
          const ci = len >= tw + 2 * rc;
          [0.5, 0.32, 0.68, 0.18, 0.82].forEach((f) => {
            const x = a.x + (b.x - a.x) * f; const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
            if (ci && (x - tw / 2 < lo + rc - 0.5 || x + tw / 2 > hi - rc + 0.5)) return;
            if (!ci && f !== 0.5) return;
            const pen = (ci ? 0 : 500) + Math.abs(f - 0.5) * 90 - Math.min(len, 500) * 0.12 + (estremo ? 140 : 0);
            const ys = a.y - w / 2 - 6, yg = a.y + w / 2 + 14;
            prove.push({ x, y: ys, anc: 'middle', bl: 'auto', box: { x1: x - tw / 2 - 2, x2: x + tw / 2 + 2, y1: ys - 11, y2: ys + 3 }, pen });
            prove.push({ x, y: yg, anc: 'middle', bl: 'auto', box: { x1: x - tw / 2 - 2, x2: x + tw / 2 + 2, y1: yg - 11, y2: yg + 3 }, pen: pen + 25 });
          });
          // accanto al blocco di partenza o d'arrivo: lì di solito non passano altri tubi
          if (len >= tw + 12 && (i === 0 || i === n - 1)) {
            const verso = Math.sign(b.x - a.x) || 1, ys = a.y - w / 2 - 6;
            const x = i === n - 1 ? b.x - verso * 5 : a.x + verso * 5;
            const anc = (i === n - 1) === (verso > 0) ? 'end' : 'start';
            const x1 = anc === 'end' ? x - tw - 2 : x - 2, x2 = anc === 'end' ? x + 2 : x + tw + 2;
            prove.push({ x, y: ys, anc, bl: 'auto', box: { x1, x2, y1: ys - 11, y2: ys + 3 }, pen: 35 - Math.min(len, 500) * 0.12 + (estremo ? 60 : 0) });
          }
        } else if (len >= 26) {
          [0.5, 0.3, 0.7].forEach((f) => {
            const y = a.y + (b.y - a.y) * f;
            const pen = 70 + Math.abs(f - 0.5) * 90 - Math.min(len, 400) * 0.06 + (estremo ? 140 : 0);
            const xd = a.x + w / 2 + 6, xs = a.x - w / 2 - 6;
            prove.push({ x: xd, y, anc: 'start', bl: 'central', box: { x1: xd - 2, x2: xd + tw + 2, y1: y - 8, y2: y + 8 }, pen });
            prove.push({ x: xs, y, anc: 'end', bl: 'central', box: { x1: xs - tw - 2, x2: xs + 2, y1: y - 8, y2: y + 8 }, pen: pen + 20 });
          });
        }
        prove.forEach((c) => {
          let k = c.pen;
          rettB.forEach((r) => { if (sovrap(c.box, r)) k += 4000; });
          piazzate.forEach((r) => { if (sovrap(c.box, r)) k += 6000; });
          segRett.forEach((lista, j) => lista.forEach((r, si) => { if ((j !== ti || (si !== i)) && sovrap(c.box, r)) k += j === ti ? 300 : 900; }));
          if (!best || k < best.k) best = { ...c, k };
        });
      }
      if (!best) { const a = t.pts[0], b = t.pts[n]; const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2 - w / 2 - 6; best = { x, y, anc: 'middle', bl: 'auto', box: { x1: x - tw / 2, x2: x + tw / 2, y1: y - 11, y2: y + 3 } }; }
      Object.assign(e, { x: best.x, y: best.y, anc: best.anc, bl: best.bl, box: best.box });
      piazzate.push(best.box);
    });
  }

  function confiniScena(sc) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    sc.blocchi.forEach(({ b, g }) => { x1 = Math.min(x1, b.x - 12); y1 = Math.min(y1, b.y - 12); x2 = Math.max(x2, b.x + g.w + 12); y2 = Math.max(y2, b.y + g.h + 12); });
    sc.tubi.forEach((t) => {
      t.pts.forEach((p) => { x1 = Math.min(x1, p.x - t.w / 2); y1 = Math.min(y1, p.y - t.w / 2); x2 = Math.max(x2, p.x + t.w / 2); y2 = Math.max(y2, p.y + t.w / 2); });
      if (t.etich && t.etich.box) { const bx = t.etich.box; x1 = Math.min(x1, bx.x1); y1 = Math.min(y1, bx.y1); x2 = Math.max(x2, bx.x2); y2 = Math.max(y2, bx.y2); }
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
      if (t.etich) s += `<text class="sk-tubo-etich${t.etich.calc ? ' calc' : ''}" x="${r2(t.etich.x)}" y="${r2(t.etich.y)}" text-anchor="${t.etich.anc}" dominant-baseline="${t.etich.bl}">${esc(t.etich.testo)}</text>`;
    });
    s += '</g><g class="sk-blocchi">';
    sc.blocchi.forEach(({ b, g }) => {
      const st = ver && ver.r.stB.get(b.id);
      const sel = schermo && stato.selB.has(b.id);
      const sorg = schermo && stato.collega && stato.collega.b === b.id;
      const conv = b.tipo === 'conversione', cmp = b.tipo === 'confronto';
      const cls = 'sk-blocco' + (conv ? ' conv' : '') + (cmp ? ' cmp' : '') + (sel ? ' sel' : '') + (st ? ' st-' + st : '') + (sorg ? ' sorgente' : '') + (ver && stato.obsoleto ? ' obsoleto' : '');
      const msgs = ver ? (ver.r.msgB.get(b.id) || []) : [];
      const descr = st === 'ok' ? 'bilancio coerente' : st === 'err' ? 'bilancio incoerente' : st === 'warn' ? 'valori non determinabili' : '';
      const aria = schermo ? ` tabindex="0" role="button" aria-label="${conv ? 'Blocco di conversione' : cmp ? 'Blocco Confronta' : 'Blocco'} ${esc(b.nome)}, ${b.dati.length} dati${descr ? ', ' + descr : ''}"` : '';
      s += `<g class="${cls}" data-blocco="${b.id}" transform="translate(${r2(b.x)} ${r2(b.y)})"${aria}>`;
      if (schermo && msgs.length) s += `<title>${esc(msgs.map((m) => m.testo).join('\n'))}</title>`;
      const sbk = g.s || 1; if (g.base) g = g.base; // si disegna a scala 1 dentro un gruppo ingrandito
      if (sbk !== 1) s += `<g transform="scale(${sbk})">`;
      const fm = formaBlocco(b, g);
      if (fm.para) {
        const dP = 'M' + fm.pts.map((q) => r2(q[0]) + ' ' + r2(q[1])).join('L') + 'Z';
        if (schermo) s += `<path class="sk-blocco-sel" d="M${r2(fm.pts[0][0] - 1)} -6L${g.w + 6} -6L${r2(g.w - INCL + 1)} ${g.h + 6}L-6 ${g.h + 6}Z"/>`;
        s += `<path class="sk-blocco-fondo" d="${dP}"/>`;
        if (b.dati.length) s += `<path class="sk-blocco-testa" d="M${fm.testa.map((q) => r2(q[0]) + ' ' + r2(q[1])).join('L')}Z"/><line class="sk-blocco-div" x1="${r2(fm.div[0])}" x2="${r2(fm.div[2])}" y1="${TESTA}" y2="${TESTA}"/>`;
        s += `<path class="sk-blocco-corpo" d="${dP}"/>`;
      } else {
        const R = fm.r;
        if (schermo) s += `<rect class="sk-blocco-sel" x="-5" y="-5" width="${g.w + 10}" height="${g.h + 10}" rx="${R + 4}"/>`;
        s += `<rect class="sk-blocco-fondo" width="${g.w}" height="${g.h}" rx="${R}"/>`;
        if (b.dati.length) s += `<path class="sk-blocco-testa" d="M0 ${R}a${R} ${R} 0 0 1 ${R}-${R}h${g.w - 2 * R}a${R} ${R} 0 0 1 ${R} ${R}v${TESTA - R}H0z"/><line class="sk-blocco-div" x1="0" x2="${g.w}" y1="${TESTA}" y2="${TESTA}"/>`;
        s += `<rect class="sk-blocco-corpo" width="${g.w}" height="${g.h}" rx="${R}"/>`;
      }
      const yIc = b.dati.length ? TESTA / 2 : g.h / 2;
      if (conv) s += `<path class="sk-conv-icona" transform="translate(${g.w - PADX - 22} ${yIc - 6.5})" d="${ICONA_CONV}"><title>Blocco di conversione</title></path>`;
      if (cmp) s += `<text class="sk-cmp-icona" x="${r2(g.w - PADX - 14 - INCL * yIc / g.h)}" y="${yIc + 1}" text-anchor="end" dominant-baseline="central">A−B<title>Blocco Confronta</title></text>`;
      const ox = fm.ox;
      if (b.dati.length) s += `<text class="sk-blocco-nome" x="${PADX + ox}" y="${TESTA / 2 + 1}" dominant-baseline="central">${esc(b.nome)}</text>`;
      else s += `<text class="sk-blocco-nome" x="${g.w / 2}" y="${g.h / 2}" text-anchor="middle" dominant-baseline="central">${esc(b.nome)}</text>`;
      g.righe.forEach((r) => {
        const c = col(VETTORI[unitaOk(r.dt.u, r.dt.ua) ? vettoreDi(r.dt.u) : 'altro'].v);
        const attiva = schermo && stato.collega && stato.collega.b === b.id && stato.collega.d === r.dt.id;
        s += `<g class="sk-riga${attiva ? ' sorgente' : ''}" data-dato="${r.dt.id}">`;
        if (schermo) s += `<rect class="sk-riga-hit" x="${2 + ox}" y="${r2(r.cy - r.alto / 2)}" width="${g.w - 4 - 2 * ox}" height="${r2(r.alto)}" rx="4"/>`;
        const vuoto = r.dt.ruolo === 'perdita'; const mx = PADX + 4 + ox;
        if (r.uscita) s += `<path d="M${mx} ${r2(r.cy - 5)}l5 5-5 5-5-5z" style="${vuoto ? `fill:none;stroke:${c};stroke-width:1.6px` : `fill:${c}`}"/>`;
        else s += vuoto
          ? `<circle cx="${mx}" cy="${r2(r.cy)}" r="3.6" style="fill:none;stroke:${c};stroke-width:1.8px"/>`
          : `<circle cx="${mx}" cy="${r2(r.cy)}" r="4.2" style="fill:${c}"/>`;
        const clsFx = 'sk-riga-fx' + (cmp ? (/aumento/.test(r.fx) ? ' cmp aum' : ' cmp') : '');
        if (r.fx2) s += `<text class="sk-riga-etich" x="${PADX + 14 + ox}" y="${r2(r.cy - 6)}" dominant-baseline="central">${esc(r.et)}</text><text class="${clsFx}" x="${PADX + 14 + ox}" y="${r2(r.cy + 8)}" dominant-baseline="central" style="font-size:11px">${esc(r.fx)}</text>`;
        else s += `<text class="sk-riga-etich" x="${PADX + 14 + ox}" y="${r2(r.cy)}" dominant-baseline="central">${esc(r.et)}${r.fx ? `<tspan class="${clsFx}" dx="6">${esc(r.fx)}</tspan>` : ''}</text>`;
        s += `<text class="sk-riga-val ${r.tv.cls}" x="${g.w - PADX - ox}" y="${r2(r.cy)}" text-anchor="end" dominant-baseline="central">${esc(r.tv.testo)}</text></g>`;
      });
      if (st) {
        const cc = col(st === 'ok' ? 'successo' : st === 'err' ? 'errore' : 'attenzione');
        s += `<g class="sk-badge" transform="translate(${g.w - 3} 3)"><circle r="9.5" style="fill:${cc}"/>`;
        s += st === 'ok' ? '<path d="M-4.2 0.3l2.8 2.8 5.4-5.6" style="fill:none;stroke-width:2.4px;stroke-linecap:round;stroke-linejoin:round" class="sk-badge-segno"/>' : `<text text-anchor="middle" dominant-baseline="central" y="0.5">${st === 'err' ? '!' : '?'}</text>`;
        s += '</g>';
      }
      if (sbk !== 1) s += '</g>';
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
  function aggiornaCursori() {
    [['blocchi', doc.opzioni.scalaBlocchi], ['tubi', doc.opzioni.scalaTubi]].forEach(([k, v]) => {
      const el = $('#sk-scala-' + k); if (!el) return; const pc = Math.round((v > 0 ? v : 1) * 100);
      el.value = pc; $('#sk-scala-' + k + '-val').textContent = pc + '%';
    });
  }
  function disegnaTutto() { $('#sk-titolo').value = doc.titolo; aggiornaCursori(); disegna(); disegnaPannello(); aggiornaPulsanti(); aggiornaModo(); }

  function disegnaSovra() {
    let s = '';
    const dr = stato.drag;
    if (stato.modo === 'collegamento' && stato.collega && stato.mouse && scenaCorrente) {
      const vb = scenaCorrente.blocchi.find((x) => x.b.id === stato.collega.b);
      const b = vb && vb.b, g = vb && vb.g;
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
    const ns = notaScale(scenaCorrente); if (ns) h += `<span class="sk-leg-nota">${esc(ns)}</span>`;
    if (doc.blocchi.some((b) => b.tipo === 'conversione')) h += '<span class="sk-leg-nota">angoli smussati ⇄ = conversione (× fattore × η) · ◆ = riga calcolata</span>';
    if (doc.blocchi.some((b) => b.tipo === 'confronto')) h += '<span class="sk-leg-nota">parallelogramma A−B = confronto (riduzione / aumento)</span>';
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
    tela.classList.remove('modo-seleziona', 'modo-blocco', 'modo-collegamento', 'modo-conversione', 'modo-confronto');
    tela.classList.add('modo-' + stato.modo);
    mostraSuggerimento(true);
  }
  function suggerimento() {
    if (stato.modo === 'blocco') return 'Modalità Blocco: clicca nell\'area per creare un blocco · trascina i blocchi per spostarli · Esc per uscire';
    if (stato.modo === 'confronto') return 'Modalità Confronta: clicca nell\'area per creare un blocco che confronta due scenari (A − B: riduzione o aumento, assoluto e %) · Esc per uscire';
    if (stato.modo === 'conversione') return 'Modalità Conversione: clicca nell\'area per creare un blocco di conversione (uscita = fattore × ingresso) · Esc per uscire';
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
  function creaBlocco(wx, wy, tipo) {
    tipo = TIPI_BLOCCO.includes(tipo) ? tipo : 'bilancio';
    const conv = tipo === 'conversione';
    const b = { id: uid('b'), nome: nomeUnico(conv ? 'Conversione' : tipo === 'confronto' ? 'Confronta' : 'Blocco'), x: aggancia(wx - 70), y: aggancia(wy - 25), tipo, dati: [] };
    if (conv) {
      // proposta iniziale: elettricità (kWh) → CO₂ (t) con il fattore tipico; righe, fattore e rendimento si cambiano nel pannello
      const ing = nuovoDato({ u: 'kWh', etichetta: 'Elettricità' }), usc = nuovoDato({ u: 'tCO2', etichetta: 'CO₂' });
      usc.conv = { da: ing.id, f: null, num: null, den: null, eta: 1, lib: '' };
      b.dati.push(ing, usc);
      applicaFattore(usc, 'el-co2');
    } else if (tipo === 'confronto') {
      // proposta iniziale: A (scenario base) e B (alternativa) in tep, risultato A − B
      const A = nuovoDato({ u: 'tep', etichetta: 'A · scenario base' }), B = nuovoDato({ u: 'tep', etichetta: 'B · alternativa' }), R = nuovoDato({ u: 'tep', etichetta: 'Differenza' });
      R.cmp = { a: A.id, b: B.id };
      b.dati.push(A, B, R);
    }
    modifica(() => { doc.blocchi.push(b); });
    seleziona([b.id]);
    messaggio(conv ? `Creato il blocco di conversione «${b.nome}»: elettricità → CO₂ con il fattore tipico. Cambia righe, unità, fattore e rendimento nel pannello a destra.`
      : tipo === 'confronto' ? `Creato il blocco Confronta «${b.nome}»: collega lo scenario base alla riga A e l'alternativa alla riga B; il risultato è A − B (riduzione o aumento, anche in %).`
      : `Creato «${b.nome}». Aggiungi i dati nel pannello a destra, oppure continua a cliccare per altri blocchi.`, 'successo', tipo === 'bilancio' ? 4500 : 7000);
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
    const bS = doc.blocchi.find((x) => x.id === da.b), bT = doc.blocchi.find((x) => x.id === a.b);
    const dS = datoDi(bS, da.d), dT = datoDi(bT, a.d);
    const acquaConv = ((bT && bT.tipo === 'conversione') || (bS && bS.tipo === 'conversione')) && ((dS && dS.u === 'm3') || (dT && dT.u === 'm3'));
    if (doc.collegamenti.some((l) => l.da.b === da.b && l.da.d === da.d && l.a.b === a.b && l.a.d === a.d)) { messaggio('Questo collegamento esiste già.', 'avviso'); stato.collega = null; richiediDisegno(); return; }
    const l = { id: uid('l'), da: { b: da.b, d: da.d }, a: { b: a.b, d: a.d }, valore: null, calc: null, u: '', ua: '', etichetta: '' };
    modifica(() => { doc.collegamenti.push(l); });
    stato.collega = null;
    seleziona([], [l.id]);
    if (acquaConv) messaggio('Attenzione: l\'acqua (m³) non è convertibile in energia né in emissioni. Nel blocco di conversione questa riga sarà trascurata.', 'avviso', 8000);
    else messaggio('Collegamento creato. Inserisci valore e unità nel pannello (o lascia vuoto: lo calcola Aggiorna). Puoi continuare a collegare.', 'successo', 6000);
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
      nb.dati.forEach((dt) => { if (dt.conv && dt.conv.da) dt.conv.da = mappaD.get(dt.conv.da) || null; if (dt.cmp) { dt.cmp.a = mappaD.get(dt.cmp.a) || null; dt.cmp.b = mappaD.get(dt.cmp.b) || null; } });
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
    const creaTipo = { blocco: 'bilancio', conversione: 'conversione', confronto: 'confronto' }[stato.modo];
    stato.drag = { ...base, tipo: creaTipo ? 'crea' : 'vuoto', tipoBlocco: creaTipo, tx0: stato.vista.tx, ty0: stato.vista.ty };
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
    if (dr.tipo === 'crea' && !dr.mosso) creaBlocco(w.x, w.y, dr.tipoBlocco);
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
    else if (lk === 'c') { impostaModo('conversione'); e.preventDefault(); }
    else if (lk === 'k') { impostaModo('confronto'); e.preventDefault(); }
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

  /* ---- fattori di conversione ---- */
  const fattoreDi = (id) => (doc.fattori || []).find((x) => x.id === id) || null;
  /** Applica alla riga d'uscita un fattore della libreria; se la dimensione non torna adegua l'unità della riga. */
  function applicaFattore(dt, libId) {
    const lib = fattoreDi(libId) || FATTORI_TIPICI.find((x) => x.id === libId); if (!lib || !dt.conv) return null;
    dt.conv.f = lib.f; dt.conv.num = lib.num; dt.conv.den = lib.den; dt.conv.lib = lib.id;
    // il rendimento resta quello della riga, salvo i fattori tipici che ne dichiarano uno (caldaie)
    if (lib.eta > 0) dt.conv.eta = lib.eta; else if (!(dt.conv.eta > 0)) dt.conv.eta = 1;
    if (dimU(lib.num) !== dimU(dt.u, dt.ua)) {
      const vecchio = UNITA[dt.u] ? UNITA[dt.u].nomeDato : null;
      dt.u = unitaUscitaPreferita(lib.num); dt.ua = '';
      if (!dt.etichetta || dt.etichetta === vecchio || /^(Dato|Uscita)( \d+)?$/.test(dt.etichetta)) dt.etichetta = UNITA[dt.u].nomeDato;
    }
    return lib;
  }
  /** Fattore tipico più adatto per convertire la riga src nella riga dt (stessa dimensione dell'ingresso, poi dell'uscita e del vettore). */
  function fattoreAdatto(src, dt) {
    if (!src || src.u === 'm3' || !unitaOk(src.u, src.ua)) return null;
    const ds = dimU(src.u, src.ua), dd = dimU(dt.u, dt.ua), vs = UNITA[src.u].vettore;
    const punti = (x) => (dimU(x.num) === dd ? 0 : 10) + (UNITA[x.den].vettore === vs ? 0 : 5) + (x.den === src.u ? 0 : 1) + (x.num === dt.u ? 0 : 0.5);
    const c = (doc.fattori || []).filter((x) => UNITA[x.den] && dimU(x.den) === ds).sort((a, b) => punti(a) - punti(b));
    return c[0] || null;
  }
  /** Dopo un cambio d'unità: le conversioni che non tornano più ricevono un fattore tipico adatto (o restano da completare). */
  function adeguaConversioni(b) {
    if (b.tipo !== 'conversione') return;
    b.dati.forEach((dt) => {
      if (!dt.conv || !dt.conv.da) return;
      const src = b.dati.find((x) => x.id === dt.conv.da); if (!src || dt.conv.f == null) return;
      if (!coefConversione(dt.conv, src, dt).err) return;
      const lib = fattoreAdatto(src, dt);
      if (lib && dimU(lib.num) === dimU(dt.u, dt.ua)) applicaFattore(dt, lib.id);
      else { dt.conv.f = null; dt.conv.num = null; dt.conv.den = null; dt.conv.lib = ''; }
    });
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
    h += `<label class="sk-campo"><span>Nota del diagramma (fonti, ipotesi, rendimenti: compare nelle esportazioni)</span><textarea data-campo="o-nota" rows="4" maxlength="2000">${esc(doc.nota || '')}</textarea></label>`;
    h += '<h3>Calcolo e spessori</h3>';
    h += `<label class="sk-check"><input type="checkbox" data-campo="o-conv"${o.conversione ? ' checked' : ''}> Converti in energia (kWh)</label>`;
    h += '<p class="sk-nota">Riguarda i bilanci dei blocchi: con la conversione MWh → kWh e Sm³ → kWh (con il PCI) elettricità, gas e calore entrano nello stesso bilancio energetico; senza, ogni vettore ha il suo bilancio (kWh e MWh dello stesso vettore restano sempre confrontabili). Gli spessori dipendono invece dalla «Scala unica».</p>';
    h += `<label class="sk-campo"><span>PCI del gas naturale (kWh/Sm³)</span><input class="sk-num" inputmode="decimal" data-campo="o-pci" value="${fmtCampo(o.pci)}"${o.conversione ? '' : ' disabled'}></label>`;
    h += `<label class="sk-check"><input type="checkbox" data-campo="o-prop"${o.proporzionale ? ' checked' : ''}> Spessore proporzionale ai valori</label>`;
    h += `<label class="sk-check"><input type="checkbox" data-campo="o-unica"${o.scalaUnica !== false ? ' checked' : ''}> Scala unica (equivalente TEP)</label>`;
    h += '<p class="sk-nota">Con la scala unica lo spessore di ogni tubo è proporzionale al suo equivalente in tep, su una sola scala per tutto il diagramma: elettricità, gas e calore con i fattori qui sotto; t CO₂ e le altre unità non energetiche ereditano l\'equivalente attraverso i blocchi di conversione (uscita = ingresso × rendimento, il fattore delle unità non conta), una riga che somma più tubi vale la somma, il risultato di un Confronta |A − B|. Così le perdite escono sottili e il tubo delle emissioni totali è spesso quanto la somma dei flussi iniziali. L\'acqua resta su una scala separata. Senza scala unica: una scala per unità di misura.</p>';
    h += '<h3>Fattori di equivalenza per lo spessore</h3><div class="sk-libreria">' + ['el-tep', 'gas-tep', 'th-tep'].map((id) => fattoreDi(id)).filter(Boolean).map((x) => `<label class="sk-lib-voce"><span>${esc(x.nome)}</span><span class="sk-fattore"><input class="sk-num" inputmode="decimal" data-campo="fl-f" data-id="${esc(x.id)}" value="${fmtCampo(x.f)}" aria-label="${esc(x.nome)}, fattore di equivalenza"><span class="sk-fattore-u">${esc(breveU(x.num) + '/' + breveU(x.den))}</span></span></label>`).join('') + '</div><p class="sk-nota">Gli stessi valori della libreria dei fattori tipici; tep = 1.</p>';
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
    h += '<h3>Fattori tipici (libreria)</h3>';
    h += '<p class="sk-nota">Valori proposti nei blocchi di conversione (coerenti con Playfair-S). Se ne cambi uno, si aggiornano tutte le righe che lo usano.</p>';
    h += '<div class="sk-libreria">' + (doc.fattori || []).map((x) => `<label class="sk-lib-voce"><span>${esc(x.nome)}${x.eta > 0 && x.eta !== 1 ? ' · η ' + esc(fmtPct(x.eta)) : ''}</span><span class="sk-fattore"><input class="sk-num" inputmode="decimal" data-campo="fl-f" data-id="${esc(x.id)}" value="${fmtCampo(x.f)}" aria-label="${esc(x.nome)}, fattore in ${esc(breveU(x.num) + '/' + breveU(x.den))}"><span class="sk-fattore-u">${esc(breveU(x.num) + '/' + breveU(x.den))}</span></span></label>`).join('') + '</div>';
    h += '<div class="sk-azioni"><button type="button" class="sk-btn sk-piccolo" data-azione="fl-ripristina">Ripristina i valori tipici</button></div>';
    const nCalc = doc.collegamenti.filter((l) => l.calc != null).length + doc.blocchi.reduce((s, b) => s + b.dati.filter((d) => d.calc != null).length, 0);
    if (nCalc) h += `<div class="sk-azioni"><button type="button" class="sk-btn sk-piccolo" data-azione="fissa-tutti" data-tip="Trasforma i ${nCalc} valori calcolati in valori inseriti">Fissa i ${nCalc} calcolati</button><button type="button" class="sk-btn sk-piccolo" data-azione="cancella-calc">Cancella i calcolati</button></div>`;
    h += `<details class="sk-semantica"><summary>Come vengono verificati i bilanci</summary><ol>
      <li><strong>Dato collegato.</strong> Il valore di un dato (riga) è uguale alla somma dei tubi che arrivano a quella riga e, separatamente, alla somma dei tubi che partono da quella riga.</li>
      <li><strong>Blocco.</strong> Per ogni vettore (unità di misura o, con la conversione, energia in kWh): se il blocco ha sia ingressi sia uscite, Σ ingressi = Σ uscite + Σ dati con ruolo «Perdita». Un blocco senza ingressi è una <em>sorgente</em>, senza uscite è un'<em>utenza</em>: non ha vincoli di blocco.</li>
      <li><strong>Caselle vuote.</strong> Un dato o un tubo con l'unità ma senza valore è un'incognita: Aggiorna risolve il sistema lineare dei bilanci e scrive in <em style="color:var(--segno)">corsivo colorato</em> i valori determinati in modo univoco. Se i dati non bastano, segnala «non determinabile». «Fissa» trasforma un valore calcolato in inserito.</li>
      <li><strong>Blocco di conversione</strong> (angoli smussati, icona ⇄). Trasforma un vettore in un altro: ogni riga d'uscita vale <em>riga d'ingresso × fattore delle unità di misura × rendimento η</em> (es. t CO₂ = kWh × 0,216 kg CO₂/kWh × 100%; MWh termici di una caldaia = Sm³ × 9,59 kWh/Sm³ × 90%). Il fattore converte le unità, il rendimento (predefinito 100%) dice quanta energia diventa utile. Qui il bilancio ingressi = uscite tra unità diverse <em>non</em> si applica: valgono le equazioni di conversione, che Aggiorna usa in avanti e all'indietro; se entrambi i valori sono inseriti e non tornano, il blocco diventa rosso. I prefissi (kg↔t, kWh↔MWh) sono gestiti da soli. L'acqua (m³) non è convertibile in energia né in emissioni: in un blocco di conversione viene trascurata con un avviso.</li>
      <li><strong>Blocco Confronta</strong> (parallelogramma, «A−B»). Per ogni riga di risultato vale <em>A − B</em> tra due righe della stessa grandezza: A = scenario di riferimento, B = alternativa. Positivo = <em>riduzione</em>, negativo = <em>aumento</em>; la percentuale è riferita ad A. Se inserisci un risultato diverso, il blocco diventa rosso.</li>
      <li><strong>Somme.</strong> Un blocco con una sola riga e più tubi in arrivo (es. «Emissioni totali (t CO₂)», «Energia primaria totale (TEP)») ne calcola la somma.</li>
      <li>Dati senza tubi e non «Perdita» sono solo informativi. Tolleranza: 0,1% del termine più grande.</li></ol></details>`;
    return h;
  }

  function pannelloBlocco(b) {
    if (!b) return pannelloDiagramma();
    const v = stato.verifica; const st = v ? v.r.stB.get(b.id) : null;
    const conv = b.tipo === 'conversione';
    let h = `<h2>${iconaSt(st)} ${conv ? 'Blocco di conversione <span aria-hidden="true">⇄</span>' : b.tipo === 'confronto' ? 'Blocco Confronta <span aria-hidden="true">A−B</span>' : 'Blocco'} ${chiudiBtn()}</h2>`;
    h += `<label class="sk-campo"><span>Nome del blocco</span><input type="text" data-campo="b-nome" value="${esc(b.nome)}" maxlength="80"></label>`;
    h += `<label class="sk-campo"><span>Tipo di blocco</span><select data-campo="b-tipo"><option value="bilancio"${conv ? '' : ' selected'}>Bilancio: Σ ingressi = Σ uscite + perdite</option><option value="conversione"${conv ? ' selected' : ''}>Conversione ⇄: uscita = ingresso × fattore × η</option><option value="confronto"${b.tipo === 'confronto' ? ' selected' : ''}>Confronta A−B: differenza tra due scenari</option></select></label>`;
    if (conv) h += '<p class="sk-nota">Trasforma un vettore in un altro (es. Sm³ → MWh, kWh → t CO₂ o tep). Le righe senza fattore sono gli ingressi; per ogni uscita scegli la riga d\'ingresso, il fattore delle unità di misura (es. PCI 9,59 kWh/Sm³) e il rendimento η (100% se è un puro cambio di unità, 90% per una caldaia…). Il bilancio tra unità diverse non si applica. L\'acqua (m³) non si converte.</p>';
    if (b.tipo === 'confronto') h += '<p class="sk-nota">Confronta due scenari della stessa grandezza: A = riferimento, B = alternativa. Il risultato vale A − B: positivo = <strong>riduzione</strong>, negativo = <strong>aumento</strong>; la percentuale è riferita ad A. Più coppie nello stesso blocco (es. tep e t CO₂).</p>';
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
      if (conv) h += rigaConversione(b, dt);
      if (b.tipo === 'confronto') h += rigaConfronto(b, dt);
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

  /** Campi di conversione di una riga (riga d'ingresso, fattore con la sua unità, fattore tipico). */
  function rigaConversione(b, dt) {
    if (dt.u === 'm3') return '<div class="sk-msg warn sk-larga">L\'acqua (m³) non è convertibile in energia né in emissioni: in questo blocco la riga è trascurata.</div>';
    const fonti = b.dati.filter((x) => x !== dt && x.u !== 'm3' && !(x.conv && x.conv.da === dt.id));
    const da = dt.conv && dt.conv.da && b.dati.find((x) => x.id === dt.conv.da) ? dt.conv.da : '';
    let h = `<label class="sk-larga">Calcolo della riga<select data-campo="d-conv-da" data-dato="${dt.id}"><option value=""${da ? '' : ' selected'}>Ingresso (vettore da convertire)</option>`;
    fonti.forEach((x) => { h += `<option value="${x.id}"${x.id === da ? ' selected' : ''}>= fattore × «${esc(x.etichetta || '—')}»${unitaOk(x.u, x.ua) ? ' (' + esc(testoUnita(x.u, x.ua)) + ')' : ''}</option>`; });
    h += '</select></label>';
    if (!da) return h;
    const src = b.dati.find((x) => x.id === da);
    const num = dt.conv.num || dt.u, den = dt.conv.den || src.u;
    const ufat = breveU(num, dt.ua) + ' / ' + breveU(den, src.ua);
    h += `<label class="sk-larga">Fattore delle unità di misura<span class="sk-fattore"><input type="text" class="sk-num" inputmode="decimal" data-campo="d-conv-f" data-dato="${dt.id}" value="${fmtCampo(dt.conv.f)}" placeholder="fattore" autocomplete="off"><span class="sk-fattore-u">${esc(ufat)}</span></span></label>`;
    h += `<label class="sk-larga">Rendimento η<span class="sk-fattore"><input type="text" class="sk-num" inputmode="decimal" data-campo="d-conv-eta" data-dato="${dt.id}" value="${fmtCampo((dt.conv.eta > 0 ? dt.conv.eta : 1) * 100)}" placeholder="100" autocomplete="off"><span class="sk-fattore-u">%</span></span></label>`;
    const ds = dimU(src.u, src.ua);
    const lib = (doc.fattori || []).filter((x) => UNITA[x.den] && dimU(x.den) === ds);
    if (lib.length) {
      h += `<label class="sk-larga">Fattore tipico<select data-campo="d-conv-lib" data-dato="${dt.id}"><option value=""${dt.conv.lib ? '' : ' selected'}>${dt.conv.f != null ? '(personalizzato)' : '(scegli…)'}</option>`;
      lib.forEach((x) => { h += `<option value="${esc(x.id)}"${x.id === dt.conv.lib ? ' selected' : ''}>${esc(x.nome)}: ${esc(fmtFattore(x.f))} ${esc(breveU(x.num) + '/' + breveU(x.den))}${x.eta > 0 && x.eta !== 1 ? ', η ' + esc(fmtPct(x.eta)) : ''}</option>`; });
      h += '</select></label>';
    } else h += `<p class="sk-nota sk-larga" style="margin:0">Nessun fattore tipico per ${esc(breveU(src.u, src.ua))}: inserisci il fattore a mano.</p>`;
    if (dt.conv.f != null && unitaOk(dt.u, dt.ua) && unitaOk(src.u, src.ua)) {
      const c = coefConversione(dt.conv, src, dt);
      if (c.err) h += `<div class="sk-msg err sk-larga">${esc(c.err)}</div>`;
      else h += `<p class="sk-nota sk-larga" style="margin:0">Uscita = ingresso × fattore × η${Math.abs(c.k - dt.conv.f) > 1e-12 * Math.max(1, Math.abs(c.k)) ? ` = ingresso × ${esc(fmtFattore(c.k))} ${esc(breveU(dt.u, dt.ua) + ' / ' + breveU(src.u, src.ua))} (con le unità delle righe)` : ''}</p>`;
    }
    return h;
  }

  /** Campi di una riga del blocco Confronta: ingresso (A o B) oppure risultato A − B. */
  function rigaConfronto(b, dt) {
    const altri = b.dati.filter((x) => x !== dt && !x.cmp);
    let h = `<label class="sk-larga">Calcolo della riga<select data-campo="d-cmp" data-dato="${dt.id}"><option value=""${dt.cmp ? '' : ' selected'}>Ingresso da confrontare (A o B)</option><option value="ris"${dt.cmp ? ' selected' : ''}>Risultato: A − B (riduzione se positivo)</option></select></label>`;
    if (!dt.cmp) return h;
    const opz = (sel) => '<option value="">(scegli)</option>' + altri.map((x) => `<option value="${x.id}"${x.id === sel ? ' selected' : ''}>«${esc(x.etichetta || '—')}»${unitaOk(x.u, x.ua) ? ' (' + esc(testoUnita(x.u, x.ua)) + ')' : ''}</option>`).join('');
    h += `<label>A · riferimento<select data-campo="d-cmp-a" data-dato="${dt.id}">${opz(dt.cmp.a)}</select></label>`;
    h += `<label>B · alternativa<select data-campo="d-cmp-b" data-dato="${dt.id}">${opz(dt.cmp.b)}</select></label>`;
    const tc = testoConfronto(b, dt);
    if (tc.valore) h += `<p class="sk-nota sk-larga" style="margin:0">A − B = ${esc(fmt(valDato(dt)))} ${esc(testoUnita(dt.u, dt.ua))}: <strong>${esc(tc.fx)}</strong> rispetto ad A.</p>`;
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
          adeguaConversioni(b);
        }, { pannello: true });
        if (b.tipo === 'conversione' && dt.u === 'm3') messaggio('L\'acqua (m³) non è convertibile in energia né in emissioni: nel blocco di conversione la riga sarà trascurata.', 'avviso', 7000);
      } break;
      case 'b-tipo': if (tipoEv === 'change' && b) modifica(() => { b.tipo = TIPI_BLOCCO.includes(el.value) ? el.value : 'bilancio'; }, { pannello: true }); break;
      case 'd-conv-da': if (tipoEv === 'change' && dt) {
        let lib = null;
        modifica(() => {
          if (!el.value) { dt.conv = null; return; }
          const src = b.dati.find((x) => x.id === el.value);
          dt.conv = { f: null, num: null, den: null, eta: 1, lib: '', ...(dt.conv || {}), da: el.value };
          if (dt.conv.f == null || coefConversione(dt.conv, src, dt).err) { dt.conv.f = null; dt.conv.num = null; dt.conv.den = null; dt.conv.lib = ''; lib = fattoreAdatto(src, dt); if (lib) applicaFattore(dt, lib.id); }
        }, { pannello: true });
        if (lib) messaggio(`Fattore tipico proposto: ${lib.nome}, ${fmtFattore(lib.f)} ${breveU(lib.num)}/${breveU(lib.den)}. Puoi cambiarlo.`, 'successo', 6000);
      } break;
      case 'd-conv-f': if (tipoEv === 'input' && dt && dt.conv) { const v = leggiVal(); if (v !== undefined) modifica(() => { dt.conv.f = v; dt.conv.lib = ''; }, { unione: 'd-conv-f' + dt.id }); } break;
      case 'd-conv-eta': if (tipoEv === 'input' && dt && dt.conv) { const v = leggiVal(); if (v != null && v > 0) modifica(() => { dt.conv.eta = v / 100; }, { unione: 'd-conv-eta' + dt.id }); } break;
      case 'd-cmp': if (tipoEv === 'change' && dt) modifica(() => {
        if (!el.value) { dt.cmp = null; return; }
        const altri = b.dati.filter((x) => x !== dt && !x.cmp);
        dt.cmp = { a: altri[0] ? altri[0].id : null, b: altri[1] ? altri[1].id : null };
        if (!unitaOk(dt.u, dt.ua) && altri[0]) { dt.u = altri[0].u; dt.ua = altri[0].ua; }
      }, { pannello: true }); break;
      case 'd-cmp-a': case 'd-cmp-b': if (tipoEv === 'change' && dt && dt.cmp) modifica(() => { dt.cmp[c === 'd-cmp-a' ? 'a' : 'b'] = el.value || null; }, { pannello: true }); break;
      case 'd-conv-lib': if (tipoEv === 'change' && dt && dt.conv && el.value) modifica(() => { applicaFattore(dt, el.value); }, { pannello: true }); break;
      case 'o-nota': if (tipoEv === 'input') modifica(() => { doc.nota = el.value; }, { unione: 'o-nota', dati: false }); break;
      case 'fl-f': if (tipoEv === 'input') {
        const x = fattoreDi(el.dataset.id); const v = leggiVal();
        if (x && v != null && v > 0) modifica(() => { x.f = v; doc.blocchi.forEach((bb) => bb.dati.forEach((d2) => { if (d2.conv && d2.conv.lib === x.id) d2.conv.f = v; })); }, { unione: 'fl-f' + x.id });
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
      case 'o-unica': if (tipoEv === 'change') modifica(() => { doc.opzioni.scalaUnica = el.checked; }, { dati: false, pannello: true }); break;
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
        modifica(() => { b.dati.splice(idx, 1); b.dati.forEach((x) => { if (x.conv && x.conv.da === id) x.conv.da = null; if (x.cmp) { if (x.cmp.a === id) x.cmp.a = null; if (x.cmp.b === id) x.cmp.b = null; } }); doc.collegamenti.forEach((x) => { if (x.da.b === b.id && x.da.d === id) x.da.d = null; if (x.a.b === b.id && x.a.d === id) x.a.d = null; }); }, { pannello: true });
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
      case 'fl-ripristina': modifica(() => {
        doc.fattori = copiaFattori();
        doc.blocchi.forEach((bb) => bb.dati.forEach((d2) => { const x = d2.conv && d2.conv.lib && fattoreDi(d2.conv.lib); if (x) d2.conv.f = x.f; }));
      }, { pannello: true }); messaggio('Fattori tipici ripristinati.', 'successo'); break;
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
  /** riga di fonte comune a tutti i file scaricati dal sito (Playfair.fonte() in sito.js) */
  const fonte = () => (window.Playfair && window.Playfair.fonte ? window.Playfair.fonte() : `Fonte: Playfair — playfair.statocritico.it · elaborazione del ${oggi()} su dati forniti dall'utente · licenza AGPL-3.0`);
  function scarica(blob, nome) {
    if (window.Playfair && window.Playfair.scarica) { window.Playfair.scarica(blob, nome); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function salvaJSON() {
    const dati = { ...doc, versione: VERSIONE, vista: stato.vista, salvato: new Date().toISOString(), fonte: fonte() };
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
    const migrato = doc.migrato; delete doc.migrato;
    if (migrato) messaggio(`Progetto in formato versione ${migrato} convertito automaticamente alla versione ${VERSIONE} (conversioni con rendimento, Confronta, scala unica degli spessori in tep, scale di blocchi e tubi). Premi Aggiorna per verificare i bilanci.`, 'successo', 9000);
    else if (testo) messaggio(testo, 'successo', 6000);
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
.sk-tubo-etich.calc{fill:${p.segno};font-style:italic}.sk-badge text{font-size:12px;font-weight:800;fill:#fff}.sk-badge-segno{stroke:#fff}.sk-badge circle{stroke:#fff;stroke-width:2}
.sk-conv-icona{fill:none;stroke:${p.inchiostro};stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.sk-cmp-icona{fill:${p.tenue};font-size:11px;font-weight:700}
.sk-riga-fx{fill:${p.tenue};font-size:10.5px;font-style:italic}.sk-riga-fx.cmp{fill:${p.successo};font-style:normal;font-weight:700}.sk-riga-fx.aum{fill:${p.errore}}`;
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
    const margine = 40;
    const W = Math.max(Math.ceil(bb.w + margine * 2), 720);
    const righeNota = a_capo(doc.nota, W - margine * 2, (t) => M(t, 400, 12.5));
    const testa = 78 + righeNota.length * 17 + (righeNota.length ? 6 : 0);
    // legenda su più righe se serve
    const voci = vett.map((k) => ({ k, t: VETTORI[k].nome, w: 30 + M(VETTORI[k].nome, 400, 12) + 22 }));
    const nl = notaLegenda(sc);
    voci.push({ k: null, t: nl, w: M(nl, 400, 12) + 10 });
    const righeLeg = []; let riga = [], lr = 0;
    voci.forEach((v) => { if (lr + v.w > W - margine * 2 && riga.length) { righeLeg.push(riga); riga = []; lr = 0; } riga.push(v); lr += v.w; });
    if (riga.length) righeLeg.push(riga);
    const altLeg = righeLeg.length * 22 + 26;
    const H = Math.ceil(testa + bb.h + altLeg + 20 + 22);
    const ox = (W - bb.w) / 2 - bb.x, oy = testa - bb.y;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${stileExport(pal)}</style>`;
    s += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
    s += `<text x="${margine}" y="38" style="font-size:22px;font-weight:700;fill:${pal.inchiostro}">${esc(doc.titolo)}</text>`;
    s += `<text x="${margine}" y="58" style="font-size:12px;fill:${pal.tenue}">${oggi()} · Playfair Sankey (playfair.statocritico.it)</text>`;
    righeNota.forEach((t, i) => { s += `<text x="${margine}" y="${80 + i * 17}" style="font-size:12.5px;fill:${pal.inchiostro}">${esc(t)}</text>`; });
    s += `<line x1="${margine}" x2="${W - margine}" y1="${testa - 10}" y2="${testa - 10}" stroke="${pal.linea}"/>`;
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
    s += `<text x="${margine}" y="${H - 16}" style="font-size:11px;fill:${pal.tenue}">${esc(fonte())}</text>`;
    s += '</svg>';
    return { svg: s, W, H, ox, oy, righeLeg };
  }
  /** Testo della legenda per le note grafiche (conversione, tratteggio, corsivo). */
  /** Nota sulle scale degli spessori (scala unica in tep, acqua separata, scale proprie). */
  function notaScale(sc) {
    if (!sc || !sc.unica) return '';
    const sc2 = sc.scale || new Set(); let t = 'spessore ∝ equivalente in tep (scala unica)';
    if (sc2.has('*acqua')) t += ' · acqua: scala separata';
    if ([...sc2].some((x) => String(x).startsWith('*propria'))) t += ' · flussi senza equivalente: scala propria';
    return t;
  }
  function notaLegenda(sc) {
    const ns = notaScale(sc);
    return (ns ? ns + ' · ' : '') + (doc.blocchi.some((b) => b.tipo === 'conversione') ? 'angoli smussati con frecce = conversione (ingresso × fattore × η) · ' : '')
      + (doc.blocchi.some((b) => b.tipo === 'confronto') ? 'parallelogramma A-B = confronto (A - B: riduzione o aumento) · ' : '')
      + (doc.blocchi.some((b) => b.tipo !== 'bilancio') ? 'rombo = riga calcolata dal blocco · ' : '') + 'tratteggio = valore mancante · corsivo = valore calcolato';
  }
  /** Divide un testo in righe di larghezza massima maxW (misura fornita da mis). */
  function a_capo(testo, maxW, mis) {
    const out = [];
    String(testo || '').split(/\n+/).forEach((par) => {
      let r = '';
      par.split(/\s+/).filter(Boolean).forEach((p) => { const t = r ? r + ' ' + p : p; if (r && mis(t) > maxW) { out.push(r); r = p; } else r = t; });
      if (r) out.push(r);
    });
    return out;
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
  /** Cartella Excel: foglio con l'immagine del diagramma + fogli «Blocchi» e «Flussi» (con l'equivalente in tep). */
  async function esportaXLSX() {
    const x = preparaExport(); if (!x) return null;
    if (!window.Playfair || !window.Playfair.esportaExcel) { messaggio('Esportazione in Excel non disponibile.', 'errore'); return null; }
    const r = costruisciSVG(x);
    const mb = mappaBlocchi(doc);
    const eq = equivalenti(doc, mb);
    const val = (o) => (o.valore != null ? o.valore : o.calc);
    const tep = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 1e6) / 1e6);
    const tipoB = { bilancio: 'bilancio', conversione: 'conversione', confronto: 'confronto' };
    const righeB = [];
    doc.blocchi.forEach((b) => {
      if (!b.dati.length) { righeB.push([b.nome, tipoB[b.tipo] || b.tipo, '', null, '', '', '', null]); return; }
      b.dati.forEach((dt) => {
        const v = val(dt);
        righeB.push([b.nome, tipoB[b.tipo] || b.tipo, dt.etichetta || '', v == null ? null : v, testoUnita(dt.u, dt.ua), dt.ruolo === 'perdita' ? 'perdita' : (dt.ruolo || 'valore'),
          dt.valore == null && dt.calc != null ? 'calcolato' : (dt.valore != null ? 'inserito' : 'mancante'), tep(eq.eqR.get(dt.id))]);
      });
    });
    const nomeEstremo = (e) => { const b = mb.get(e.b); const dt = datoDi(b, e.d); return (b ? b.nome : '?') + (dt && dt.etichetta ? ' · ' + dt.etichetta : ''); };
    const righeF = doc.collegamenti.filter((l) => mb.has(l.da.b) && mb.has(l.a.b)).map((l) => {
      const un = unitaEffettiva(l, mb); const v = val(l);
      return [nomeEstremo(l.da), nomeEstremo(l.a), v == null ? null : v, un ? testoUnita(un.u, un.ua) : '', tep(eq.eqL.get(l.id)),
        l.valore == null && l.calc != null ? 'calcolato' : (l.valore != null ? 'inserito' : 'mancante'), l.etichetta || ''];
    });
    let png = null;
    try {
      const c = await svgInCanvas(r.svg, r.W, r.H, clamp(2400 / r.W, 1, 2.5));
      png = { base64: c.toDataURL('image/png').split(',')[1], w: c.width, h: c.height };
    } catch (err) { messaggio('Immagine del diagramma non disponibile: ' + err.message, 'avviso'); }
    const nota = 'Equivalente in tep: fattori del progetto (elettricità ' + fmtFattore(fattoreEq(doc, 'MWh_el')) + ' tep/MWh, gas ' + fmtFattore(fattoreEq(doc, 'Sm3')) + ' tep/Sm³, calore ' + fmtFattore(fattoreEq(doc, 'MWh_th')) + ' tep/MWh); vuoto se il flusso non ha un equivalente energetico (acqua, unità libere).';
    const fogli = [
      { nome: 'Diagramma', titolo: doc.titolo, immagine: png, grafico: null, tabella: { colonne: [], righe: [] },
        nota: 'Diagramma di Sankey come immagine: i dati sono nei fogli «Blocchi» e «Flussi».' },
      { nome: 'Blocchi', titolo: doc.titolo + ' — blocchi e righe', grafico: null, immagine: null, solaTabella: true, nota,
        tabella: { colonne: ['Blocco', 'Tipo', 'Riga', 'Valore', 'Unità', 'Ruolo', 'Origine del valore', 'Equivalente [tep]'], righe: righeB } },
      { nome: 'Flussi', titolo: doc.titolo + ' — flussi', grafico: null, immagine: null, solaTabella: true, nota,
        tabella: { colonne: ['Sorgente', 'Destinazione', 'Valore', 'Unità', 'Equivalente [tep]', 'Origine del valore', 'Etichetta'], righe: righeF } }
    ];
    if (png == null) fogli.shift();
    try {
      const esito = await window.Playfair.esportaExcel(fogli, { strumento: 'Playfair Sankey', nomeFile: 'playfair-sankey', titolo: doc.titolo, righeFonte: doc.nota ? [['Nota del diagramma', doc.nota]] : [] });
      messaggio('Esportato ' + esito.nome + ' (diagramma, blocchi, flussi e fonte).', 'successo');
      return esito;
    } catch (err) { messaggio('Esportazione Excel non riuscita: ' + (err && err.message ? err.message : err), 'errore'); return null; }
  }
  // l'Helvetica standard di jsPDF non disegna ² e ³ (glifo vuoto): Sm³ → Sm3, m³ → m3, CO₂ → CO2
  const pdfTesto = (s) => String(s).replace(/₂/g, '2').replace(/³/g, '3').replace(/rendimento η/g, 'rendimento').replace(/η\./g, 'rend.').replace(/η /g, 'rend. ').replace(/η/g, 'rend.').replace(/²/g, '2').replace(/≠/g, '!=').replace(/≈/g, '~').replace(/−/g, '-').replace(/→/g, '->').replace(/[^\x00-\xFF—–…·€‘’“”•]/g, '');
  /** PDF vettoriale disegnato con le primitive di jsPDF a partire dalla stessa scena. */
  /** Copia del diagramma impaginata per la stampa in A4: colonne ricavate dalla disposizione dell'utente
      (blocchi che si sovrappongono in orizzontale = stessa colonna), ordine verticale conservato,
      blocchi grandi quanto il contenuto, tubi più sottili e spazi ridotti. Il diagramma originale non cambia. */
  function docPerStampa() {
    const c = JSON.parse(JSON.stringify(doc));
    c.opzioni.spessoreMax = Math.min(c.opzioni.spessoreMax || 40, 18);
    const geo = calcolaScena(c, { famiglia: FONT_EXP, compatto: true }).geo;
    const ord = c.blocchi.slice().sort((p, q) => p.x - q.x);
    const col = new Map(); let ci = -1, fine = -Infinity;
    ord.forEach((b) => { const w = geo.get(b.id).w; if (b.x >= fine - 20) { ci++; fine = b.x + w; } else fine = Math.max(fine, b.x + w); col.set(b.id, ci); });
    return impagina(c, 72, 22, { colonne: col, compatto: true, simula: false, famiglia: FONT_EXP, copia: true });
  }
  function esportaPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) { messaggio('Libreria PDF non disponibile.', 'errore'); return; }
    const x = preparaExport(); if (!x) return;
    const { pal, vett, esito } = x; const ver = esito ? stato.verifica : null;
    // impaginazione compatta per la stampa: stesse colonne e stesso ordine, blocchi grandi quanto il contenuto
    const sc = calcolaScena(docPerStampa(), { famiglia: FONT_EXP, compatto: true });
    const bb = confiniScena(sc);
    const { jsPDF } = window.jspdf; const mg = 10;
    const scelta = ($('#sk-formato') || {}).value || 'auto';
    // misura di intestazione e legenda per ciascun orientamento, poi si sceglie quello con la scala maggiore
    const prova = (orient) => {
      const t = new jsPDF({ orientation: orient, unit: 'mm', format: 'a4' });
      const PW = t.internal.pageSize.getWidth(), PH = t.internal.pageSize.getHeight();
      t.setFont('helvetica', 'normal'); t.setFontSize(8.5);
      const righeNota = doc.nota ? t.splitTextToSize(pdfTesto(doc.nota), PW - 2 * mg) : [];
      t.setFontSize(8);
      const voci = vett.map((kk) => ({ kk, t: pdfTesto(VETTORI[kk].nome) })).map((v) => ({ ...v, w: 9 + t.getTextWidth(v.t) + 5 }));
      const note = pdfTesto(notaLegenda(sc).replace('∝ ', 'proporzionale all\'')) + ' · i flussi senza etichetta valgono quanto la riga da cui partono o a cui arrivano · pagina generata nel browser: nessun dato inviato a server.';
      const righeLeg = []; let riga = [], lr = 0;
      voci.forEach((v) => { if (lr + v.w > PW - 2 * mg && riga.length) { righeLeg.push(riga); riga = []; lr = 0; } riga.push(v); lr += v.w; });
      if (riga.length) righeLeg.push(riga);
      const righeNoteLeg = t.splitTextToSize(note, PW - 2 * mg).concat(t.splitTextToSize(pdfTesto(fonte()), PW - 2 * mg));
      const yLinea = mg + 13 + (righeNota.length ? righeNota.length * 3.6 + 1.5 : 0);
      const altLeg = righeLeg.length * 4.2 + righeNoteLeg.length * 3.4 + 3;
      const top = yLinea + 4, fondo = PH - mg - altLeg - 2;
      const k = Math.min((PW - 2 * mg) / bb.w, (fondo - top) / bb.h, 0.42);
      return { orient, PW, PH, righeNota, righeLeg, righeNoteLeg, yLinea, top, fondo, k };
    };
    const opzioni = scelta === 'auto' ? [prova('landscape'), prova('portrait')] : [prova(scelta)];
    const L = opzioni.reduce((m, o) => (o.k > m.k ? o : m));
    const { PW, PH, k, top, fondo } = L;
    const pdf = new jsPDF({ orientation: L.orient, unit: 'mm', format: 'a4', compress: true });
    pdf.setProperties({ title: doc.titolo, subject: 'Diagramma di Sankey', creator: 'Playfair · playfair.statocritico.it', keywords: pdfTesto(fonte()) });
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.setTextColor(pal.inchiostro);
    pdf.text(pdf.splitTextToSize(pdfTesto(doc.titolo), PW - 2 * mg)[0], mg, mg + 3, { baseline: 'middle' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(pal.tenue);
    pdf.text(pdfTesto(`${oggi()} · Playfair Sankey (playfair.statocritico.it)`), mg, mg + 9, { baseline: 'middle' });
    pdf.setTextColor(pal.inchiostro);
    L.righeNota.forEach((t, i) => pdf.text(t, mg, mg + 14 + i * 3.6, { baseline: 'middle' }));
    pdf.setDrawColor(pal.linea); pdf.setLineWidth(0.2); pdf.line(mg, L.yLinea, PW - mg, L.yLinea);
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
      const xx = X(t.etich.x) - (t.etich.anc === 'middle' ? tw / 2 : t.etich.anc === 'end' ? tw : 0); const yy = Y(t.etich.y) - (t.etich.bl === 'auto' ? pt(11.5) * 25.4 / 72 * 0.35 : 0);
      pdf.setFillColor('#ffffff'); pdf.rect(xx - 0.5, yy - pt(11.5) * 0.18, tw + 1, pt(11.5) * 0.36, 'F');
      pdf.text(txt, xx, yy, { baseline: 'middle' });
    });
    // blocchi
    sc.blocchi.forEach(({ b, g: gS }) => {
      const g = gS.base || gS, kb = k * (gS.s || 1), ptb = (px) => px * kb * 72 / 25.4;
      const st = ver && ver.r.stB.get(b.id);
      const x0 = X(b.x), y0 = Y(b.y), w = g.w * kb, h = g.h * kb;
      const fm = formaBlocco(b, g), ox = fm.ox * kb;
      const poligono = (pts) => { pdf.moveTo(x0 + pts[0][0] * kb, y0 + pts[0][1] * kb); pts.slice(1).forEach((q) => pdf.lineTo(x0 + q[0] * kb, y0 + q[1] * kb)); pdf.close(); };
      const coloreBordo = st === 'ok' ? pal.successo : st === 'err' ? pal.errore : st === 'warn' ? pal.attenzione : pal.bordo;
      const spessore = (st ? (st === 'err' ? 3.5 : 2.5) : 1.5) * kb;
      pdf.setFillColor(st === 'err' ? pal['errore-fondo'] : '#ffffff'); pdf.setDrawColor(coloreBordo); pdf.setLineWidth(spessore);
      if (fm.para) { poligono(fm.pts); pdf.fill(); }
      else pdf.roundedRect(x0, y0, w, h, fm.r * kb, fm.r * kb, 'F');
      if (b.dati.length) {
        pdf.setFillColor(st === 'err' ? pal['errore-fondo'] : pal.rialzo);
        if (fm.para) { poligono(fm.testa); pdf.fill(); }
        else {
          const rr = fm.r * kb;
          pdf.moveTo(x0, y0 + rr); pdf.curveTo(x0, y0 + rr * 0.45, x0 + rr * 0.45, y0, x0 + rr, y0); pdf.lineTo(x0 + w - rr, y0);
          pdf.curveTo(x0 + w - rr * 0.45, y0, x0 + w, y0 + rr * 0.45, x0 + w, y0 + rr); pdf.lineTo(x0 + w, y0 + TESTA * kb); pdf.lineTo(x0, y0 + TESTA * kb); pdf.close(); pdf.fill();
        }
        pdf.setDrawColor(pal.linea); pdf.setLineWidth(0.6 * kb);
        if (fm.para) pdf.line(x0 + fm.div[0] * kb, y0 + TESTA * kb, x0 + fm.div[2] * kb, y0 + TESTA * kb); else pdf.line(x0, y0 + TESTA * kb, x0 + w, y0 + TESTA * kb);
      }
      pdf.setDrawColor(coloreBordo); pdf.setLineWidth(spessore);
      if (fm.para) { poligono(fm.pts); pdf.stroke(); } else pdf.roundedRect(x0, y0, w, h, fm.r * kb, fm.r * kb, 'S');
      const yIc = b.dati.length ? TESTA / 2 : g.h / 2;
      if (b.tipo === 'conversione') {
        const ix = x0 + w - (PADX + 22) * kb, iy = y0 + (yIc - 6.5) * kb;
        pdf.setDrawColor(pal.inchiostro); pdf.setLineWidth(1.6 * kb); pdf.setLineCap('round');
        [[0, 3.5, 12, 3.5], [9, 0.5, 12, 3.5], [12, 3.5, 9, 6.5], [14, 9.5, 2, 9.5], [5, 6.5, 2, 9.5], [2, 9.5, 5, 12.5]].forEach((q) => pdf.line(ix + q[0] * kb, iy + q[1] * kb, ix + q[2] * kb, iy + q[3] * kb));
        pdf.setLineCap('butt');
      }
      if (b.tipo === 'confronto') { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(ptb(11)); pdf.setTextColor(pal.tenue); pdf.text('A-B', x0 + (g.w - PADX - 14 - INCL * yIc / g.h) * kb, y0 + (yIc + 1) * kb, { baseline: 'middle', align: 'right' }); }
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(ptb(13)); pdf.setTextColor(pal.inchiostro);
      if (b.dati.length) pdf.text(pdfTesto(b.nome), x0 + PADX * kb + ox, y0 + (TESTA / 2 + 1) * kb, { baseline: 'middle' });
      else pdf.text(pdfTesto(b.nome), x0 + w / 2, y0 + h / 2, { baseline: 'middle', align: 'center' });
      g.righe.forEach((r) => {
        const c = pal[VETTORI[unitaOk(r.dt.u, r.dt.ua) ? vettoreDi(r.dt.u) : 'altro'].v];
        const cy = y0 + r.cy * kb;
        const mx = x0 + (PADX + 4) * kb + ox;
        if (r.uscita) {
          pdf.setFillColor(c); pdf.setDrawColor(c); pdf.setLineWidth(1.6 * kb);
          const pts = [[mx, cy - 5 * kb], [mx + 5 * kb, cy], [mx, cy + 5 * kb], [mx - 5 * kb, cy]];
          if (r.dt.ruolo === 'perdita') pts.forEach((q, i) => { const z = pts[(i + 1) % 4]; pdf.line(q[0], q[1], z[0], z[1]); });
          else { pdf.triangle(pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1], 'F'); pdf.triangle(pts[0][0], pts[0][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1], 'F'); }
        } else if (r.dt.ruolo === 'perdita') { pdf.setDrawColor(c); pdf.setLineWidth(1.8 * kb); pdf.circle(mx, cy, 3.6 * kb, 'S'); }
        else { pdf.setFillColor(c); pdf.circle(mx, cy, 4.2 * kb, 'F'); }
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(ptb(12)); pdf.setTextColor(pal.inchiostro);
        const et = pdfTesto(r.et);
        pdf.text(et, x0 + (PADX + 14) * kb + ox, r.fx2 ? cy - 6 * kb : cy, { baseline: 'middle' });
        if (r.fx) {
          const xw = pdf.getTextWidth(et); const cmpR = b.tipo === 'confronto';
          pdf.setFont('helvetica', cmpR ? 'bold' : 'italic'); pdf.setFontSize(ptb(r.fx2 ? 11 : 10.5)); pdf.setTextColor(cmpR ? pal.successo : pal.tenue); if (cmpR && /aumento/.test(r.fx)) pdf.setTextColor(pal.errore);
          if (r.fx2) pdf.text(pdfTesto(r.fx), x0 + (PADX + 14) * kb + ox, cy + 8 * kb, { baseline: 'middle' });
          else pdf.text(pdfTesto(r.fx), x0 + (PADX + 14 + 6) * kb + ox + xw, cy, { baseline: 'middle' });
        }
        pdf.setFont('helvetica', r.tv.cls === 'calc' ? 'bolditalic' : r.tv.cls === 'vuoto' ? 'normal' : 'bold');
        pdf.setTextColor(r.tv.cls === 'calc' ? pal.segno : r.tv.cls === 'vuoto' ? pal.tenue : pal.inchiostro);
        pdf.text(pdfTesto(r.tv.testo), x0 + w - PADX * kb - ox, r.fx2 ? cy - 6 * kb : cy, { baseline: 'middle', align: 'right' });
      });
      if (st) {
        const cx = x0 + w - 3 * kb, cyb = y0 + 3 * kb;
        pdf.setFillColor(st === 'ok' ? pal.successo : st === 'err' ? pal.errore : pal.attenzione); pdf.setDrawColor('#ffffff'); pdf.setLineWidth(2 * kb);
        pdf.circle(cx, cyb, 9.5 * kb, 'FD');
        if (st === 'ok') { pdf.setLineWidth(2.4 * kb); pdf.lines([[2.8 * kb, 2.8 * kb], [5.4 * kb, -5.6 * kb]], cx - 4.2 * kb, cyb + 0.3 * kb, [1, 1], 'S'); }
        else { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(ptb(12)); pdf.setTextColor('#ffffff'); pdf.text(st === 'err' ? '!' : '?', cx, cyb, { baseline: 'middle', align: 'center' }); }
      }
    });
    // legenda (su più righe se serve)
    let ly = fondo + 3;
    pdf.setDrawColor(pal.linea); pdf.setLineWidth(0.2); pdf.line(mg, ly, PW - mg, ly);
    ly += 3.6;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    L.righeLeg.forEach((riga) => {
      let lx = mg;
      riga.forEach((v) => {
        pdf.setFillColor(pal[VETTORI[v.kk].v]); pdf.roundedRect(lx, ly - 1.4, 7, 2.8, 0.6, 0.6, 'F');
        pdf.setTextColor(pal.inchiostro); pdf.text(v.t, lx + 9, ly, { baseline: 'middle' }); lx += v.w;
      });
      ly += 4.2;
    });
    pdf.setTextColor(pal.tenue);
    L.righeNoteLeg.forEach((t) => { pdf.text(t, mg, ly, { baseline: 'middle' }); ly += 3.4; });
    const minPt = 11 * k * 72 / 25.4; // testo più piccolo nel PDF compatto: fattori ed etichette (11 px)
    const blob = pdf.output('blob');
    scarica(blob, slug(doc.titolo) + '.pdf');
    messaggio(`Esportato PDF vettoriale A4 ${L.orient === 'landscape' ? 'orizzontale' : 'verticale'} (testo più piccolo ${numIt(minPt, 1)} pt).`, minPt < 5.5 ? 'avviso' : 'successo');
    window.PlayfairSankey && (window.PlayfairSankey.ultimoPDF = { orient: L.orient, k, minPt });
    return blob;
  }

  /* ---- esempi ----
     Blocco: [chiave, nome, x, y, dati, tipo]; dato: [etichetta, valore, unità, ruolo, ua, conv]
     conv: { da: indice della riga d'ingresso, lib: id del fattore tipico, eta, num } oppure { da, f, num, den, eta }.
     cmp:  { a: indice della riga A, b: indice della riga B } (blocco 'cmp'). */
  function costruisciEsempio(titolo, opz, blocchi, links, nota) {
    const d = docVuoto(); d.titolo = titolo; d.nota = nota || ''; Object.assign(d.opzioni, opz);
    const per = {};
    blocchi.forEach(([k, nome, x, y, dati, tipo]) => {
      const b = { id: uid('b'), nome, x, y, tipo: tipo === 'conv' ? 'conversione' : tipo === 'cmp' ? 'confronto' : 'bilancio', dati: dati.map(([et, val, u, ruolo, ua]) => ({ id: uid('d'), etichetta: et, valore: val, calc: null, u, ua: ua || '', ruolo: ruolo || 'valore', conv: null, cmp: null })) };
      dati.forEach((x, i) => {
        const c = x[5]; if (!c) return;
        const dt = b.dati[i];
        if (c.a != null) { dt.cmp = { a: b.dati[c.a].id, b: b.dati[c.b].id }; return; }
        dt.conv = { da: b.dati[c.da].id, f: null, num: null, den: null, eta: 1, lib: '' };
        if (c.lib) { const lib = d.fattori.find((f) => f.id === c.lib); Object.assign(dt.conv, { f: lib.f, num: c.num || lib.num, den: lib.den, lib: lib.id, eta: c.eta || lib.eta || 1 }); }
        else Object.assign(dt.conv, { f: c.f, num: c.num || null, den: c.den || null, eta: c.eta || 1 });
      });
      per[k] = b; d.blocchi.push(b);
    });
    links.forEach(([da, a, val, u, et]) => {
      const [kb, i] = da.split('.'), [kb2, j] = a.split('.');
      d.collegamenti.push({ id: uid('l'), da: { b: per[kb].id, d: i != null ? per[kb].dati[+i].id : null }, a: { b: per[kb2].id, d: j != null ? per[kb2].dati[+j].id : null }, valore: val == null ? null : val, calc: null, u: u || '', ua: '', etichetta: et || '' });
    });
    return d;
  }
  /** Impaginazione automatica degli esempi: colonne dagli x indicativi (in ordine), larghezze e altezze
      come saranno DOPO Aggiorna (tubi proporzionali), y di ogni blocco alla media delle porte collegate
      nelle colonne vicine, poi impilati senza sovrapposizioni. */
  function impagina(d, gapX, gapY, opzI) {
    gapX = gapX || 240; gapY = gapY || 46; opzI = opzI || {};
    const fam = opzI.famiglia || famigliaPagina, compatto = !!opzI.compatto;
    const c = JSON.parse(JSON.stringify(d));
    if (opzI.simula !== false) {
      const r = analizza(c);
      c.collegamenti.forEach((l) => { l.calc = (l.valore == null && r.calcLink.has(l.id)) ? r.calcLink.get(l.id) : null; });
      c.blocchi.forEach((b) => b.dati.forEach((dt) => { dt.calc = (dt.valore == null && r.calcDato.has(dt.id)) ? r.calcDato.get(dt.id) : null; }));
      c.opzioni.proporzionale = true;
    }
    let col, xs;
    if (opzI.colonne) { col = opzI.colonne; xs = [...new Set(col.values())].sort((a, b) => a - b); }
    else { xs = [...new Set(c.blocchi.map((b) => b.x))].sort((a, b) => a - b); col = new Map(c.blocchi.map((b) => [b.id, xs.indexOf(b.x)])); xs = xs.map((_, i) => i); }
    const ordine = new Map(c.blocchi.map((b) => [b.id, b.y]));
    const mb = mappaBlocchi(c);
    const grid = (v) => Math.round(v / GRIGLIA) * GRIGLIA;
    for (let giro = 0; giro < 4; giro++) {
      const geo = calcolaScena(c, { famiglia: fam, compatto }).geo;
      const cy = (b, did) => { const g = geo.get(b.id); const rr = did && g.righe.find((x) => x.dt.id === did); return rr ? rr.cy : g.cyCentro; };
      let x = 0;
      xs.forEach((ci) => { const bs = c.blocchi.filter((b) => col.get(b.id) === ci); if (!bs.length) return; bs.forEach((b) => { b.x = x; }); x += Math.max(...bs.map((b) => geo.get(b.id).w)) + gapX; });
      const sinistra = giro % 2 === 0; // giri alterni: da sinistra (ingressi) e da destra (uscite)
      const colonne = xs.slice(); if (!sinistra) colonne.reverse();
      colonne.forEach((ci) => {
        const bs = c.blocchi.filter((b) => col.get(b.id) === ci).sort((p, q) => ordine.get(p.id) - ordine.get(q.id));
        const obiettivi = bs.map((b) => {
          const vicini = c.collegamenti.filter((l) => (l.a.b === b.id && (sinistra ? col.get(l.da.b) < ci : giro > 0)) || (l.da.b === b.id && (!sinistra ? col.get(l.a.b) > ci : giro > 0)));
          if (!vicini.length) return null;
          return vicini.reduce((s, l) => { const entra = l.a.b === b.id; const o = mb.get(entra ? l.da.b : l.a.b); return s + o.y + cy(o, entra ? l.da.d : l.a.d) - cy(b, entra ? l.a.d : l.da.d); }, 0) / vicini.length;
        });
        let fondo = -Infinity;
        bs.forEach((b, i) => {
          const t = obiettivi[i] != null ? obiettivi[i] : (isFinite(fondo) ? fondo + gapY : (giro ? b.y : ordine.get(b.id)));
          b.y = grid(Math.max(t, fondo + gapY)); fondo = b.y + geo.get(b.id).h;
        });
        // se la colonna è scesa troppo rispetto agli obiettivi, la si risale in blocco
        const scarti = bs.map((b, i) => (obiettivi[i] != null ? b.y - obiettivi[i] : null)).filter((v) => v != null);
        if (scarti.length) { const m = Math.min(...scarti); if (m > 0) { const su = grid(scarti.reduce((a, v) => a + v, 0) / scarti.length / 2); if (su > 0) bs.forEach((b) => { b.y -= Math.min(su, grid(m)); }); } }
      });
    }
    const y0 = Math.min(...c.blocchi.map((b) => b.y));
    const pos = new Map(c.blocchi.map((b) => [b.id, { x: b.x, y: b.y - y0 }]));
    if (opzI.copia) { c.blocchi.forEach((b) => { b.y -= y0; }); return c; }
    d.blocchi.forEach((b) => { const q = pos.get(b.id); b.x = q.x; b.y = q.y; });
    return d;
  }
  const FATTORI_NOTA = 'Fattori come in Playfair-S: elettricità 0,216 kg CO₂/kWh e 0,187 tep/MWh; gas naturale 1,96 kg CO₂/Sm³, 0,000836 tep/Sm³ e PCI 9,59 kWh/Sm³.';
  /** Uscite di un blocco «→ CO₂ e TEP»: t CO₂ e tep calcolati dalla riga 0 con i fattori tipici indicati. */
  const righeCO2TEP = (ing, co2, tep) => [ing, ['CO₂ emessa', null, 'tCO2', 'valore', '', { da: 0, lib: co2 }], ['Energia primaria', null, 'tep', 'valore', '', { da: 0, lib: tep }]];
  /** Esempio «Sito N (2025)»: forniture → contatore gas (Sm³ → MWh, PCI) → utenze → conversione in CO₂ e TEP → totali. */
  function esempioSito(n, el, gas, acqua, extra) {
    const X = [0, 400, 820, 1240, 1760];
    return impagina(costruisciEsempio(`Sito ${n} — forniture, utenze, CO₂ ed energia primaria (2025)`, { conversione: true }, [
      ['el', 'Rete elettrica (POD)', X[0], 0, [['Prelievo 2025', el, 'kWh']]],
      ['acq', 'Acquedotto', X[0], 250, [['Acqua 2025', acqua, 'm3']]],
      ['gas', 'Rete gas (PDR)', X[0], 560, [['Gas naturale 2025', gas, 'Sm3']]],
      ['pci', 'Contatore gas: Sm³ → MWh', X[1], 560, [['Energia termica (PCI)', null, 'MWh_th', 'valore', '', { da: 1, lib: 'gas-pci' }], ['Gas naturale', null, 'Sm3']], 'conv'],
      ['ue', 'Utenze elettriche', X[2], 0, [['Elettricità', null, 'kWh']]],
      ['ua', 'Utenze idriche', X[2], 250, [['Acqua', null, 'm3']]],
      ['ut', 'Utenze termiche', X[2], 560, [['Energia termica', null, 'MWh_th']]],
      ['cel', 'Elettricità → CO₂ e TEP', X[3], -10, righeCO2TEP(['Elettricità consumata', null, 'kWh'], 'el-co2', 'el-tep'), 'conv'],
      ['cgas', 'Gas → CO₂ e TEP', X[3], 330, righeCO2TEP(['Gas consumato', null, 'Sm3'], 'gas-co2', 'gas-tep'), 'conv'],
      ['tco2', 'Emissioni totali (t CO₂)', X[4], 60, [['Totale CO₂', null, 'tCO2']]],
      ['ttep', 'Energia primaria totale (TEP)', X[4], 330, [['Totale', null, 'tep']]]
    ], [['el.0', 'ue.0'], ['ue.0', 'cel.0'], ['gas.0', 'pci.1'], ['pci.0', 'ut.0'], ['pci.1', 'cgas.0'], ['acq.0', 'ua.0'],
      ['cel.1', 'tco2.0'], ['cgas.1', 'tco2.0'], ['cel.2', 'ttep.0'], ['cgas.2', 'ttep.0']],
    `Dati 2025 del sito ${n} (file ${n}_consumi.csv): elettricità ${fmt(el)} kWh, gas ${fmt(gas)} Sm³, acqua ${fmt(acqua)} m³; teleriscaldamento assente. ${extra ? extra + ' ' : ''}${FATTORI_NOTA} L'acqua resta un consumo: non si converte in energia né in emissioni.`));
  }
  const ESEMPI = {
    cogenerazione: () => impagina(costruisciEsempio('Centrale di cogenerazione — fabbisogni del sito 1 (2025)', { conversione: true }, [
      ['gas', 'Rete gas (PDR)', 0, 90, [['Gas naturale', null, 'Sm3']]],
      ['el', 'Rete elettrica (POD)', 0, 700, [['Prelievo', null, 'kWh']]],
      ['cog', 'Cogeneratore (1,6 MWe)', 380, -60, [['Gas naturale', null, 'Sm3'], ['Elettricità', 12000, 'MWh_el', 'valore', '', { da: 0, lib: 'gas-pci', num: 'kWh', eta: 0.40 }], ['Calore utile', null, 'MWh_th', 'valore', '', { da: 0, lib: 'gas-pci', eta: 0.45 }], ['Perdite', null, 'MWh_th', 'perdita', '', { da: 0, lib: 'gas-pci', eta: 0.15 }]], 'conv'],
      ['cal', 'Caldaia integrativa', 380, 300, [['Gas naturale', null, 'Sm3'], ['Calore', null, 'MWh_th', 'valore', '', { da: 0, lib: 'gas-pci', eta: 0.92 }], ['Perdite', null, 'MWh_th', 'perdita', '', { da: 0, lib: 'gas-pci', eta: 0.08 }]], 'conv'],
      ['cpod', 'Prelievo da rete → CO₂ e TEP', 380, 700, righeCO2TEP(['Prelievo da rete', null, 'kWh'], 'el-co2', 'el-tep'), 'conv'],
      ['ut', 'Utenze termiche (sito 1)', 900, 120, [['Calore', 23713090, 'kWh_th']]],
      ['per', 'Perdite (fumi, radiatori)', 900, 260, [['Perdite', null, 'MWh_th']]],
      ['ue', 'Utenze elettriche (sito 1)', 900, 380, [['Elettricità', 16104820, 'kWh']]],
      ['cgas', 'Gas → CO₂ e TEP', 1300, 600, righeCO2TEP(['Gas consumato', null, 'Sm3'], 'gas-co2', 'gas-tep'), 'conv'],
      ['tco2', 'Emissioni totali (t CO₂)', 1700, 560, [['Totale CO₂', null, 'tCO2']]],
      ['ttep', 'Energia primaria totale (TEP)', 1700, 690, [['Totale', null, 'tep']]]
    ], [['gas.0', 'cog.0'], ['gas.0', 'cal.0'], ['el.0', 'cpod.0'], ['cpod.0', 'ue.0'], ['cog.1', 'ue.0'], ['cog.2', 'ut.0'], ['cal.1', 'ut.0'], ['cog.3', 'per.0'], ['cal.2', 'per.0'],
      ['cog.0', 'cgas.0'], ['cal.0', 'cgas.0'], ['cgas.1', 'tco2.0'], ['cpod.1', 'tco2.0'], ['cgas.2', 'ttep.0'], ['cpod.2', 'ttep.0']],
    'Scenario sui fabbisogni 2025 del sito 1 (1_consumi.csv e termico_sito_1.csv): 16.104.820 kWh elettrici e 23.713.090 kWh termici. Cogeneratore da 1,6 MWe per 7.500 h (12.000 MWh el.). Nei blocchi di conversione il gas diventa energia con il PCI (9,59 kWh/Sm³) moltiplicato per il rendimento η, ipotizzato sul PCI: cogeneratore elettrico 40%, termico 45%, perdite 15%; caldaia integrativa 92% (perdite 8%). Aggiorna ricava all\'indietro il gas di ciascun impianto (Sm³) e il prelievo da rete. Emissioni e tep si contano sui vettori acquistati (gas bruciato e prelievo da rete): elettricità e calore autoprodotti non si contano due volte. ' + FATTORI_NOTA)),
    ospedale: () => impagina(costruisciEsempio('Ospedale — elettricità, gas, acqua, CO₂ e TEP (sito 4, 2025)', { conversione: false }, [
      ['el', 'Rete elettrica (POD)', 0, 0, [['Prelievo 2025', 17694646, 'kWh']]],
      ['gas', 'Rete gas (PDR)', 0, 330, [['Gas naturale 2025', 2334682, 'Sm3']]],
      ['acq', 'Acquedotto', 0, 640, [['Acqua 2025', 156482.65, 'm3']]],
      ['cab', 'Cabina MT/BT', 400, 0, [['Elettricità', null, 'kWh']]],
      ['ct', 'Centrale termica (condensazione)', 400, 280, [['Calore prodotto', 23055515, 'kWh_th', 'valore', '', { da: 1, lib: 'gas-pci', eta: 23055515 / (2334682 * 9.59) }], ['Gas naturale', null, 'Sm3']], 'conv'],
      ['rep', 'Reparti di degenza', 960, -40, [['Elettricità', 6000000, 'kWh'], ['Calore', 13000000, 'kWh_th'], ['Acqua', 95000, 'm3']]],
      ['sop', 'Sale operatorie e diagnostica', 960, 250, [['Elettricità', 4500000, 'kWh'], ['Calore', 3500000, 'kWh_th']]],
      ['serv', 'Servizi generali e HVAC', 960, 490, [['Elettricità', null, 'kWh'], ['Calore', null, 'kWh_th'], ['Acqua', null, 'm3']]],
      ['cel', 'Elettricità → CO₂ e TEP', 1420, 40, righeCO2TEP(['Elettricità consumata', null, 'kWh'], 'el-co2', 'el-tep'), 'conv'],
      ['cgas', 'Gas → CO₂ e TEP', 1420, 380, righeCO2TEP(['Gas consumato', null, 'Sm3'], 'gas-co2', 'gas-tep'), 'conv'],
      ['tco2', 'Emissioni totali (t CO₂)', 1940, 110, [['Totale CO₂', null, 'tCO2']]],
      ['ttep', 'Energia primaria totale (TEP)', 1940, 380, [['Totale', null, 'tep']]]
    ], [['el.0', 'cab.0'], ['cab.0', 'rep.0'], ['cab.0', 'sop.0'], ['cab.0', 'serv.0'], ['gas.0', 'ct.1'], ['ct.0', 'rep.1'], ['ct.0', 'sop.1'], ['ct.0', 'serv.1'],
      ['acq.0', 'rep.2'], ['acq.0', 'serv.2'], ['rep.0', 'cel.0'], ['sop.0', 'cel.0'], ['serv.0', 'cel.0'], ['ct.1', 'cgas.0'],
      ['cel.1', 'tco2.0'], ['cgas.1', 'tco2.0'], ['cel.2', 'ttep.0'], ['cgas.2', 'ttep.0']],
    'Dati 2025 del sito 4 (4_consumi.csv e termico_sito_4.csv): elettricità 17.694.646 kWh, gas 2.334.682 Sm³, acqua 156.483 m³, domanda termica 23.055.515 kWh. Centrale termica con caldaie a condensazione: calore = Sm³ × PCI 9,59 kWh/Sm³ × η. Il rendimento, ricavato dai dati 2025 (23.055.515 kWh termici ÷ 22.389.600 kWh di gas), vale 102,97%: supera il 100% perché è riferito al PCI, che non conta il calore latente del vapore nei fumi recuperato dalla condensazione (riferito al PCS, circa 10,6 kWh/Sm³, sarebbe circa il 93%). La ripartizione tra reparti è indicativa. ' + FATTORI_NOTA + ' L\'acqua resta un consumo, esclusa da conversioni ed emissioni.'), 300),
    sito1: () => esempioSito(1, 16104820, 2430979, 159171.46),
    sito2: () => esempioSito(2, 5680743, 855823, 87548.74),
    sito3: () => esempioSito(3, 2441251, 1423474, 43655.59, 'Attenzione: nel 2025 il consumo elettrico cala molto (2.441.251 kWh contro 5.465.782 kWh nel 2024, −55%); è un dato reale dei file, non un errore del diagramma.'),
    sito45: () => { const d = esempioSito('4 e 5', 17694646, 2334682, 156482.65, 'I file del sito 4 e del sito 5 sono identici.'); d.nota = d.nota.replace('(file 4 e 5_consumi.csv)', '(file 4_consumi.csv e 5_consumi.csv)'); d.titolo = 'Siti 4 e 5 — forniture, utenze, CO₂ ed energia primaria (2025)'; return d; },
    sito6: () => esempioSito(6, 7218604, 1074431, 122694.18),
    caldaie: () => impagina(costruisciEsempio('Caldaia tradizionale vs a condensazione — stesso fabbisogno (sito 1, 2025)', { conversione: true }, [
      ['ga', 'Rete gas · scenario A', 0, 0, [['Gas naturale', null, 'Sm3']]],
      ['gb', 'Rete gas · scenario B', 0, 400, [['Gas naturale', null, 'Sm3']]],
      ['ca', 'Caldaia tradizionale', 400, 0, [['Calore utile', null, 'MWh_th', 'valore', '', { da: 1, lib: 'cald-trad' }], ['Gas naturale', null, 'Sm3'], ['Perdite', null, 'MWh_th', 'perdita', '', { da: 1, lib: 'gas-pci', eta: 0.10 }]], 'conv'],
      ['pa', 'Perdite · A (fumi, mantello)', 820, -200, [['Perdite', null, 'MWh_th']]],
      ['cb', 'Caldaia a condensazione', 400, 400, [['Calore utile', null, 'MWh_th', 'valore', '', { da: 1, lib: 'cald-cond' }], ['Gas naturale', null, 'Sm3']], 'conv'],
      ['ua', 'Utenza termica · A', 820, -40, [['Fabbisogno', 23713.09, 'MWh_th']]],
      ['ea', 'Gas A → CO₂ e TEP', 820, 100, righeCO2TEP(['Gas consumato', null, 'Sm3'], 'gas-co2', 'gas-tep'), 'conv'],
      ['ub', 'Utenza termica · B', 820, 360, [['Fabbisogno', 23713.09, 'MWh_th']]],
      ['eb', 'Gas B → CO₂ e TEP', 820, 500, righeCO2TEP(['Gas consumato', null, 'Sm3'], 'gas-co2', 'gas-tep'), 'conv'],
      ['cf', 'Confronta: condensazione vs tradizionale', 1260, 200, [['TEP · A tradizionale', null, 'tep'], ['TEP · B condensazione', null, 'tep'], ['Risparmio TEP', null, 'tep', 'valore', '', { a: 0, b: 1 }], ['CO₂ · A tradizionale', null, 'tCO2'], ['CO₂ · B condensazione', null, 'tCO2'], ['Risparmio CO₂', null, 'tCO2', 'valore', '', { a: 3, b: 4 }]], 'cmp']
    ], [['ga.0', 'ca.1'], ['ca.0', 'ua.0'], ['ca.1', 'ea.0'], ['ca.2', 'pa.0'], ['gb.0', 'cb.1'], ['cb.0', 'ub.0'], ['cb.1', 'eb.0'],
      ['ea.2', 'cf.0'], ['eb.2', 'cf.1'], ['ea.1', 'cf.3'], ['eb.1', 'cf.4']],
    'Stesso fabbisogno termico in due scenari: 23.713 MWh termici, la domanda 2025 del sito 1 (termico_sito_1.csv). Calore = Sm³ × PCI 9,59 kWh/Sm³ × rendimento: caldaia tradizionale η 90% (perdite 10%), caldaia a condensazione η 105%, entrambi riferiti al PCI (la condensazione recupera il calore latente dei fumi, escluso dal PCI, quindi sul PCI non ha perdite). Aggiorna ricava all\'indietro il gas di ciascuna caldaia dal fabbisogno; tep e CO₂ con i fattori di Playfair-S (0,000836 tep/Sm³ e 1,96 kg CO₂/Sm³, rendimento 100%). Il blocco Confronta calcola A − B: riduzione assoluta e percentuale ottenuta con la condensazione.'), 260),
    vapore: () => costruisciEsempio('Macchina a vapore — omaggio a Sankey (1898), su 100 kWh di calore dal carbone', { conversione: true, scalaUnica: false }, [
      ['carb', 'Carbone', -80, 150, [['Carbone bruciato', null, 'kg']]],
      ['comb', 'Combustione del carbone', 270, 110, [['Carbone', null, 'kg'], ['Calore (PCI)', 100, 'kWh_th', 'valore', '', { da: 0, lib: 'carb-pci' }], ['Energia primaria', null, 'tep', 'valore', '', { da: 0, lib: 'carb-tep' }]], 'conv'],
      ['cald', 'Caldaia', 720, 120, [['Combustibile', null, 'kWh_th'], ['Fumi al camino', 20, 'kWh_th'], ['Vapore', null, 'kWh_th']]],
      ['mot', 'Motore a vapore', 1100, 90, [['Vapore', null, 'kWh_th'], ['Scarico al condensatore', null, 'kWh_th'], ['Attriti e irraggiamento', 5, 'kWh_th'], ['Lavoro all\'albero', 11, 'kWh']]],
      ['cam', 'Camino', 1100, 470, [['Fumi', null, 'kWh_th']]],
      ['cond', 'Condensatore', 1510, 40, [['Calore scaricato', null, 'kWh_th']]],
      ['amb', 'Ambiente', 1510, 190, [['Dispersioni', null, 'kWh_th']]],
      ['alb', 'Lavoro utile', 1510, 330, [['Lavoro meccanico', null, 'kWh']]]
    ], [['carb.0', 'comb.0'], ['comb.1', 'cald.0'], ['cald.1', 'cam.0'], ['cald.2', 'mot.0'], ['mot.1', 'cond.0'], ['mot.2', 'amb.0'], ['mot.3', 'alb.0']],
    'Ricostruzione didattica del diagramma di M. H. P. R. Sankey (1898) su 100 kWh di calore. Il blocco di conversione ricava all\'indietro i kg di carbone (PCI 8,14 kWh/kg, carbone da 7.000 kcal/kg) e i tep corrispondenti (0,0007 tep/kg). Qui gli spessori usano una scala in energia (kWh), non la scala unica in tep, per restare fedeli alle proporzioni della tavola di Sankey (il lavoro all\'albero è l\'11% del calore).'),
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
    ['2 · Inserisci i dati', '<p>Clicca un blocco: nel pannello a destra dai un nome e aggiungi <strong>uno o più dati</strong> con etichetta, valore e unità (kWh, MWh el., Sm³, MWh o kWh termici, m³ acqua, t o kg CO₂, tep, kg o libera). Ogni dato è una riga del blocco.</p><p>Puoi lasciare vuoto il valore e indicare solo l\'unità: lo calcolerà il programma.</p>'],
    ['3 · Collega i blocchi', '<p>Premi <strong>Collegamento</strong> (<kbd>L</kbd>), clicca la <strong>riga del dato</strong> di partenza e poi quella di arrivo. Il tubo esce e arriva all\'altezza di quella riga e prende il colore del vettore: <span style="color:var(--flusso-el)">verde</span> elettricità, <span style="color:var(--flusso-th)">arancione</span> gas e calore, <span style="color:var(--flusso-acqua)">azzurro</span> acqua, <span style="color:var(--flusso-co2)">marrone</span> CO₂, <span style="color:var(--flusso-tep)">viola</span> tep (energia primaria).</p>'],
    ['4 · Converti e confronta', '<p><strong>Conversione</strong> (<kbd>C</kbd>) crea un blocco ad <strong>angoli smussati ⇄</strong>: ogni uscita vale <em>ingresso × fattore delle unità di misura × rendimento η</em> (es. Sm³ × 9,59 kWh/Sm³ × 90% per una caldaia; kWh × 0,216 kg CO₂/kWh × 100%). Il fattore viene dalla libreria «Fattore tipico» o lo scrivi tu; i prefissi (kg↔t, kWh↔MWh) sono automatici. Aggiorna calcola in avanti e all\'indietro; l\'acqua (m³) non si converte.</p><p>Un blocco a una riga con più tubi in arrivo ne fa la <strong>somma</strong> (es. t CO₂ totali, <span style="color:var(--flusso-tep)">tep</span> totali). <strong>Confronta</strong> (<kbd>K</kbd>, parallelogramma) fa invece la <strong>differenza</strong> A − B tra due scenari: riduzione o aumento, assoluto e in %.</p>'],
    ['5 · Aggiorna ed esporta', '<p>Premi <strong>Aggiorna</strong> (<kbd>A</kbd>): gli spessori diventano proporzionali ai valori, i bilanci vengono verificati (bordo <span style="color:var(--successo)">verde</span> se tornano, <span style="color:var(--errore)">rosso</span> con lo scarto se no) e le caselle vuote vengono compilate <em style="color:var(--segno)">in corsivo</em>.</p><p>Per iniziare puoi caricare un esempio dal menu «Progetto». Buon lavoro!</p>']
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
      if (s) { doc = normalizza(JSON.parse(s)); delete doc.migrato; if (doc.vista) { stato.vista = doc.vista; delete doc.vista; } caricato = true; }
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
    ['blocchi', 'tubi'].forEach((k) => $('#sk-scala-' + k).addEventListener('input', (e) => {
      const v = clamp(Number(e.target.value) / 100, 0.5, 2); $('#sk-scala-' + k + '-val').textContent = Math.round(v * 100) + '%';
      modifica(() => { doc.opzioni[k === 'blocchi' ? 'scalaBlocchi' : 'scalaTubi'] = v; }, { unione: 'scala-' + k, dati: false });
    }));
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
    $('#sk-esp-xlsx').addEventListener('click', esportaXLSX);
    $('#sk-zoom-piu').addEventListener('click', () => zoomA(stato.vista.s * 1.25));
    $('#sk-zoom-meno').addEventListener('click', () => zoomA(stato.vista.s / 1.25));
    $('#sk-zoom-100').addEventListener('click', () => zoomA(1));
    $('#sk-adatta').addEventListener('click', adatta);
    $('#sk-titolo').addEventListener('input', (e) => modifica(() => { doc.titolo = e.target.value; }, { unione: 'titolo', dati: false }));
    $('#sk-titolo').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tela.focus({ preventScroll: true }); } });
    $('#sk-pannello-apri').addEventListener('click', () => { if (app.classList.contains('pannello-aperto')) chiudiPannelloSeStretto(); else { app.classList.add('pannello-aperto'); $('#sk-pannello-apri').setAttribute('aria-expanded', 'true'); const f = corpoPannello.querySelector('input, select, button'); if (f) f.focus(); } });
    corpoPannello.addEventListener('input', campoPannello);
    // il ridisegno dopo «change» (che scatta sul blur) non deve sostituire il pulsante su cui si sta cliccando
    let pannelloPremuto = false, ridisegnoAtteso = false;
    corpoPannello.addEventListener('pointerdown', () => { pannelloPremuto = true; });
    document.addEventListener('pointerup', () => { if (!pannelloPremuto) return; pannelloPremuto = false; if (ridisegnoAtteso) { ridisegnoAtteso = false; setTimeout(disegnaPannello, 0); } });
    corpoPannello.addEventListener('change', (e) => {
      campoPannello(e);
      // ridisegno differito: il fuoco è già passato al campo successivo e disegnaPannello lo ripristina
      if (['d-val', 'l-val', 'd-conv-f', 'd-conv-eta', 'fl-f'].includes(e.target.dataset.campo)) { if (pannelloPremuto) ridisegnoAtteso = true; else setTimeout(disegnaPannello, 0); }
    });
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
      scena: () => calcolaScena(doc, { famiglia: famigliaPagina }), esportaPDF, esportaJPG, esportaSVG, esportaXLSX, svg: () => { const x = preparaExport(); return x ? costruisciSVG(x).svg : null; },
      vista: () => ({ ...stato.vista }), adatta, scenaStampa: () => { const c = docPerStampa(); const sc = calcolaScena(c, { famiglia: FONT_EXP, compatto: true }); return { bb: confiniScena(sc), blocchi: sc.blocchi.map(({ b, g }) => [b.nome, Math.round(b.x), Math.round(b.y), g.w, g.h]) }; }, leggiNumero, fmt
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
