# ADR-0011 - Événements publiés et versements idempotents des Quêtes

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le Village, le Donjon et le Marché publient déjà les actions utiles aux contrats.
Le Village accepte des versements idempotents via `realm.deposit`. Il peut être
extrait dans un service distant : une confirmation synchrone n'est pas garantie.

## Décision

Lire les événements via la projection, sans importer les tables des partenaires.
Enregistrer atomiquement une réclamation et un message `realm.deposit` dans la
boîte d'envoi. Le mouvement reçoit un identifiant stable, conservé en table ; le
Village répond sur `quests.transfer-result`. La confirmation ne fait que passer
une réclamation existante de « en attente » à « versée » et tolère les doublons.
La distribution est déclenchée par les réclamations, les consultations du tableau
et la tâche quotidienne déjà présente.

Ajouter à la plateforme deux capacités génériques : écrire/supprimer des messages
dans une transaction fournie, et construire une source SSE par abonné autorisé.
Le canal privé des Quêtes lit uniquement les notifications de son propriétaire.
Les notifications sont des invalidations : le navigateur relit sa vue et ne reçoit
aucune graine de Donjon ni donnée d'un autre joueur. Le renouvellement à minuit est
calculé à la lecture et le navigateur programme sa relecture à l'échéance.

## Conséquences

### Positives

- Livraison au moins une fois, sans double versement grâce au Village.
- Une panne après acceptation ne perd pas la récompense, même après minuit.
- Aucun changement des règles des trois modules partenaires.
- Le canal ne publie pas de métadonnées des actions des autres joueurs.

### Négatives

- Une réclamation peut rester en attente ; les messages abandonnés demandent le
  diagnostic et la relance déjà prévus par `scripts/dead-letters.ts`.
- Le SSE ajoute des lectures régulières ; les notifications ne sont pas un historique
  exhaustif et expirent après trente jours. Une reconnexion relit toujours le tableau.
- La suppression d'un compte ne peut pas annuler un message déjà en cours de remise
  dans un autre processus ; la limite d'effacement concurrent du socle demeure.

## Alternatives écartées

- **Appel direct au Village puis écriture locale** : une interruption entre les deux
  opérations rend leur résultat ambigu.
- **Modification directe des stocks** : enfreint la propriété des données.
- **Canal global avec données masquées** : expose inutilement l'activité et les
  identifiants des flux des autres joueurs.
- **Saga compensable** : aucune ressource n'est prélevée ; un versement confirmé ne
  doit pas être annulé. Le bonus B5 n'est pas revendiqué.

## Réexamen

Revoir pour des récompenses consommables dans plusieurs modules, des compensations
réelles ou une charge SSE dépassant le budget.

## Usage de l'IA générative

Codex : analyse des contrats existants, proposition, rédaction, implémentation et
tests. Les preuves de reprise, d'idempotence et d'isolation seront consignées dans
le rendu, sans présenter les tests automatiques comme une validation humaine.
