# Validation du jeu et de son expérience

Référence : 43 scénarios d’acceptation de DockersSpecs et décisions DEC-001 à DEC-045. Les tests unitaires utilisent des positions pédagogiques réduites pour isoler les règles ; les parcours navigateur utilisent le catalogue complet et le montage initial officiel.

| Domaine | Vérifications |
| --- | --- |
| Catalogue et préparation | 27 cubes, 162 faces, 33 faces par couleur, trois cubes spéciaux, ordre de droite à gauche, couches et centres, tirage de 2 à 4 couleurs |
| Orientation et mouvements | 24 orientations propres, roulement orthogonal, dessus conservé pendant chute, pivot libre au contact, absence de montée, bord et support |
| Blocage et Douane | Surmontement, groupe rangé, couleur sans joueur, déblocage par chute ou masquage, caisse douanière immobile et colonne protégée |
| Score | Multiplicateurs, propriétaire adverse, fusion, figures 7 et 8, absence de recompte statique, nouveau score par dévoilement, double crédit dans l’ordre |
| Tour et historique | Trois coups obligatoires, recherche complète, connexion globale finale, état exact incluant orientation, coups intercalés, fin normale et égalité |
| Abandon | Décompte incluant Douane, échéance inclusive, restauration de zéro à trois mouvements et de tous les gains, transfert de première Douane, ordre des abandons et gagnants |
| Persistance et interface | Reprise de phase, échéance conservée, archives incompatibles, exclusion d’un second onglet, aide clavier, inspection, tablette et vues caméra |

Commandes : `npm test`, `npm run build`, `npm run test:e2e`. Les résultats et captures des parcours navigateur se trouvent dans les sorties Playwright de l’exécution courante, non versionnées.

Une apparition correcte du plateau ne suffit pas : les parcours appliquent réellement les trois mouvements, placent la Douane, changent de joueur et restaurent une partie après expiration. Aucun test ne désactive une assertion du moteur pour rendre un mouvement valide.

## Résultats du 7 octobre 2026

- 59 tests du moteur et de la persistance réussis.
- 10 parcours Playwright réussis dans Chromium, dont une vue tablette, une sélection de cube 3D et le fonctionnement sans WebGL.
- Compilation TypeScript et Vite réussie avec la base de publication `/DockersGame/`.

## Évolution de l’expérience

Référence : `DockersSpecs/evolutions/experience-de-jeu/`, commit `0d30353`, exigences EXP-PL, EXP-BA, EXP-IN, EXP-PI et EXP-CH et 34 scénarios EXP-AC.

Les parcours navigateur couvrent le choix direct de destination, la prévisualisation sans engagement, les doubles activations, le glissement sans coup, le pivot inverse refusé, le demi-tour en un coup, l’orientation gratuite de chute, l’inspection indépendante, les commandes accessibles et l’absence des anciens panneaux permanents. Les tests utilisent les mêmes validations métier que l’application.

Les sorties Playwright contiennent notamment `bascule-immersive.png` et `plateau-tablette.png`. Les captures servent à vérifier la disposition ; elles ne remplacent pas les assertions sur les événements et la sauvegarde.
