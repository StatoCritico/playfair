# Playfair

Sito divulgativo di formazione sull'energia, dedicato a **William Playfair** (1759–1823), l'inventore del grafico a
linee, a barre e a torta. Fa parte di [Stato Critico](https://statocritico.it) ed è pubblicato su
**https://playfair.statocritico.it**.

Contiene strumenti che trasformano un file CSV in grafici per esercitazioni (Playfair-S, -E, -T, -M, -C), un editor di
diagrammi di Sankey e due pagine sui personaggi. **I dati caricati restano nel browser**: nulla viene inviato a server,
nessun cookie, nessun tracker, nessuna CDN.

## Struttura

Sito statico, **nessuna build**: HTML + CSS + JS puri, con link relativi (funziona anche aprendo i file dal disco).

```
index.html              home
personaggi.html         William Playfair e Matthew H. P. R. Sankey
playfair-s|e|t|m|c.html gli strumenti
sankey.html             editor di diagrammi a blocchi
404.html                pagina «non trovata»
guida-rapida.pdf        guida utente
assets/tema.css         SOLO variabili (colori, font, raggi, ombre): l'aspetto del sito
assets/sito.css|js      testata, menu, tema chiaro/scuro, trascinamento dei file
assets/vendor/          librerie locali (Chart.js, PapaParse, chartjs-plugin-annotation, jsPDF)
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

Tutti i colori, i font, i raggi e le ombre stanno nel solo **`assets/tema.css`** (tema scuro predefinito, chiaro con
`[data-theme="light"]`). Si ristila il sito sostituendo quel file, senza toccare l'HTML. L'elenco delle variabili e le
regole sono in [`docs/CONTRATTO_CSS.md`](docs/CONTRATTO_CSS.md). Le regole generali del sito sono in
[`docs/CONTRATTO.md`](docs/CONTRATTO.md).

## Pubblicazione

Ogni `git push` su `main` ripubblica il sito in un paio di minuti (Cloudflare Workers Builds collegato a GitHub).
Guida passo passo: [`docs/ISTRUZIONI_PUBBLICAZIONE.md`](docs/ISTRUZIONI_PUBBLICAZIONE.md); scorciatoia da PowerShell:
`docs\pubblica.ps1`.

## Licenze e crediti

- **Immagini storiche** (ritratti, grafici originali di Playfair e Sankey): **pubblico dominio**, da Wikimedia Commons.
- **Font**: Barlow, Hanken Grotesk, IBM Plex Mono – SIL Open Font License 1.1 (testi in `assets/font/OFL-*.txt`).
- **Librerie**: Chart.js, chartjs-plugin-annotation, PapaParse, jsPDF – licenza MIT.
- **Stile** ripreso da EuGEnio, dello stesso autore.
- Testi e strumenti: © Stato Critico.
