# DOCKERS — application web locale

Une application en français pour 2 à 4 joueurs sur un appareil partagé. Plateau 3D en bois stylisé, vues fixes, inspection des six faces, arbitrage des mouvements, scores événementiels, Douane, chronomètre de cinq minutes et sauvegarde locale.

## Lancer le projet

Prérequis : Node.js 22.12+ (ou 24) et npm. Utiliser le checkout existant ; une tâche cloud est déjà isolée, aucun worktree supplémentaire n’est nécessaire.

```sh
npm ci
npm run dev
```

Le navigateur ouvre l’application servie par Vite. Pour produire et servir la version de production :

```sh
npm run build
npm run preview
```

L’application fonctionne sans compte ni serveur de parties. Les ressources sont embarquées : pas de téléchargement de texture, de police ou de modèle pendant une partie. La 3D utilise WebGL ; la liste accessible et les commandes de caisses permettent aussi de jouer si la 3D n’est pas disponible. Une connexion n’est pas nécessaire aux règles une fois la page chargée ; cette version ne comporte pas de service worker pour garantir un rechargement hors ligne.

## Vérification

```sh
npm test
npm run test:e2e
```

Les tests navigateur utilisent Chromium système s’il existe. Sinon, installer le navigateur Playwright :

```sh
npx playwright install chromium
```

La compilation TypeScript, les tests de règles et les parcours Playwright sont vérifiés dans GitHub Actions avant le déploiement. Voir [la validation](docs/validation.md).

## Règles de référence

Les spécifications sont dans [DanielLeurquin/DockersSpecs](https://github.com/DanielLeurquin/DockersSpecs), référence de départ `5a9759d`. Les dernières décisions utilisateur priment sur le livret physique. Aucun fichier de DockersSpecs n’est modifié par cette réalisation.

Points essentiels :

- Plateau 7 × 7, cube initial 3 × 3 × 3 au centre ; catalogue exact des 27 ports.
- Trois mouvements, puis décision Douane dans cinq minutes, sans pause. Échéance exacte acceptée.
- Pivot au dessus visible autorisé malgré les contacts et le rangement, sauf Douane. Pas de coup sans effet.
- Aucun retour au même état coordonnées + orientation pendant un tour.
- Connexité par faces exigée au troisième coup ; séparation temporaire autorisée.
- Score immédiat du groupe complet ; un dévoilement peut recréditer un groupe ; gain direct avant gain dévoilé.
- Abandon avant la décision Douane : restaurer plateau et tous les scores du début de tour. Le joueur actif suivant reçoit un tour complet.
- Recherche de séquence légale ; impasse normale : fin aux scores acquis, sans restauration.

## Sauvegarde et chronomètre

Une copie de secours immédiate dans localStorage couvre le rechargement avant la fin d’une écriture asynchrone. IndexedDB conserve une partie courante, le journal, l’instantané de début de tour et l’échéance absolue. La fermeture ou le rechargement ne suspend pas le temps. Une sauvegarde incompatible est conservée, puis archivée lors du lancement d’une nouvelle partie. Les données restent sur le navigateur et l’appareil utilisés ; vider ses données efface les parties.

Les navigateurs disposant de Web Locks empêchent deux onglets de modifier simultanément la même partie. Il s’agit d’un jeu local : le chronomètre utilise l’horloge de l’appareil, pas une horloge serveur anti-triche.

## Déploiement GitHub Pages

Le workflow `.github/workflows/pages.yml` compile avec la base `/DockersGame/`, teste, puis déploie sur GitHub Pages lors d’un push sur `main` ou d’un lancement manuel. Dans **Settings → Pages**, sélectionner **GitHub Actions** comme source. L’activation de Pages relève des paramètres du dépôt ; la présence du workflow ne prouve pas que le site est déjà publié.

## Architecture

- `src/engine/` : catalogue, rotations physiques, géométrie, mouvements, recherche de continuation, scores et transitions de partie. Aucun import React ou Three.js.
- `src/components/Board.tsx` : représentation 3D et caméra ; les animations ne décident jamais des règles.
- `src/storage/` : validation et persistance versionnée.
- `src/App.tsx` : parcours local, inspection, actions, aide, résultat et horloge.
- `tests/` et `e2e/` : vérification métier et navigateur.

Le tutoriel guidé, le multijoueur distant, les comptes et l’IA sont hors du périmètre initial. L’aide intégrée permet de consulter les règles pendant la partie, sans arrêter le chronomètre.

Pour vérifier localement le même chemin que GitHub Pages :

```sh
PAGES_BASE=/DockersGame/ npm run build
PAGES_BASE=/DockersGame/ npm run preview
```

Ouvrir le chemin `/DockersGame/` indiqué par Vite.
