# Playfair

Sito divulgativo di formazione sull'energia, dedicato a **William Playfair** (1759–1823), l'inventore del grafico a
linee, a barre e a torta. Fa parte di [Stato Critico](https://statocritico.it) ed è pubblicato su
**https://playfair.statocritico.it**.

Contiene strumenti che trasformano un file CSV, Excel (`.xlsx`, `.xls`) o LibreOffice (`.ods`) in grafici per esercitazioni
(Playfair-S, -E, -T, -M, -G, -C), scaricabili anche come cartella Excel con grafici nativi, un editor di
diagrammi di Sankey e due pagine sui personaggi. **I dati caricati restano nel browser**: nulla viene inviato a server,
nessun cookie, nessuna CDN. Le visite sono contate con Cloudflare Web Analytics (statistiche anonime, senza cookie).

## Struttura

Sito statico, **nessuna build**: HTML + CSS + JS puri, con link relativi (funziona anche aprendo i file dal disco).

```
index.html              home
personaggi.html         William Playfair e Matthew H. P. R. Sankey
playfair-s|e|t|m|g|c.html gli strumenti
licenza.html            licenza AGPL-3.0, termini aggiuntivi, crediti di terzi
sankey.html             editor di diagrammi a blocchi
404.html                pagina «non trovata»
guida-rapida.pdf        guida utente
assets/tema.css         SOLO variabili della cornice (colori, font, raggi, ombre): l'aspetto del sito
assets/area.css         palette fissa dell'area di lavoro (strumenti, Sankey) e colori dei dati: non modificare
assets/sito.css|js      testata, menu, tema, trascinamento dei file, fogli di calcolo → CSV, fonte nei download
assets/excel.js         «Scarica in Excel»: OOXML con grafici nativi (caricato a richiesta con JSZip)
assets/vendor/          librerie locali (Chart.js, PapaParse, chartjs-plugin-annotation, jsPDF, SheetJS, JSZip)
LICENSE                 testo della GNU AGPL-3.0 (pubblicato come /LICENSE)
TERMINI_AGGIUNTIVI.md   termini aggiuntivi ex sezione 7 (non pubblicato: la pagina pubblica è licenza.html)
assets/font/            font woff2 self-hosted con le loro licenze OFL
img/                    immagini
_headers                intestazioni HTTP (cache, sicurezza) per Cloudflare
wrangler.jsonc          configurazione Cloudflare Workers (dominio, 404)
.assetsignore           file del repository da NON pubblicare (docs/, *.md, configurazione…)
docs/                   documentazione interna, non pubblicata
```

## Provarlo in locale

- **Doppio clic** su `index.html`: quasi tutto funziona già così.
- **Server locale** (consigliato, più fedele), dalla cartella del repository:
  ```powershell
  python -m http.server 8000      # poi apri http://localhost:8000
  ```
- **Come su Cloudflare** (con `_headers`, 404 e redirect veri; serve Node.js):
  ```powershell
  npx wrangler dev                # poi apri http://localhost:8787
  ```

## Cambiare aspetto

I colori, i font, i raggi e le ombre della **cornice** (testata, menu, piè, sfondo, pagine di testo, intestazioni
degli strumenti) stanno nel solo **`assets/tema.css`** (tema scuro predefinito, chiaro con `[data-theme="light"]`).
Si ristila il sito sostituendo quel file, senza toccare l'HTML. L'**area di lavoro** (pannelli dei grafici, controlli
degli strumenti, app Sankey, esportazioni) e i colori dei dati (vettori energetici, serie) hanno una palette fissa in
`assets/area.css`, che il tema non cambia. L'elenco delle variabili e le
regole sono in [`docs/CONTRATTO_CSS.md`](docs/CONTRATTO_CSS.md). Le regole generali del sito sono in
[`docs/CONTRATTO.md`](docs/CONTRATTO.md).

## Pubblicazione

Ogni `git push` su `main` ripubblica il sito in un paio di minuti (Cloudflare Workers Builds collegato a GitHub).
Guida passo passo: [`docs/ISTRUZIONI_PUBBLICAZIONE.md`](docs/ISTRUZIONI_PUBBLICAZIONE.md); scorciatoia da PowerShell:
`docs\pubblica.ps1`.

## Licenza e crediti

- **Codice**: © 2026 Paolo Bianco – Stato Critico, **GNU AGPL-3.0** (file `LICENSE`) con i termini aggiuntivi della
  sezione 7 in `TERMINI_AGGIUNTIVI.md` (attribuzione «Playfair © 2026 Paolo Bianco – Stato Critico –
  https://playfair.statocritico.it» da conservare, origine riconoscibile, nomi e logo). Riassunto in `licenza.html`,
  collegata dal piè di ogni pagina.
- **File scaricati** (xlsx, CSV, PNG/JPG, PDF/SVG, JSON): contengono la riga «Fonte: Playfair — playfair.statocritico.it ·
  elaborazione del GG/MM/AAAA su dati forniti dall'utente · licenza AGPL-3.0» (`Playfair.fonte()` in `sito.js`).
- **Immagini storiche**: pubblico dominio, da Wikimedia Commons.
- **Font**: Barlow, Hanken Grotesk, IBM Plex Mono – SIL Open Font License 1.1 (testi in `assets/font/OFL-*.txt`).
- **Librerie**: Chart.js, chartjs-plugin-annotation, PapaParse, jsPDF, JSZip – MIT; SheetJS CE 0.18.5 – Apache-2.0.
- **Stile** ripreso da EuGEnio, dello stesso autore.
