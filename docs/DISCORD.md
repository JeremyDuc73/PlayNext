# Bot Discord PlayNext

Le bot n’importe aucun membre. Il poste dans un salon lié :
**Lobby ouvert** (jour/heure, jeu + Store si soirée directe), **Jeu choisi**,
**Proposition Steam** (prix + absents + Store).

Même application Discord que l’OAuth de connexion. Pas de gateway, pas
d’intents privilégiés.

## Configuration

1. [Discord Developer Portal](https://discord.com/developers/applications) →
   ton application PlayNext → **Bot** → Reset Token.
2. Coller le token dans `.env` / `.env.production` :

```text
DISCORD_BOT_TOKEN=
```

Le `DISCORD_CLIENT_ID` OAuth sert aussi à l’URL d’invitation.

3. Relancer l’API.

## Liaison dans l’app

Groupe → **Gérer** → **Salon du groupe** :

1. **Inviter le bot** (permissions : voir le salon, envoyer des messages).
2. Discord : Paramètres → Avancés → **Mode développeur**.
3. Clic droit sur le salon → **Copier l’identifiant du salon**.
4. Coller l’identifiant (ou l’URL `discord.com/channels/…/…`) → **Lier**.

Délier n’expulse pas le bot du serveur.

## Messages

Embeds vermillon (`#e2402c`), pied « PlayNext · Ce soir, on décide. », en-tête de groupe et boutons d’action directs.

- **Salon lié** : message de bienvenue récapitulant les fonctionnalités activées et lien d'installation.
- **Lobby ouvert** : horaire avec compte à rebours dynamique Discord (`<t:unix:F> (<t:unix:R>)`), joueurs convoqués, ambiance, durée ou jaquette du jeu direct + boutons Store Steam / Ouvrir PlayNext.
- **Vote ouvert** : annonce du début du dépouillement secret, liste des jeux sélectionnés du tour, rappel des règles (1 veto) + bouton direct pour voter.
- **Jeu retenu (résultat)** : grande affiche officielle, horaire de session, détail du dépouillement (`Chaud` / `Pourquoi pas`), mention de la roulette en cas d’égalité + bouton Store Steam.
- **Proposition Steam** : vignette du jeu, prix Store EUR, compteur de possession, joueurs sans le jeu + boutons Store Steam et Voter dans PlayNext.
- **Proposition validée** : annonce de l'unanimité du groupe dès que tous les membres ont voté Chaud.

Pas de votes individuels divulgués. Si Discord est indisponible, la soirée et les votes continuent normalement dans l'application.
