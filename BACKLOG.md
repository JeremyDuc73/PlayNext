# PlayNext — Backlog produit (V1.1)

Source de vérité produit : `PlayNext_Cahier_des_charges_PC_V1.1.pdf`.  
Ce fichier empêche les oublis : **tout ce qui est reporté reste ici**, avec une phase. Rien ne vit uniquement dans le chat.

**Règle :** si on dit « plus tard », on coche / déplace ici le même jour. Pas d’item orphelin.

Statuts : `[ ]` à faire · `[~]` en cours · `[x]` fait · `[-]` abandonné (avec raison)

Phases :

- **P0** — Socle (maintenant)
- **P1** — Bibliothèque locale fiable
- **P2** — Groupes & sync
- **P3** — Soirées & votes
- **P4** — Découvertes & achats
- **P5** — Historique, polish, production
- **Hors V1** — Explicitement hors périmètre CDC (ne pas “oublier” : c’est volontaire)

## Déroulé recommandé (ordre d’exécution)

Ne pas brûler les étapes : chaque palier doit être **démontrable** avant d’empiler la suite.

1. **P0a — Socle API + Discord web** ✅  
   Monorepo, Docker, OAuth cookie sur `localhost`, profil `/auth/me`.

2. **P0b — App Windows smoke-testable** ✅  
   Login Discord via navigateur système + deep link `playnext://`.  
   Build NSIS CI + install sur PC réel + API WSL + CORS `tauri.localhost` validés.

3. **P1a — Scan Steam**  
   Connecteur Rust + fixtures, puis vrai scan sur le PC Windows. Sync API sans chemins. UI bibliothèque perso.

4. **P1b — Autres launchers prioritaires**  
   Epic + Riot (LoL / VALORANT séparés), puis le reste. Correction manuelle dès Steam.

5. **P2 — Groupes**  
   Création, invitations, biblio commune. Bot Discord *après* le parcours app (pas bloquant pour le cœur).

6. **P3 — Soirée + votes + veto**  
   Le produit « ce soir ». Recommandation par règles. Temps réel.

7. **P4 — Achats collectifs**  
   Une fois les soirées stables. Prévoir règle de quorum (pas seulement unanimité).

8. **P5 — Finition prod**  
   Historique, Astro/téléchargement, signature, updater, Caddy, recette CDC.

**Règles de séquence :**
- Pas de polish DA bloquant avant P0b/P1a.
- Pas de 8 launchers avant qu’un Steam → sync → UI marche.
- Bot Discord et site vitrine peuvent avancer en parallèle *légèrement*, jamais à la place du parcours cœur.
- Tout report → journal en bas de ce fichier.

---

## P0 — Socle



### Outillage & architecture

- [x] Monorepo (app desktop, API, infra)
- [x] App Tauri 2 + React + TypeScript + Vite + Rust
- [x] API Fastify (TypeScript)
- [x] PostgreSQL
- [x] Redis (+ BullMQ plus tard dans P2/P5 selon besoin)
- [x] Docker Compose (API, Postgres, Redis)
- [ ] Caddy (HTTPS / reverse proxy) — peut arriver en fin de P0 ou P5
- [x] CI GitHub Actions (build / tests de base)
- [x] Variables d’environnement, secrets hors dépôt
- [x] Structure des commandes natives Tauri (allowlist dès le départ)



### Identité & session

- [x] Discord OAuth2 (scopes minimaux, anti-CSRF) — login, callback, échange code, session cookie (validé en local)
- [~] Profil PlayNext (id, display name, avatar ; perso limitée) — profil Discord de base ; perso limitée plus tard
- [x] Session / jetons (cookie httpOnly 30j, hash en base) — renouvellement/rotation plus tard si besoin
- [~] Révocation Discord → déconnexion propre sans purge immédiate des données groupe — logout local OK ; webhook révocation Discord plus tard
- [x] Persistance de session si Discord indisponible temporairement — session locale indépendante du token Discord



### Distribution minimale

