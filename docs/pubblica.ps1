<#
  pubblica.ps1 - Pubblica Playfair su playfair.statocritico.it

  Cosa fa: controlla git, aggiunge tutte le modifiche, crea un commit con data e ora
  e fa il push su GitHub (ramo main). Cloudflare vede il push e ripubblica il sito
  in 1-2 minuti. Nessuna credenziale in questo file: l'accesso a GitHub lo gestisce
  Git Credential Manager (finestra del browser al primo push).

  Uso, dalla cartella del sito o da qualunque altra:
    .\docs\pubblica.ps1
    .\docs\pubblica.ps1 "Nuovo tema chiaro"
  Se Windows blocca gli script, una volta sola:
    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#>
param(
    [string]$Messaggio = ""
)

# "Continue": git scrive messaggi normali su stderr; gli errori li controlliamo con $LASTEXITCODE.
$ErrorActionPreference = "Continue"

function Scrivi-Ok($t)     { Write-Host "  OK  $t" -ForegroundColor Green }
function Scrivi-Info($t)   { Write-Host "  ..  $t" -ForegroundColor Cyan }
function Esci-Errore($t)   { Write-Host "  !!  $t" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Playfair - pubblicazione" -ForegroundColor Yellow
Write-Host ""

# 1. Git installato?
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Esci-Errore "git non trovato. Installa Git per Windows (https://git-scm.com/download/win) e riapri PowerShell."
}
Scrivi-Ok (git --version)

# 2. Posizionati nella radice del sito (la cartella sopra docs\, dove sta questo script)
$radice = Split-Path -Parent $PSScriptRoot
Set-Location $radice
Scrivi-Info "Cartella: $radice"

if (-not (Test-Path (Join-Path $radice "wrangler.jsonc"))) {
    Esci-Errore "wrangler.jsonc non trovato: lo script deve stare in <cartella del sito>\docs\."
}
if (-not (Test-Path (Join-Path $radice ".git"))) {
    Esci-Errore "Questa cartella non e' ancora un repository git. Segui il passo A di docs\ISTRUZIONI_PUBBLICAZIONE.md."
}

# 3. File che non devono mancare (senza .assetsignore verrebbero pubblicati anche docs\ e wrangler.jsonc)
foreach ($f in @("index.html", ".assetsignore", "_headers")) {
    if (-not (Test-Path (Join-Path $radice $f))) { Esci-Errore "Manca $f nella radice del sito." }
}

# 4. Ramo e collegamento a GitHub
$ramo = (git rev-parse --abbrev-ref HEAD).Trim()
if ($ramo -ne "main") {
    Esci-Errore "Sei sul ramo '$ramo': Cloudflare pubblica solo 'main'. Passa a main con: git switch main"
}
$remoto = git remote get-url origin 2>$null
if (-not $remoto) {
    Esci-Errore "Nessun 'origin'. Esegui: git remote add origin https://github.com/statocritico/playfair.git"
}
Scrivi-Ok "Ramo main -> $remoto"

# 5. Ci sono modifiche?
$modifiche = git status --porcelain
if (-not $modifiche) {
    Scrivi-Info "Nessuna modifica locale."
} else {
    Write-Host ""
    Write-Host "  File modificati:" -ForegroundColor Cyan
    $modifiche | ForEach-Object { Write-Host "     $_" }
    Write-Host ""

    # Messaggio di commit con data e ora (es. "Aggiornamento sito 18/11/2026 17:42 - Nuovo tema")
    $data = Get-Date -Format "dd/MM/yyyy HH:mm"
    $testo = "Aggiornamento sito $data"
    if ($Messaggio.Trim() -ne "") { $testo = "$testo - $($Messaggio.Trim())" }

    git add -A
    if ($LASTEXITCODE -ne 0) { Esci-Errore "git add non riuscito." }
    git commit -m $testo | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Esci-Errore "git commit non riuscito. Se chiede nome ed email: git config --global user.name ""Nome"" e git config --global user.email ""email"""
    }
    Scrivi-Ok "Commit: $testo"
}

# 6. Allinea con GitHub (se qualcuno ha modificato online) e invia
Scrivi-Info "Allineamento con GitHub..."
git pull --rebase origin main
if ($LASTEXITCODE -ne 0) {
    Esci-Errore "Conflitto con le modifiche su GitHub. Risolvi i file indicati, poi: git rebase --continue (oppure git rebase --abort)."
}

Scrivi-Info "Invio a GitHub..."
git push origin main
if ($LASTEXITCODE -ne 0) { Esci-Errore "git push non riuscito (rete o accesso a GitHub)." }

Write-Host ""
Scrivi-Ok "Fatto. Tra 1-2 minuti: https://playfair.statocritico.it"
Write-Host "      Avanzamento: dash.cloudflare.com -> Workers & Pages -> playfair -> Deployments" -ForegroundColor DarkGray
Write-Host ""
