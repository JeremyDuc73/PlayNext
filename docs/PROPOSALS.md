# Propositions Steam (P4)

Proposer un jeu Steam au groupe, même si personne ne le possède encore.
Le Store Steam est le seul lien d’achat. Pas d’achat intégré. Prix Store (EUR).

## Flux

1. Groupe → **Proposer un jeu** (haut de page) → recherche Store → valider un titre
2. Encart : jaquette, titre, prix, lien Store, **Sans le jeu**, bulletin **Chaud / Non**
3. Chaque membre vote, y compris le proposant et ceux qui ont le jeu
4. Quand tout le monde a voté, le proposant voit **Créer une soirée** (soirée directe, jeu prérempli)
5. L’auteur ou un admin **Annule** la proposition

Posséder le même titre sur Xbox / Epic compte comme « Possède » (affichage seulement).
Une seule proposition ouverte par jeu Steam et par groupe.

## API

| Méthode | Chemin |
|---------|--------|
| GET | `/steam/search?q=` |
| GET | `/groups/:id/proposals` |
| POST | `/groups/:id/proposals` `{ appId }` |
| POST | `/groups/:id/proposals/:proposalId/reply` `{ value }` |
| POST | `/groups/:id/proposals/:proposalId/close` |

`value` : `hot` · `no`

Recherche : `appId`, `name`, `steamUrl`, `coverUrl`, `priceLabel` (`gratuit` / `19,99 €` / `—`).

## Discord

Embed vermillon, titre cliquable vers le Store, bouton **Store Steam**,
prix, compteur « Possèdent », liste « Sans le jeu ». Pas de mentions.

Si Discord est down, la proposition reste dans l’app.