- [~] Installateur Windows (setup) utilisable en interne — cible NSIS + workflow CI ; à valider sur PC
- [x] Deep link `playnext://` + handoff OAuth desktop (cookies browser ≠ WebView Tauri)
- [x] Doc build Windows (`docs/WINDOWS.md`)
- [~] Site vitrine Astro : dossier `apps/web` réservé (pas encore scaffoldé Astro)
  - [ ] Accueil
  - [ ] Téléchargement (version, prérequis, checksum, notes)
  - [ ] Documentation
  - [ ] Invitations / deep links (ouvre l’app ou téléchargement)
  - [ ] Légal (mentions, confidentialité, CGU, contact)



### DA (direction, pas polish)

- [~] Direction artistique originale (éviter look gaming générique violet/cyan) — direction encre / laiton / patine posée
- [x] Tokens CSS (couleurs, typo expressive, atmosphère)
- [ ] Principes UX CDC : états vide / chargement / erreur / hors ligne / MAJ / confidentialité
- [~] Accessibilité de base (focus, contraste, clavier) — focus visible + contraste de base ; approfondir en P5

---



## P1 — Bibliothèque locale



### Connecteurs (ne pas en faire 8 d’un coup, mais tous restent listés)

- [x] Steam (manifestes, AppID, installé ; sync API sans chemins) — validé (~143 possédés)
- [x] Steam Web API possession (profil) — via `STEAM_WEB_API_KEY` + steamId local
- [~] Xbox / Microsoft Store — OAuth public+PKCE + title history validés (~123 jeux web) ; scan AppX installés à valider sur app Windows (voir `docs/XBOX.md`)
- [ ] Epic Games Store
- [ ] Riot natif : League of Legends et VALORANT **séparés**, chemins perso OK ; pas de faux positif Client/Vanguard seuls
- [ ] Battle.net
- [ ] Ubisoft Connect
- [ ] EA app
- [ ] GOG Galaxy
- [ ] Ajout manuel / dossier choisi par l’utilisateur



### Moteur de scan

- [x] Priorité manifestes / registre / emplacements connus (pas de scan disque agressif) — Steam V1
- [ ] Scan différentiel après premier passage
- [ ] Correspondance catalogue + score de confiance
- [ ] Validation UI des associations incertaines
- [ ] Correction manuelle : possédé / installé / non installé / masqué / mauvaise ID
- [ ] Conservation des corrections entre scans



### Sync & privacy scan

- [x] Transmis : id jeu, launcher, installé, lançable, possédé déclaré, date sync — Steam + Xbox (pfn)
- [x] Non transmis : chemins, exécutables, compte Windows, contenu dossiers — rejet API si paths
- [x] Local only : chemins Steam / Xbox jamais renvoyés par les commandes natives
- [ ] Écran / page « Mes données »



### Desktop utilitaires (liés biblio)

- [ ] Sync manuelle / auto à fréquence raisonnable
- [ ] Mode hors ligne limité (biblio locale + dernières données sync)
- [ ] Lancement jeu via launcher / protocole quand fiable
- [ ] Tray / zone de notification (optionnel P1, obligatoire avant prod)
- [ ] Démarrage auto Windows (optionnel)

---



## P2 — Groupes & Discord

- [ ] Création de groupe PlayNext
- [ ] Invitation par lien
- [ ] Invitation / jonction depuis Discord
- [ ] Liaison optionnelle serveur + salon Discord (pas d’import auto de tous les membres)
- [ ] Rôles PlayNext : propriétaire, admin, membre (distincts des rôles Discord)
- [ ] Admin : nom, image, membres, salon notif, préférences collectives
- [ ] Bibliothèques partagées (états utiles uniquement)
- [ ] Masquage d’un jeu au groupe sans le supprimer en local
- [ ] Bot / webhooks Discord :
  - [ ] Nouvelle soirée
  - [ ] Votes terminés (sans votes individuels)
  - [ ] Jeu choisi
  - [ ] Nouvelle proposition d’achat
  - [ ] Accord collectif → invitation soirée
  - [ ] Rappels facultatifs
