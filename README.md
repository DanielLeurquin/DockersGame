# DOCKERS — application web locale

Une application en français pour 2 à 4 joueurs sur un appareil partagé. Plateau 3D en bois stylisé, plateau immersif, déplacements directs et inspection 3D indépendante en mode Facile, arbitrage des mouvements, scores événementiels, Douane, chronomètre de cinq minutes et sauvegarde locale.

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

Les spécifications sont dans [DanielLeurquin/DockersSpecs](https://github.com/DanielLeurquin/DockersSpecs), référence métier `5a9759d` et évolution de l’expérience `0d30353` et modes/thème `b76bfc8` et correction du blocage DEC-051 `98e9405`. Les dernières décisions utilisateur priment sur le livret physique. Aucun fichier de DockersSpecs n’est modifié par cette réalisation.

Points essentiels :

- Plateau 7 × 7, cube initial 3 × 3 × 3 au centre ; catalogue exact des 27 ports.
- Trois mouvements, puis décision Douane dans cinq minutes, sans pause. Échéance exacte acceptée.
- Pivot au dessus visible autorisé malgré les contacts latéraux, sauf Douane ou appartenance à un groupe de couleur. Une caisse rangée peut seulement chuter sous conditions. Pas de coup sans effet.
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
- `src/components/Board.tsx` : scène, destinations cliquables, flèches et inspecteur 3D ; les animations ne décident jamais des règles.
- `src/components/GameStage.tsx` : écran immersif, menu flottant, actions directes et panneaux secondaires.
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

## Jouer depuis le plateau

- Sélectionner une caisse, puis choisir **Basculer**, **Chuter** ou **Pivoter** dans le menu flottant. On peut aussi choisir le mode avant la caisse.
- **Bascule** : cliquer une case mise en évidence pour appliquer le coup directement.
- **Chute** : régler au besoin l’orientation d’arrivée avec les flèches gratuites, puis cliquer la case. Le dessus est conservé et l’ensemble coûte un seul coup.
- **Pivot** : cliquer une flèche autour de la caisse pour un quart de tour. Activer « Demi-tour » avant la flèche pour réaliser 180° en un seul coup.
- Les mouvements appliqués sont irréversibles. Survoler une destination ne joue aucun coup. Glisser pour observer et double-cliquer ne doivent pas ajouter un mouvement.
- Choisir **Normal** (par défaut) ou **Facile** avant de commencer. En Normal, aucune inspection ni fiche des six faces. En Facile, l’icône d’œil apparaît seulement pour une caisse ayant au moins un mouvement légal au moment de la consultation ; les caisses surmontées, sous Douane ou sans coup légal sont exclues. Une caisse rangée reste inspectable si elle peut chuter. En phase Douane, aucun mouvement de caisse n’est possible et l’inspection est fermée.
- L’inspection autorisée reste indépendante : tourner le cube ou consulter son dessous ne déplace pas la caisse réelle.
- **Outils** donne accès aux scores, journal, liste des caisses, règles, vues, animations et abandon. Dans **Outils → Commandes accessibles**, ouvrir **Commandes accessibles du mouvement** pour choisir les mêmes actions au clavier, même sans 3D.

Les repères cachés par une caisse ne deviennent pas cliquables à travers celle-ci : passer en vue **Dessus** ou utiliser les commandes accessibles. Les scores de tous les joueurs, le joueur actif, le temps et la progression restent visibles ; ouvrir un panneau ne met pas la partie en pause.

Le mode choisi ne peut pas être changé pendant la partie. Les anciennes sauvegardes sans mode reprennent en Facile, avec la nouvelle restriction aux caisses déplaçables ; leurs positions, scores et échéances restent conservés.

Le thème des quais associe bois chaleureux, sable et bleu marin. L’inspection autorisée affiche uniquement le cube 3D et ses commandes : aucune grille de faces ni direction cardinale. Sans WebGL, l’inspection visuelle est indisponible ; les commandes de jeu accessibles restent utilisables.

À la reprise, la recherche de suite légale est appliquée avec les règles courantes. Une impasse détectée termine la partie aux scores acquis sans restaurer le plateau. Les coups déjà enregistrés ne sont pas annulés par cette correction.
