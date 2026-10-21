# Revue de sécurité du Donjon : dissimulation d'informations et intégrité du jeu

- Date : 2026-10-21
- Périmètre : API du module Donjon, canal temps réel des expéditions, tirages au sort, stratégies des monstres et compagnons.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design), catégories retenues dans le TD6.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| D1 | La vue d'une expédition ne contient ni la graine ni le contenu des salles non explorées | Test « ne transmet ni la graine ni le contenu des salles suivantes » ; lecture de `view.ts` ; réponses HTTP | La vue construit explicitement les champs transmis. `seed`, `rooms` et `choices` sont absents ; seul le contenu de la salle courante apparaît dans `currentRoom`. Le test vérifie aussi l'absence du trésor et du troll des salles suivantes. | Conforme |
| D2 | L'action choisie par un héros n'est connue que de son joueur jusqu'à la résolution de la manche | Tests « cache l'action choisie par les autres héros » et « ne révèle pas l'action d'un héros aux autres joueurs » ; deux sessions HTTP | Après le choix d'Alice, sa vue contient son action ; celle de Bob indique `ready: true` et `action: null` pour Alice. Trois protections se complètent : `toView` filtre les choix, l'API ne renvoie que cette vue et le canal réservé aux membres retire les données des événements. Les actions deviennent visibles dans `lastRound` après résolution. | Conforme |
| D3 | Le canal d'une expédition n'est accessible qu'à ses membres | Test « réserve le canal d'une expédition à ses membres (403) » ; essais HTTP sur le flux et le repli | Un membre reçoit `200`. Carol, connectée mais non membre, reçoit `403` sur le flux SSE et sur `/events` ; sans session, les deux routes répondent `401`. `canSubscribe` vérifie `view.isMember`. | Conforme |
| D4 | Le canal d'une expédition ne transmet aucune donnée d'événement, ni par le flux, ni par la route de repli | Tests du bloc « Canal discret » et « signale l'action d'un héros sans la révéler » ; lecture des réponses SSE et JSON | Le module déclare `redact: true`. Les événements reçus, dont `ActionSubmitted`, portent tous `data: {}` sur les deux routes. Le flux, le type et la version restent visibles ; ni l'action ni sa cible ne sont transmis. | Conforme |
| D5 | Un joueur ne peut agir qu'en son propre nom | Lecture de `api.ts` ; action contenant un `playerId` différent de celui de la session | La création prend l'identité dans `c.var.userId` et `c.var.userName`. Les routes `join`, `start`, `door` et `action` construisent également leur commande avec cette identité ; la lecture filtre selon `c.var.userId`. Ajouter l'identifiant de Bob au corps d'une action d'Alice ne fait choisir que le héros d'Alice. La commande `deadline` ne porte aucune identité de héros ; son accès est examiné en D10. | Conforme |
| D6 | Seul l'hôte lance l'expédition, et seul le héros dont c'est le tour ouvre une porte | Tests « ne laisse que l'hôte lancer l'expédition » et « fait ouvrir les portes à tour de rôle » ; essais HTTP | Bob ne peut pas lancer l'expédition créée par Alice : `403`, `NOT_HOST`. Une ouverture de porte hors tour est refusée avec `409`, `NOT_YOUR_TURN`. Les commandes de l'hôte et du héros attendu réussissent. | Conforme |
| D7 | Un joueur ne peut ni choisir ni prévoir le résultat d'un tirage au sort | Lecture de `dungeon-service.ts`, `rules.ts`, `random.ts` et `view.ts` ; contrôle D1 | La graine est tirée sur le serveur avec `crypto.getRandomValues(new Uint32Array(1))[0]`. Aucune route n'accepte une graine du client. `decide` utilise des graines dérivées et enregistre les résultats ; la vue et le canal ne révèlent pas la graine. Ces contrôles empêchent son choix ou sa lecture par les interfaces exposées. Le générateur de jeu est toutefois non cryptographique : cette vérification ne démontre pas une résistance à la prédiction par analyse des résultats observés. | Conforme aux contrôles du TD |
| D8 | L'échéance d'une manche est appréciée par l'horloge du serveur | Commande HTTP d'échéance envoyée avant la fin des trente secondes ; comparaison du journal avant et après | La commande anticipée renvoie `200`, avec le même numéro de manche et la même échéance ; aucun événement n'est ajouté. Ajouter une heure future au corps ne change rien : le service utilise `clock()`, dont la valeur par défaut est `Date.now()`. Après l'échéance, la résolution est enregistrée et le héros sans choix se défend. | Conforme |
| D9 | Une action destinée à une manche déjà résolue est refusée | Test « refuse un choix pour une manche déjà résolue » ; action HTTP pour la manche précédente | Après la résolution de la manche 1, soumettre une action pour cette manche renvoie `409`, `ROUND_OVER`. Le choix n'est pas reporté sur la manche 2. | Conforme |
| D10 | Connaître l'adresse d'une expédition ne permet pas d'y agir sans en être membre | Action puis commande d'échéance envoyées par une troisième session non membre ; lecture des routes et du domaine | L'action de Carol reçoit `403`, `NOT_A_MEMBER`, même avec l'identifiant d'Alice dans le corps. La consultation reste possible (`200`, `isMember: false`) avec une vue publique filtrée : ce choix permet de rejoindre une expédition par son adresse, dont l'UUID aléatoire rend la découverte par énumération impraticable. En revanche, la route `deadline` ne vérifie pas l'appartenance : après l'échéance, Carol obtient `200` et provoque l'enregistrement de la résolution. Elle ne choisit pas les actions ni l'heure de résolution, mais peut modifier le journal sans être membre. | Non conforme |
| D11 | Aucun joueur ne peut agir au nom d'un compagnon ni écouter le canal en son nom | Test « présente le compagnon comme prêt, et ne le compte pas parmi les membres » ; lecture de `rules.ts`, `api.ts` et de la règle du canal | Une commande `SubmitAction` visant l'identité `companion-1` est refusée avec `NOT_A_MEMBER`. Les routes prennent l'identité dans la session. `isMember` et `toView` excluent les compagnons ; la règle du canal utilise ce même indicateur et refuse donc une identité de compagnon. Les compagnons n'ont ni compte ni session. | Conforme |
| D12 | L'intelligence artificielle ne transmet aux joueurs aucune information qu'ils n'auraient pas autrement | Lecture de `companion.ts`, `monster-strategies.ts`, `rules.ts` et `view.ts` ; tests de la vue et des canaux discrets | Le compagnon ne reçoit que les héros et monstres debout au début de la résolution, sans les actions choisies par les joueurs. Les monstres utilisent ces actions après les actions des héros, sur le serveur. Les résultats sont enregistrés dans `RoundResolved` et exposés dans `lastRound` une fois la manche résolue ; avant cela, les choix restent filtrés et les événements du canal ont des données vides. | Conforme |