- [ ] Deep links : Discord / web → ouverture app si installée

---



## P3 — Soirées & votes



### Création de soirée

- [ ] Participants présents
- [ ] Durée
- [ ] Ambiance
- [ ] Contraintes possession / installation
- [ ] Préférences (récents, oubliés, campagne, gratuit, exclusions)



### Recommandation (règles, pas IA obligatoire)

- [ ] Filtres obligatoires (joueurs, plateformes, refus, possession, incompatibilités)
- [ ] Classement (ambiance, installé, envie, fréquence, historique)
- [ ] Diversité de sélection
- [ ] Liste courte 5–12
- [ ] Explications par jeu (possédé X/Y, installé X/Y, durée, modes, dernière soirée)
- [ ] Compatibilité avant popularité ; refus humains non compensés
- [ ] Tests unitaires du moteur



### Votes & veto

- [ ] Votes : Chaud / Pourquoi pas / Pas ce soir / Veto
- [ ] Votes masqués jusqu’à révélation
- [ ] 1 veto / joueur / soirée (règles CDC : dispo, retrait, consommation, restitution, anonymat)
- [ ] Progression « qui a voté » sans révéler le choix
- [ ] Clôture : tous voté / orga / délai
- [ ] Révélation agrégée ; votes individuels privés par défaut
- [ ] Égalités : diversité, historique, roulette
- [ ] Tous éliminés → nouveau tour
- [ ] Membre déconnecté / exclusion absents journalisée
- [ ] Roulette parmi meilleurs acceptés
- [ ] Relancer un tour en retirant refusés
- [ ] Lancement du jeu gagnant
- [ ] Temps réel (WebSocket / Socket.IO) : présence, votes, révélation

---



## P4 — Découvertes & achats

- [ ] Zone Découvertes / propositions
- [ ] Création proposition (catalogue, membres ciblés, message, plateforme, prix, date)
- [ ] Nombre min de joueurs si ciblage partiel
- [ ] Réponses : possède déjà / chaud / pourquoi pas / pas maintenant / pas intéressé
- [ ] Validation (défaut unanimité ciblés) + **réglage de groupe alternatif** (quorum / majorité) pour éviter blocages
- [ ] Prix indicatifs (IsThereAnyDeal ou équivalent) : boutique, région, date, lien ; jamais d’achat intégré
- [ ] Proposition sans prix si pas de donnée fiable
- [ ] Notif baisse de prix opt-in
- [ ] Cycle de vie : ouverte / en attente / validée / refusée / expirée / archivée
- [ ] Conversion proposition validée → soirée préremplie
- [ ] Partage Discord si autorisé

---



## P5 — Historique, qualité, production



### Historique & mémoire de groupe

- [ ] Historique soirées
- [ ] Notes / souvenirs / captures
- [ ] Jeux les plus joués / délaissés
- [ ] Stats légères



### UX écrans restants

- [ ] Accueil (groupes, trouver un jeu, dernière soirée, sync, propositions)
- [ ] Bibliothèque personnelle
- [ ] Bibliothèque groupe
- [ ] Création soirée / salle de vote / résultat
- [ ] Propositions d’achat
- [ ] Paramètres (Discord, scan, auto-start, confidentialité, notifs, MAJ)
- [ ] Mode compact + mode présentation grand écran
- [ ] Respect réduction des animations Windows



### Catalogue & admin

- [ ] Intégration IGDB (images, genres, plateformes, modes, ids)
- [ ] Cache catalogue serveur
- [ ] Outil interne correction associations / doublons
- [ ] Correction communautaire / exceptions par groupe (métadonnées joueurs)



### APIs externes (caractère CDC)

- [ ] Discord OAuth + bot (nécessaire)
- [ ] IGDB (nécessaire)
- [ ] Steam Web API (recommandé)
- [ ] IsThereAnyDeal (optionnel recommandé)
- [ ] Sentry ou équivalent (optionnel prod)
- [ ] Stockage S3-compatible si besoin (évolution)



