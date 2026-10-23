# Revue de sécurité des Quêtes : objectifs privés et versements uniques

- Date : 2026-10-23
- Périmètre : module `quests`, ses routes, projection, canal privé, messages et contributeur.
- Vérifications : tests du domaine, du dépôt, de l'API et parcours Chromium du dépôt.
- Cette revue porte sur les exigences ci-dessous, pas sur une certification de sécurité.

| N° | Exigence | Vérification précise | Constat | Statut |
| --- | --- | --- | --- | --- |
| Q1 | Toutes les routes et les deux formes du canal exigent une session | `quests-api.test.ts`, « protège toutes ses lectures… » | Lecture, commande, SSE et repli refusent les anonymes avec 401 | Conforme |
| Q2 | Un joueur ne choisit ni son identité ni le montant de sa récompense | `quests-api.test.ts`, « refuse date invalide… » ; `api.ts` | Corps strict limité à jour/contrat ; identité de session et catalogue serveur | Conforme |
| Q3 | Une réclamation concurrente ne crée qu'un versement | `quests-repository.test.ts`, « enregistre une seule réclamation… » ; API « crédite exactement… » | Une ligne et un message ; variation de stock égale à 20 or | Conforme |
| Q4 | Une ancienne journée ne permet pas une nouvelle réclamation | Domaine « exige le bon jour… » et API « renouvelle les contrats… » | Refus à la borne UTC ; une répétition déjà acceptée reste idempotente | Conforme |
| Q5 | Le canal privé ne révèle aucun autre joueur ni secret du Donjon | API « isole le flux privé… » et `e2e/quests.spec.ts` | Canal d'autrui refusé avec 403 ; notifications sans données ni identifiant d'expédition | Conforme |
| Q6 | Une reconstruction ne réinitialise pas les récompenses | Dépôt « conserve réclamations et progression… » | Montée de version : état conservé, aucun second message | Conforme |
| Q7 | Une remise répétée n'ajoute pas une seconde récompense | API « crédite exactement… », avec réinjection du même mouvement | Le Village ignore le doublon ; le stock ne croît qu'une fois | Conforme |
| Q8 | Seule la confirmation du Village marque une récompense versée | Domaine « une confirmation seule… », dépôt « confirme une récompense… », `TransferReply` | Réponse validée, identifiant existant requis ; répétition sans changement de date ; aucun endpoint public de confirmation | Conforme |
| Q9 | L'export est privé et l'effacement retire les données propres | Dépôt « efface les données… » et API « exporte et efface… » | Données d'autrui absentes ; données du joueur non recréées au rejeu ; celles de l'autre joueur conservées | Conforme |
| Q10 | Une panne de livraison ne perd pas un droit acquis | API « reprend un versement après une panne… » | Réclamation en attente après minuit puis confirmée après retour du service, mouvement unique | Conforme |
| Q11 | Les données temporaires sont purgées sans perdre les paiements en attente | Dépôt « purge les données échues… » et API cron | Progressions et versements terminés anciens supprimés ; paiement en attente conservé ; rejeu n'insère pas les anciennes progressions | Conforme |
| Q12 | Les relations de calcul des parties abandonnées ont une durée bornée | Lecture de `quests-projection.ts`, règle de nettoyage sur `GameEnded` | Sans événement de fin, la participation reste conservée | Risque accepté, DT-026 |
| Q13 | L'effacement retire tout lien et annule toute remise concurrente | Lecture de `personal-data.ts` et contrat du distributeur | Marqueur pseudonyme conservé ; une remise déjà en cours ne peut pas être annulée | Risque accepté, DT-027 et DT-011 |

## Synthèse et actions

**11 conformes, 0 non conforme, 2 risques acceptés dans le périmètre pédagogique.**
Les constats automatiques sont reproductibles avec `pnpm verify` et `pnpm test:e2e`.
Les tests navigateur n'utilisent ni authentification simulée ni route réservée aux tests.
Les preuves et l'état de la vérification en production figurent dans le document de rendu.

Avant une ouverture hors du cadre pédagogique : définir avec le Donjon l'expiration des
parties abandonnées (DT-026), puis coordonner l'effacement avec les traitements distants
et préciser la conservation des marqueurs (DT-027). Les limites d'authentification, de
journalisation et de sauvegarde du socle restent celles de ses revues existantes.
Un message abandonné après les tentatives du distributeur demande un diagnostic via
`scripts/dead-letters.ts` ; aucun délai maximal de versement n'est promis.
