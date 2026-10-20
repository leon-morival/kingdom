# ADR-0003 - Server-Sent Events alimentés par le journal pour le temps réel

- Statut : accepté
- Date : 2026-10-20

## Contexte

Une fondation ou une amélioration du Village doit apparaître sans rechargement dans les
autres onglets du joueur. Au TD6, les participants d'une partie du Donjon devront également
recevoir les changements provoqués par les autres joueurs. Les commandes passent déjà par
des requêtes HTTP authentifiées : le besoin supplémentaire concerne les notifications
du serveur vers le navigateur.

L'hébergement Vercel retenu borne les requêtes à 300 secondes. Plusieurs instances peuvent
traiter les commandes et les abonnements sans partager de mémoire. Le projet doit rester
dans l'offre gratuite, sans ajouter de serveur permanent ni de service de messagerie.

Le journal introduit par l'[ADR 0002](0002-event-sourcing-village.md) conserve déjà les
événements et leur version croissante dans chaque flux. Il permet de retrouver les
événements survenus après une version donnée, quelle que soit l'instance interrogée.

## Décision

Diffuser les changements par des Server-Sent Events sur `/api/stream/<canal>`. Chaque canal
correspond exactement à un flux du journal. La version d'un événement sert d'identifiant
SSE ; lors d'une reconnexion, l'en-tête `Last-Event-ID` permet de reprendre après le dernier
événement reçu.

Le serveur relit le journal toutes les 500 millisecondes, sans bus de notification en
mémoire. Un flux se ferme volontairement au bout de 240 secondes, avant la limite de la
fonction. Le navigateur se reconnecte automatiquement avec `EventSource`, après le délai
conseillé d'une seconde. Un commentaire de maintien de connexion est envoyé après quinze
secondes sans événement.

L'authentification est obligatoire. Chaque module fournit sa règle d'accès aux canaux,
transmise par la racine de composition à la plateforme générique. Un canal sans règle
est refusé ; le canal `village-<joueur>` est réservé à son propriétaire.

À chaque notification, l'interface relit sa vue auprès de l'API. Elle ne rejoue pas les
événements du domaine. Une route JSON `/api/stream/<canal>/events?after=<version>` fournit
le même historique et les mêmes contrôles d'accès pour un éventuel client de repli ;
le hook actuel utilise uniquement SSE.

## Conséquences

### Positives

- Le flux utilise HTTP et le cookie de session existant, sans protocole ni infrastructure
  supplémentaire.
- `EventSource` prend en charge la reconnexion ; les événements persistés permettent de
  rattraper une interruption et de reprendre sur une autre instance.
- La plateforme reste indépendante des modules : chacun fournit seulement ses règles
  d'accès, et peut réutiliser le journal et le hook d'abonnement.
- La vue est calculée par le serveur, qui reste responsable de l'état affiché et des
  informations accessibles au joueur.

### Négatives

- Chaque abonnement entraîne environ deux lectures du journal par seconde, même sans
  changement. Deux onglets d'un même joueur ouvrent deux flux et doublent cette charge.
- L'attente avant la prochaine lecture atteint 500 millisecondes en fonctionnement normal.
  Les délais de base, de réseau et de relecture de la vue s'y ajoutent ; une reconnexion
  ajoute aussi son délai. Il ne s'agit pas d'une garantie de latence maximale de bout en bout.
- Les connexions sont renouvelées régulièrement, et certains intermédiaires peuvent
  retarder ou empêcher la diffusion progressive. La route JSON existe, mais le client
  ne bascule pas automatiquement dessus.
- Chaque événement reçu provoque une relecture de la vue, ce qui ajoute des requêtes et
  peut devenir coûteux pour des flux très actifs.

## Alternatives écartées

- **WebSocket** : la bidirectionnalité n'est pas nécessaire aux commandes HTTP existantes.
  Maintenir des connexions permanentes s'accorde mal avec les fonctions de durée limitée ;
  un serveur dédié ajouterait une infrastructure à exploiter.
- **Interrogation périodique par le navigateur** : un intervalle court multiplie les
  requêtes HTTP, tandis qu'un intervalle long retarde l'affichage. SSE garde une connexion
  et profite de la reprise native du navigateur.
- **Notification partagée avec PostgreSQL `LISTEN/NOTIFY` ou Redis** : elle réduirait les
  lectures inutiles, mais demande des connexions ou un service supplémentaires et une
  gestion du rattrapage. Cette complexité n'est pas justifiée pour l'effectif du projet.

## Réexamen

Mesurer les lectures, la charge de la base et le délai de notification lorsque le nombre
d'abonnements augmente : `N` flux produisent environ `2 × N` lectures par seconde, avant
les relectures des vues. Réexaminer le choix si cette charge dégrade les réponses ou
dépasse les ressources de l'offre retenue.

Le revoir également si le jeu exige des échanges bidirectionnels à très faible délai,
si les interruptions ou les réseaux incompatibles deviennent fréquents, ou si l'hébergeur
propose une prise en charge stable des WebSocket adaptée aux contraintes du projet.

La relecture du journal est un compromis choisi, et non une dette à rembourser
systématiquement ; elle n'ajoute donc pas d'entrée au registre de la dette technique.

## Usage de l'IA générative

Cet ADR a été rédigé avec l'assistance de Codex à partir du TD5, du modèle d'ADR et du code
du projet. Les routes, les règles des canaux et le hook ont été comparés aux consignes.
Les 58 tests, les contrôles de types et les règles d'architecture ont réussi en environnement
normal et avec `VERCEL=1 NODE_ENV=production`.
