# Epic Games

PlayNext reprend le flux du launcher Epic, comme Playnite :

1. PlayNext ouvre une fenêtre Tauri dédiée ;
2. l’utilisateur se connecte sur Epic ;
3. la fenêtre intercepte `localhost/launcher/authorized?code=...` ;
4. elle se ferme sans afficher de JSON ;
5. l’API échange le code avec le client public du launcher ;
6. **Scanner Epic** synchronise la bibliothèque.

## Configuration

Aucun client Epic personnalisé, callback HTTPS ou secret Epic n’est nécessaire.
Le client public du launcher est utilisé uniquement côté API pour l’échange du
code. Le code d’autorisation n’est jamais affiché ni demandé à l’utilisateur.

## Installation locale

Les jeux installés sont lus depuis :

```text
%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item
```

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
- Aussi exclus : Steam (outils, pas SteamWorld), wallpaper, 3DMark, Aim Lab, Discord, RPG Maker XP
- Les titres viennent du **catalogue** Epic (plus d’IDs hex bruts)
- Jeux gérés par EA/Ubisoft via Epic peuvent encore apparaître
- Rescanne après MAJ pour rafraîchir la liste
