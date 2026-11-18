# Playfair · tema «Steampunk e neon» — come installarlo

Il pacchetto contiene solo i file nuovi o modificati. Tutto il resto del sito (area.css, sito.css, strumenti.css,
sankey.css, gli script, le immagini, i font già presenti) resta com'è.

## Cosa caricare sul server (sovrascrivendo)

| File | Che cosa fa |
|---|---|
| `assets/tema.css` | **sostituisce** il tema: tre schemi (Fredda, Aliena, Calda) × scuro/chiaro; i nomi del contratto sono invariati |
| `assets/steampunk.css` | **nuovo**: testata (P a sinistra, menu centrato, interruttore chiaro/scuro a destra) e home animata |
| `assets/home.js` | **nuovo**: sequenza dei flussi, riquadri al neon con i raggi, manometro degli schemi |
| `assets/font/*.woff2` + `OFL-*.txt` | **nuovi**: Marcellus, Share Tech Mono, Playfair Display, Orbitron, Cormorant Garamond, Michroma (OFL 1.1, self-hosted) |
| `index.html` | home nuova: la macchina con i riquadri; via la sezione «Perché Playfair, perché Sankey» |
| tutte le altre `*.html` | tre ritocchi in testa a ogni pagina, il resto è identico |

Prima di caricare conviene una copia di sicurezza di `assets/tema.css` e delle pagine `.html` attuali.

## I ritocchi alle pagine (uguali in tutte)

1. Lo script anti-lampo legge anche lo schema scelto:
   `localStorage 'pf-schema'` → `data-schema` su `<html>` (senza scelta vale Aliena).
2. Dopo `assets/sito.css` si carica `assets/steampunk.css`.
3. Nel marchio `.pf-marchio` la scritta «Playfair .statocritico» è sostituita dal monogramma P in SVG
   (l'etichetta «Playfair, home» per i lettori di schermo resta).

## Schemi e temi

- Il **manometro** della home cambia lo schema (F → A → C) e lo ricorda: vale per tutte le pagine.
- Il pulsante **chiaro/scuro** è quello di sempre (`sito.js`, chiave `pf-tema`).
- L'**area di lavoro** degli strumenti e l'app Sankey non cambiano: usano ancora solo `area.css`.
- Nei tubi della home i vettori energetici usano `--fluo-*` (gli stessi colori di `--flusso-*` scuri, più luminosi
  dentro il vetro scuro): il significato dei colori resta quello di `area.css`.

## Verifica fatta

Sito completo montato in locale e aperto in Chrome (1440 px e 390 px): home nei tre schemi, chiaro e scuro, riquadro
acceso con raggio e voce di menu accesa, pagina Playfair-E e app Sankey. Nessun errore nella console.
