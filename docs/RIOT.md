# Riot Games

PlayNext détecte séparément les installations locales de :

- League of Legends ;
- VALORANT.

Le scan est local et ne demande pas de connexion Riot. Il vérifie les
métadonnées Riot et la présence des exécutables du jeu. Le chemin d’installation
reste local et n’est jamais envoyé à l’API.

Dans **Bibliothèque**, utiliser **Scan Riot**. Le résultat est synchronisé avec
les identifiants :

```text
riot:league_of_legends
riot:valorant
```

Le Riot Client seul n’est pas ajouté comme jeu. Les deux titres restent séparés
dans la bibliothèque.

Les jaquettes viennent du CDN Twitch (box art 600×800), comme pour les covers
Steam / Xbox / Epic. Un nouveau **Scan Riot** n’est pas obligatoire : la liste
et les soirées résolvent déjà l’URL.
