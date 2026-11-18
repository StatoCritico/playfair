# Playfair – messa online su playfair.statocritico.it

Guida per Windows (PowerShell), passo passo. Stesso schema di Bordo Vasca: **repository GitHub → Cloudflare Workers
(file statici) → dominio personalizzato**. Qui però **non c'è nessuna build**: il sito è già pronto nella radice del
repository e Cloudflare lo pubblica così com'è. Tempo: circa mezz'ora la prima volta, poi un minuto a ogni aggiornamento.

> **In 10 righe**
> 1. Su GitHub, in **statocritico**: *New repository* → `playfair`, Public, **senza** README → *Create*.
> 2. PowerShell: `cd C:\Users\ingpa\Documents\claude\pj\playfair\playfair-sito` (è già un repository con i commit: niente `git init`)
> 3. `git remote add origin https://github.com/statocritico/playfair.git` · `git push -u origin main`
> 4. **dash.cloudflare.com** → *Workers & Pages* → *Create application* → *Import a repository* / GitHub → `statocritico/playfair`.
> 5. Nome progetto **playfair** · *Build command* **vuoto** · *Deploy command* `npx wrangler deploy` · branch `main` → *Deploy*.
> 6. Il dominio `playfair.statocritico.it` lo crea da solo il deploy (è scritto in `wrangler.jsonc`).
> 7. Se non compare: Worker → *Settings* → *Domains & Routes* → *Add* → *Custom domain* → `playfair.statocritico.it`.
> 8. Dopo 2–5 minuti apri **https://playfair.statocritico.it** e prova uno strumento trascinando un CSV.
> 9. Aggiornare: modifichi i file, poi `.\docs\pubblica.ps1` (o add/commit/push): online in 1–2 minuti.
> 10. Tornare indietro: Worker → *Deployments* → ⋯ sulla versione buona → *Rollback*.

---

## 0. Prima di cominciare

- **Account**: GitHub `statocritico`, Cloudflare (lo stesso che gestisce il DNS di `statocritico.it` e già pubblica
  `bordovasca.statocritico.it`).
