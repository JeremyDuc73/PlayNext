# Première mise en ligne

## URLs publiques

- Site : `https://playnext.jeremyduc.dev`
- API : `https://api.playnext.jeremyduc.dev`
- Discord OAuth callback :
  `https://api.playnext.jeremyduc.dev/auth/discord/callback`
- Microsoft/Xbox callback :
  `https://api.playnext.jeremyduc.dev/auth/microsoft/callback`

Epic n’a aucune URL de callback publique : l’application Windows intercepte
le retour local du launcher dans une fenêtre Tauri. Aucun client Epic dédié ni
secret Epic n’est nécessaire.

Créer deux entrées DNS A vers le VPS :

```text
playnext.jeremyduc.dev      → IP_DU_VPS
api.playnext.jeremyduc.dev  → IP_DU_VPS
```

## Discord Developer Portal

Dans OAuth2 → Redirects, ajouter exactement :

```text
https://api.playnext.jeremyduc.dev/auth/discord/callback
```

Les valeurs de production sont dans `deploy/.env.production.example`.
Ne jamais copier `.env` dans Git.

Bot de notifications : même application, token Bot, voir
[`docs/DISCORD.md`](../docs/DISCORD.md).

## Caddy sur l’hôte

Dans ton cas, Caddy n’apparaît pas dans `docker ps` : il est probablement
installé comme service Ubuntu. Le fichier `deploy/Caddyfile.example` utilise
donc les chemins et ports de l’hôte :

- site : `/var/www/playnext/apps/web/dist` ;
- API : `127.0.0.1:3101` (Cinezone utilise déjà le port `3001`).

Le site Astro est statique :

```bash
npm run build -w @playnext/web
```

Le build reste directement dans le clone `/var/www/playnext`.
Caddy fournit automatiquement HTTPS pour les deux domaines.

## API Docker de production

Sur le VPS :

1. Copier `deploy/.env.production.example` vers `deploy/.env.production`.
2. Renseigner `DATABASE_URL`, `SESSION_SECRET`, Discord et les services voulus.
3. Renseigner `POSTGRES_PASSWORD`.
4. Lancer le compose de production :

```bash
cd /var/www/playnext
docker compose \
  --env-file deploy/.env.production \
  -f deploy/docker-compose.production.yml \
  up -d --build
```

L’API écoute seulement sur `127.0.0.1:3101`; elle n’est pas exposée directement
sur internet. Vérifier :

```bash
curl https://api.playnext.jeremyduc.dev/health
```

## Déploiement automatique GitHub

`.github/workflows/deploy-production.yml` déploie sur `main` :

1. build du site Astro ;
2. copie de `apps/web/dist/` ;
3. mise à jour du dépôt VPS ;
4. rebuild du conteneur API ;
5. smoke test `/health`.

Créer dans GitHub Actions → Secrets :

- `VPS_HOST` — nom ou IP du VPS ;
- `VPS_USER` — ici probablement `ubuntu` ;
- `VPS_SSH_KEY` — clé privée complète, jamais la clé publique ;
- `VPS_APP_PATH` — `/var/www/playnext` ;
- `VPS_WEB_PATH` — `/var/www/playnext/apps/web/dist`.

Le workflow utilise l’environnement GitHub `production`. Tu peux lui ajouter
une approbation manuelle dans GitHub avant de passer à un déploiement
automatique sans validation.

## Installer Windows depuis GitHub

Le workflow Windows est déclenché manuellement et publie un artifact ainsi
qu’une Release GitHub :

```bash
Dans GitHub Actions → **Windows build** → **Run workflow**, renseigner le tag
`v0.2.0`.
```

La page `/download` pointe vers le setup de la dernière Release.

## Signature Windows

Ajouter dans GitHub Actions → Secrets :

- `WINDOWS_CERTIFICATE_BASE64` : fichier `.pfx` encodé en Base64 ;
- `WINDOWS_CERTIFICATE_PASSWORD` : mot de passe du `.pfx`.

## Mise à jour intégrée

La version `v0.2.0` active l’updater Tauri. Ajouter aussi :

- `TAURI_SIGNING_PRIVATE_KEY` : contenu de `.tools/playnext-updater.key` ;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` : laisser vide pour la clé actuelle.

Ne jamais publier la clé privée. Le workflow publie `latest.json`, la signature
et l’installateur nécessaires aux versions suivantes.

Sans certificat reconnu, l’installeur est fonctionnel et personnalisé mais
SmartScreen peut afficher « éditeur inconnu ». Il ne faut pas désactiver
Defender pour contourner cela.