## Synthèse

**12 exigences : 11 conformes aux contrôles du TD, 1 non conforme et 0 exigence
classée en risque accepté.** La conformité de D7 porte sur l'origine et la non-divulgation
de la graine, sans garantie cryptographique sur la prévisibilité du générateur.

Les choix des autres héros, les salles futures et la graine ne sont pas transmis par
les vues ni par les canaux. Les contrôles d'identité, de tour, de manche et d'heure
fonctionnent dans les scénarios vérifiés. La consultation publique d'une expédition
dont l'adresse est connue est retenue pour permettre de la rejoindre ; cette possibilité
est distincte de l'écriture constatée en D10.

L'action à traiter pour D10 est de réserver `POST /api/dungeon/games/:id/deadline` aux
membres avant toute résolution persistée. Le critère de clôture est un test montrant
qu'un non-membre reçoit `403` et que le journal reste inchangé, y compris après
l'échéance ; un membre doit toujours pouvoir déclencher le rattrapage. Cette revue
consigne le comportement actuel sans modifier la règle d'accès.

## Vérifications et limites

La suite exécutée par `pnpm verify` a réussi : **131 tests dans 17 fichiers**.
La lecture du code a porté sur les routes, le service, les règles, la vue filtrée,
les règles des canaux et les fonctions de décision des monstres et compagnons.

Les essais complémentaires ont utilisé le serveur Next.js local, le véritable adaptateur
Better Auth et trois sessions séparées. Une expédition à deux a été créée, rejointe,
lancée, jouée jusqu'à un combat puis terminée par une défaite. Les réponses HTTP,
les événements SSE et la route JSON de repli ont été inspectés directement. Les sessions
ont été déconnectées à la fin des essais.

Au TD7, deux sessions distinctes ont également vérifié par HTTP le choix de difficulté,
le refus d'un niveau inconnu, l'ajout de compagnons réservé à l'hôte et leur prise en
compte dans les places disponibles. Une échéance d'exploration d'une minute a été
attendue : la lecture a montré la porte ouverte sans modifier le journal, puis la
commande d'échéance a enregistré l'ouverture. En solo, le choix du joueur a résolu
immédiatement la manche avec l'action du compagnon. Une expédition à plusieurs avec
compagnons a été terminée sans qu'un compagnon soit désigné pour ouvrir une porte.

Aucun navigateur pilotable n'était disponible : les manipulations dans les outils de
développement et la mise à jour visuelle des deux fenêtres n'ont pas été vérifiées.
Les essais HTTP contrôlent les données effectivement transmises, sans valider le rendu
ni le déclenchement de la commande par le compte à rebours du navigateur.

Les principaux points de contrôle sont :

- [Routes du Donjon](../../src/modules/dungeon/api.ts) et [service](../../src/modules/dungeon/application/dungeon-service.ts).
- [Règles du jeu](../../src/modules/dungeon/domain/rules.ts), [générateur](../../src/modules/dungeon/domain/random.ts) et [vue filtrée](../../src/modules/dungeon/domain/view.ts).
- [Décisions des compagnons](../../src/modules/dungeon/domain/companion.ts), [stratégies des monstres](../../src/modules/dungeon/domain/monster-strategies.ts) et [tests des compagnons](../../src/modules/dungeon/domain/companion.test.ts).
- [Règle du canal](../../src/modules/dungeon/index.ts) et [flux SSE et repli](../../src/platform/realtime/stream-api.ts).
- [Tests de l'API](../../src/bootstrap/dungeon-api.test.ts), [tests du temps réel](../../src/bootstrap/dungeon-realtime.test.ts) et [tests des canaux discrets](../../src/platform/realtime/stream-api.test.ts).
