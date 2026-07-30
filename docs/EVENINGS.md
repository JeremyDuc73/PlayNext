# Soirées PlayNext (P3)

Choisir un jeu pour ce soir : shortlist depuis la biblio croisée, votes masqués, un veto par joueur, révélation agrégée.

## Flux

1. Dans un groupe → **Lancer la soirée** (participants, durée, ambiance, contraintes)
2. Shortlist 5–12 jeux (moteur de règles, pas d’IA)
3. Chaque participant vote sur **chaque** jeu : Chaud / Pourquoi pas / Pas ce soir / Veto
4. Pendant le vote : on voit *qui a voté*, jamais *quoi*
5. Quand tout le monde a voté (ou orga révèle) → scores agrégés + proposition
6. Orga : **Confirmer** / **Roulette** / **Nouveau tour** / Annuler

## Contraintes shortlist

| Option | Effet |
|--------|--------|
| Tout le monde possède | `ownedCount === participants` |
| Tout le monde a installé | idem pour `installed` |
| Fallback | si 0 résultat → assouplit installé puis possédé |

Diversité : les gagnants récents du groupe sont pénalisés (pas exclus).

## Scores

- Chaud = 3 · Pourquoi pas = 1 · Pas ce soir = 0
- Veto = élimine le jeu ; **1 veto / joueur / soirée** (modifiable tant que le tour est ouvert)
- Départage : score → installés → possédés → roulette

Votes individuels des autres restent privés après révélation (tu vois seulement les totaux + ton vote).

## API

| Méthode | Chemin |
|---------|--------|
| POST | `/groups/:groupId/evenings` |
| GET | `/groups/:groupId/evenings` |
| GET | `/evenings/:id` |
| POST | `/evenings/:id/votes` |
| POST | `/evenings/:id/reveal` |
| POST | `/evenings/:id/close` |
| POST | `/evenings/:id/roulette` |
| POST | `/evenings/:id/new-round` |
| POST | `/evenings/:id/cancel` |

Polling UI ~2,5 s (WebSocket plus tard).

## Tests moteur

```bash
npm run test:api
```

## Pas encore

- Temps réel WebSocket
- Lancement auto du jeu gagnant
- Métadonnées durée/modes catalogue
- Exclusion absents journalisée fine
- Bot Discord notifs
