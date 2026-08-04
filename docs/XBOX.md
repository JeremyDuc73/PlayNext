# Xbox / Microsoft — configuration

## Choix : public client + PKCE (pas de secret)

Pour PlayNext (desktop / localhost), on utilise **uniquement** :

- client **public** + **PKCE**
- `MICROSOFT_CLIENT_ID` seul
- **pas** de `client_secret`

C’est le modèle adapté aux apps desktop (proche de Playnite).  
Le mode Web + secret a été abandonné ici : trop fragile (`AADSTS7000215` / bascules qui brûlent le code OAuth).

## Setup Entra (une fois)

1. [Entra → App registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) (ton directory, pas « Microsoft Services »)
2. **New registration** → `PlayNext`
3. Comptes : **Personal Microsoft accounts only**
4. Onglet **Configuration d’URI de redirection** :
   - Ajouter plateforme **Mobile and desktop applications** (pas seulement Web)
   - URI : `http://localhost:3001/auth/microsoft/callback`
   - Si tu as une entrée **Web** avec la même URI : **supprime-la**  
     (Web = client confidentiel → `AADSTS70002` même avec public flows = Yes)
5. Onglet **Paramètres** → **Allow public client flows** → **Yes**
6. Copier **Application (client) ID** → `.env` :

```env
MICROSOFT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
MICROSOFT_REDIRECT_URI=http://localhost:3001/auth/microsoft/callback
```

Tu peux ignorer / supprimer `MICROSOFT_CLIENT_SECRET`.

Redémarrer l’API, puis lancer **Lier Xbox** dans l’application. La connexion
se fait dans une fenêtre PlayNext dédiée et se ferme après le retour OAuth.

## Ce que fait PlayNext ensuite

1. OAuth Microsoft (PKCE)
2. Tokens Xbox Live (user.auth → XSTS)
3. Historique PC `titlehub` + packages installés locaux (`pfn`)

## Limites

- Pas le catalogue Game Pass entitlements complet
- Un jeu jamais lancé peut manquer
