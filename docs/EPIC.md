# Epic Games — configuration

PlayNext importe Epic **comme Playnite / Legendary** :

1. Login compte Epic → `authorizationCode`
2. Tokens OAuth (client public du **Epic Games Launcher**)
3. Bibliothèque possédée via `library-service…/library/api/public/items`
4. Installés locaux via `%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item`

## Pas de clé `.env`

Contrairement à Steam / Xbox, **aucune variable Epic** n’est requise.  
On utilise le client OAuth public du launcher Epic (même approche que Playnite, Heroic, Legendary).

## Flow utilisateur

1. Login Discord sur `http://localhost:1420`
2. **Connecter Epic** → le champ de code apparaît (rien ne s’ouvre tout seul)
3. Clique **Ouvrir la page Epic** (un seul onglet)
4. Copie `authorizationCode` → colle → **Valider le code**
5. **Scanner Epic**

## Privacy

Transmis : `appName`, nom, installé, possédé.  
**Jamais** : chemins d’install Epic.

## Limites

- Le code d’auth expire vite : colle-le tout de suite
- On ne garde que les **jeux lançables** (filtre catalogue Epic, style Playnite) : pas DLC seuls, extras, plugins, Unreal Engine
- Les titres viennent du **catalogue** Epic (plus d’IDs hex bruts)
- Jeux gérés par EA/Ubisoft via Epic peuvent encore apparaître
- Rescanne après MAJ pour rafraîchir la liste
