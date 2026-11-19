# Contratto comune del sito playfair.statocritico.it

Documento vincolante per tutti gli agenti che costruiscono il sito. Lingua del sito: **italiano**. Formati numerici italiani (virgola decimale, punto migliaia).

## Contesto
- Sito divulgativo di formazione sull'energia, dedicato a **William Playfair** (1759–1823, inventore di grafico a linee, a barre, a torta). Fa parte di Stato Critico (statocritico.it, "energy management, sanità, IA e altre cose serie").
- Ospitato su Cloudflare Workers (file statici, `wrangler.jsonc`), dominio `playfair.statocritico.it`, repo GitHub `statocritico/playfair`. **Sito statico, nessuna build**: HTML + CSS + JS puri.
- Stile grafico: **ripreso dal sito EuGEnio** (stesso autore). Riferimenti in `/mnt/user-data/uploads/statocritico/eugenio/fase5-sito/sito/` (`stile.css`, `README_stile.md`, `aspetto.js`, `index.html`, `app.js` per la zona drag&drop `#zona-file` con classe `.pieno`).
- Skill e convenzioni Playfair (palette, widget): `/mnt/user-data/uploads/playfair/SKILL.md`, `references/design.md`, `references/widgets.md`.

## Struttura (piatta, link RELATIVI così funziona anche aprendo i file in locale)
```
/home/claude/playfair-sito/
  index.html            home: macchina a vapore di Sankey animata + annotazioni blueprint
  personaggi.html       Playfair e Sankey
  playfair-s.html  playfair-e.html  playfair-t.html  playfair-m.html  playfair-g.html  playfair-c.html
  sankey.html           editor di diagrammi a blocchi
  assets/tema.css       SOLO variabili della CORNICE (colori, font, raggi, ombre): è il "CSS modificabile"
  assets/area.css       palette FISSA dell'AREA DI LAVORO (--area-*) + colori dei dati (--flusso-*, --serie-*)
  assets/sito.css       testata, menu, tooltip, piè di pagina, zone di trascinamento, componenti comuni
  assets/sito.js        tema chiaro/scuro, menu mobile, voce attiva, drag&drop automatico sui file
  assets/sankey.css  assets/sankey.js
  assets/vendor/        librerie scaricate localmente (chart.js 4.4.1 umd, papaparse 5.4.1, chartjs-plugin-annotation 3.0.1, jspdf ...). Niente CDN.
  assets/font/          eventuali font self-hosted (woff2)
  img/                  immagini (sorgenti pubblico dominio in /home/claude/src/img/)
  guida-rapida.pdf      guida utente (1 pagina, max 2)
  docs/                 documentazione NON pubblicata (esclusa con .assetsignore)
  wrangler.jsonc  .assetsignore  .gitignore  README.md  404.html
```

## Cornice e area di lavoro (dettagli in `docs/CONTRATTO_CSS.md`)
L'aspetto ha due livelli:
- **Cornice** — `assets/tema.css`, modificabile (es. da Claude Design): testata e menu, piè di pagina, sfondo della
  pagina, pagine di testo (home, personaggi, link, licenza, 404), intestazioni degli strumenti (`.pf-intro`,
  `.pf-come`, «Scarica in Excel»), tooltip del menu. Nomi ripresi da EuGEnio: `--carta --foglio --rialzo --tinta
  --linea --bordo --inchiostro --tenue --primario --primario-forte --su-primario --profondo --segno
  --successo(-fondo) --attenzione(-fondo) --errore(-fondo) --ombra-1 --ombra-2`, blueprint della home `--bp-*`,
  font `--testo --titoli --mono`, raggi `--raggio …`. Tema scuro predefinito su `:root, [data-theme="dark"]`, chiaro
  con `[data-theme="light"]` su `<html>`.
