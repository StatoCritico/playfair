# Contratto tra le pagine, la cornice (`tema.css`) e l'area di lavoro (`area.css`)

Il sito ha **due livelli di aspetto**, separati per file e per variabili:

| Livello | File di variabili | Chi lo cambia | Che cosa veste |
|---|---|---|---|
| **Cornice** | `assets/tema.css` | il tema grafico (es. Claude Design) | testata e menu, piè di pagina, sfondo della pagina, pagine di testo (home, personaggi, link, licenza, 404), intestazioni degli strumenti, tooltip del menu |
| **Area di lavoro** | `assets/area.css` | **nessuno** (palette fissa) | pannelli dei grafici, canvas Chart.js, KPI, tabelle dei risultati, controlli degli strumenti, tutta l'app Sankey, dialoghi/avvisi degli strumenti, esportazioni |

Ordine di caricamento in **ogni** pagina (dopo lo script anti-lampo):

```html
<link rel="stylesheet" href="assets/tema.css">   <!-- cornice: modificabile -->
<link rel="stylesheet" href="assets/area.css">   <!-- area di lavoro + colori dei dati: fisso, DOPO tema.css -->
<link rel="stylesheet" href="assets/sito.css">
<!-- poi strumenti.css o sankey.css -->
```

`area.css` viene **dopo** `tema.css`: se un tema ridefinisse per errore `--flusso-*`, `--serie-*` o una `--area-*`,
vincerebbe comunque il valore di `area.css`.

Regola d'oro: **nessun colore, carattere o raggio scritto a mano** nei CSS, nelle pagine o negli script.
Nella cornice si usano solo le variabili di `tema.css`; nell'area solo le variabili `--area-*` e i colori dei dati
(`--flusso-*`, `--serie-*`) di `area.css`.

---

# Parte 1 — Cornice (`tema.css` — modificabile da Claude Design)

## Che cosa è cornice

- Testata `.pf-testata`, marchio `.pf-marchio`, menu `.pf-menu` (anche quello del telefono), pulsanti `.pf-tema` e
  `.pf-menu-apri`, tooltip `.pf-tip` del menu (senza la classe `.pf-tip-area`).
- Piè di pagina `.pf-piede`, `.pf-piede-nota`.
- Sfondo e testo della pagina (`body`), link, titoli, focus fuori dall'area.
- Pagine di testo: `index.html` (tavola blueprint), `personaggi.html`, `link.html`, `licenza.html`, `404.html`.
- Intestazione di ogni strumento: `.pf-intro` (occhiello, titolo h1, sommario, riquadro «File accettato»),
  `details.pf-come` («Come si usa»), `.pf-bottone-piccolo` («Scarica in Excel»).
- Componenti comuni usati dalle pagine di testo: `.pf-btn`, `.pf-pannello`, `.pf-etichetta`, `.pf-campo`,
  `.pf-input`, `.pf-avviso`, `.pf-tabella`, `.pf-contenitore`, `.pf-testo`, `.pf-intestazione`, `.pf-sopratitolo`,
  `.pf-salta`, `.solo-lettori`.

## Regole per un nuovo tema

1. Un file, `assets/tema.css`. Niente `@import` o font da server esterni (CDN, Google Fonts): il sito non carica risorse di terzi
   (la CSP le bloccherebbe). Font propri in `woff2` in `assets/font/`, con percorsi relativi: `src: url("font/nome.woff2")`.
2. Tema **scuro predefinito** in `:root, [data-theme="dark"]`; **chiaro** in `[data-theme="light"]` (attributo su
   `<html>`, impostato dallo script anti-lampo con la chiave `localStorage` `pf-tema`). Ogni variabile di colore va
   definita in **entrambi** i blocchi.
3. Le variabili non di colore (caratteri, corpi, spaziature, raggi) stanno nel terzo blocco `:root` e valgono per
   entrambi i temi.
4. Contrasto WCAG AA: `--inchiostro` e `--tenue` almeno 4,5:1 su `--carta` e `--foglio`; `--primario` almeno 4,5:1
   sul fondo (è anche il colore dei link e del focus); `--su-primario` almeno 4,5:1 su `--primario`; `--bp-testo` e
   `--bp-tenue` almeno 4,5:1 su `--bp-fondo` e `--bp-fondo-2`.
