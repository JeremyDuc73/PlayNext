# Xbox / Microsoft — configuration

PlayNext importe la biblio Xbox **comme Playnite** :

1. Login compte Microsoft (OAuth Live)
2. Échange tokens Xbox Live (user.auth → XSTS)
3. Historique PC via `titlehub.xboxlive.com/.../titlehistory`
4. Packages installés locaux (AppX / Store) matchés par **Package Family Name** (`pfn`)

## Limites (honnêtes)

- Ce n’est **pas** l’API entitlements / catalogue Game Pass complète (réservée aux éditeurs).
- Un jeu Game Pass **jamais lancé** peut manquer ; on tente un enrichissement des packages installés inconnus via `titles/batch`.
- Après résiliation Game Pass, des titres **déjà joués** peuvent encore apparaître.

## Prérequis : un répertoire (tenant) Entra

Microsoft a **désactivé** la création d’apps « hors répertoire ». Un compte perso `@outlook.com` / `@live.com` seul ne suffit plus : il faut un **tenant** (annuaire).

### Chemin le plus simple (recommandé)

1. Ouvre [Créer un compte Azure gratuit](https://azure.microsoft.com/free/) avec **le même** compte Microsoft que ton Xbox.
2. Ça crée automatiquement un répertoire Entra à ton nom.
3. Va sur [Entra admin center — App registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)  
   (plus clair que le portail Azure général).
4. En haut à droite : vérifie que tu es dans **ton** répertoire (pas « Microsoft Services »).

Alternative gratuite sans carte : [Microsoft 365 Developer Program](https://developer.microsoft.com/microsoft-365/dev-program) (sandbox + tenant).

### Erreurs fréquentes

| Message | Cause | Fix |
|--------|--------|-----|
| « créer des applications hors d’un répertoire a été déconseillée » | Pas de tenant | Créer un compte Azure free / M365 dev program |
| `AADSTS16000` / compte live.com absent du tenant « Microsoft Services » | Mauvais contexte de portail | Se déconnecter, rouvrir [entra.microsoft.com](https://entra.microsoft.com/), choisir **ton** directory |

## Enregistrer l’app PlayNext

1. **App registrations** → **New registration**
2. Name : `PlayNext`
3. Supported account types : **Personal Microsoft accounts only**  
   (ou « Accounts in any org directory and personal Microsoft accounts » si l’option perso-only n’apparaît pas)
4. Redirect URI :
   - Platform : **Web**
   - URI : `http://localhost:3001/auth/microsoft/callback`
5. Copier **Application (client) ID** → `MICROSOFT_CLIENT_ID` dans `.env`
6. **Certificates & secrets** → New client secret → `MICROSOFT_CLIENT_SECRET`  
   (recommandé pour une redirect Web)

Scopes OAuth utilisés : `Xboxlive.signin` `Xboxlive.offline_access`.

## Variables `.env`

```env
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=http://localhost:3001/auth/microsoft/callback
```

Redémarrer l’API après modification.

## Flow utilisateur (desktop)

1. Se connecter Discord (session PlayNext)
2. **Connecter Microsoft** → navigateur → compte MS / Xbox
3. Deep link `playnext://auth/microsoft?ok=1`
4. **Scanner Xbox** → historique + installés locaux → sync `launcher: xbox`

## Privacy

Transmis : `pfn` / title id logique, nom, installé, possédé.  
**Jamais** : chemins d’install, compte Windows, contenu des dossiers.
