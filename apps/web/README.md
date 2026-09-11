# @playnext/web

Site vitrine PlayNext (Astro).

## Pages

- `/` — présentation et parcours produit ;
- `/download` — téléchargement du setup Windows GitHub ;
- `/docs` — fonctionnement et données ;
- `/admin` — compteurs d’utilisateurs actifs et statistiques ;
- `/legal` — informations du projet.

## Développement

```bash
npm run dev -w @playnext/web
npm run build -w @playnext/web
```

Production : générer `apps/web/dist/` puis le servir derrière Caddy ou Nginx
sur `https://playnext.jeremyduc.dev`.