### Sécurité & confidentialité (checklist prod)

- [ ] Allowlist commandes Tauri
- [ ] Pas de script distant dans l’UI
- [ ] Updater signé + notes de version + report redémarrage
- [ ] Secrets Windows sécurisés
- [ ] Deep links validés (pas de commande arbitraire)
- [ ] AuthZ par appartenance / rôle sur chaque op API
- [ ] Rate limit, validation stricte, journalisation actions sensibles
- [ ] HTTPS partout
- [ ] Sauvegardes chiffrées + test restauration
- [ ] Suppression / anonymisation compte
- [ ] Temps de jeu : usage reco, affichage précis désactivable



### Exploitation

- [ ] Signature code Windows (SmartScreen)
- [ ] Canal stable unique
- [ ] Déploiement Compose sur VPS OVH
- [ ] Postgres/Redis non exposés
- [ ] Sauvegarde quotidienne, rotation logs
- [ ] Surveillance minimale (santé API, disque, jobs, bot)
- [ ] Rollback documenté
- [ ] Domaine playnext.fr / téléchargement officiel



### Qualité & recette CDC

- [ ] Tests unitaires : reco, votes, veto
- [ ] Tests connecteurs (fixtures manifestes anonymisés)
- [ ] Tests Discord / externes mockés
- [ ] E2E : connexion, groupe, scan, soirée, vote, achat
- [ ] Tests install / MAJ / désinstall / cache local
- [ ] A11y parcours essentiels (clavier, contraste, zoom, lecteur d’écran)
- [ ] Critères de recette section 12 du CDC (checklist finale avant pub)



### Perf (cibles CDC — à vérifier, pas estimer ici)

- [ ] App utilisable rapidement à l’ouverture
- [ ] Premier scan avec progression claire
- [ ] Scan incrémental rapide
- [ ] Création / vote réactifs
- [ ] Conso modérée en tray

---



## Risques CDC à traiter (pas des features, mais à ne pas oublier)

- [ ] Connecteurs isolés + fixtures (formats launchers qui bougent)
- [ ] Score de confiance catalogue + validation user + outil admin
- [ ] Cache / dégradé si API externe down
- [ ] Confiance scan : doc, permissions, Mes données
- [ ] SmartScreen / réputation signature
- [ ] Gros groupes : participants par soirée + ciblage propositions
- [ ] Métadonnées jeux incorrectes : source visible + override groupe
- [ ] Discord down : sessions + pas de perte des votes confirmés

---



## Hors V1 (volontaire — ne pas réintroduire par accident)

- [-] Dépendance Playnite
- [-] macOS / Linux
- [-] App mobile
- [-] Bibliothèques consoles
- [-] Achat / paiement intégré
- [-] Chat vocal ou textuel (Discord suffit)
- [-] Remplacer les launchers (téléchargement / MAJ fichiers jeux)
- [-] IA générative obligatoire
- [-] Microservices / K8s / observabilité lourde
- [-] Multiples canaux bêta publics

---



## Journal des reports

Quand on reporte quelque chose hors phase prévue, ajouter une ligne :


| Date | Item | De → Vers | Pourquoi |
| ---- | ---- | --------- | -------- |
| 2026-07-29 | Caddy HTTPS | P0 → P5 | Pas bloquant en local ; requis avant prod publique |
| 2026-07-29 | Scaffold Astro complet | P0 → plus tard P0/P5 | Dossier réservé ; pages après auth + parcours cœur |
| 2026-07-29 | Scan Steam | avant build Win → après P0b | Scan inutile sans app sur le PC Steam |
| 2026-07-29 | Bot Discord complet | P2 tôt → après groupes app | Notifications utiles, pas le cœur décision |


---



## Prochaine action concrète

**P1a en cours** — scan Steam + sync API implémentés (à rebuild Windows pour tester).  
Commit/push de ton côté : CORS, HOST example, Steam Rust, routes `/library/*`, UI.