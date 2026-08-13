# Bot Discord PlayNext

Le bot n’importe aucun membre. Il poste deux messages dans un salon lié :
**Lobby ouvert** et **On joue ça**.

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

```text
LOBBY
Les Copains
Soirée ouverte · 05 joueurs

ON JOUE ÇA
Hades
Les Copains
```

Pas de votes individuels. Si Discord est down, la soirée continue.
