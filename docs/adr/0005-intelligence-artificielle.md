# ADR-0005 - Intelligence artificielle déterministe dans le domaine, sans tâche de fond

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le Donjon doit proposer des monstres dont le comportement varie selon la difficulté,
ainsi que des compagnons permettant à un joueur de partir seul en expédition. Ces
personnages doivent prendre leurs décisions sans navigateur ni intervention humaine.

L'hébergement ne permet aucun processus permanent ni tâche de fond, comme le rappelle
l'[ADR 0004](0004-manches-simultanees.md). Une boucle de jeu exécutée en continu ne peut
donc pas piloter ces personnages.

L'état est reconstruit à partir des événements, selon le principe de l'[ADR 0002](0002-event-sourcing-village.md).
Une manche échue peut aussi être calculée lors d'une lecture, sans être enregistrée,
puis calculée de nouveau par une commande. Les décisions automatiques doivent donner
le même résultat lors de ces calculs successifs et rester rejouables après une évolution
des règles.

## Décision

Les décisions de l'intelligence artificielle sont des fonctions pures du domaine,
appelées uniquement lors de la résolution d'une manche. Elles utilisent exclusivement
le générateur pseudo-aléatoire de cette manche lorsqu'un tirage est nécessaire.
Elles ne lisent ni l'horloge réelle, ni la base de données, ni le réseau.

Le comportement des monstres est isolé derrière le port `MonsterStrategy`. Chaque niveau
de difficulté fournit une stratégie : une cible tirée au hasard en facile ; une cible
qui peut être abattue à coup sûr, puis un héros exposé et affaibli, en difficile.
La résolution conserve la responsabilité de l'ordre des actions et des dégâts.

Le compagnon décide sur la situation du début de manche, sans connaître les choix des
joueurs : il soigne le héros le plus atteint lorsqu'il est en danger, sinon attaque
le monstre le plus affaibli. Il n'agit que si au moins un joueur a choisi une action
pour la manche ; en l'absence de choix humain, il se défend. Seuls les héros incarnés
encore debout sont attendus pour résoudre une manche avant son échéance.

Les résultats de ces décisions, y compris les actions des compagnons et les effets
des attaques des monstres, sont enregistrés dans `RoundResolved`. Le rejeu applique
ces résultats sans exécuter de nouveau les stratégies. Les caractéristiques des
monstres, bonus de difficulté compris, sont enregistrées dans `GameStarted`.

L'équilibre est mesuré par simulation sur des graines fixes, avec plusieurs compositions
et des joueurs actifs ou absents. Les tests statistiques protègent la différence entre
les niveaux, la possibilité de gagner en solo accompagné et la défaite des groupes
entièrement absents. Le niveau difficile ajoute trois points d'attaque aux monstres,
conformément aux mesures obtenues.

## Conséquences

### Positives

- Aucun processus permanent ni service supplémentaire n'est nécessaire : les décisions
  s'intègrent au calcul existant des manches et aux échéances paresseuses.
- Les calculs sont reproductibles entre lectures et commandes. Les tests exacts,
  d'invariant et statistiques utilisent des graines fixes et restent stables.
- Les événements conservent les résultats passés : modifier une stratégie ne réécrit
  pas les décisions déjà enregistrées dans les expéditions jouées.
- Le port de stratégie sépare le choix d'une cible des règles de combat et permet
  d'ajouter un comportement sans modifier la résolution des effets.
- Des milliers d'expéditions peuvent être simulées sans serveur ni base de données,
  pour mesurer l'effet d'un réglage avant sa publication.

### Négatives

- Un personnage piloté par l'ordinateur ne peut pas agir de sa propre initiative
  entre deux échéances ou résolutions. Sans nouvelle commande, les résultats calculés
  à la lecture ne sont toujours pas enregistrés dans le journal.
- La qualité des mesures dépend du comportement des joueurs simulés. Une règle simple
  d'attaque et de défense ne représente pas toutes les tactiques ni la coordination
  de joueurs réels ; les taux de victoire mesurés ne sont pas une promesse en production.
- Une stratégie coûteuse ralentirait les commandes et les lectures qui rattrapent
  plusieurs échéances, puisque les résultats non enregistrés peuvent être recalculés.
- Les stratégies déterministes deviennent prévisibles. Les groupes de quatre héros
  restent très avantagés, même au niveau difficile, dans les simulations actuelles.
- La reproductibilité exige de conserver des entrées explicites et de ne pas introduire
  de source de hasard extérieure au générateur fourni par la manche.

## Alternatives écartées

- **Boucle de jeu dans un processus permanent** : elle ne convient pas à l'hébergement
  et ajouterait une infrastructure inutile pour des décisions prises à la résolution.
- **Décisions calculées par le navigateur d'un joueur** : elles dépendraient de sa
  présence et pourraient être modifiées par le client. Leur calcul pourrait aussi
  nécessiter la divulgation d'informations que la vue doit garder secrètes.
- **Recalcul des décisions lors du rejeu** : une évolution de stratégie ou de réglage
  changerait les parties passées. Enregistrer les résultats permet de reconstruire
  l'historique sans réinterpréter les anciennes décisions.

## Réexamen

Réexaminer cette décision si des personnages doivent réagir en temps réel entre deux
résolutions, si la fin d'une expédition doit être enregistrée sans nouvelle commande,
ou si un service de planification compatible avec l'hébergement devient nécessaire.

Mesurer également le coût des stratégies lors du rattrapage. Une intelligence artificielle
trop coûteuse pour une lecture justifierait de déplacer ou de mémoriser ce calcul.
Si les résultats des joueurs réels divergent des simulations, revoir d'abord les
comportements simulés et les seuils d'équilibrage avant de modifier l'architecture.

## Usage de l'IA générative

Aide à la formulation et à la relecture. Vérification de la décision par rapport aux
consignes du TD7, au domaine, aux résultats du script de simulation et aux tests.
