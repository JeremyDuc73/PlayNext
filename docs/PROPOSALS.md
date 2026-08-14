# Propositions Steam (P4)

Proposer un jeu Steam au groupe pour les membres qui ne l’ont pas.
Le Store Steam est le seul lien d’achat. Pas d’achat intégré.

## Flux

1. Groupe → jeu Steam pas possédé par tout le monde → **Proposer**
2. Registre : qui possède / qui n’a pas / réponses
3. Les joueurs sans le jeu tamponnent **Chaud / Pourquoi pas / Plus tard / Non**
4. **Store Steam** ouvre la fiche. Un message part dans le salon Discord s’il est lié.
5. L’auteur ou un admin **Classe** la proposition.

Posséder le même titre sur Xbox / Epic compte comme « Possède ».
On ne propose pas un titre que tout le monde a déjà.

Une seule proposition ouverte par jeu Steam et par groupe.

## API

| Méthode | Chemin |
|---------|--------|
| GET | `/groups/:id/proposals` |
| POST | `/groups/:id/proposals` `{ launcher: "steam", externalId }` |
| POST | `/groups/:id/proposals/:proposalId/reply` `{ value }` |
| POST | `/groups/:id/proposals/:proposalId/close` |

`value` : `hot` · `maybe` · `later` · `no`

## Discord

Embed vermillon, titre cliquable vers le Store, bouton **Store Steam**,
compteur « Possèdent », liste « Sans le jeu ». Pas de mentions.

Si Discord est down, la proposition reste dans l’app.
