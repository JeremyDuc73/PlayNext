# Build & test PlayNext on Windows

L’app desktop est la cible V1. Le scan Steam et le login Discord *dans Tauri* se valident sur Windows, pas dans le navigateur WSL.

## Ne pas builder l’installeur depuis WSL

Tu es sous **WSL/Linux**. `npm run tauri:build` ici :

1. exige `cargo` dans le `PATH` ;
2. produirait une binaire **Linux**, pas un `.exe` Windows.

Pour un installateur NSIS testable sur ton PC : **Windows natif** (PowerShell) ou **GitHub Actions**.

## Erreur `cargo: No such file or directory`

Sous WSL, un toolchain local peut exister dans le repo :

```bash
# depuis la racine playnext
source .tools/cargo/env
cargo --version
```

Ça débloque `cargo`, mais **ça ne remplace pas** un build Windows.

## Prérequis (machine Windows native)

- [Node.js 20+](https://nodejs.org/)
- [Rust](https://rustup.rs/) (`rustup` toolchain stable) — installé **côté Windows**, pas seulement WSL
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) avec **Desktop development with C++**
- WebView2 (souvent déjà là sur Win10/11)
- Git (le repo peut être le même dossier via `\\wsl$\...` ou un clone Windows)

Voir : [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

## API accessible depuis Windows

Pendant le dev, l’API peut tourner sous WSL :

```bash
# dans WSL
npm run docker:up
npm run dev:api
```

Sur Windows récents / WSL2, `http://localhost:3001` depuis le navigateur Windows pointe souvent vers WSL.  
Sinon, IP WSL (`hostname -I`) dans la config.

Redirect Discord : `http://localhost:3001/auth/discord/callback`.

## Option A — Build sur Windows (recommandé)

**Ne pas** faire `cd \\wsl$\...` puis `npm` : Windows ne gère pas les UNC comme dossier courant → npm écrit dans `C:\Windows` et plante (`EPERM`).

### A1 — Clone / copie sur un disque Windows (le plus fiable)

```powershell
# Exemple
git clone <ton-repo> C:\dev\playnext
cd C:\dev\playnext
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # si npm.ps1 est bloqué
npm install
cd apps\desktop
npm run tauri:build
```

### A2 — Mapper un lecteur vers WSL (PowerShell)

`pushd` PowerShell **ne mappe pas** de lettre (contrairement à `cmd`) → npm reste en UNC et plante.

```powershell
net use P: \\wsl$\Ubuntu\home\jeremy\projets\playnext
P:
npm.cmd install
cd apps\desktop
npm.cmd run tauri:build
# plus tard : net use P: /delete
```

Ou tout en `cmd.exe` :

```bat
pushd \\wsl$\Ubuntu\home\jeremy\projets\playnext
npm install
cd apps\desktop
npm run tauri:build
popd
```

Artefact :

`apps\desktop\src-tauri\target\release\bundle\nsis\PlayNext-Setup.exe`

Installation par utilisateur avec branding PlayNext : icône, en-tête,
panneau latéral, dossier menu Démarrer et message de fin d’installation.

## Protection Windows et signature

PlayNext ne désactive pas Defender ou SmartScreen. Une application sûre peut
quand même afficher un avertissement si elle est inconnue ou non signée.

Pour supprimer l’avertissement « éditeur inconnu », il faut signer le binaire
et l’installeur avec un certificat de signature de code reconnu.

Le workflow GitHub accepte :

- `WINDOWS_CERTIFICATE_BASE64` — certificat `.pfx` encodé en Base64 ;
- `WINDOWS_CERTIFICATE_PASSWORD` — mot de passe du certificat.

Sans ces secrets, le build reste téléchargeable mais SmartScreen peut demander
une confirmation. Il n’existe pas de réglage applicatif légitime pour
contourner cette protection.

## Option B — GitHub Actions

Push la branche, lance le workflow **Windows build** (ou attends le push sur `main`).  
Télécharge l’artifact `playnext-windows-nsis`.

## Login Discord dans l’app

1. Lance le `.exe` installé (ou `npm run tauri:dev` **sur Windows**).
2. **Continuer avec Discord** ouvre le navigateur.
3. Retour via `playnext://auth/callback?handoff=...`.
4. L’app échange le handoff → session.

L’aperçu web `npm run dev:ui` (WSL) reste OK pour l’UI, pas pour le smoke desktop.

## CI

`.github/workflows/windows-build.yml` → artifact NSIS, signé automatiquement
si les secrets du certificat sont configurés.