5. Non rinominare le variabili. Si possono **aggiungere** variabili nuove.
6. **Non** definire in `tema.css` i colori dei dati (`--flusso-*`, `--serie-*`) né variabili `--area-*`: non sono di
   competenza del tema e verrebbero comunque ignorati (vince `area.css`).
7. Dopo il cambio di tema `sito.js` emette l'evento `pf-tema` su `window` (`e.detail.tema` = `"dark"`/`"light"`).
   Il tema cambia anche la **modalità** chiara/scura dell'area di lavoro, che però usa valori propri.

## Variabili di colore della cornice (definite due volte: scuro e chiaro)

### Superfici
| Variabile | Scuro | Chiaro | Uso |
|---|---|---|---|
| `--carta` | `#19171c` | `#f7f6f8` | fondo della pagina, testo sui tooltip del menu |
| `--foglio` | `#232027` | `#ffffff` | `.pf-pannello`, menu del telefono, riquadri delle pagine di testo |
| `--rialzo` | `#2d2932` | `#efedf1` | passaggio del mouse (menu, pulsanti), riquadro «File accettato» |
| `--tinta` | `#3a2230` | `#ffe6dd` | sfondo d'accento delle pagine di testo |
| `--linea` | `#39343f` | `#e1dde6` | bordi sottili e separatori (testata, piè) |
| `--bordo` | `#7b7385` | `#847c8e` | bordi di pulsanti secondari e campi della cornice (≥ 3:1) |

### Testo e marca
| Variabile | Scuro | Chiaro | Uso |
|---|---|---|---|
| `--inchiostro` | `#f3eff4` | `#1c1820` | testo principale; fondo dei tooltip del menu |
| `--tenue` | `#b5adbd` | `#5f5868` | testo secondario, didascalie, piè |
| `--primario` | `#ff7a50` | `#c43c12` | link, pulsanti, voce attiva del menu, focus, monogramma, occhiello degli strumenti |
| `--primario-forte` | `#ff9775` | `#a8260c` | passaggio del mouse sul primario |
| `--su-primario` | `#19171c` | `#ffffff` | testo sopra `--primario` |
| `--profondo` | `#ffd0c0` | `#8a1530` | titoli in evidenza nelle pagine di testo |
| `--segno` | `#8f9bff` | `#3f4bd0` | secondo accento delle pagine di testo |

### Stati (pagine di testo: `.pf-avviso`)
| Variabile | Scuro | Chiaro |
|---|---|---|
| `--successo` / `--successo-fondo` | `#8fcf86` / `#1f2a1d` | `#2e7a34` / `#e7f2e4` |
| `--attenzione` / `--attenzione-fondo` | `#f2c14e` / `#2f2715` | `#8a5a00` / `#fbf0d6` |
| `--errore` / `--errore-fondo` | `#ff8a8a` / `#361a1c` | `#a8133c` / `#fbe5ea` |

### Blueprint (tavola della home)
| Variabile | Scuro | Chiaro | Uso |
|---|---|---|---|
| `--bp-fondo` | `#0a1830` | `#e8eff8` | fondo della scena: blu notte / carta da lucido |
| `--bp-fondo-2` | `#0f2140` | `#f6f9fd` | fondo dei riquadri di annotazione |
| `--bp-linea` | `#9cc7f0` | `#23477e` | tratto della tavola (filtro SVG `#bp-colore`), linee di richiamo, cornice |
| `--bp-luce` | `#7af4ff` | `#0069b4` | ciano luminoso: parola in evidenza del titolo, parte della macchina accesa |
| `--bp-griglia` | `rgb(140 190 255 / .075)` | `rgb(35 71 126 / .07)` | quadrettatura di fondo (24 e 120 px) |
| `--bp-testo` | `#e2efff` | `#0f2547` | testo sulla scena blueprint |
| `--bp-tenue` | `#93b2d8` | `#44618a` | testo secondario sulla scena blueprint |

La tavola di Sankey è un PNG di sole linee bianche con trasparenza (`img/sankey-1898-tavola.png`): il colore lo dà
il filtro SVG con `flood-color: var(--bp-linea)`, quindi segue il tema senza altri file.