- **Programmi sul PC**: [Git per Windows](https://git-scm.com/download/win) (controlla in PowerShell con `git --version`).
  Facoltativi: [GitHub Desktop](https://desktop.github.com) se preferisci i clic ai comandi; [Node.js LTS](https://nodejs.org)
  solo per `npx wrangler` (prova in locale o pubblicazione senza GitHub, passo F).
- **Cartella del sito sul PC**: `C:\Users\ingpa\Documents\claude\pj\playfair\playfair-sito` (fuori da `statocritico`, va bene così: il repository è indipendente). È **già un repository git** con tutta la storia dei commit. Dentro devono
  esserci `index.html`, `assets\`, `img\`, `wrangler.jsonc`, `.assetsignore`, `_headers`, `404.html`.
  I file che iniziano con il punto (`.assetsignore`, `.gitignore`) in Esplora file si vedono solo con
  *Visualizza → Mostra → Elementi nascosti*: **non vanno persi**, servono.
- **Cosa viene pubblicato**: tutta la cartella, **tranne** quello che è elencato in `.assetsignore` (`docs\`, tutti i
  `.md`, gli script `.ps1`, `wrangler.jsonc`, la cartella `.git`…). La cartella `docs\` va su GitHub (è documentazione)
  ma **non** sul sito.
- Il primo controllo in locale (facoltativo, 1 minuto):
  ```powershell
  cd C:\Users\ingpa\Documents\claude\pj\playfair\playfair-sito
  python -m http.server 8000        # apri http://localhost:8000 ; Ctrl+C per uscire
  ```

## A. Repository GitHub

### A1. Crea il repository (browser)
1. **github.com** → in alto a destra **+** → *New repository*.
2. *Owner* **statocritico** · *Repository name* **playfair** · **Public** · **non** spuntare *Add a README*, né
   `.gitignore`, né licenza (ci sono già nella cartella) → *Create repository*.

### A2 (strada consigliata). Carica i file con git da PowerShell
La cartella è già un repository git con i commit fatti: **non** serve `git init` né il primo commit.
```powershell
cd C:\Users\ingpa\Documents\claude\pj\playfair\playfair-sito
git status                        # deve dire "nothing to commit, working tree clean"
git log --oneline                 # mostra i commit già fatti
git remote add origin https://github.com/statocritico/playfair.git
git push -u origin main
```
Se hai modificato qualcosa nel frattempo, prima del push: `git add .` e `git commit -m "descrizione"`.

Cosa aspettarsi:
- Se `git status` mostra file modificati che non hai toccato (succede su Windows per i permessi dei file), esegui una volta `git config core.fileMode false`.
- Al primo `git push` si apre una finestra di accesso a GitHub (*Sign in with your browser*): autorizza. Nessuna
  password va scritta nei file.
- L'ultima riga è del tipo `* [new branch]  main -> main`.
- Se git chiede «Please tell me who you are»: una volta sola
  `git config --global user.name "Il tuo nome"` e `git config --global user.email "la-tua-email"`, poi rifai il commit.

### A2 (alternativa). GitHub Desktop
1. *File → Add local repository* → scegli la cartella `playfair-sito` (è già un repository: GitHub Desktop la riconosce
   con tutti i commit).
2. *Publish repository* → **togli** la spunta *Keep this code private* → *Organization*/account **statocritico** →
   *Publish*. (Se hai già creato il repository al passo A1, usa invece *Repository → Repository settings → Remote*
   `https://github.com/statocritico/playfair.git` e poi *Push origin*.)

### A2 (ultima risorsa). Caricamento dal browser
Nel repository vuoto: *uploading an existing file* → trascina **il contenuto** della cartella (non la cartella stessa)
→ *Commit changes*. Limiti: massimo 100 file per volta (carica `assets` e `img` in più riprese, rispettando le
sottocartelle) e i file nascosti come `.assetsignore` vanno controllati uno per uno. **Senza `.assetsignore` verrebbe
pubblicata anche `docs\`**: verifica che ci sia nell'elenco dei file del repository.

### A3. (Consigliato) Proteggi `main`
Repository → *Settings* → *Branches* (o *Rules → Rulesets*) → regola su `main` con **Block force pushes**. Niente
«Require a pull request»: si pubblica con push diretti.

## B. Sito su Cloudflare Workers, collegato a GitHub (browser)

1. **dash.cloudflare.com** → menu a sinistra *Compute (Workers)* / **Workers & Pages** → **Create application**.
2. Scegli **Import a repository** (o *Continue with GitHub*). La prima volta Cloudflare chiede di installare la sua
   GitHub App: account **statocritico**, *Only select repositories* → **playfair** (se c'è già per bordovasca:
   *Configure GitHub App* e aggiungi `playfair`).
3. Seleziona `statocritico/playfair` e compila:

   | Campo | Valore |
   |---|---|
   | *Project name* / nome del Worker | **playfair** (deve essere identico a `"name"` in `wrangler.jsonc`) |
   | *Production branch* | `main` |
   | *Build command* | **vuoto** (non c'è nulla da costruire) |
   | *Deploy command* | `npx wrangler deploy` (è già il valore predefinito) |
   | *Non-production branch deploy command* | lascia il predefinito |
   | *Root directory / Path* | `/` (vuoto) |
   | *Variabili d'ambiente* | nessuna |

4. **Deploy** (o *Save and Deploy*). Nel registro della build, alla fine, devi leggere qualcosa come
   `Uploaded playfair` … `Deployed playfair triggers` … `playfair.statocritico.it (custom domain)`.

Se Cloudflare ti propone una scheda **Pages** invece di Workers, **non** usarla: questo sito è configurato per
Workers (`wrangler.jsonc`), come bordovasca.

## C. Dominio playfair.statocritico.it

### C1. Caso normale: la zona statocritico.it è già su Cloudflare
È il caso di Stato Critico (il DNS è su Cloudflare e `bordovasca.statocritico.it` funziona già così). Non devi fare
niente: in `wrangler.jsonc` c'è
```jsonc
"routes": [ { "pattern": "playfair.statocritico.it", "custom_domain": true } ]
```
e a ogni deploy Cloudflare crea (o conferma) il record DNS e il certificato https. Controlla in
*Workers & Pages* → **playfair** → *Settings* → **Domains & Routes**: deve esserci `playfair.statocritico.it` come
*Custom domain*. Il certificato può impiegare qualche minuto.

Per essere sicuri che la zona è su Cloudflare: *dash.cloudflare.com* → *Account home*: `statocritico.it` compare con
stato **Active**.

### C2. Se il dominio non compare: aggiungilo a mano
*Workers & Pages* → **playfair** → *Settings* → *Domains & Routes* → **Add** → **Custom domain** →
`playfair.statocritico.it` → *Add custom domain*.
Se rifiuta perché «esiste già un record»: *statocritico.it* → *DNS* → *Records*, cancella il vecchio record
`playfair` (CNAME o A) e riprova. Un Custom Domain non si può creare sopra un CNAME esistente.

### C3. Se la zona fosse ancora su Aruba (improbabile)
I Custom Domain dei Worker funzionano **solo** se la zona è attiva su Cloudflare. Un semplice CNAME impostato da Aruba
verso `*.workers.dev` **non** funziona (Cloudflare non riconosce il nome). Quindi:
1. *dash.cloudflare.com* → *Add a domain* → `statocritico.it` → piano **Free**: Cloudflare importa i record DNS esistenti
   (controllali: soprattutto MX e TXT della posta) e ti dà **due nameserver** (`xxx.ns.cloudflare.com`).
2. **Aruba** → area clienti → *Gestione domini* → `statocritico.it` → *Gestione DNS / Server DNS* → *Modifica* →
   usa DNS esterni e inserisci i due nameserver di Cloudflare → salva.
3. Attendi lo stato **Active** su Cloudflare (da pochi minuti a 24 ore), poi rifai il deploy (passo E2) o il C2.

## D. Verifica (5 minuti)

1. Apri **https://playfair.statocritico.it**: lucchetto chiuso (https), compare la home.
2. Clicca ogni voce del menu (Playfair-S, -E, -T, -M, -C, Sankey, Personaggi): niente pagine bianche.
   È normale che l'indirizzo diventi `/playfair-s` senza `.html` (Cloudflare toglie l'estensione).
3. In uno strumento **trascina un CSV** di prova sulla pagina: la zona diventa evidenziata, compare il nome del file e
   poi i grafici. Prova anche il pulsante «scegli file».
4. Prova il tema chiaro/scuro (◐) e, dal telefono, il pulsante *Menu*.
5. Apri un indirizzo inventato, es. `https://playfair.statocritico.it/xyz`: deve comparire la pagina 404 del sito.
6. Controlla che i file interni **non** siano pubblici: `https://playfair.statocritico.it/docs/CONTRATTO.md` e
   `…/wrangler.jsonc` devono dare 404.
7. (Facoltativo) In Chrome, F12 → *Console*: nessun errore rosso «Content Security Policy». Se ce ne sono, vedi G.

## E. Aggiornamenti futuri

### E1. Pubblicare una modifica
Modifichi i file nella cartella, poi da PowerShell:
```powershell
cd C:\Users\ingpa\Documents\claude\pj\playfair\playfair-sito
.\docs\pubblica.ps1                         # oppure: .\docs\pubblica.ps1 "Nuovo tema"
```
Lo script fa `git add`, `git commit` con data e ora e `git push`. Equivalente a mano:
`git add .` · `git commit -m "descrizione"` · `git push`. Con GitHub Desktop: *Commit to main* → *Push origin*.
Cloudflare vede il push e ripubblica in 1–2 minuti (*Workers & Pages* → **playfair** → *Deployments* / *Builds*).

Se PowerShell rifiuta lo script («l'esecuzione di script è disabilitata»), una volta sola:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (oppure lancia con
`powershell -ExecutionPolicy Bypass -File .\docs\pubblica.ps1`).

**Cambiare aspetto**: sostituisci solo `assets\tema.css` (cornice; variabili descritte in `docs\CONTRATTO_CSS.md`; l'area di lavoro in `assets\area.css` non si tocca), prova in
locale, poi pubblica. Se il browser mostra ancora il vecchio stile: Ctrl+F5.

### E2. Ripubblicare senza modifiche
*Workers & Pages* → **playfair** → *Deployments* (o *Builds*) → *Retry build* sull'ultima build.

### E3. Tornare a una versione precedente (rollback)
- **Veloce**: *Workers & Pages* → **playfair** → **Deployments** → ⋯ accanto alla versione buona → **Rollback**.
  Attenzione: il prossimo push ripubblica comunque il contenuto di `main`.
- **Definitivo**: riporta indietro anche il repository, con GitHub Desktop (*History* → clic destro sul commit
  sbagliato → *Revert changes in commit* → *Push origin*) o da PowerShell `git revert HEAD` e `git push`.

## F. Alternativa senza GitHub (pubblicazione diretta dal PC)

Serve Node.js. Dalla cartella del sito:
```powershell
cd C:\Users\ingpa\Documents\claude\pj\playfair\playfair-sito
npx wrangler login        # si apre il browser: autorizza l'account Cloudflare di statocritico.it
npx wrangler deploy       # carica i file (rispettando .assetsignore) e collega il dominio
```
Cosa aspettarsi: `Deployed playfair triggers` e `playfair.statocritico.it (custom domain)`.
Va bene per la prima prova o per un'emergenza. Se però il Worker è collegato a GitHub, il push successivo
sovrascrive quello che hai caricato a mano: tieni allineati i due canali (meglio usarne uno solo).
Prova «come su Cloudflare» in locale: `npx wrangler dev` → http://localhost:8787 (Ctrl+C per uscire).

## G. Problemi frequenti

| Sintomo | Causa probabile e rimedio |
|---|---|
| Build fallita: «The name in your Wrangler configuration file … must match the name of your Worker» | Il progetto su Cloudflare non si chiama `playfair`. Rinomina o ricrea il Worker con nome `playfair` (o cambia `"name"` in `wrangler.jsonc`). |
| Build fallita: «Missing entry-point» | Cloudflare non trova `wrangler.jsonc`: *Settings → Build* → *Root directory* vuota (`/`); verifica che `wrangler.jsonc` sia su GitHub. |
| Build fallita per il dominio (messaggio che cita «custom domain» o un record DNS già esistente) | Esiste già un record DNS `playfair`: cancellalo in *DNS → Records* e rifai la build (*Retry build*). Oppure aggiungi il dominio a mano (C2). |
| Build fallita: «Authentication error» / token | Token di build cancellato o scaduto: *Settings → Build* → *API token* → creane uno nuovo. |
| Il repository non compare nell'elenco di Cloudflare | La GitHub App di Cloudflare non ha accesso: GitHub → *Settings* (di statocritico) → *GitHub Apps* → *Cloudflare Workers and Pages* → *Configure* → aggiungi `playfair`. |
| `git push` rifiutato («rejected», «fetch first») | Su GitHub c'è un file che non hai in locale (es. README creato dal sito): `git pull --rebase origin main`, poi `git push`. |
| `git push` chiede utente/password | Non usare la password: annulla e accedi dalla finestra del browser (Git Credential Manager), oppure usa GitHub Desktop. |
| Il sito risponde 404 dappertutto | Manca `index.html` nella radice del repository, oppure `.assetsignore` esclude troppo. Controlla il registro della build: elenca i file caricati. |
| `/docs/…` o `wrangler.jsonc` sono visibili online | `.assetsignore` non è stato caricato su GitHub (file nascosto): aggiungilo e ripubblica. |
| «Questo sito non può fornire una connessione sicura» | Certificato ancora in emissione: aspetta 5–15 minuti. Se dura più di un'ora, togli e rimetti il Custom domain (C2). |
| Il dominio non risolve (DNS_PROBE…) | La zona non è *Active* su Cloudflare (C3) o il Custom domain non è stato creato (C2). |
| Grafici o pulsanti non funzionano solo online | F12 → Console: un errore «Refused to … Content Security Policy» indica che `_headers` blocca qualcosa. Allenta la riga `Content-Security-Policy` in `_headers` (o toglila del tutto) e ripubblica. |
| Il nuovo stile non si vede | Cache del browser: Ctrl+F5. Le librerie in `assets\vendor` sono in cache per 30 giorni: se le aggiorni, cambia il nome del file. |
| Un file grosso non viene caricato | Limite di 25 MiB per singolo file: comprimi immagini/PDF. |

## Costi
Tutto sui piani gratuiti: Workers (sito di soli file statici, nessun codice server; limiti: 20.000 file e 25 MiB per
file), Workers Builds (minuti di build gratuiti mensili: qui ogni build dura pochi secondi), GitHub pubblico.
Nessuna scadenza o token da rinnovare a mano.

---

## Fonti consultate (documentazione ufficiale Cloudflare, novembre 2026)

- Static Assets – Configuration and Bindings (`assets.directory`, `.assetsignore` nella radice della cartella degli asset,
  stessa sintassi di `.gitignore`): https://developers.cloudflare.com/workers/static-assets/binding/
- Wrangler – Configuration (`main` facoltativo per Worker di soli asset; `html_handling` predefinito
  `auto-trailing-slash`; `not_found_handling` `404-page`/`single-page-application`/`none`; `workers_dev`):
  https://developers.cloudflare.com/workers/wrangler/configuration/
- HTML handling (`/file.html` → redirect 307 a `/file`): https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/
- Static Site Generation e pagine 404 (`404-page` serve il `404.html` più vicino con stato 404):
  https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/
- Headers (`_headers` nella cartella degli asset, non pubblicato, max 100 regole, righe max 2000 caratteri):
  https://developers.cloudflare.com/workers/static-assets/headers/
- Custom Domains (`routes` con `custom_domain: true`; serve una zona Cloudflare attiva; non si crea sopra un CNAME
  esistente; percorso *Settings → Domains & Routes → Add → Custom Domain*):
  https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- Workers Builds (collegamento a GitHub; il nome del Worker deve coincidere con `name` di wrangler):
  https://developers.cloudflare.com/workers/ci-cd/builds/
- Workers Builds – Configuration (build command facoltativo, deploy command predefinito `npx wrangler deploy`,
  branch predefinito `main`): https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Workers Builds – Troubleshooting: https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/
- Rollbacks (*Deployments* → ⋯ → *Rollback*; `wrangler rollback`):
  https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
- Limits (piano Free: 20.000 file per versione, 25 MiB per file): https://developers.cloudflare.com/workers/platform/limits/
- Migrate from Pages to Workers: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/
