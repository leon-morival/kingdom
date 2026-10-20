# ADR-0002 - Event Sourcing comme mode de persistance du Village

- Statut : accepté
- Date : 2026-10-20

## Contexte

L'état d'un village évolue à la suite des actions du joueur : fondation, puis améliorations
des bâtiments. Le domaine produit déjà des événements et sait reconstruire cet état en
les rejouant. Leur stockage provisoire en mémoire entraîne toutefois la perte des villages
à chaque redémarrage et ne permet pas de partager les données entre plusieurs instances.

La suite du projet prévoit de diffuser les changements en temps réel (TD5), puis de
construire des vues de lecture à partir de l'activité des joueurs, notamment le classement
(TD8). Conserver les faits à l'origine des changements répond à ces deux besoins.

L'hébergement sans serveur peut traiter simultanément plusieurs requêtes pour un même
village sur des instances différentes. La persistance doit empêcher que deux commandes
décidées sur un même stock dépensent les mêmes ressources.

## Décision

Le Village utilise l'Event Sourcing : son état n'est pas stocké, mais reconstruit en rejouant
ses événements dans l'ordre. Ceux-ci sont conservés dans le journal générique de la
plateforme, `platform.events`, en ajout seul, avec un flux `village-<joueur>` par village.
La plateforme conserve les événements sans interpréter leur signification métier.

Chaque événement possède une version dans son flux et une position globale dans le journal.
La contrainte d'unicité sur le couple flux et version détecte les écritures concurrentes.
En cas de conflit, le service recharge l'état et prend de nouveau la décision, dans la
limite de trois tentatives au total. Les autres erreurs sont transmises immédiatement.

Un événement porte les informations nécessaires à son application, notamment le coût payé
pour une amélioration : rejouer l'historique ne doit pas recalculer les anciens coûts à
partir des règles actuelles.

Le journal est implémenté dans `src/platform/event-store/`. L'adaptateur
`src/modules/realm/infrastructure/event-store-village-repository.ts` le relie au port du
Village, sans modifier les règles du domaine. Ce choix de persistance concerne le Village ;
il n'impose pas l'Event Sourcing aux autres modules.

## Conséquences

### Positives

- L'historique des actions est conservé : il permet d'expliquer l'origine d'un état et
  d'analyser un résultat contesté.
- Le village peut être reconstruit à partir des événements, y compris après un redémarrage
  ou pour examiner un état passé.
- Les mêmes faits pourront alimenter la diffusion en temps réel et de nouvelles vues de
  lecture sans avoir prévu toutes leurs utilisations lors de leur enregistrement.
- La base garantit la détection des écritures concurrentes entre plusieurs instances ;
  une commande en conflit est réévaluée sur un état à jour.
- Le remplacement du stockage se fait par un adaptateur : le domaine conserve ses
  fonctions pures et ses tests.

### Négatives

- Un événement enregistré ne peut plus être modifié. Toute évolution de sa structure doit
  préserver la lecture des anciens événements, par exemple au moyen de versions ou d'une
  adaptation à la lecture.
- Chaque chargement relit et rejoue le flux entier. Le coût augmente avec la longueur de
  l'historique et peut nécessiter des instantanés à terme.
- Les requêtes portant sur plusieurs villages demandent des vues de lecture spécifiques ;
  le journal ne fournit pas directement un classement des joueurs.
- Les données conservées durablement dans le journal demandent une attention particulière
  lorsqu'un besoin d'effacement apparaît.
- Le nouvel essai reste borné : une forte contention peut épuiser les trois tentatives et
  faire échouer la requête.

## Alternatives écartées

- **Stocker l'état courant dans une table du module** : cette solution simplifierait la
  lecture d'un village, mais ferait perdre l'historique des actions. Il faudrait ajouter
  des mécanismes distincts pour conserver et diffuser les changements nécessaires aux
  fonctionnalités annoncées.
- **Verrouillage pessimiste** : verrouiller le village pendant tout le traitement
  empêcherait les conflits, mais imposerait des attentes et des transactions plus longues.
  La concurrence optimiste convient mieux aux conflits peu fréquents attendus et au
  traitement de requêtes par plusieurs instances sans serveur.
- **Conserver le journal en mémoire** : cette solution ne survit pas aux redémarrages et
  ne coordonne pas les écritures entre plusieurs instances.

## Réexamen

Mesurer le temps de lecture et de reconstruction lorsque le nombre d'événements par village
augmente. Si ce temps devient une part excessive du délai de réponse, examiner l'ajout
d'instantanés avant de remettre en cause le journal.

Réexaminer également la stratégie si les conflits épuisent régulièrement les trois
tentatives, si les besoins d'effacement deviennent incompatibles avec les événements
conservés, ou si la valeur de l'historique ne justifie plus le coût de sa maintenance.

## Usage de l'IA générative

Cet ADR a été rédigé avec l'assistance de Codex à partir des consignes du TD3, de l'ADR 0001
et du code du projet. Codex a également repris les fichiers fournis par le TD et exécuté
les contrôles de formatage, de types, d'architecture et les 36 tests du projet.
La persistance du village et la production de ressources ont été vérifiées par des
requêtes à l'API avant et après un arrêt puis un redémarrage du serveur de développement.