### Ombre
`--ombra-1` (rilievo minimo) e `--ombra-2` (elementi sospesi: menu del telefono, tooltip del menu).

### Colori dei dati usati dalla cornice (in sola lettura)
La home (flussi animati e legenda della tavola), la 404 e il monogramma del marchio usano `--flusso-el`,
`--flusso-th`, `--flusso-acqua`, `--flusso-altro`. **Non** sono definiti in `tema.css` ma in `area.css` (caricato in
ogni pagina): la cornice li legge, non li ridefinisce. Così il verde significa elettricità ovunque, anche in home.
Non servono alias in `tema.css`.

## Variabili comuni ai due temi (cornice)

| Variabile | Valore | Uso |
|---|---|---|
| `--testo` | Hanken Grotesk | testo corrente della cornice |
| `--titoli` | Barlow | titoli, voci di menu |
| `--mono` | IBM Plex Mono | codici, numerazione da tavola tecnica, sopratitoli |
| `--c-xs` … `--c-2xl`, `--c-h1` | 12,5 → 28 px; h1 32–52 px fluido | scala dei corpi |
| `--s1` … `--s8` | 4 → 64 px | spaziature (passo 4 px) |
| `--margine` | 16–32 px fluido | margine laterale di testata, pagine e piè |
| `--larghezza` | 1440px | larghezza massima dei contenuti (`.pf-contenitore`) |
| `--raggio` (`--r`), `--r-s`, `--r-l`, `--r-tondo` | 6, 4, 10, 999 px | raggi della cornice |
| `--tocco` | 2.75rem | altezza minima di campi e pulsanti della cornice (44 px) |
| `--alto-testata` | 3.75rem (aggiornata da `sito.js`) | altezza reale della testata sticky (la usa anche l'app Sankey per la sua altezza) |
| `--durata`, `--ritardo-tip` | .18s, .35s | transizioni, ritardo del tooltip senza JS |

Caratteri: OFL 1.1, da `@fontsource` (licenze in `assets/font/OFL-*.txt`), solo sottoinsieme latino.

## Esempio: un tema "Indaco" cambiando solo tema.css

```css
:root, [data-theme="dark"] {
  --carta: #11152a; --foglio: #191e36; --rialzo: #222844; --tinta: #262c52; --linea: #2f3656; --bordo: #6d77a3;
  --inchiostro: #eceef8; --tenue: #a8aec8; --primario: #8aa4ff; --primario-forte: #aabdff; --su-primario: #11152a;
  /* …le altre restano come sono o si adattano… */
}
[data-theme="light"] { --primario: #3550c4; --primario-forte: #283f9e; /* … */ }
```
Cambiano testata, menu, piè, home e intestazioni degli strumenti; pannelli, grafici, controlli e app Sankey restano
identici.

---

# Parte 2 — Area di lavoro (`area.css` — non modificare)

## Che cosa è area di lavoro

- **Strumenti** (Playfair-S/E/T/M/G/C): il contenitore `<div class="pf-app pf-area fam-…">` e tutto ciò che contiene:
  pannelli dei grafici, canvas Chart.js (assi, griglie, testi, legende, tooltip), KPI e cifre, tabelle dei
  risultati, schede, campi, pulsanti, menu a tendina, zone di trascinamento `.pf-drop`, finestre modali.
  Il contenitore ha il fondo `--area-fondo` con bordo e raggio propri (il «vassoio»): anche il testo che sta fuori
  dai pannelli poggia sulla palette dell'area, qualunque sia il fondo della pagina.
- **App Sankey**: `<main class="sk-app pf-area">` (menu a sinistra, area di disegno, blocchi, tubi, zoom, legenda,
  barra di stato, pannello a destra) e la guida introduttiva `<dialog class="sk-dialogo pf-area">`.
- **Controlli comuni degli strumenti** (in `sito.css`, sezione delimitata «AREA DI LAVORO»): zone di trascinamento
  `.pf-drop`/`.pf-drop-leggera`, velo a tutta pagina `.pf-velo`, annuncio `.pf-annuncio`, dialogo di scelta del
  foglio `.pf-dialogo`, bolla dei tooltip dentro l'area `.pf-tip.pf-tip-area` (la aggiunge `sito.js` quando il
  bersaglio sta in `.pf-area`).
