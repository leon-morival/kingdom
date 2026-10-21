# ADR-0007 - Orchestrer les opérations entre modules par des sagas et une boîte d'envoi transactionnelle

- Statut : accepté
- Date : 2026-10-21

## Contexte

Un échange du Marché concerne une offre et les villages de deux joueurs. La réservation,
le paiement et la livraison doivent préserver les ressources, y compris lorsqu'une requête
est interrompue ou lorsque plusieurs acheteurs acceptent la même offre.

L'encapsulation des modules interdit au Marché de modifier directement les données du
Village. Une extraction future d'un module dans un service possédant sa propre base doit
rester possible. Une transaction commune aux deux modules compromettrait cette séparation.

L'hébergement ne permet aucun processus permanent, comme le rappelle
l'[ADR 0004](0004-manches-simultanees.md). La coopération doit pouvoir avancer pendant
les requêtes et reprendre après l'arrêt d'une fonction.

## Décision

Une transaction ne modifie les données que d'un seul module. Elle peut également enregistrer
les messages correspondants dans la boîte d'envoi de la plateforme, dans la même transaction
que les événements. L'enregistrement est atomique : aucun événement validé ne perd sa demande,
et aucune demande n'est distribuée si les événements ont été refusés.

Toute opération entre modules devient une saga orchestrée par le module qui porte l'opération.
Chaque étape est identifiée comme compensable, pivot ou reprise jusqu'au succès. Pour un échange,
le Marché réserve les ressources du vendeur ; cette réservation peut être compensée par une
restitution. Le prélèvement chez l'acheteur est le pivot : après son succès, les deux livraisons
doivent aboutir. Un paiement refusé rouvre l'offre sans modifier le stock de l'acheteur.

Les participants ignorent la saga. Le Village sait prélever ou verser des ressources et répond
au sujet indiqué par l'adresse de retour de la demande. Il n'importe aucun code du Marché.
L'orchestrateur traduit les décisions du domaine en demandes aux participants.

La distribution se fait au moins une fois : chaque réservation de message est protégée par
un bail, une interruption permet une nouvelle remise à son expiration, et un échec technique
entraîne un nouvel essai avec recul exponentiel. Après dix tentatives, le message est abandonné
et conservé pour intervention. Un refus métier est une réponse normale, pas une panne à retenter.

Chaque gestionnaire est idempotent. Le demandeur choisit une clé correspondant à l'intention
du mouvement, distincte de l'identifiant du message. Le Village mémorise aussi les refus :
un prélèvement refusé ne doit pas réussir plus tard à la faveur d'une livraison en double.
Le Marché ne traite une réponse que si elle correspond à l'étape et à la tentative attendues.

La distribution est déclenchée après les commandes du Marché et à la consultation de sa liste,
ainsi que chaque jour par une tâche planifiée protégée par `CRON_SECRET`. Sans secret, la route
planifiée reste fermée. Les échéances des offres utilisent des messages différés ; une offre
échue ne peut plus être acceptée, même si sa restitution attend encore une distribution.

## Conséquences

### Positives

- Aucun module n'écrit dans les données d'un autre ; leurs transactions restent locales,
  ce qui prépare leur séparation éventuelle en services.
- L'enregistrement atomique et l'idempotence permettent de reprendre après une panne sans
  perdre une demande ni appliquer deux fois un mouvement de ressources.
- Le Village peut servir d'autres demandeurs grâce à ses messages génériques et à l'adresse
  de retour, sans apprendre les règles de chaque nouvelle saga.
- Les étapes et les compensations de l'échange se lisent dans un seul domaine, celui du Marché.
- La boîte d'envoi sert aussi de minuterie pour les offres, sans service supplémentaire.

### Négatives

- Les joueurs peuvent observer des états intermédiaires : réservation ou règlement en cours.
  Un échange déclaré conclu peut encore attendre la distribution des versements.
- La latence dépend de l'activité : une saga interrompue reprend à une prochaine consultation
  du Marché ou lors du passage quotidien de la tâche planifiée, sous réserve du délai de reprise.
- Tous les gestionnaires doivent être idempotents et leurs doublons testés, y compris les refus
  et les réponses tardives d'une ancienne tentative.
- Les messages abandonnés demandent une intervention, mais aucun outil ne permet encore de
  les examiner ni de les relancer. La dette DT-007 conserve cette limite ; des ressources
  peuvent rester en séquestre jusqu'à son traitement.
- Les messages traités restent conservés : la table de la boîte d'envoi grandit sans limite
  tant qu'aucune politique d'archivage ou de purge n'est définie.
- Les contrats de messages lient les modules. Leur évolution doit rester compatible avec
  des messages déjà enregistrés, parfois remis longtemps après leur création.

## Alternatives écartées

- **Transaction unique entre le Marché et le Village** : elle franchit leurs frontières et
  suppose une base commune, incompatible avec l'extraction envisagée.
- **Transaction distribuée par validation en deux phases** : elle ajoute un coordinateur,
  des verrous et des contraintes d'exploitation disproportionnés pour l'hébergement.
- **Appel direct du Village sans boîte d'envoi** : une interruption entre la décision locale
  et l'appel laisse une opération incomplète sans demande persistante à reprendre.
- **Saga chorégraphiée** : elle répartit les étapes entre les participants et rend plus difficile
  la lecture du déroulement et des compensations d'un échange.
- **Journal d'événements utilisé comme boîte d'envoi** : le journal conserve des faits immuables,
  alors que la distribution doit modifier les tentatives, les baux et l'état du traitement.

## Réexamen

Revoir cette décision lors de l'extraction d'un module : chaque base devra posséder sa boîte
d'envoi, et un transport reliera les services. Un volume important de messages peut justifier
un courtier dédié, des consommateurs permanents et une politique d'archivage.

Réexaminer aussi les déclencheurs de distribution si la latence attendue devient incompatible
avec les requêtes des joueurs et le passage quotidien, ainsi que la gestion des abandons si
des offres bloquées nécessitent un traitement opérationnel régulier.

## Usage de l'IA générative

Aide à la formulation et à la relecture. Vérification des choix par rapport aux consignes,
aux transactions, aux tests de doublons, de concurrence et de compensation, et aux essais
de l'API avec deux sessions.
