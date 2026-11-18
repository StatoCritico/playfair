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
  playfair-s.html  playfair-e.html  playfair-t.html  playfair-m.html  playfair-c.html
  sankey.html           editor di diagrammi a blocchi
  assets/tema.css       SOLO variabili (colori, font, raggi, ombre): è il "CSS modificabile"
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

## tema.css (variabili) — nomi obbligatori
Riprendere i nomi di EuGEnio: `--carta --foglio --rialzo --tinta --linea --bordo --inchiostro --tenue --primario --primario-forte --su-primario --profondo --segno --successo(-fondo) --attenzione(-fondo) --errore(-fondo) --serie-1..6 --ombra-1 --ombra-2`. Tema scuro predefinito su `:root, [data-theme="dark"]`, chiaro con `[data-theme="light"]` su `<html>`. Il "vestito" Playfair è una variante: tenere i valori corallo di EuGEnio come base ma con un tocco "blueprint/tecnologico" solo nella home (variabili aggiuntive `--bp-fondo --bp-linea --bp-luce --bp-griglia`).
Variabili aggiuntive obbligatorie per i vettori energetici (usate da Sankey, home, strumenti):
`--flusso-el` (verde, kWh elettrici) `--flusso-th` (arancione, Sm³ e MWh termici) `--flusso-acqua` (azzurro, m³) `--flusso-co2` (marrone, t CO₂) `--flusso-altro` (grigio).
Font: `--testo` e `--titoli` (+ `--mono`). Raggi: `--raggio`. Tutto ciò che è colore/tipo nelle pagine deve passare da queste variabili, così cambiando solo tema.css si ristila il sito. Documentare ogni variabile in `docs/CONTRATTO_CSS.md`.

## Script anti-lampo nel <head> (prima dei CSS) di OGNI pagina
```html
<script>try{var t=localStorage.getItem('pf-tema');if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>
<link rel="stylesheet" href="assets/tema.css">
<link rel="stylesheet" href="assets/sito.css">
```
e prima di `</body>`: `<script src="assets/sito.js" defer></script>` (sempre dopo gli script della pagina oppure con defer).

## Testata (IDENTICA in ogni pagina; cambia solo `aria-current="page"` sulla voce attiva)
```html
<header class="pf-testata">
  <a class="pf-marchio" href="index.html" aria-label="Playfair, home">Playfair<span class="pf-marchio-sub">.statocritico</span></a>
  <button class="pf-menu-apri" aria-expanded="false" aria-controls="pf-menu">Menu</button>
  <nav class="pf-menu" id="pf-menu" aria-label="Strumenti">
    <a href="playfair-s.html" data-tip="Site — analisi del singolo sito: costi e consumi di elettricità, gas, calore e acqua">Playfair-S</a>
    <a href="playfair-e.html" data-tip="Electric — curve di carico elettriche quartorarie: profili, mappe orarie, picchi e base">Playfair-E</a>
    <a href="playfair-t.html" data-tip="Thermal — consumi termici ed elettrici, simulazione di cogenerazione e valutazione economica">Playfair-T</a>
    <a href="playfair-m.html" data-tip="Money — confronto di investimenti energetici: VAN, TIR, ROI, WACC e flussi di cassa">Playfair-M</a>
    <a href="playfair-c.html" data-tip="Cusum — regressione, residui e carta CUSUM secondo ISO 50006">Playfair-C</a>
    <a href="sankey.html" data-tip="Sankey — disegna diagrammi di flusso energetico a blocchi e verifica i bilanci">Sankey</a>
    <a href="personaggi.html" data-tip="William Playfair e Matthew H. P. R. Sankey: chi erano">Personaggi</a>
  </nav>
  <button class="pf-tema" type="button" aria-label="Cambia tema chiaro/scuro">◐</button>
</header>
```
Tooltip: CSS su `[data-tip]` (comparsa al passaggio del mouse e al focus da tastiera, piccolo ritardo, freccina), `sito.js` aggiunge anche `aria-describedby`/`title` accessibile. Su mobile il menu si apre con "Menu".

Piè di pagina comune: `<footer class="pf-piede">` con: "Playfair · un progetto di <a href="https://statocritico.it">Stato Critico</a> · <a href="guida-rapida.pdf">Guida rapida</a> · Immagini storiche: pubblico dominio (Wikimedia Commons)". I dati caricati restano nel browser: nulla viene inviato a server.

## Drag & drop dei file (OBBLIGATORIO per tutti gli strumenti)
`sito.js` trasforma automaticamente ogni `<input type="file">` in una zona di trascinamento in stile EuGEnio (classe `.pf-drop`, stato `.pieno` quando sopra/caricato, mostra il nome del file). Meccanismo: al drop imposta `input.files = e.dataTransfer.files` e lancia `input.dispatchEvent(new Event('change',{bubbles:true}))`, così il codice esistente (onchange="loadCSV()" o addEventListener('change')) funziona senza modifiche. Se la pagina ha un solo input file, si può trascinare il file **ovunque nella pagina** (velo a tutto schermo "Rilascia il file CSV"). Con più input (Playfair-T) il file trascinato sulla pagina va all'input il cui attributo `data-pf-pattern` (regex sul nome file, es. `termico` / `curva`) corrisponde; altrimenti si usa la zona specifica. Se si trascinano più file insieme, vengono smistati con lo stesso criterio. Il pulsante "scegli file" classico deve continuare a funzionare. API esposta: `window.Playfair.drop(inputEl, opzioni)` e `window.Playfair.tema()`.

## Strumenti (artifact originali in /home/claude/src/artifacts/playfair-X.html)
| Pagina | Titolo | File d'esempio (NON pubblicati) |
|---|---|---|
| playfair-s.html | Playfair-S (Site) — analisi di singolo sito | N_consumi.csv |
| playfair-e.html | Playfair-E (Electric) — consumi elettrici | N_curva_di_carico.csv |
| playfair-t.html | Playfair-T (Thermal) — termico e cogenerazione | N_curva_di_carico.csv + termico_sito_N.csv |
| playfair-m.html | Playfair-M (Money) — analisi economiche | investimenti_energetici_v2.csv |
| playfair-c.html | Playfair-C (Cusum) — CUSUM ISO 50006 | consumo_cusum.csv |
CSV d'esempio (6 set, N=1..6) in `/mnt/user-data/uploads/playfair/N/` — servono solo per i test, NON vanno copiati nel sito.

## Vettori energetici e colori (Sankey e home)
verde = kWh elettrici; arancione = Sm³ gas e MWh termici; azzurro = m³ acqua; marrone = t CO₂.

## Regole
- Nessun dato inviato a server; nessun tracker; nessuna CDN (tutto in assets/vendor).
- Accessibilità: contrasti come EuGEnio, focus visibile, `prefers-reduced-motion` rispettato (animazioni ferme o ridotte).
- Ogni pagina: `<html lang="it">`, `<meta name="viewport">`, `<title>` "Playfair-X — … · Playfair", meta description, favicon `img/favicon.svg`.
- Testare con Chrome headless (`/usr/bin/google-chrome`, Python playwright disponibile).