- **Esportazioni**: PNG/JPG dei grafici (`Playfair.telaConFonte`), cartelle Excel (`excel.js`: i colori dell'area
  scura sono convertiti nei valori dell'area chiara), JPG/PDF/SVG/Excel del Sankey (palette dell'area chiara).

## Regole

1. Nell'area le regole usano **solo** `--area-*` e i colori dei dati `--flusso-*`/`--serie-*`. Valgono per
   `strumenti.css` (sezioni 1, 3, 4, 5), `sankey.css`, gli `<style>` e gli attributi `style` dentro `.pf-app`, gli
   script (`PF.c('--area-testo')`, `PF.tavolozza`, `sankey.js`, `excel.js`, `sito.js`).
2. Colori dei dati negli script: `--serie-1…6` e `--flusso-*`; per soglie e riferimenti `--area-segno`; per gli stati
   `--area-ok/-warn/-err`. **Mai** `--area-accento` come colore di una serie: è un colore d'interfaccia.
3. Rete di sicurezza: dentro `.pf-area` i nomi della cornice (`--inchiostro`, `--primario`, `--testo`, `--raggio`…)
   sono ridefiniti come alias dei valori dell'area, e `PF.c('--inchiostro')` legge `--area-testo`
   (tabella `PF.AREA` in `strumenti.js`). Un nome della cornice scritto per errore nell'area non fa quindi trapelare
   il tema; il codice nuovo deve comunque usare i nomi `--area-*`.
4. Modalità chiara/scura: segue l'interruttore del sito (`data-theme` su `<html>`), con valori propri; anche
   `color-scheme` (caselle, cursori, barre di scorrimento native) è impostato dall'area.
5. Contrasti WCAG AA verificati in entrambe le modalità (tabelle qui sotto).

## Palette dell'area (definita due volte: scura e chiara)

Grafite fredda e neutra, accento **monocromatico**: gli unici colori saturi dell'area sono quelli dei dati.

| Variabile | Scura | Chiara | Uso | Contrasto (scura / chiara) |
|---|---|---|---|---|
| `--area-fondo` | `#14161a` | `#f3f4f6` | vassoio degli strumenti, app Sankey, campi, area di disegno | — |
| `--area-pannello` | `#1c1f24` | `#ffffff` | pannelli, menu e pannello del Sankey, blocchi, dialoghi, sfondo dei PNG | — |
| `--area-rialzo` | `#262a31` | `#eceef2` | KPI, intestazioni di tabella, passaggio del mouse | — |
| `--area-tinta` | `#2a3240` | `#e2e8f3` | selezione, primitiva attiva, zona di trascinamento attiva | testo 11,3 / 14,0 |
| `--area-linea` | `#30353d` | `#dcdfe5` | bordi sottili, separatori | — |
| `--area-bordo` | `#737b88` | `#7f8693` | bordi di campi e pulsanti | 3,9 / 3,7 sul pannello |
| `--area-testo` | `#eef0f3` | `#181b20` | testo | 14,5 / 17,3 sul pannello |
| `--area-tenue` | `#a8afba` | `#545b67` | testo secondario, etichette degli assi | 7,5 / 6,8 sul pannello |
| `--area-titolo` | `#f7f8fa` | `#11151b` | titoli dei grafici e del Sankey | 15,6 / 18,3 |
| `--area-accento` | `#e2e6ec` | `#262d38` | pulsante principale, scheda attiva, selezione | 13,2 / 13,9 |
| `--area-accento-forte` | `#ffffff` | `#0f1319` | passaggio del mouse sull'accento | — |
| `--area-su-accento` | `#14161a` | `#ffffff` | testo sull'accento | 14,5 / 13,9 |
| `--area-focus` | `#8fa2ff` | `#3448d1` | anello del focus, bordo dei campi attivi, trascinamento in corso | 6,9 / 7,0 |
| `--area-segno` | `#9db0ff` | `#3045c2` | valori calcolati (corsivo), soglie, linee di riferimento, link nell'area | 7,9 / 7,6 |
| `--area-griglia` | `rgb(238 240 243 / .10)` | `rgb(24 27 32 / .09)` | griglie dei grafici | — |
| `--area-ok` / `--area-ok-fondo` | `#7fd08a` / `#17261a` | `#2a7a35` / `#e4f2e6` | bilancio che torna, file caricato | 8,9 / 5,3 |
| `--area-warn` / `--area-warn-fondo` | `#f0c24f` / `#2b2513` | `#845700` / `#fbf1d6` | avvisi | 9,9 / 6,3 |
| `--area-err` / `--area-err-fondo` | `#ff8d8d` / `#341a1d` | `#b1183f` / `#fbe6ea` | errori, bilancio che non torna | 7,4 / 6,8 |
| `--area-ombra-1`, `--area-ombra-2` | | | rilievo dei pannelli; elementi sospesi | |

