# ADR-0006 - Séparer les modèles de lecture et les tenir à jour par des projections rattrapées à la lecture

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le classement et la liste des expéditions ouvertes traversent les flux du Village et
du Donjon. Rejouer leurs événements à chaque consultation fait croître le coût avec
l'historique du jeu, même si peu de faits nouveaux ont été enregistrés. La dette
DT-005 décrit cette limite pour la liste des expéditions ouvertes.

L'hébergement ne permet aucun processus permanent chargé de surveiller le journal,
comme le rappelle l'[ADR 0004](0004-manches-simultanees.md). Les mises à jour doivent
s'exécuter dans les requêtes de l'application.

Le journal, source de vérité selon l'[ADR 0002](0002-event-sourcing-village.md), attribue
à chaque événement une position globale croissante mais non continue. Une insertion
annulée consomme une position ; des insertions concurrentes peuvent aussi devenir
visibles dans un ordre différent de celui des positions attribuées.

## Décision

Les lectures transversales utilisent des modèles de lecture, conservés dans le schéma
PostgreSQL de leur module : `ranking` pour le classement, `dungeon` pour les expéditions
ouvertes. Les commandes continuent à décider à partir du modèle d'écriture. Une table
de lecture ne devient jamais une source de vérité pour les règles du jeu.

Chaque modèle est construit par une projection. La table `platform.projections` conserve
son nom, sa position de reprise et sa version. Le moteur lit le journal dans l'ordre
global, par lots, et ne traite que ce qui suit le point de reprise. Il examine toutes
les positions, même lorsque le type d'événement n'intéresse pas la projection.

La consultation rattrape la projection avant de lire ses tables. Le rattrapage verrouille
le point de reprise et met à jour les tables et ce point dans une même transaction.
Deux rattrapages de la même projection sont ainsi sérialisés ; un échec annule ensemble
les données calculées et leur progression. Cette écriture dans des données dérivées
n'ajoute aucun événement et ne modifie pas l'histoire du jeu.

Devant une position manquante, le rattrapage s'arrête tant que l'événement suivant a
moins de cinq secondes. Passé ce délai, il franchit le trou. Cette règle repose sur
l'hypothèse que les insertions du journal se terminent en moins de cinq secondes ;
ce délai ne constitue pas une preuve de validation des transactions précédentes.

Chaque changement du contenu calculé augmente la version de la projection. Une version
plus élevée que celle des tables déclenche leur reconstruction transactionnelle depuis
le début du journal. Une version de code plus ancienne s'abstient de les modifier lors
du rattrapage, pour préserver les données construites par une version plus récente.

Le classement dispose d'un canal global discret. Il annonce uniquement la position,
le type, la version et le flux des événements concernés, sans leurs données. L'interface
relit le classement jusqu'à ce que sa position atteigne celle annoncée, avec un nombre
limité de tentatives pour ne pas interroger indéfiniment un service indisponible.

## Conséquences

### Positives

- Après le rattrapage initial, le travail de projection dépend des nouveaux événements,
  et la consultation utilise des tables adaptées au tri et au filtrage.
- Le Village et le Donjon écrivent leurs événements sans connaître les projections
  des autres modules qui les liront.
- Une nouvelle information, comme le meilleur butin, peut être calculée pour tout
  l'historique par reconstruction, sans corriger les événements ni migrer leurs données.
- Les projections sont mises à jour et reconstruites sans tâche de fond ni intervention
  manuelle après un déploiement.
- Les transactions et les points de reprise permettent de reprendre après un échec
  sans compter une victoire ou un héros plusieurs fois.

### Négatives

- La cohérence est différée : les tables peuvent avoir quelques secondes de retard,
  notamment lorsque le moteur attend devant une position manquante récente.
- La reconstruction s'exécute pendant une consultation. Son coût augmente avec le journal
  et finira par dépasser la durée maximale d'une fonction de l'hébergement.
- Un retour à une ancienne version de l'application peut laisser une projection figée
  jusqu'au déploiement d'un code compatible avec la version déjà enregistrée.
- Le Classement dépend des noms et des données publiés par les autres modules. Ajouter
  ou modifier un événement impose de réexaminer ses lecteurs ; un oubli peut rester
  silencieux, comme pour le comptage des compagnons dans une liste d'expéditions.
- Le verrou du point de reprise sérialise les rattrapages d'une même projection. Une
  forte concurrence peut transformer cette protection en point d'attente.
- Le canal global rend visibles des métadonnées d'activité. Son caractère discret
  protège les données des événements, mais ne dispense pas d'examiner ces métadonnées
  dans la revue de sécurité.

## Alternatives écartées

- **Mettre à jour les tables dans chaque commande du module producteur** : cela couple
  ses écritures à tous leurs lecteurs et alourdit le traitement des commandes.
- **Tâche planifiée** : la fréquence disponible sur l'offre d'hébergement ne convient
  pas à un classement qui doit suivre l'activité des joueurs.
- **Processus de fond abonné au journal** : il demande un service permanent que
  l'hébergement actuel ne fournit pas.
- **Vue matérialisée PostgreSQL rafraîchie entièrement** : son recalcul complet ne
  bénéficie pas de l'application incrémentale des seuls événements nouveaux.
- **Conserver le rejeu à chaque lecture** : le coût continuerait à croître avec tout
  l'historique et la dette DT-005 ne serait pas remboursée.

## Réexamen

Revoir ce choix si une reconstruction approche la durée maximale d'une fonction,
si l'attente du verrou devient importante sous la charge, ou si une lecture exige
une cohérence stricte avec la dernière commande. Une reconstruction hors consultation
ou un service de projection dédié pourrait alors devenir nécessaire.

Revoir également la gestion des positions manquantes si les insertions du journal
peuvent dépasser cinq secondes, ainsi que le canal global si ses métadonnées doivent
être davantage restreintes. Les changements d'événements publiés doivent systématiquement
inclure une revue de leurs projections et de leurs canaux.

## Usage de l'IA générative

Aide à la formulation et à la relecture. Vérification des choix par rapport aux consignes,
aux transactions, aux migrations, aux tests de reconstruction et aux essais de l'API.
