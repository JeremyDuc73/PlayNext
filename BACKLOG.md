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
3. **P1a — Scan Steam** ✅
  Connecteur Rust + fixtures, puis vrai scan sur le PC Windows. Sync API sans chemins. UI bibliothèque perso.
4. **P1b — Autres launchers prioritaires** ✅ (partiel)
   Steam + Xbox + Epic + Riot local OK. Autres launchers **en pause**.
5. **P2 — Groupes** ← **cœur app OK**
  Création, invitations lien, rôles, biblio croisée, masquage. Salon Discord notifs OK. Invitation depuis Discord *après*.
6. **P3 — Soirée + votes + veto** ← **cœur OK**
  Shortlist, votes masqués, veto, révélation. WebSocket *après* (polling pour l’instant).
7. **P4 — Achats collectifs**
  Une fois les soirées stables. Prévoir règle de quorum (pas seulement unanimité).
8. **P5 — Finition prod** ← **en cours**
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
- [x] Caddy (HTTPS / reverse proxy) — site et API accessibles sur le VPS
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

- [~] Installateur Windows (setup) — NSIS custom, workflow manuel ; validation sur PC/signature restante

- [x] Deep link `playnext://` + handoff OAuth desktop (cookies browser ≠ WebView Tauri)
- [x] Doc build Windows (`docs/WINDOWS.md`)
- [x] Site vitrine Astro scaffoldé
  - [x] Accueil
  - [x] Téléchargement (version, prérequis, signature)
  - [x] Documentation
  - [~] Invitations / deep links (ouverture app à finaliser)
  - [x] Légal minimal

### DA (direction, pas polish)

- [x] Direction artistique — **« BULLETIN »** (Tailwind + GSAP) : encre, filets, blocs inversés, tampons
- [x] Tokens CSS + composants `apps/desktop/src/ui/*`
- [x] Covers launcher (Steam CDN, TitleHub, Epic, Riot/Twitch) ; IGDB manuel pour le catalogue

- [~] Principes UX CDC : vide / chargement de base ; hors ligne / MAJ / confidentialité à approfondir
- [~] Accessibilité de base (focus, contraste, clavier) — focus visible + contraste ; approfondir en P5

- [x] Site Astro vitrine + install — build et première mise en ligne validés

---

## P1 — Bibliothèque locale

### Connecteurs (ne pas en faire 8 d’un coup, mais tous restent listés)

- [x] Steam (manifestes, AppID, installé ; sync API sans chemins) — validé (~143 possédés)
- [x] Steam Web API possession (profil) — via `STEAM_WEB_API_KEY` + steamId local
- [x] Xbox / Microsoft Store — OAuth public+PKCE + title history + AppX installés (validé Windows)
- [x] Epic Games Store — client public launcher, login WebView Tauri, library/catalogue + manifests `.item` (voir `docs/EPIC.md`)
- [x] Riot local : League of Legends et VALORANT **séparés** — validé sur Windows
- [x] Jaquettes Riot (LoL, VALORANT) — box art Twitch
- [ ] Battle.net — plus tard
- [ ] Ubisoft Connect — plus tard
- [x] Ajout manuel depuis le catalogue IGDB ; dossier local choisi plus tard

### Moteur de scan

- [x] Priorité manifestes / registre / emplacements connus (pas de scan disque agressif) — Steam V1

### Sync & privacy scan

- [x] Transmis : id jeu, launcher, installé, lançable, possédé déclaré, date sync — Steam + Xbox (pfn)
- [x] Non transmis : chemins, exécutables, compte Windows, contenu dossiers — rejet API si paths
- [x] Local only : chemins Steam / Xbox jamais renvoyés par les commandes natives
- [x] Écran / page « Mes données »

### Desktop utilitaires (liés biblio)

- [x] Sync manuelle
- [x] Mode hors ligne limité (biblio locale + dernières données sync)

### Filtres biblio

- [x] Exclusions playtest / demo / modkit (`isJunkGameName`)
- [x] Exclusions outils : steam (hors SteamWorld), wallpaper, 3DMark, Aim Lab, Discord, RPG Maker XP
- [x] Classement multi / solo : Steam + IGDB, tampon manuel sur les restants, relance des sans réponse

---

## P2 — Groupes & Discord

- [x] Création de groupe PlayNext
- [x] Invitation par lien (`playnext://invite/<code>` + collage code)
- [ ] Invitation / jonction depuis Discord
- [x] Liaison optionnelle serveur + salon Discord (pas d’import auto de tous les membres)
- [x] Rôles PlayNext : propriétaire, admin, membre (distincts des rôles Discord)