- **Area di lavoro** — `assets/area.css`, palette **fissa e neutra** (non si tocca per ristilare): pannelli dei
  grafici, canvas Chart.js, KPI, tabelle, controlli degli strumenti (campi, pulsanti, schede, zone di trascinamento),
  tutta l'app Sankey, dialoghi e avvisi degli strumenti, esportazioni. Contenitore `.pf-area` (su `.pf-app`,
  `.sk-app`, `.sk-dialogo`); variabili `--area-fondo --area-pannello --area-rialzo --area-tinta --area-linea
  --area-bordo --area-testo --area-tenue --area-titolo --area-accento(-forte) --area-su-accento --area-focus
  --area-segno --area-griglia --area-ok/-warn/-err(-fondo) --area-ombra-1/2 --area-font(-titoli/-mono)
  --area-raggio …`, con valori propri per `[data-theme="dark"]` e `[data-theme="light"]` (segue l'interruttore del
  sito). Negli script: `PF.c('--area-testo')`, `Playfair.colore('--area-pannello')`.
- **Colori dei dati** (in `area.css`, significato fisso, non di competenza del tema):
  `--flusso-el` (verde, kWh elettrici) `--flusso-th` (arancione, Sm³ e MWh termici) `--flusso-acqua` (azzurro, m³)
  `--flusso-co2` (marrone, t CO₂) `--flusso-tep` (viola, tep) `--flusso-altro` (grigio); `--serie-1..6`.
  La cornice li può leggere (home, 404, monogramma) ma non li ridefinisce: `area.css` si carica dopo `tema.css`.

## Script anti-lampo nel <head> (prima dei CSS) di OGNI pagina
```html
<script>try{var t=localStorage.getItem('pf-tema');if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>
<link rel="stylesheet" href="assets/tema.css">
<link rel="stylesheet" href="assets/area.css">
<link rel="stylesheet" href="assets/sito.css">
```
(`area.css` sempre subito dopo `tema.css`, in tutte le pagine; poi `strumenti.css` o `sankey.css`.)
e prima di `</body>`: `<script src="assets/sito.js" defer></script>` (sempre dopo gli script della pagina oppure con defer).

## Testata (IDENTICA in ogni pagina, 9 voci; cambia solo `aria-current="page"` sulla voce attiva; in 404.html i link sono assoluti `/…`)
```html
<header class="pf-testata">
  <a class="pf-marchio" href="index.html" aria-label="Playfair, home">Playfair<span class="pf-marchio-sub">.statocritico</span></a>
  <button class="pf-menu-apri" aria-expanded="false" aria-controls="pf-menu">Menu</button>
  <nav class="pf-menu" id="pf-menu" aria-label="Strumenti">
    <a href="playfair-s.html" data-tip="Site — analisi del singolo sito: costi e consumi di elettricità, gas, calore e acqua">Playfair-S</a>
    <a href="playfair-e.html" data-tip="Electric — curve di carico elettriche quartorarie: profili, mappe orarie, picchi e base">Playfair-E</a>
    <a href="playfair-t.html" data-tip="Thermal — consumi termici ed elettrici, simulazione di cogenerazione e valutazione economica">Playfair-T</a>
    <a href="playfair-g.html" data-tip="Group — analisi di un gruppo di sedi: consumo specifico, incidenza sul totale, Pareto e mappa a 4 quadranti">Playfair-G</a>
    <a href="playfair-m.html" data-tip="Money — confronto di investimenti energetici: VAN, TIR, ROI, WACC e flussi di cassa">Playfair-M</a>
    <a href="playfair-c.html" data-tip="Cusum — regressione, residui e carta CUSUM secondo ISO 50006">Playfair-C</a>
    <a href="sankey.html" data-tip="Sankey — disegna diagrammi di flusso energetico a blocchi e verifica i bilanci">Sankey</a>
    <a href="personaggi.html" data-tip="William Playfair e Matthew H. P. R. Sankey: chi erano">Personaggi</a>
    <a href="link.html" data-tip="Link — Stato Critico, EuGEnio, Pseudomania, Bordo Vasca e i corsi Festo Academy">Link</a>
  </nav>
  <button class="pf-tema" type="button" aria-label="Cambia tema chiaro/scuro">◐</button>
</header>
```
Tooltip: CSS su `[data-tip]` (comparsa al passaggio del mouse e al focus da tastiera, piccolo ritardo, freccina), `sito.js` aggiunge anche `aria-describedby`/`title` accessibile. Su mobile il menu si apre con "Menu".

