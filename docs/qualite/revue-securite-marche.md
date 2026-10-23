# Revue de sécurité du Marché : intégrité des échanges

- Date : 2026-10-21
- Périmètre : API du module Marché, gestionnaires de messages du Village et du Marché,
  boîte d'envoi et la route `/api/cron/daily`, canal temps réel du Marché.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design,
  A08 Software and Data Integrity Failures).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| M1 | Un joueur ne publie, n'accepte et ne retire une offre qu'en son propre nom | Lecture de `src/modules/market/api.ts` et de la racine de composition | Les routes utilisent exclusivement `c.var.userId` et `c.var.userName`, fournis par `requireUser`. Le corps de publication ne fournit que `give` et `want`. Les requêtes anonymes sont refusées avec HTTP 401. | Conforme |
| M2 | Seul le vendeur peut retirer son offre et récupérer les ressources en séquestre | Test « restitue les ressources au vendeur qui retire son offre » et essai HTTP avec deux sessions | Le retrait par l'acheteur renvoie HTTP 403 ; celui du vendeur produit `OfferWithdrawn` et le versement de restitution. Le stock retrouve sa valeur initiale, production comprise. | Conforme |
| M3 | Un joueur ne peut pas accepter sa propre offre | Tests du domaine et de l'API ; essai HTTP | `AcceptOffer` compare l'acheteur au vendeur. L'auto-acceptation renvoie HTTP 409, sans prélèvement ni livraison. | Conforme |
| M4 | Aucun échange ne crée ni ne détruit de ressources, y compris lors d'acceptations simultanées | Tests « réalise l'échange complet… » et « ne conclut l'échange qu'avec un seul acheteur… » ; échange HTTP entre deux villages | Avec l'horloge figée, les trois villages conservent au total 300 bois et 150 pierre après deux acceptations concurrentes ; une seule réussit. L'échange réel de 60 bois contre 30 pierre produit les variations attendues chez les deux joueurs, après déduction de leur production. | Conforme |
| M5 | Un message remis plusieurs fois n'a d'effet qu'une fois | Tests « n'a qu'un effet, et ne répond qu'une fois… », « ignore un mouvement déjà traité… » et « ignore une réponse en double… » | Le Village conserve l'issue du mouvement, y compris un refus ; le doublon ne produit ni événement ni réponse. Le Marché ignore les réponses qui ne correspondent plus à l'étape attendue. | Conforme |
| M6 | Les quantités échangées sont des entiers strictement positifs, à l'entrée de l'API comme à la réception d'un message | Schémas `ResourceAmounts` et `TransferRequest` ; publications HTTP invalides ; test des messages mal formés | Les quantités -50, 0 et 1,5, une ressource inconnue et un ensemble vide sont refusés avec HTTP 400 `INVALID_INPUT`. Le stock ne varie que par la production normale. Les gestionnaires du Village valident le même schéma avant toute décision. | Conforme |
| M7 | Les routes publiques ne permettent aucun mouvement de ressources arbitraire | Lecture des routes des modules et des adaptateurs de messages | Aucune route publique ne donne accès à `transfer`, à l'enregistrement d'un message ni aux commandes internes de la saga. Les commandes de prélèvement et de versement arrivent par les gestionnaires enregistrés dans la racine de composition. Depuis le 23 octobre, les Quêtes utilisent aussi ce contrat pour des récompenses fixes, protégées par les contrôles Q2/Q3 de leur revue. | Conforme |
| M8 | La route de distribution planifiée n'est accessible qu'avec le secret, absent du dépôt | Test « refuse une requête sans le secret attendu, et reste fermée sans secret configuré (401) » ; appel HTTP sans secret sur `/api/cron/daily` ; `git grep -n CRON_SECRET` | Une absence de secret configuré, un en-tête absent ou un secret incorrect donnent HTTP 401. Le secret attendu permet la distribution en test. Le dépôt ne contient que des références, un emplacement vide dans `.env.example` et une constante réservée aux tests ; aucune valeur de production. | Conforme |
| M9 | Le canal du Marché ne transmet aucune donnée d'événement | Abonnement SSE réel et appel de `/api/stream/market/events?after=0` avec une session | Chaque événement reçu contient `data: {}`. Le canal annonce la position, le flux, la version et le type ; les détails de l'offre sont relus par l'API. Les visiteurs anonymes n'accèdent pas au canal. | Conforme |
| M10 | Les ressources manquantes lors d'un paiement refusé ne sont connues que de l'acheteur concerné | Offre de 10 bois contre 500 pierre ; consultation après refus avec les deux sessions | L'acheteur reçoit les pierres manquantes et l'offre reste ouverte. La consultation de la même offre par le vendeur renvoie `missing: null`. Le canal global ne contient pas les données du refus. | Conforme |

## Synthèse

Les dix exigences sont conformes : **10 conformes, 0 non conforme, 0 en risque accepté**.
Les tests automatisés passent, notamment les transactions événement/message, les doublons,
la reprise après interruption, les compensations et la concurrence entre acheteurs.

Les manipulations M6, M9 et M10 ont été exécutées par des requêtes HTTP avec deux comptes
et leurs cookies de session réels sur le serveur local. Elles vérifient les réponses,
les stocks et le flux SSE ; elles ne constituent pas une validation visuelle dans deux
fenêtres de navigateur. La configuration effective du secret et le déclenchement de la tâche
planifiée de production restent des vérifications de déploiement distinctes.

La dette **DT-007** reste ouverte : les messages abandonnés sont comptés, mais aucun outil
ne permet encore d'examiner leur cause et de les relancer. Une offre peut rester bloquée
avec des ressources en séquestre jusqu'à une intervention. Le registre prévoit son réexamen
au TD11 ; cette limite ne doit pas être assimilée à une garantie de livraison sans intervention.