Variabili comuni: `--area-font` (Hanken Grotesk, dichiarato in `area.css` con il nome di famiglia «PF Area Testo»),
`--area-font-titoli` (Barlow, «PF Area Titoli»), `--area-font-mono` (IBM Plex Mono, «PF Area Mono»), `--area-raggio`
6px, `--area-r-s` 4px, `--area-r-l` 10px, `--area-r-tondo` 999px, `--area-durata` .18s. I nomi di famiglia propri
rendono l'area indipendente dai `@font-face` del tema (stessi file `woff2`, scaricati una volta sola).

## Colori dei dati (in `area.css`, significato fisso, non di competenza del tema)

### Serie dei grafici
`--serie-1` … `--serie-6`, in ordine fisso (1 = corallo, 2 = azzurro, 3 = giallo, 4 = magenta, 5 = verde,
6 = grigio). Scura: `#ff7a50 #8ccbf2 #f2d16b #e070ad #9ccf8f #b9b2ad`; chiara: `#c43c12 #1f6fb4 #a87800 #b3418a #4f7f22
#6b625d`. `--serie-1` è anche il colore della retta di regressione (Playfair-C)
e della linea del PBT (Playfair-M).
In Playfair-G ogni sede ha un colore fisso (nell'ordine del file: `--serie-1…5` × 5 toni = 25 colori, poi si
ripetono), lo stesso nel Pareto, nell'incidenza, nella mappa a quadranti e nella tabella.

### Vettori energetici (Sankey, strumenti, home)
| Variabile | Scura | Chiara | Significato |
|---|---|---|---|
| `--flusso-el` | `#4fd68a` | `#1b8a45` | verde: kWh elettrici, lavoro utile |
| `--flusso-th` | `#ff9a3d` | `#d45a00` | arancione: Sm³ di gas, MWh termici, calore e vapore |
| `--flusso-acqua` | `#4cc6f5` | `#1272b0` | azzurro: m³ d'acqua, ritorni |
| `--flusso-co2` | `#c4946a` | `#7a4a26` | marrone: t CO₂ |
| `--flusso-altro` | `#9b96a6` | `#706a7a` | grigio: perdite, altro |
| `--flusso-tep` | `#c58af0` | `#7b2fa8` | viola: tep, energia primaria (blocchi di conversione del Sankey) |

### Alias per il codice degli artifact originali
In `area.css`: `--pf-blue` (= `--serie-1`) `--pf-green --pf-red --pf-amber --pf-bg-app --pf-bg-panel --pf-border
--pf-focus --pf-text-primary --pf-text-secondary --pf-text-hint --pf-divider --pf-s1..4` puntano all'area.
In `strumenti.css`: gli alias dell'ambiente claude.ai `--color-text-* --color-background-* --color-border-*
--font-sans --font-mono --border-radius-*` puntano all'area.

## Sankey: spessore dei tubi d'acqua
L'acqua (m³) non è energia: sta su una **scala separata e ridotta**. Lo spessore dei tubi d'acqua è proporzionale ai
m³ tra i soli tubi d'acqua, ma il più grande è largo **un terzo** (`FRAZ_ACQUA = 1/3` in `sankey.js`) dello spessore
massimo dei flussi energetici: `spessoreMax × scalaTubi × 1/3` (13,3 px con lo slider «Spessore tubi» al 100%,
6,7 px al 50%, 26,7 px al 200%; minimo 1,5 px). Vale con e senza «Scala unica», a schermo e in JPG/PDF/SVG; la
legenda lo dice («acqua: scala separata, ridotta»).