Piè di pagina comune (IDENTICO ovunque, link assoluti in 404.html): `<footer class="pf-piede">` con "Playfair · un progetto di Stato Critico · Guida rapida · **Licenza AGPL-3.0** (`licenza.html`) · Immagini storiche: pubblico dominio (Wikimedia Commons)" e `<p class="pf-piede-nota">` «I dati caricati restano nel browser: nulla viene inviato a server.» + attribuzione obbligatoria «Playfair © 2026 Paolo Bianco – Stato Critico – https://playfair.statocritico.it». La licenza NON va nel menu.

## Drag & drop dei file (OBBLIGATORIO per tutti gli strumenti)
`sito.js` trasforma automaticamente ogni `<input type="file">` in una zona di trascinamento in stile EuGEnio (classe `.pf-drop`, stato `.pieno` quando sopra/caricato, mostra il nome del file). Meccanismo: al drop imposta `input.files = e.dataTransfer.files` e lancia `input.dispatchEvent(new Event('change',{bubbles:true}))`, così il codice esistente (onchange="loadCSV()" o addEventListener('change')) funziona senza modifiche. Se la pagina ha un solo input file, si può trascinare il file **ovunque nella pagina** (velo a tutto schermo "Rilascia il file CSV"). Con più input (Playfair-T) il file trascinato sulla pagina va all'input il cui attributo `data-pf-pattern` (regex sul nome file, es. `termico` / `curva`) corrisponde; altrimenti si usa la zona specifica. Se si trascinano più file insieme, vengono smistati con lo stesso criterio. Il pulsante "scegli file" classico deve continuare a funzionare. API esposta: `window.Playfair.drop(inputEl, opzioni)` e `window.Playfair.tema()`.

## Strumenti (artifact originali in /home/claude/src/artifacts/playfair-X.html)
| Pagina | Titolo | File d'esempio (NON pubblicati) |
|---|---|---|
| playfair-s.html | Playfair-S (Site) — analisi di singolo sito | N_consumi.csv |
| playfair-e.html | Playfair-E (Electric) — consumi elettrici | N_curva_di_carico.csv |
| playfair-t.html | Playfair-T (Thermal) — termico e cogenerazione | N_curva_di_carico.csv + termico_sito_N.csv |
| playfair-g.html | Playfair-G (Group) — analisi di un gruppo di sedi | /home/claude/esempi/sedi_gruppo_esempio.csv, sedi_gruppo_unita_virgola.csv |
| playfair-m.html | Playfair-M (Money) — analisi economiche | investimenti_energetici_v2.csv |
| playfair-c.html | Playfair-C (Cusum) — CUSUM ISO 50006 | consumo_cusum.csv |
CSV d'esempio (6 set, N=1..6) in `/mnt/user-data/uploads/playfair/N/` — servono solo per i test, NON vanno copiati nel sito.

## Vettori energetici e colori (Sankey e home)
verde = kWh elettrici; arancione = Sm³ gas e MWh termici; azzurro = m³ acqua; marrone = t CO₂; viola = tep.
Sankey: l'acqua (m³) sta su una scala separata e **ridotta**: tubi d'acqua proporzionali ai m³ tra loro, il più grande
largo un terzo dello spessore massimo dei flussi energetici (`FRAZ_ACQUA` in `sankey.js`), segue lo slider «Spessore
tubi»; legenda «acqua: scala separata, ridotta».

## Regole
- Nessun dato degli utenti inviato a server; nessuna CDN (tutto in assets/vendor). Unica eccezione voluta: Cloudflare Web Analytics (beacon inserito da Cloudflare, anonimo, senza cookie), consentito nella CSP di _headers.
- Accessibilità: contrasti come EuGEnio, focus visibile, `prefers-reduced-motion` rispettato (animazioni ferme o ridotte).
- Ogni pagina: `<html lang="it">`, `<meta name="viewport">`, `<title>` "Playfair-X — … · Playfair", meta description, favicon `img/favicon.svg`.
- Testare con Chrome headless (`/usr/bin/google-chrome`, Python playwright disponibile).

## Zoom, «Reimposta scala» e frecce dei periodi (strumenti.js)
- Rotella del mouse sopra un grafico = zoom orizzontale centrato sul mouse (`PF.zoomRotella(elemento, () => grafico|[grafici], {dopo})`), mai cambio di periodo; riducendo fino in fondo si torna alla vista completa. Playfair-C (pan e zoom propri) e Playfair-M (zoom verticale VAN, log-log) restano con il loro zoom.
- «Reimposta scala» riporta TUTTO il pannello alla vista iniziale: zoom (`PF.zoomReimposta`) e minimi/massimi automatici. In Playfair-C gli oggetti finestra (`wAnd`, `wSca`, `wCus`, `wReg`) si aggiornano sul posto (`setW`), mai riassegnandoli.
- Le frecce dei periodi (Playfair-E) e degli anni (Playfair-S) non escono dal periodo coperto dai dati: oltre, `PF.messaggio('Dati XXXX non disponibili', pulsante)` con il periodo richiesto.

