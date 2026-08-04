# PlayNext

Application Windows desktop-first pour aider un groupe d’amis à choisir un jeu rapidement : détection locale, bibliothèques croisées, votes masqués, veto, Discord.

Cahier des charges : `PlayNext_Cahier_des_charges_PC_V1.1.pdf`  
Suivi produit / anti-oubli : [`BACKLOG.md`](./BACKLOG.md)

Licence : [MIT](./LICENSE)

## Structure

```
apps/
  desktop/   # Tauri 2 + React + TypeScript (produit principal)
  api/       # Fastify + PostgreSQL
  web/       # Site Astro public (présentation, téléchargement, docs)
docker-compose.yml
```

## Prérequis

- Node.js 20+
- Docker (Postgres + Redis)
- Rust + dépendances Tauri pour lancer l’app native  
  - Windows : cible principale V1  
  - Linux/WSL : utile pour l’API ; `tauri dev` nécessite les libs WebKit GTK

### Rust local (optionnel, déjà utilisable dans ce repo)

Si besoin d’un toolchain dans le projet :

```bash
export RUSTUP_HOME="$PWD/.tools/rustup"
export CARGO_HOME="$PWD/.tools/cargo"
source "$CARGO_HOME/env"
```

`.tools/` est ignoré par git.

## Démarrage rapide

```bash
cp .env.example .env
npm install
npm run docker:up
npm run dev:api
```

Dans un autre terminal (UI navigateur, sans shell Tauri) :

```bash
npm run dev:ui
```

Site public Astro :

```bash
npm run dev -w @playnext/web
```

App native (quand la toolchain Tauri est prête) :

```bash
npm run dev:desktop
```

## Endpoints API utiles

| Route | Rôle |
|-------|------|
| `GET /health` | Santé API + Postgres |
| `GET /auth/discord/status` | Discord configuré ? |
| `GET /auth/discord` | Démarre OAuth Discord |
| `GET /auth/me` | Session courante |
| `POST /auth/microsoft/start` | Démarre lien Microsoft / Xbox (session requise) |
| `POST /library/sync` | Sync Steam |
| `POST /library/xbox/sync` | Sync Xbox (title history + installés) |
| `POST /auth/epic/exchange` | Lien compte Epic (authorizationCode) |
| `POST /library/epic/sync` | Sync Epic (possédés + installés) |
| `GET /library/me` | Bibliothèque sync |
| `POST /library/manual/search` | Recherche manuelle IGDB |
| `POST /library/manual` | Ajout d’un jeu catalogue à la bibliothèque |

Renseigner Discord (+ optionnel Steam / Microsoft) dans `.env`.  
Xbox : [`docs/XBOX.md`](./docs/XBOX.md) · Epic : [`docs/EPIC.md`](./docs/EPIC.md).

## Scripts root

| Script | Action |
|--------|--------|
| `npm run dev:api` | API en watch |
| `npm run dev:ui` | Frontend Vite |
| `npm run dev:desktop` | Tauri dev |
| `npm run docker:up` | Postgres + Redis |
| `npm run typecheck` | Types API + desktop |
| `npm run build -w @playnext/web` | Build du site public |

## Phase en cours

**P5 — Mise en ligne** : API, site public et workflow Windows prêts ; VPS,
signature et recette finale restent à valider.

Déroulé complet : [`BACKLOG.md`](./BACKLOG.md) (section *Déroulé recommandé*).  
Build Windows : [`docs/WINDOWS.md`](./docs/WINDOWS.md).  
Xbox : [`docs/XBOX.md`](./docs/XBOX.md).
Mise en ligne : [`deploy/README.md`](./deploy/README.md).
Documentation : [`docs/README.md`](./docs/README.md).
