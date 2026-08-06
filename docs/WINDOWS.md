# Développement et distribution Windows

PlayNext est une application Windows native. Le développement de l’interface
peut être réalisé sur toute plateforme compatible Node.js ; le scan local,
le shell Tauri et l’installeur doivent être validés sur Windows.

## Prérequis

- Windows 10 ou 11 ;
- Node.js 20 ou supérieur ;
- Rust stable ;
- Visual Studio Build Tools avec **Desktop development with C++** ;
- WebView2 ;
- Git.

Les prérequis Tauri sont détaillés dans la
[documentation officielle](https://v2.tauri.app/start/prerequisites/).

## Développement

Depuis la racine du dépôt :

```powershell
npm install
npm run dev:api
```

Dans un autre terminal :

```powershell
npm run dev:desktop
```

Le mode navigateur est disponible avec :

```powershell
npm run dev:ui
```

Ce mode ne remplace pas la validation du shell Tauri et des fonctions natives.

## Build local

```powershell
npm install
npm run tauri:build -w @playnext/desktop
```

L’installeur NSIS est généré dans :

```text
apps/desktop/src-tauri/target/release/bundle/nsis/PlayNext-Setup.exe
```

L’installeur utilise une installation par utilisateur, une icône PlayNext et
un habillage NSIS personnalisé.

## Build GitHub Actions

Le workflow `Windows build` est déclenché manuellement depuis GitHub Actions.
Il :

1. compile l’application ;
2. génère l’installeur NSIS ;
3. signe les exécutables si un certificat est configuré ;
4. signe l’artefact updater ;
5. publie une Release GitHub avec `PlayNext-Setup.exe`, sa signature et `latest.json`.

Le champ `release_tag` doit contenir un tag versionné, par exemple `v0.2.0`.

Pour préparer une nouvelle release sans modifier les versions à la main :

```bash
npm run release:version -- 0.2.1
```

La commande met à jour la version desktop Tauri, Cargo, npm et le lockfile.

## Signature Windows

Une application non signée peut afficher un avertissement SmartScreen, même si
son contenu est sûr. PlayNext ne désactive pas les protections Windows.

Le workflow accepte un certificat Authenticode `.pfx` via les secrets GitHub :

- `WINDOWS_CERTIFICATE_BASE64` ;
- `WINDOWS_CERTIFICATE_PASSWORD`.

Une alternative gratuite peut être demandée auprès de
[SignPath Foundation](https://signpath.org/) pour un projet open source
éligible.

## Mise à jour intégrée

La première version équipée de l’updater est `v0.2.0`. Elle doit être
installée manuellement une fois. Les versions suivantes vérifient
`latest.json`, téléchargent l’installateur signé et proposent un redémarrage.

Le secret GitHub `TAURI_SIGNING_PRIVATE_KEY` contient la clé privée générée par
`tauri signer generate`. Elle ne doit jamais être commitée. La clé publique est
déjà intégrée à la configuration Tauri.

## Connexion Discord

L’application ouvre le navigateur pour l’authentification Discord, puis revient
dans le shell via le protocole `playnext://`. Le domaine, le callback OAuth et
les variables de production sont documentés dans `deploy/README.md`.

## Validation avant publication

Les parcours suivants doivent être vérifiés sur Windows :

- installation et désinstallation ;
- connexion Discord ;
- détection Steam, Xbox et Epic ;
- création d’un groupe ;
- sélection et vote d’une soirée ;
- lancement et mise à jour de l’application.
