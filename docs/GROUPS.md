# Groupes PlayNext (P2)

Parcours cœur sans bot Discord : créer un groupe, inviter par lien, croiser les bibliothèques, masquer un jeu pour le groupe uniquement.

## Rôles

| Rôle | Pouvoirs |
|------|----------|
| **owner** | Tout + supprimer le groupe, transférer la propriété, promouvoir/rétrograder admins |
| **admin** | Renommer, inviter, révoquer invites, retirer des *membres* |
| **member** | Voir le groupe / la biblio, quitter, masquer ses propres jeux |

Le propriétaire ne peut pas quitter sans transférer (ou supprimer le groupe).

## API (authentifiée)

| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/groups` | Mes groupes |
| POST | `/groups` | Créer `{ name, imageUrl? }` |
| GET | `/groups/:id` | Détail + membres |
| PATCH | `/groups/:id` | Renommer / image (admin+) |
| DELETE | `/groups/:id` | Supprimer (owner) |
| POST | `/groups/:id/leave` | Quitter |
| POST | `/groups/:id/transfer` | `{ userId }` (owner) |
| PATCH | `/groups/:id/members/:userId` | `{ role: "admin" \| "member" }` |
| DELETE | `/groups/:id/members/:userId` | Retirer |
| POST | `/groups/:id/invites` | Créer invite (`expiresInDays`, `maxUses`) |
| GET | `/groups/:id/invites` | Lister (admin+) |
| DELETE | `/groups/:id/invites/:inviteId` | Révoquer |
| GET | `/invites/:code` | Prévisualiser |
| POST | `/invites/:code/join` | Rejoindre |
| GET | `/groups/:id/library` | Biblio croisée |
| POST | `/groups/:id/library/hide` | Masquer mon jeu pour le groupe |
| POST | `/groups/:id/library/unhide` | Réafficher |
| GET | `/groups/:id/library/hidden` | Mes jeux masqués |
| GET | `/groups/:id/discord` | Salon lié (admin+) |
| PUT | `/groups/:id/discord` | `{ channelId }` — lier un salon |
| DELETE | `/groups/:id/discord` | Délier |

## Invitation

- Lien deep link : `playnext://invite/<code>`
- Ou coller le code dans l’app
- Défaut UI : expire en 14 jours
- Pas d’import auto de tout un serveur Discord (volontaire)

## Bibliothèque croisée

- Agrège les `user_games` des membres (`owned`, non `hidden` globalement)
- Exclut les entrées de `group_hidden_games` **par membre**
- Exclut les jeux solo connus (Steam, même titre Xbox/Epic, IGDB manuel, tampon profil). La biblio perso les garde. Le classement Steam reprend tout seul si un 429 a interrompu le tri.
- États utiles : qui possède / qui a installé, compteurs `X/Y`
- Masquer ≠ supprimer de la biblio perso

## Tester solo (1 seul Discord)

```bash
# Compte A = toi (app / Discord normal)
# Crée un groupe → copie le code d’invite

npm run seed:buddy -- --join <CODE>
```

Puis dans un **2ᵉ navigateur / profil** (aperçu Vite, pas forcément Tauri) :

```js
localStorage.setItem("playnext_session", "<token affiché>");
location.reload();
```

Tu es « Buddy Dev » avec quelques jeux sample pour croiser la biblio.

## Pas encore (reste backlog)

- Invitation / jonction depuis Discord
- Image upload (URL optionnelle côté API seulement)
- Préférences collectives soirée
- Ouverture automatique des invitations web dans l’application installée
