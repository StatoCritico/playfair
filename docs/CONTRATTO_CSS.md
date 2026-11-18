# Contratto tra le pagine e il tema (`assets/tema.css`)

Il sito ha tre livelli di stile:

| File | Contiene | Si cambia per… |
|---|---|---|
| `assets/tema.css` | **solo** variabili CSS e `@font-face` | ristilare tutto il sito (colori, caratteri, raggi, ombre) |
| `assets/sito.css` | testata, menu, tooltip, piè, zone di trascinamento, componenti comuni (`.pf-*`) | cambiare la struttura dei componenti |
| `<style>` nelle pagine, `assets/sankey.css` | regole specifiche di una pagina | solo quella pagina |

Regola d'oro: **nessun colore, carattere o raggio scritto a mano** in `sito.css`, nelle pagine o negli script. Si usa
sempre `var(--nome)`. Così sostituendo solo `tema.css` cambia l'aspetto di tutto il sito, tavola della home compresa.

## Regole per un nuovo tema

1. Un file, `assets/tema.css`. Niente `@import` o font da server esterni (CDN, Google Fonts): il sito promette nessun
   tracciamento. Font propri in `woff2` in `assets/font/`, con percorsi relativi: `src: url("font/nome.woff2")`.
2. Tema **scuro predefinito** in `:root, [data-theme="dark"]`; **chiaro** in `[data-theme="light"]` (attributo su
   `<html>`, impostato dallo script anti-lampo con la chiave `localStorage` `pf-tema`). Ogni variabile di colore va
   definita in **entrambi** i blocchi.
3. Le variabili non di colore (caratteri, corpi, spaziature, raggi) stanno nel terzo blocco `:root` e valgono per
   entrambi i temi.
4. Contrasto WCAG AA: `--inchiostro` e `--tenue` almeno 4,5:1 su `--carta` e `--foglio`; `--primario` almeno 4,5:1
   sul fondo (è anche il colore dei link e del focus); `--su-primario` almeno 4,5:1 su `--primario`; `--bp-testo` e
   `--bp-tenue` almeno 4,5:1 su `--bp-fondo` e `--bp-fondo-2`.
5. Non rinominare le variabili: le leggono anche gli script (`Playfair.colore('--flusso-el')`, grafici Chart.js,
   editor Sankey). Si possono **aggiungere** variabili nuove.
6. Dopo il cambio di tema `sito.js` emette l'evento `pf-tema` su `window` (`e.detail.tema` = `"dark"`/`"light"`):
   chi disegna con colori calcolati (canvas, Chart.js) ridisegna lì. Chi scrive `var(--…)` negli attributi SVG non
   deve fare nulla.

## Variabili di colore (definite due volte: scuro e chiaro)

### Superfici
| Variabile | Scuro | Chiaro | Uso |
|---|---|---|---|
| `--carta` | `#19171c` | `#f7f6f8` | fondo della pagina, fondo delle zone `.pf-drop`, testo sui tooltip |
| `--foglio` | `#232027` | `#ffffff` | pannelli `.pf-pannello`, menu del telefono, riquadro del velo |
| `--rialzo` | `#2d2932` | `#efedf1` | passaggio del mouse, intestazioni di tabella, pulsanti disattivi |
| `--tinta` | `#3a2230` | `#ffe6dd` | sfondo d'accento: zona di trascinamento con il file sopra |
| `--linea` | `#39343f` | `#e1dde6` | bordi sottili e separatori |
| `--bordo` | `#7b7385` | `#847c8e` | bordi di campi, pulsanti secondari, zone tratteggiate (≥ 3:1) |

### Testo e marca
| Variabile | Scuro | Chiaro | Uso |
|---|---|---|---|
| `--inchiostro` | `#f3eff4` | `#1c1820` | testo principale; fondo dei tooltip |
| `--tenue` | `#b5adbd` | `#5f5868` | testo secondario, didascalie, piè |
| `--primario` | `#ff7a50` | `#c43c12` | link, pulsanti, voce attiva, focus, riquadro acceso della home |
| `--primario-forte` | `#ff9775` | `#a8260c` | passaggio del mouse sul primario |
| `--su-primario` | `#19171c` | `#ffffff` | testo sopra `--primario` |
| `--profondo` | `#ffd0c0` | `#8a1530` | titoli dei grafici, cifre in evidenza |
| `--segno` | `#8f9bff` | `#3f4bd0` | secondo accento: soglie, valori di riferimento |

### Stati
| Variabile | Scuro | Chiaro | Uso |
|---|---|---|---|
| `--successo` / `--successo-fondo` | `#8fcf86` / `#1f2a1d` | `#2e7a34` / `#e7f2e4` | esito positivo, spunta del file caricato |
| `--attenzione` / `--attenzione-fondo` | `#f2c14e` / `#2f2715` | `#8a5a00` / `#fbf0d6` | avvisi `.pf-avviso` |
| `--errore` / `--errore-fondo` | `#ff8a8a` / `#361a1c` | `#a8133c` / `#fbe5ea` | errori `.pf-avviso.errore` |

