# Soirées PlayNext (P3)

Deux parcours : **rituel** (shortlist → votes masqués → veto → résultat) et
**direct** (un jeu Steam + horaire, tampon Je viens, pas de vote).
Toute soirée a une date (`scheduled_at`, fuseau Europe/Paris, défaut 21:00).

## Flux rituel

1. Dans un groupe → **Nouvelle soirée** (Ce soir / autre jour, participants, durée, ambiance)
2. **Lobby** : chaque participant tamponne **Je suis prêt**. L’orga peut **Lancer sans eux** (absents hors tour).
3. Quand tout le monde est prêt (ou l’orga lance), chacun sélectionne 1 à N jeux dans le pool commun
4. L’organisateur lance le vote quand toutes les sélections sont déposées
5. Un seul jeu est affiché à la fois ; tous votent sur ce même jeu
6. Quand tous ont voté, passage automatique au jeu suivant
7. Résultat : **Confirmer** / revoter l’égalité / **Roulette** / nouveau tour / Annuler

Un seul rituel live par groupe (`lobby|selection|voting|revealed`).

## Flux direct

1. Onglet Soirée → **Proposer une soirée** (recherche Store, jour/heure) — ou CTA **Créer une soirée** depuis une proposition
2. Lobby : les participants tamponnent **Je viens**
3. L’orga **Confirme** (tous présents) ou **Lancer sans eux**
4. Écran résultat, un jeu. Pas de shortlist ni de votes

Plusieurs soirées `direct` datées peuvent coexister. L’onglet Soirée les liste (date + titre) puis le détail.

## Contraintes shortlist

Le pool initial est déterministe et vient des bibliothèques des participants ;
chaque joueur ne voit que ses jeux possédés. Les filtres « En commun » et
« Pas en commun » indiquent les jeux absents chez certains joueurs.
Chaque joueur choisit ensuite entre 1 et N jeux, avec N fixé par l’hôte entre 1 et 5.

| Option | Effet |
|--------|--------|
| En commun | `ownedCount === participants` |
| Pas en commun | `ownedCount < participants` + indication des absents |
| Installation | filtre optionnel au lancement du pool |
| Durée | minutes libres entre 15 et 600, ou sans limite |
| Jouable en groupe | exclut les jeux marqués solo (Steam Store + exceptions) |
| Fallback | si 0 résultat → assouplit l’installation |

Diversité : les gagnants récents du groupe sont pénalisés (pas exclus).
La propriété « jouable en groupe » vient du Steam Store (catégories multi / co-op).
Les solo **connus** n’apparaissent ni dans la biblio groupe ni dans le pool de soirée ;
ils restent dans la bibliothèque personnelle (filtre Multi / Solo).
Les titres encore non classés restent visibles dans le groupe le temps du
classement. Steam Store classe les AppIDs Steam **un par un**, avec pause.
Un 429 arrête le run ; un AppID indisponible (200 + success:false) n’est plus
rejoué en boucle. Le même titre est réutilisé pour Xbox / Epic / manuel.
Les jeux absents de Steam sont cherchés par nom dans le Store, puis IGDB
(`game_modes`). Le nom Xbox / Epic est nettoyé (parenthèses, ™, `- WINDOWS`,
`Celebration Edition`) avant la recherche ; un titre collé (`KILLINGFLOOR2BETA`)
matche `Killing Floor 2`. Le profil sépare **en attente**
(pas encore interrogé) et **sans réponse** (catalogues sans mode). Un tampon
**Multi / Solo** sur un titre restant écrit `game_meta` (source `manual`) pour
toutes les copies du même nom : groupes et soirées en héritent. **Annuler**
remet le titre en file. **Relancer les
sans réponse** rouvre uniquement les titres sans mode. LoL / VALORANT sont
toujours multi.

## Scores

- Chaud = 3 · Pourquoi pas = 1 · Pass = 0
- Veto = élimine le jeu ; **1 veto / joueur / soirée** (modifiable tant que le tour est ouvert)
- Départage : score → installés → possédés → roulette

Votes individuels des autres restent privés après révélation (tu vois seulement les totaux + ton vote).

## API

| Méthode | Chemin |
|---------|--------|
| POST | `/groups/:groupId/evenings` `{ kind, scheduledAt, appId? }` |
| GET | `/groups/:groupId/evenings` |
| DELETE | `/groups/:groupId/evenings/history` (propriétaire, terminées / annulées) |
| GET | `/me/open-evenings` |
| GET | `/evenings/:id` |
| POST | `/evenings/:id/ready` |
| POST | `/evenings/:id/open-selection` |
| POST | `/evenings/:id/selections` |
| POST | `/evenings/:id/start-voting` |
| POST | `/evenings/:id/current-vote` |
| POST | `/evenings/:id/revote-tie` |
| POST | `/evenings/:id/votes` |
| POST | `/evenings/:id/reveal` |
| POST | `/evenings/:id/close` |
| POST | `/evenings/:id/roulette` |
| POST | `/evenings/:id/new-round` |
| POST | `/evenings/:id/cancel` |
| DELETE | `/evenings/:id` (propriétaire, terminée / annulée) |

Polling UI ~2,5 s, y compris l’écran idle et les autres onglets
(`GET /me/open-evenings`). WebSocket plus tard.

`GET /groups/:groupId/evenings` renvoie aussi `winnerName`, `kind`, `scheduledAt`, `gameName`.
Sans titre saisi, l’UI affiche **Soirée du JJ/MM/AAAA** (date prévue).
Le propriétaire peut effacer une entrée terminée/annulée, ou tout l’historique d’un coup
(`DELETE …/history` ne touche pas aux soirées en cours).

`kind` : `ritual` (défaut) | `direct`.
`scheduledAt` : ISO, interprété en Europe/Paris à l’affichage.

Statuts rituel : `lobby` → `selection` → `voting` → `revealed` → `closed` / `cancelled`.
Statuts direct : `lobby` → `revealed` → `closed` / `cancelled`.

## Tests moteur

```bash
npm run test:api
```

## Pas encore

- Temps réel WebSocket
- Métadonnées durée catalogue
- Exclusion absents journalisée fine
- Réservation de places chiffrée
