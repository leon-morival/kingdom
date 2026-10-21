# ADR-0004 - Manches simultanées et échéances paresseuses pour les combats du Donjon

- Statut : accepté
- Date : 2026-10-21

## Contexte

Les combats du Donjon réunissent jusqu'à quatre joueurs humains. Aucun joueur ne doit
bloquer indéfiniment les autres, ni être avantagé par l'ordre dans lequel il joue.
Les choix doivent rester secrets jusqu'à la résolution de la manche afin que personne
ne puisse adapter son action aux choix déjà soumis par les autres.

L'hébergement ne permet ni minuteur en mémoire ni tâche de fond. Les tâches planifiées
de l'offre gratuite ne s'exécutent qu'une fois par jour, ce qui ne convient pas au rythme
d'un combat.

L'état d'une expédition est reconstruit à partir de ses événements, selon le principe
d'Event Sourcing décrit dans l'[ADR 0002](0002-event-sourcing-village.md). Les calculs
doivent être reproductibles, y compris lorsqu'une lecture ou une nouvelle tentative
de commande recalcule une résolution qui n'a pas encore été enregistrée.

## Décision

Les héros choisissent leur action simultanément. Une manche est résolue dès que tous
ont choisi ou lorsque son échéance de trente secondes est atteinte. Un héros qui n'a
pas choisi à l'échéance se défend. Les choix individuels ne sont pas divulgués aux
autres joueurs avant la résolution, y compris dans les vues et les notifications.

L'échéance de chaque manche est enregistrée dans les événements. Une manche échue est
résolue à l'instant de cette échéance, même si le calcul a lieu plus tard. Les échéances
suivantes sont calculées à partir de cet instant, sans décaler le combat au moment de
la requête qui le réveille.

Les échéances sont traitées de manière paresseuse : une lecture calcule la résolution
des manches échues pour présenter un état à jour, sans enregistrer les événements
calculés. Toute commande commence par enregistrer ces résolutions avant de traiter
l'action demandée. Lorsque son compte à rebours atteint zéro, le navigateur envoie une
commande d'échéance ; celle-ci provoque l'enregistrement et permet la diffusion des
notifications à partir du journal, conformément à l'[ADR 0003](0003-server-sent-events.md).
Le serveur reste responsable de vérifier que l'échéance est atteinte.

Les tirages aléatoires sont effectués dans `decide`, avec un générateur dont la graine
est dérivée du numéro de manche. À état et manche identiques, les tirages sont donc
reproductibles. Leurs résultats sont enregistrés dans les événements ; le rejeu applique
ces résultats sans effectuer de nouveau tirage.

Chaque action porte le numéro de la manche visée. Après le rattrapage des échéances,
une action visant une manche déjà résolue est refusée : elle ne peut pas être appliquée
à la manche suivante.

## Conséquences

### Positives

- Les choix simultanés et secrets évitent l'avantage lié à l'ordre de soumission des
  actions et permettent aux joueurs de participer sans attendre leur tour.
- L'échéance de trente secondes et la défense par défaut empêchent un joueur absent
  de bloquer la progression du combat.
- Le traitement paresseux fonctionne avec l'hébergement disponible, sans service
  permanent ni tâche planifiée supplémentaire.
- Les échéances enregistrées et les tirages déterministes rendent les résolutions
  reproductibles entre lectures et commandes, et facilitent leur vérification.
- Les lectures présentent un état à jour tout en conservant leur absence d'effets
  de bord sur le journal.

### Négatives

- Lorsque plus aucun joueur ne se manifeste par une commande, le journal peut rester
  en retard sur les résolutions calculées et affichées par les lectures. La fin d'une
  expédition abandonnée peut ainsi ne jamais être enregistrée.
- Le déclenchement des notifications dépend des navigateurs pour envoyer la commande
  d'échéance. Un onglet fermé, suspendu ou déconnecté peut retarder l'enregistrement
  et les notifications jusqu'à la prochaine commande.
- Une lecture peut recalculer plusieurs manches échues sans conserver le résultat ;
  ce travail est répété tant qu'aucune commande ne l'enregistre.
- La gestion du rattrapage, des commandes concurrentes et des actions tardives ajoute
  de la complexité. Une action envoyée avant la fin du compte à rebours peut être
  refusée si elle arrive au serveur après l'échéance.
- Le délai fixe et la défense par défaut pénalisent les joueurs dont la connexion
  est lente ou qui ont besoin de davantage de temps pour choisir.

## Alternatives écartées

- **Tour par tour strict** : il impose une attente entre les joueurs, donne un rôle
  à l'ordre de jeu et permet à un joueur absent de bloquer le combat sans mécanisme
  supplémentaire d'expiration.
- **Minuteur en mémoire ou tâche planifiée** : un minuteur ou une tâche de fond ne
  peut pas être maintenu sur l'hébergement retenu. La fréquence quotidienne des tâches
  planifiées gratuites ne permet pas de respecter des manches de trente secondes.
- **Lecture qui enregistre elle-même la résolution** : consulter l'état provoquerait
  des écritures et des notifications. Cela introduirait des effets de bord dans les
  lectures et brouillerait la séparation entre consultation et commande.
- **Tirage par `Math.random` dont seul le résultat serait enregistré** : le résultat
  enregistré suffirait au rejeu, mais pas aux calculs précédant l'enregistrement.
  Deux lectures ou une nouvelle tentative de commande pourraient produire des issues
  différentes pour la même manche. Une graine déterministe évite cette divergence.

## Réexamen

Réexaminer cette décision si la fin d'une expédition abandonnée doit être enregistrée
sans nouvelle intervention d'un joueur, ou si les notifications doivent être déclenchées
à l'échéance même lorsqu'aucun navigateur n'est actif.

La disponibilité d'un service de planification de tâches compatible avec l'hébergement,
capable de traiter des échéances de trente secondes à un coût acceptable, justifierait
également un réexamen. Des retards fréquents de notification ou un coût excessif du
rattrapage lors des lectures constitueraient d'autres motifs de révision.

## Usage de l'IA générative

Aide à la formulation et à la relecture des rubriques. Vérification de la présence
des éléments demandés, du respect du modèle et de la cohérence avec les ADR 0002 et 0003.
