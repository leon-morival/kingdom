# ADR-0010 - Réclamations en tables et progression reconstruisible

- Statut : accepté
- Date : 2026-10-23

## Contexte

Les contrats quotidiens lisent des actions déjà enregistrées par trois modules.
Leur progression est dérivée ; une récompense réclamée engage un versement et doit
survivre à la reconstruction de cette progression. Les données datées ont une
utilité limitée et doivent participer à l'export et à l'effacement.

## Décision

Conserver les données dans le schéma `quests`. Séparer les réclamations, uniques
par joueur/jour/contrat, des tables reconstruites par `quests-progress` version 1.
La projection utilise le moteur et le point de reprise de la plateforme. Elle lit
l'heure métier `data.at` des événements, et non leur date d'insertion dans la base.
Le catalogue fixe et les règles de journée UTC sont des fonctions pures.

Les progressions et notifications de plus de trente jours sont purgées chaque jour,
ainsi que les réclamations versées. Les versements en attente ne sont pas purgés.
Le rejeu ignore les progressions hors conservation. Un marqueur d'effacement,
indépendant de la projection, empêche leur réapparition pour un compte supprimé.

## Conséquences

### Positives

- La reconstruction ne réinitialise pas le droit à une récompense.
- Unicité et transaction SQL protègent les réclamations concurrentes.
- Les données temporaires peuvent être effacées sans réécrire un journal propre.

### Négatives

- La cohérence est différée : une projection en retard peut temporairement refuser
  une réclamation dont l'objectif vient d'être atteint.
- La reconstruction parcourt le journal et son coût augmente avec son volume.
- Le marqueur d'effacement conserve un identifiant pseudonyme ; ce n'est pas une
  anonymisation. Les participations non terminées demandent une conservation dédiée.
- Le catalogue est fixe ; modifier une récompense demande de conserver les montants
  des réclamations existantes et de revoir la règle applicable à la journée en cours.

## Alternatives écartées

- **Tout en Event Sourcing** : ajoute un historique de progression temporaire déjà
  disponible chez les partenaires et complique l'effacement.
- **Une table unique reconstruite** : perd l'état des versements lors d'un rejeu.
- **Calcul complet à chaque lecture** : coût proportionnel au journal pour chaque joueur.

## Réexamen

Revoir si le catalogue devient configurable, si les quêtes ont une durée différente
ou si la reconstruction dépasse le budget d'une requête.


## Usage de l'IA générative
