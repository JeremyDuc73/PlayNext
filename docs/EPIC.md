# Epic Games — configuration

PlayNext importe Epic avec un client OAuth PlayNext enregistré :

1. Connexion Epic dans le navigateur ;
2. retour automatique vers PlayNext ;
3. échange serveur du code OAuth ;
4. Bibliothèque possédée via `library-service…/library/api/public/items`
5. Installés locaux via `%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item`

## Configuration Epic

Créer une application/client Epic et enregistrer exactement les callbacks :

```text
http://localhost:3001/auth/epic/callback
https://api.playnext.jeremyduc.dev/auth/epic/callback
```

Renseigner ensuite :

```env
EPIC_CLIENT_ID=...
EPIC_CLIENT_SECRET=...
EPIC_REDIRECT_URI=http://localhost:3001/auth/epic/callback
```

En production, utiliser le callback HTTPS dans `.env.production`.

## Flow utilisateur

1. Connexion PlayNext ;
2. **Lier Epic** ;
3. connexion Epic ;
4. retour automatique dans PlayNext ;
5. **Scanner Epic**.

## Privacy

Transmis : `appName`, nom, installé, possédé.  
**Jamais** : chemins d’install Epic.

## Covers

Au sync, PlayNext lit `keyImages` du catalogue (`DieselGameBoxTall` / `OfferImageTall`) et les cache dans `game_meta`.  
→ **Re-scan Epic** après MAJ pour remplir les affiches.

## Limites

- Le code d’auth expire rapidement
- On ne garde que les **jeux lançables** (filtre catalogue Epic, style Playnite) : pas DLC seuls, extras, plugins, Unreal Engine
- Titres *playtest* / *demo* / *modkit* exclus automatiquement
- Les titres viennent du **catalogue** Epic (plus d’IDs hex bruts)
- Jeux gérés par EA/Ubisoft via Epic peuvent encore apparaître
- Rescanne après MAJ pour rafraîchir la liste
