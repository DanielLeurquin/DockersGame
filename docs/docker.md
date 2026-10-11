# Héberger DOCKERS avec Docker Compose

Le même serveur fournit **le front et le back**. Le front construit dans l’image appelle `/api/online` sur sa propre origine. GitHub Pages reste déployé séparément et peut appeler ce même back : les deux interfaces partagent donc les mêmes salons.

## Démarrer sur le serveur personnel

Prérequis : Git, Docker et Docker Compose v2.

```sh
git clone https://github.com/DanielLeurquin/DockersGame.git
cd DockersGame
cp .env.example .env
# Modifier .env avec votre domaine et le port souhaité.
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 dockers-game
```

Le jeu est accessible à `http://ADRESSE_DU_SERVEUR:8787/` (ou au port choisi), et le contrôle de santé à `/health`. Cette adresse permet une vérification sur le réseau local. Le conteneur s’exécute sans privilèges root, avec un système de fichiers en lecture seule, sauf son volume de données.

Pour un accès public, faire pointer un domaine, par exemple `dockersgame.leurquin.org`, vers votre serveur et configurer votre reverse proxy HTTPS existant (Caddy, Traefik ou Nginx) vers le port 8787. Transmettre **tous les chemins**, front, `/api/online/*` et `/health`, sans retirer de préfixe. Le front est prévu à la racine du domaine. Aucun WebSocket n’est nécessaire.

Si le proxy tourne directement sur le serveur, définir `DOCKERS_BIND_ADDRESS=127.0.0.1`. S’il tourne dans un autre conteneur, `127.0.0.1` désigne ce conteneur : connecter les deux services à un réseau Docker commun et cibler `dockers-game:8787`, ou configurer explicitement un accès au port publié de l’hôte.

Dans `.env`, renseigner les origines publiques exactes :

```dotenv
DOCKERS_PORT=8787
DOCKERS_BIND_ADDRESS=127.0.0.1
DOCKERS_ORIGINS=https://danielleurquin.github.io,https://dockersgame.leurquin.org
```

Une origine ne contient ni chemin ni barre finale : pour Pages, ne pas ajouter `/DockersGame/`. Ajouter une autre origine si le front est ouvert via une autre adresse derrière un proxy. Appliquer les modifications avec `docker compose up -d`. HTTPS permet aussi la copie automatique des codes dans les navigateurs qui l’autorisent.

## Cloudflare Tunnel existant

Le tunnel existant est configuré séparément ; ce Compose ne crée pas de tunnel et ne contient aucun jeton Cloudflare.

Configurer le hostname public `dockersgame.leurquin.org` vers :

- `http://localhost:8787` si `cloudflared` tourne directement sur le serveur ; dans ce cas, `DOCKERS_BIND_ADDRESS=127.0.0.1` convient.
- `http://dockers-game:8787` si `cloudflared` partage un réseau Docker avec le jeu ; connecter le service au réseau existant du tunnel.

Acheminer tous les chemins sans restriction de préfixe : le domaine sert le front et le back. Le navigateur accède en HTTPS à Cloudflare ; le tunnel peut joindre le conteneur en HTTP. Aucun port entrant public n’est nécessaire pour ce tunnel.

Pour conserver le jeu sans compte et permettre les appels depuis GitHub Pages, l’API doit être accessible sans écran de connexion Cloudflare Access. Une politique Access exigeant une connexion bloquerait les requêtes de l’interface actuelle. Ne pas mettre de secret de service Cloudflare dans le front.

## Garder GitHub Pages

Le workflow Pages utilise désormais `https://dockersgame.leurquin.org` par défaut. La variable GitHub Actions `VITE_ONLINE_URL`, si elle existe, reste prioritaire : la retirer ou la définir à cette même URL si elle pointe ailleurs. Relancer le workflow Pages après un changement de variable. Le serveur doit être accessible depuis Internet en HTTPS : une adresse LAN seule ne permet pas aux visiteurs de Pages de le rejoindre.

L’image Docker ne reprend pas cette variable : son front utilise toujours son propre back. Les sauvegardes de navigateur restent propres à chaque origine ; pour passer de Pages au front personnel, utiliser le code du salon et le code personnel de récupération. Une seule connexion par joueur reste autorisée.

## Données, mises à jour et arrêt

Le volume nommé `dockers-data` conserve `online.json` après recréation du conteneur. Garder **une seule instance** : les salons et leurs chronomètres reposent sur ce processus, avec sauvegarde sur disque. Un arrêt ne suspend pas les échéances.

```sh
git pull --ff-only
docker compose up -d --build
```

`docker compose down` arrête le service et conserve le volume. **`docker compose down -v` supprime les parties et les secrets sauvegardés.** Le redémarrage automatique intervient après une sortie du processus ou un redémarrage de Docker ; un état `unhealthy` seul ne déclenche pas de redémarrage.

Pour une sauvegarde cohérente, arrêter temporairement le service et copier les données :

```sh
docker compose stop dockers-game
mkdir -p backups
chmod 700 backups
docker compose cp dockers-game:/app/data/online.json ./backups/online.json
chmod 600 backups/online.json
docker compose start dockers-game
```

Le fichier n’existe qu’après une première sauvegarde de salon. Pour restaurer une sauvegarde, arrêter le service, copier le fichier vers `/app/data/online.json` avec `docker compose cp`, vérifier qu’il appartient à l’utilisateur du conteneur (UID 1000) avec les permissions 0600, puis redémarrer. Protéger les sauvegardes : elles contiennent l’état des parties et les empreintes des secrets.