- [~] Admin : nom, membres, salon Discord OK ; image URL API seule (pas d’upload) ; préférences collectives plus tard

- [x] Bibliothèques partagées (états utiles uniquement) — possédé / installé par membre
- [x] Masquage d’un jeu au groupe sans le supprimer en local
- [x] Bot / webhooks Discord :
  - [x] Nouvelle soirée (Lobby)
  - [ ] Votes terminés (sans votes individuels)
  - [x] Jeu choisi
  - [ ] Proposition de soirée (jeu + places)
  - [x] Nouvelle proposition d’achat
  - [ ] Accord collectif → invitation soirée
  - [ ] Rappels facultatifs

- [~] Deep links : invite → app OK ; Discord / web → ouverture app si installée

Doc : `docs/GROUPS.md` · bot : `docs/DISCORD.md`

---

## P3 — Soirées & votes

Doc : `docs/EVENINGS.md`

### Création de soirée

- [x] Participants présents
- [x] Durée
- [x] Ambiance
- [x] Sélection depuis les bibliothèques personnelles / installation optionnelle
- [ ] Proposition directe : un membre choisit un jeu + un max de places (soirée sans shortlist / votes)
  - [ ] Annonce Discord (salon du groupe) — plus tard
  - [ ] Réservation des places par les autres membres — plus tard

- [~] Préférences (récents via diversité gagnants ; oubliés / campagne / gratuit / exclusions fines plus tard)

### Recommandation (règles, pas IA obligatoire)

- [x] Filtres obligatoires (participants / compatibilité) + installation optionnelle
- [x] Soirées / groupes : hors solo (Steam Store + même titre Xbox/Epic + IGDB manuel)

- [~] Classement (installé, possession, diversité récents ; envie/fréquence/historique enrichis plus tard)

- [x] Diversité de sélection (pénalité gagnants récents)
- [x] Pool personnel complet + maximum de sélection 1–5
- [x] Explications par jeu (possédé X/Y, installé X/Y ; mode groupe catalogué si disponible)
- [x] Compatibilité avant popularité ; veto non compensé
- [x] Tests unitaires du moteur (`npm run test:api`)

### Votes & veto

- [x] Phase de sélection personnelle depuis la bibliothèque (1–5 jeux) avant le vote
- [x] Lobby : présence tamponnée avant la sélection ; l’orga peut lancer sans les absents
- [x] Vote séquentiel synchronisé, jeu par jeu
- [x] Re-vote des égalités ou roulette au résultat
- [x] Votes : Chaud / Pourquoi pas / Pass / Veto
- [x] Votes masqués jusqu’à révélation
- [x] 1 veto / joueur / soirée (retrait possible tant que le tour est ouvert)
- [x] Progression « qui a voté » sans révéler le choix
- [x] Clôture : tous voté / orga révèle ; délai `closes_at` prévu côté API
- [x] Révélation agrégée ; votes individuels privés par défaut
- [x] Égalités : installé / possédé / roulette
- [x] Tous éliminés → nouveau tour
- [~] Membre déconnecté / exclusion absents journalisée — « Lancer sans eux » au Lobby (`present = false`)
- [x] Roulette parmi meilleurs acceptés
- [x] Relancer un tour en retirant refusés
- [-] Lancement du jeu gagnant — abandonné : l’affichage du résultat suffit

- [~] Temps réel : polling UI 2,5 s (soirée live + idle + autres onglets) ; WebSocket plus tard

---

## P4 — Découvertes & achats

- [x] Zone Découvertes / propositions
- [x] Création proposition (Steam, membres sans le jeu, Store)
- [ ] Nombre min de joueurs si ciblage partiel
- [x] Réponses : possède déjà / chaud / pourquoi pas / plus tard / non
- [ ] Validation (défaut unanimité ciblés) + **réglage de groupe alternatif** (quorum / majorité) pour éviter blocages
- [ ] Prix indicatifs (IsThereAnyDeal ou équivalent) : boutique, région, date, lien ; jamais d’achat intégré
- [x] Proposition sans prix si pas de donnée fiable — lien Store Steam uniquement
- [ ] Notif baisse de prix opt-in
- [~] Cycle de vie : ouverte / classée (refusée / expirée / archivée plus tard)
- [ ] Conversion proposition validée → soirée préremplie
- [x] Partage Discord si autorisé

---

## P5 — Historique, qualité, production

