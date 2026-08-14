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

Embed vermillon, pied « PlayNext ». Notification courte + carte :

- Lobby : groupe, horaire, nombre de joueurs, « Soirée ouverte » ; soirée directe : jeu + bouton Store
- Jeu choisi : titre du jeu, groupe, jaquette si connue
- Proposition : titre, prix Store, qui possède / qui n’a pas, bouton Store Steam

Pas de votes individuels. Si Discord est down, la soirée continue.
