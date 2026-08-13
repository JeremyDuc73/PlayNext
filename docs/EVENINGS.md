# Soirées PlayNext (P3)

Choisir un jeu pour ce soir : shortlist depuis la biblio croisée, votes masqués, un veto par joueur, révélation agrégée.

## Flux

1. Dans un groupe → **Nouvelle soirée** (participants, durée, ambiance, contraintes)
2. **Lobby** : chaque participant tamponne **Je suis prêt**. L’orga peut **Lancer sans eux** (absents hors tour).
3. Quand tout le monde est prêt (ou l’orga lance), chacun sélectionne 1 à N jeux dans le pool commun
4. L’organisateur lance le vote quand toutes les sélections sont déposées
5. Un seul jeu est affiché à la fois ; tous votent sur ce même jeu
6. Quand tous ont voté, passage automatique au jeu suivant
7. Résultat : **Confirmer** / revoter l’égalité / **Roulette** / nouveau tour / Annuler

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
| Jouable en groupe | exclut les jeux marqués solo par le catalogue launcher |
| Fallback | si 0 résultat → assouplit l’installation |

Diversité : les gagnants récents du groupe sont pénalisés (pas exclus).
La propriété « jouable en groupe » vient du Steam Store quand disponible ;
les exceptions produit restent dans le filtre (ex. Elden Ring).

## Scores

- Chaud = 3 · Pourquoi pas = 1 · Pass = 0
- Veto = élimine le jeu ; **1 veto / joueur / soirée** (modifiable tant que le tour est ouvert)
- Départage : score → installés → possédés → roulette

Votes individuels des autres restent privés après révélation (tu vois seulement les totaux + ton vote).

## API

| Méthode | Chemin |
|---------|--------|
| POST | `/groups/:groupId/evenings` |
| GET | `/groups/:groupId/evenings` |
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

Polling UI ~2,5 s, y compris l’écran idle et les autres onglets
(`GET /me/open-evenings`). WebSocket plus tard.

Statuts : `lobby` → `selection` → `voting` → `revealed` → `closed` / `cancelled`.

## Tests moteur

```bash
npm run test:api
```

## Pas encore

- Temps réel WebSocket
- Métadonnées durée catalogue
- Exclusion absents journalisée fine
