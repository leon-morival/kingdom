# ADR-0009 - Extraction du Village en service autonome, préparée mais non déployée

- Statut : accepté
- Date : 2026-10-22

## Contexte

L’ADR 0001 retient un monolithe dont les frontières doivent permettre une extraction.
Le Village est un candidat : son domaine est autonome et ses échanges avec le Marché
passent déjà par les contrats et la boîte d’envoi. Deux dépendances sont toutefois
invisibles dans les imports : le Classement et le canal du Village lisent ses événements
dans le journal commun. Il faut aussi préserver l’identité du joueur, ses droits d’accès,
l’export et l’effacement de ses données.

Une extraction pourrait répondre à une charge, une équipe, une cadence de déploiement,
un besoin d’isolation ou une technologie propres au Village. Aucun de ces besoins ne
justifie aujourd’hui le coût d’un second service en production.

## Décision

Préparer et vérifier une exécution autonome du Village, avec sa propre base, son journal
et sa boîte d’envoi. La racine de composition fournit à l’application un module distant
de même forme que le module intégré. L’API devient une passerelle qui authentifie le joueur
et transmet son identité ; les règles du domaine ne changent pas.

Les messages franchissent la frontière par une boîte de réception. L’expéditeur conserve
chaque message jusqu’au succès du traitement distant : livraison au moins une fois,
reprises et idempotence restent les garanties de l’ADR 0007.

Un relais copie le flux publié du service dans le journal de l’application, en conservant
les flux et versions. Son point de reprise ne recule pas ; il attend les positions
manquantes récentes. Le Classement et les canaux continuent de lire ce journal local.
Le relais s’exécute après les commandes et messages, puis par la tâche quotidienne.
L’effacement réécrit le nom dans les deux journaux.

Les deux processus authentifient leurs requêtes par un secret partagé, fourni dans
l’environnement et jamais versionné. Le service reste un exercice local : ni
`REALM_SERVICE_URL` ni `SERVICE_SECRET` ne sont définies en production. Cette décision
complète l’ADR 0001, sans le remplacer.

## Conséquences

### Positives

- Les frontières sont éprouvées par huit tests de contrat et un parcours HTTP à deux
  processus : échange, panne partielle, rétablissement et retour au mode intégré.
- Le domaine, le Classement et l’interface du Village gardent leurs contrats.
- Le relais rend possible le retour au mode intégré à partir des événements copiés,
  sans migration supplémentaire dans la démonstration locale.
- La boîte de réception et l’authentification entre services sont réutilisables ; les
  tests vérifient aussi le refus d’identités forgées et de messages mal formés.

### Négatives

- Deux chemins d’exécution sont à maintenir et à tester. Un appel réseau ajoute de la
  latence et peut échouer alors que le reste de l’application fonctionne.
- Les événements sont copiés et leur cohérence est différée ; un relais incomplet retarde
  le Classement et les notifications. Le retour au mode intégré exige un relais complet.
- Les migrations, la pagination du flux publié et la reprise de la boîte d’envoi du
  service restent des dettes préalables à tout déploiement (DT-015 à DT-017).
- Une fuite du secret partagé permettrait d’usurper un joueur auprès du service. Le
  même secret protège les deux sens de communication.
- Une extraction d’une base existante demande de migrer ses flux vers le service :
  changer les variables d’environnement ne transfère pas les données.

## Alternatives écartées

- **Déployer immédiatement le service** : deux bases, déploiements et ensembles de
  journaux à exploiter, sans bénéfice actuel mesuré ; les dettes ne sont pas levées.
- **Ne pas réaliser l’extraction** : la promesse de modularité resterait une hypothèse,
  sans vérification des dépendances au journal ni des pannes réseau.
- **Faire lire le flux distant directement au Classement et au temps réel** : cela
  modifierait leurs consommateurs et la plateforme ; le relais limite ces changements,
  au prix assumé d’une copie.
- **Extraire le Marché** : sa saga coordonne le Village et multiplie les échanges ;
  le Village permet d’éprouver les mêmes garanties avec un domaine plus indépendant.
- **JWT signé ou TLS mutuel** : meilleure séparation des identités ou authentification
  des machines, mais gestion de clés et certificats disproportionnée pour cet essai local.

## Réexamen

Revoir la décision si le Village dépasse durablement son budget de charge alors que les
autres modules le respectent, si une seconde équipe en prend la responsabilité, si sa
cadence de publication doit devenir indépendante ou si une exigence d’isolation apparaît.
Avant tout déploiement, rembourser DT-015 à DT-017 et préparer migration, retour arrière,
authentification, supervision et protection des deux copies des données personnelles.

## Usage de l'IA générative

Assistance à la formulation et à la relecture. Vérification des décisions dans le code,
les huit tests de contrat et les essais HTTP d’échange, de panne et de retour arrière.