### Serie dei grafici
`--serie-1` … `--serie-6`: colori delle serie in ordine fisso (1 = corallo/primario, 2 = azzurro, 3 = giallo,
4 = magenta, 5 = verde, 6 = grigio). Scuro: `#ff7a50 #8ccbf2 #f2d16b #e070ad #9ccf8f #b9b2ad`; chiaro:
`#c43c12 #1f6fb4 #a87800 #b3418a #4f7f22 #6b625d`.

### Vettori energetici (Sankey, home, strumenti)
| Variabile | Scuro | Chiaro | Significato |
|---|---|---|---|
| `--flusso-el` | `#4fd68a` | `#1b8a45` | verde: kWh elettrici, lavoro utile |
| `--flusso-th` | `#ff9a3d` | `#d45a00` | arancione: Sm³ di gas, MWh termici, calore e vapore |
| `--flusso-acqua` | `#4cc6f5` | `#1272b0` | azzurro: m³ d'acqua, ritorni |
| `--flusso-co2` | `#c4946a` | `#7a4a26` | marrone: t CO₂ |
| `--flusso-altro` | `#9b96a6` | `#706a7a` | grigio: perdite, altro |

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
`--ombra-1` (rilievo minimo: pannelli) e `--ombra-2` (elementi sospesi: menu, tooltip, velo). Nel chiaro sono
calde e leggere.

## Variabili comuni ai due temi

| Variabile | Valore | Uso |
|---|---|---|
| `--testo` | Hanken Grotesk | testo corrente (400, 400 corsivo, 600, 700) |
| `--titoli` | Barlow | titoli, voci di menu, nomi dei riquadri (500, 600, 700) |
| `--mono` | IBM Plex Mono | codici, numerazione da tavola tecnica, sopratitoli (400, 500, 600) |
| `--c-xs` … `--c-2xl`, `--c-h1` | 12,5 → 28 px; h1 32–52 px fluido | scala dei corpi |
| `--s1` … `--s8` | 4 → 64 px | spaziature (passo 4 px) |
| `--margine` | 16–32 px fluido | margine laterale di testata, pagine e piè |
| `--larghezza` | 1440px | larghezza massima dei contenuti (`.pf-contenitore`) |
| `--raggio` | 6px | raggio principale (pulsanti, campi); `--r` è un alias |
| `--r-s`, `--r-l`, `--r-tondo` | 4px, 10px, 999px | raggi piccolo, grande, a pillola |
| `--tocco` | 2.75rem | altezza minima di campi e pulsanti (44 px) |
| `--alto-testata` | 3.75rem (aggiornata da `sito.js`) | altezza reale della testata sticky |
| `--durata`, `--ritardo-tip` | .18s, .35s | transizioni, ritardo del tooltip senza JS |

Caratteri: OFL 1.1, da `@fontsource` (licenze in `assets/font/OFL-*.txt`), solo sottoinsieme latino.

### Alias per gli artifact Playfair originali
`--pf-blue --pf-green --pf-red --pf-amber --pf-bg-app --pf-bg-panel --pf-border --pf-focus --pf-text-primary
--pf-text-secondary --pf-text-hint --pf-divider --pf-s1..4` puntano alle variabili del tema (`--primario`,
`--successo`, `--errore`, `--attenzione`, `--carta`, `--foglio`, `--linea`, `--inchiostro`, `--tenue`, `--serie-*`):
il codice degli artifact (references/design.md della skill) segue il tema senza riscritture.

## Classi che il tema veste (da `sito.css`)

- Testata: `.pf-testata`, `.pf-marchio` (+ `::before` monogramma), `.pf-marchio-sub`, `.pf-menu` (+ `.aperto`,
  `a[aria-current="page"]`), `.pf-menu-apri`, `.pf-tema`.
- Tooltip: `.pf-tip` (+ `.visibile`, `.sopra`, `--freccia-x`); ripiego senza JS su `[data-tip]`.
- Piè: `.pf-piede`, `.pf-piede-nota`.
- Trascinamento: `.pf-drop` (+ `.sopra`, `.pieno`), `.pf-drop-titolo`, `.pf-drop-nome`, `.pf-drop-leggera`,
  `.pf-velo` (+ `.visibile`), `.pf-velo-riquadro`, `.pf-annuncio`.
- Componenti: `.pf-btn` (+ `.secondario`, `.piccolo`), `.pf-pannello`, `.pf-etichetta`, `.pf-campo`, `.pf-input`,
  `.pf-avviso` (+ `.errore`, `.successo`), `.pf-tabella-scorre`, `.pf-tabella`, `.num`, `.pf-contenitore`,
  `.pf-testo`, `.pf-intestazione`, `.pf-sopratitolo`, `.pf-salta`, `.solo-lettori`.

## Esempio: un tema "Indaco" cambiando solo tema.css

```css
:root, [data-theme="dark"] {
  --carta: #11152a; --foglio: #191e36; --rialzo: #222844; --tinta: #262c52; --linea: #2f3656; --bordo: #6d77a3;
  --inchiostro: #eceef8; --tenue: #a8aec8; --primario: #8aa4ff; --primario-forte: #aabdff; --su-primario: #11152a;
  /* …le altre restano come sono o si adattano… */
}
[data-theme="light"] { --primario: #3550c4; --primario-forte: #283f9e; /* … */ }
```