## Playfair-G (Group) — convenzioni
- CSV: `codice;denominazione;dimensione;consumo` (nomi simili riconosciuti; unità dall'intestazione o da una 2ª riga di unità; separatore `;` `,` tab; formato numeri automatico o forzato). Sedi con dimensione 0/mancante: segnalate, contano nel totale, nell'incidenza e nel Pareto, escluse da consumo specifico e quadranti.
- Consumo specifico = consumo/dimensione; del gruppo = Σconsumi/Σdimensioni (sedi con dimensione valida). Incidenza = consumo sede/Σconsumi. Sedi "nell'80%" = insieme minimo, in ordine decrescente, la cui cumulata raggiunge l'80%.
- Quadranti: X = consumo specifico, Y = incidenza %; soglie sulla media (X: specifico del gruppo; Y: incidenza media = 100/N) o sulla mediana; valori uguali alla soglia vanno in basso/sinistra.
- Incidenza: rettangoli affiancati, base = dimensione, altezza = consumo specifico (area = consumo), dal consumo specifico più alto; un colore fisso per sede in tutti i grafici. In Excel: grafico ad aree nativo, una serie per sede (zero fuori dalla sua base, consumo specifico sui due punti della base), asse orizzontale di tipo data usato come scala numerica (`PF_EXCEL.modelli`, `assi.cat.data` in `excel.js`).
- Nella home è il riquadro 08 «Radiation · le perdite» (parte `radiation`: tutte le perdite per irraggiamento, tratti grigi sottili).

## Licenza
Codice © 2026 Paolo Bianco – Stato Critico, **GNU AGPL-3.0** (`LICENSE` nella radice, pubblicato come `/LICENSE` con
`Content-Type: text/plain` da `_headers`) con termini aggiuntivi ex sez. 7 (`TERMINI_AGGIUNTIVI.md`, non pubblicato).
Pagina pubblica: `licenza.html` (dati, AGPL, termini aggiuntivi, nome e logo, crediti di terzi, testo completo).

## Fogli di calcolo in ingresso (sito.js)
Ogni `<input type="file">` accetta `.csv .xlsx .xls .ods`. `sito.js` intercetta il `change` (in cattura), carica
`assets/vendor/xlsx.full.min.js` solo se serve, converte il primo foglio non vuoto (dialogo `.pf-dialogo` se più d'uno) in
CSV `;` e rilancia `change` con il File CSV: il codice degli strumenti non cambia. Numeri senza migliaia, decimali con la
virgola (`data-pf-decimali="punto"` sull'input per Playfair-M), percentuali come appaiono, date `gg/mm/aaaa [hh:mm]`.
I CSV passano dallo stesso filtro, che toglie le righe `# Fonte: Playfair …`. `data-pf-fogli="no"` disattiva.

## Download: fonte e «Scarica in Excel»
- `Playfair.fonte()`, `Playfair.rigaFonteCsv()` (ultima riga dei CSV), `Playfair.scarica(blob,nome)`,
  `Playfair.scaricaImmagine(canvas,nome)` (sfondo + didascalia), `Playfair.esportaExcel(fogli?, meta?)`.
- Pulsante `[data-pf-excel-scarica]` → `assets/excel.js` + JSZip (a richiesta): un foglio per grafico (titolo, fonte,
  tabella, grafico nativo OOXML; immagine PNG se non rappresentabile) + foglio «Fonte». Nome `playfair-x_AAAA-MM-GG.xlsx`.
- Attributi dei `<canvas>`: `data-pf-titolo`, `data-pf-periodo` (selettore), `data-pf-excel="no|immagine|entrambi"`.
  Personalizzazioni per pagina: `window.PF_EXCEL = { strumento, prima(), tabelle:{id:fn}, immagini:{id:fn}, dopo(fogli) }`.
