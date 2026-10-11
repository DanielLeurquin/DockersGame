# Parties privées en ligne

Référence : [DockersSpecs, DEC-053 à DEC-078](https://github.com/DanielLeurquin/DockersSpecs/blob/main/evolutions/jeu-en-ligne/README.md), commit `9e34ae4`.

## Jouer

Depuis l’accueil, choisir **Jouer en ligne**. Créer une partie avec un pseudo de 4 à 20 caractères et choisir 2 à 4 joueurs, Normal ou Facile. Le salon fournit un code de huit caractères à communiquer. Les invités choisissent Joueur ou Spectateur. Les joueurs confirment **Je suis prêt** ; le responsable lance quand au moins deux joueurs présents sont prêts. Modifier les paramètres retire les confirmations Prêt.

Les pseudos sont comparés après retrait des espaces aux extrémités, normalisation Unicode NFC et passage en minuscules françaises. La longueur compte les caractères perçus (graphèmes), pas les unités UTF-16. Les caractères de contrôle et invisibles sont refusés. Le même pseudo ne peut identifier deux participants, spectateurs compris.

Le code personnel de huit caractères est affiché à l’entrée et copié automatiquement si le navigateur le permet. Sinon, sélectionner le code ou utiliser **Copier**. Conserver ce code privé avec le code de la partie pour reprendre sur un autre appareil. Sur le même navigateur, la session reprend automatiquement. La reprise remplace l’ancienne connexion ; elle ne crée jamais une place supplémentaire. Le code d’invitation ne récupère aucune identité.

Après démarrage, aucun nouveau joueur n’entre. Les spectateurs observent avec les mêmes restrictions Normal/Facile ; aucune commande de jeu ne leur est accordée. Un joueur peut abandonner puis rester en observation. Les codes expirent en fin de partie ; les participants présents voient le résultat pendant une minute, puis le salon ferme.

Avant démarrage, une déconnexion réserve la place et le pseudo pendant 60 secondes. **Quitter** les retire immédiatement. Le rôle du créateur passe au premier joueur arrivé parmi ceux qui restent, après son retrait effectif. Un salon vide ferme après 60 secondes. Un siège déconnecté réservé ne permet pas de lancer avant son retour ou son retrait.

## Architecture

- `server/rooms.ts` : salons, identités, codes, réservations, autorisation, moteur métier et fin.
- `server/http.ts` : API JSON, validation de taille et d’origine, limites de tentatives, hébergement statique facultatif.
- `server/index.ts` : processus Node, échéances et sauvegarde atomique sur disque.
- `src/online/` : interface et sessions, synchronisation par requêtes authentifiées chaque seconde.
- Le plateau existant est réutilisé ; hors tour et en observation, caméra et inspection restent disponibles, les commandes de déplacement sont désactivées.

Le serveur reçoit une intention de mouvement, jamais un score à accepter. Il vérifie l’identité, le siège actif, l’état du plateau, les règles et l’heure de réception. L’échéance exacte est acceptée ; la latence de transmission compte dans les cinq minutes. Un identifiant de requête empêche l’application répétée d’une même commande et un numéro d’événement rejette un coup fondé sur un état périmé.

Les jetons de session utilisent 32 octets aléatoires. Codes d’invitation et personnels utilisent huit caractères dans `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, avec contrôle de collision. Seules les empreintes SHA-256 des jetons et codes personnels sont sauvegardées côté serveur. Le code personnel et le jeton courant restent dans le navigateur pour la reprise. Ils ne sont jamais envoyés dans les URL, la liste des participants ou le journal. Les essais de récupération sont limités ; le serveur ignore les adresses IP déclarées par le client.

Les pulsations définissent une perte de connexion après cinq secondes sans requête. La fermeture de page signale immédiatement une interruption lorsque le navigateur permet la requête de fin de page ; sinon la détection par pulsation s’applique. La réservation démarre au constat serveur. Une connexion temporairement interrompue reprend automatiquement ; une connexion remplacée ne reprend pas automatiquement le contrôle de l’autre appareil.

## Développement

Node.js 22.12+ ou 24, npm.

```sh
npm ci
npm run dev:server
```

Dans un autre terminal :

```sh
npm run dev
```

Vite transmet `/api/online` au serveur sur le port 8787. Pour vérifier le tout :

```sh
npm test
npm run test:e2e
npm run build:all
```

Playwright lance automatiquement le serveur de parties et Vite. Ses données sont dans `../work/playwright-online.json`, hors des fichiers de production.

## Hébergement

Pour un serveur personnel, utiliser [Docker Compose](docker.md) : une image sert le front et le back, avec un volume persistant, tout en acceptant le front GitHub Pages.

**GitHub Pages ne peut pas exécuter le serveur de parties.** Publier le code sur main ou déployer l’interface statique ne fournit pas un service en ligne. Le serveur nécessite un hébergement Node accessible en HTTPS, avec un disque persistant. Aucun hébergeur ni domaine n’est créé par ce changement.

Pour servir l’interface et le serveur depuis le même hébergement :

```sh
npm ci
npm run build:all
PORT=8787 DOCKERS_ORIGINS=https://votre-domaine.example npm start
```

Mettre un proxy HTTPS devant le port choisi. L’origine publique doit être renseignée, notamment si HTTPS est terminé par ce proxy. Garder une seule instance serveur pour partager l’état ; ne pas lancer plusieurs réplicas indépendants avec la même sauvegarde.

Pour garder l’interface sur GitHub Pages, héberger le serveur séparément et définir :

- `DOCKERS_ORIGINS=https://danielleurquin.github.io` sur le serveur (origines exactes séparées par des virgules).
- La variable GitHub Actions **VITE_ONLINE_URL**, avec l’URL HTTPS du serveur, puis relancer le workflow Pages. Cette valeur est publique ; aucun secret n’y est attendu.

Le workflow injecte cette variable dans le build. Si elle est absente, le workflow Pages utilise `https://dockersgame.ma-soluce.com`. Le front de l’image Docker utilise toujours l’API de sa propre origine. Le mode local reste utilisable.

Variables serveur : `PORT` (8787), `DOCKERS_ORIGINS`, `DOCKERS_DATA_FILE` (`data/online.json`) et `DOCKERS_STATIC_DIR` (`dist`). Conserver le répertoire des données sur un volume persistant non servi par le proxy. Le fichier est privé (0600), écrit par remplacement atomique. Au redémarrage, les sessions sont marquées déconnectées, les échéances existantes sont conservées et les joueurs récupèrent leurs places avec leurs secrets. Une sauvegarde illisible arrête le démarrage plutôt que d’effacer les parties.

La première version conserve les salons pendant leur vie puis les supprime à la fermeture, une minute après fin pour les parties. Il n’y a pas de compte, classement public ou historique serveur permanent. La protection opérationnelle (HTTPS, limites de requêtes au proxy, sauvegardes du volume et supervision) relève de l’hébergement. Les limites d’essais ne constituent pas un plafond de spectateurs.

## Validation

Les tests métier existants restent exécutés. Les tests en ligne vérifient les salons isolés, pseudos et secrets, quotas de sièges et observation, Prêt, transfert du créateur, délais de réservation, récupération sur un autre appareil, persistance, coups autoritaires, états périmés et doublons, réception à l’échéance, abandon et expiration. Des clients HTTP réels vérifient CORS, le format des requêtes et la limitation de récupération.

Les parcours Playwright utilisent plusieurs contextes navigateur pour vérifier : salon et coups synchronisés, entrée spectateur après démarrage, refus d’un nouveau joueur, récupération avec remplacement d’appareil, recharge sur le même navigateur, doublon de pseudo et copie manuelle lorsque le presse-papiers est refusé.