### Historique & mémoire de groupe

- [x] Historique soirées — nom, jeu choisi, suppression (propriétaire)

- [ ] Notes / souvenirs / captures
- [ ] Jeux les plus joués / délaissés
- [ ] Stats légères

### UX écrans restants

- [~] Accueil (groupes, trouver un jeu, dernière soirée, sync, propositions)

- [x] Bibliothèque personnelle
- [x] Propositions d’achat — Steam, groupe, Store Discord
- [ ] Paramètres (Discord, scan, auto-start, confidentialité, notifs, MAJ)
- [ ] Mode compact + mode présentation grand écran
- [ ] Respect réduction des animations Windows

### Catalogue & admin

- [~] IGDB manuel uniquement — recherche et ajout catalogue ; pas de sync automatique

- [ ] Cache catalogue serveur
- [ ] Outil interne correction associations / doublons
- [ ] Correction communautaire / exceptions par groupe (métadonnées joueurs)

### APIs externes (caractère CDC)

- [~] Discord OAuth + bot — OAuth + notifs salon ; invitation / jonction Discord plus tard
- [~] IGDB — utilisé pour les ajouts manuels uniquement

- [x] Steam Web API (recommandé)
- [ ] IsThereAnyDeal (optionnel recommandé)
- [ ] Sentry ou équivalent (optionnel prod)
- [ ] Stockage S3-compatible si besoin (évolution)

### Sécurité & confidentialité (checklist prod)

- [x] Allowlist commandes Tauri
- [x] Pas de script distant dans l’UI
- [ ] Updater signé + notes de version + report redémarrage
- [ ] Secrets Windows sécurisés
- [ ] Deep links validés (pas de commande arbitraire)
- [x] AuthZ par appartenance / rôle sur les opérations principales
- [ ] Rate limit, validation stricte, journalisation actions sensibles

- [~] HTTPS partout — Caddy configuré, validation VPS en cours

- [ ] Sauvegardes chiffrées + test restauration
- [ ] Suppression / anonymisation compte
- [ ] Temps de jeu : usage reco, affichage précis désactivable

### Exploitation

- [~] Signature code Windows (SmartScreen) — pipeline prêt, candidature SignPath à faire

- [ ] Canal stable unique

- [~] Déploiement Compose sur VPS OVH — première mise en ligne validée, automatisation à tester

- [x] Postgres/Redis non exposés dans le compose de production
- [ ] Sauvegarde quotidienne, rotation logs
- [ ] Surveillance minimale (santé API, disque, jobs, bot)
- [ ] Rollback documenté
- [x] Domaine `playnext.jeremyduc.dev` / API HTTPS en ligne ; Release Windows à publier

### Qualité & recette CDC

- [x] Tests unitaires : moteur de reco, votes, veto
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


| Date       | Item                                          | De → Vers                       | Pourquoi                                           |
| ---------- | --------------------------------------------- | ------------------------------- | -------------------------------------------------- |
| 2026-07-29 | Caddy HTTPS                                   | P0 → P5                         | Pas bloquant en local ; requis avant prod publique |
| 2026-07-29 | Scaffold Astro complet                        | P0 → plus tard P0/P5            | Dossier réservé ; pages après auth + parcours cœur |
| 2026-07-29 | Scan Steam                                    | avant build Win → après P0b     | Scan inutile sans app sur le PC Steam              |
| 2026-07-29 | Bot Discord complet                           | P2 tôt → après groupes app      | Notifications utiles, pas le cœur décision         |
| 2026-07-30 | Autres launchers (Riot, Battle.net, …)        | P1 → plus tard                  | Steam/Xbox/Epic suffisent ; on passe aux groupes   |
| 2026-07-30 | Bot Discord + salon notif + prefs collectives | P2 → après cœur groupes         | Groupes app d’abord ; bot ensuite                  |
| 2026-07-30 | WebSocket soirées                             | P3 → après polling              | Flux sync d’abord ; realtime ensuite               |
| 2026-07-30 | Site Astro vitrine/install                    | P0/P5 → après itération desktop | Tester dans l’app d’abord                          |
| 2026-08-13 | Lancement du jeu gagnant                      | P3 → abandonné                  | L’affichage du résultat suffit                     |
| 2026-08-13 | Proposition soirée : Discord + réservation    | P3 → après le flux jeu + places | D’abord créer/proposer ; notif et places ensuite   |


---

## Prochaine action concrète

**P4 suite** — quorum / conversion proposition → soirée, ou **P5** (installeur signé, release).