# Rendu de l'évaluation

- Auteur : Leon Morival
- Module : `quests` — Tableau des contrats
- Adresse du déploiement : https://kingdom-swart.vercel.app/quests
- Fiche de cadrage : [fiche-cadrage.md](fiche-cadrage.md)
- État : validation locale effectuée ; contrôle du déploiement à consigner ci-dessous.
- L'étiquette `eval-fin` sera posée après finalisation du document par l'auteur.

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/quests/` : domain, application, infrastructure, API, index, contracts, ui | `pnpm lint:archi`, `architecture.test.ts` |
| E2 | `src/bootstrap/create-api.ts`, `src/ui/app-shell.tsx`, `app/(jeu)/quests/page.tsx` | `quests-api.test.ts`, `e2e/quests.spec.ts` |
| E3 | `quests/domain/quests.ts` | `quests/domain/quests.test.ts` : R1 à R10 ; intégration pour les effets persistants |
| E4 | `quests/infrastructure/schema.ts`, `drizzle/0013_quests.sql` | `quests-repository.test.ts` : concurrence, rejeu, montée de version, conservation |
| E5 | `quests/api.ts`, `quests/contracts.ts`, `create-api.ts` | API : anonymes, entrées forgées, dates invalides, isolation ; E2E à deux comptes |
| E6 | `quests-projection.ts`, `drizzle-quests-repository.ts`, `quests/index.ts` | Progression Village/Donjon/Marché, reprise après panne du Village distant, doublons |
| E7 | `quests/personal-data.ts`, contributeur dans `create-api.ts` | Export, effacement, protection contre le rejeu, préservation de l'autre joueur |
| E8 | Tests du domaine, du dépôt, de l'API et du navigateur | Correspondance détaillée des règles ci-dessous |
| E9 | `.dependency-cruiser.cjs` inchangé, contributeur et schéma propres | Zéro violation ; les deux fonctions d'aptitude préexistantes passent |
| E10 | Migration et route `/quests` dans le déploiement Vercel | Résultat du contrôle de production ci-dessous |

## Correspondance des règles et des tests

| Règle | Test du domaine | Preuve complémentaire |
| --- | --- | --- |
| R1 | Change de journée exactement à minuit UTC | API : renouvellement sans cron, ancienne réclamation refusée |
| R2 | Une amélioration remplit et plafonne Bâtisseur | Projection : heure métier et propriétaire ; parcours navigateur Village |
| R3 | Victoire aux participants humains, défaite à personne | Projection : compagnon exclu, joueurs humains crédités |
| R4 | Seul un échange conclu compte pour ses deux parties | Projection : paiement refusé ; API : échange réel à deux joueurs |
| R5 | Progression plafonnée | Dépôt : rejeu et montée de version sans second message |
| R6 | Bon jour, village et objectif complet | API : identité, montant et date forgés rejetés |
| R7 | Répétition d'une commande acceptée | Dépôt : deux demandes concurrentes, une ligne et un message |
| R8 | Confirmation possible après expiration | API : panne du Village distant, reprise le lendemain, mouvement unique |
| R9 | Confirmation seule, sans changement de date au rejeu | Dépôt : réponse répétée ou inconnue sans effet |
| R10 | Tableau réservé au propriétaire identifié | API et E2E : routes privées et canal d'autrui refusé |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B1 (+1) | Canal privé, notifications discrètes et reprise SSE | `quests/index.ts`, `quests/ui.tsx`, `platform/realtime/` | API « isole le flux privé… », `private-source.test.ts`, parcours navigateur en deux onglets | ADR 0011, README |
| B2 (+1) | Échéance quotidienne à minuit UTC, sans processus permanent | `quests/domain/quests.ts`, service, interface | Domaine : borne UTC ; API : renouvellement sans tâche de fond | Cadrage R1/R6, ADR 0010 |
| B4 (+1) | Projection `quests-progress` version 1 avec point de reprise | `quests-projection.ts`, adaptateur du dépôt | Dépôt : montée de version, rejeu, point de reprise | ADR 0010, architecture |
| B6 (+1) | Communication avec Village, Donjon et Marché | Projection, dépôt et gestionnaire de confirmation | Tests des trois objectifs et versement par le Village | ADR 0011, diagramme de séquence |
| B10 (+1) | Parcours Playwright avec sessions réelles, ordinateur et mobile | `e2e/quests.spec.ts`, `playwright.config.ts` | 2 scénarios × 2 profils Chromium : progression en direct, versement, rechargement, droits, isolation | README, bilan technique |

Total demandé : **5 points**, sous réserve de validation des exigences minimales.
Aucun bonus de saga compensable ni de rendu graphique subjectif n'est revendiqué.
Le test de charge sert à vérifier le socle ; il n'est pas ajouté au total revendiqué.

## Écarts avec la fiche de cadrage

Aucun écart fonctionnel annoncé. La conservation ajoute une purge quotidienne aux
échéances calculées à la lecture : cette purge ne conditionne pas le renouvellement.
Les limites acceptées sont DT-026 et DT-027. Le budget de performance local reste
dépassé (DT-028) : voir le [protocole de charge](../../perf/evaluation-environment.md).
Le bonus B7 n’est pas revendiqué ; les dettes préexistantes restent suivies.

## Indicateurs au rendu

Les mesures finales sont consignées dans le [bilan technique](../bilan-technique.md).

| Indicateur | `td11-fin` | Avec les Quêtes |
| --- | --- | --- |
| Tests / fichiers Vitest | 238 / 33 | 269 / 37 |
| Couverture des lignes | 73,99 % | 73,09 % |
| Violations d'architecture | 0 | 0 |
| Parcours navigateur | 0 | 4 passages réussis |


Le socle `td11-fin` comptait 238 tests, 33 fichiers de test, 73,99 % des lignes couvertes
par Vitest et zéro violation des sept règles d'architecture. Les tests navigateur sont
mesurés séparément et ne gonflent pas le taux de couverture Vitest.

## Vérifications du déploiement

À compléter après publication et contrôle du déploiement.

## Documents de pilotage

- [ADR 0010 : stockage](../adr/0010-quetes-stockage.md)
- [ADR 0011 : communication](../adr/0011-quetes-communication.md)
- [Architecture et séquence de versement](../architecture.md)
- [Revue de sécurité des Quêtes](../qualite/revue-securite-quetes.md)
- [Dette technique](../qualite/dette-technique.md)
- [Registre des traitements](../rgpd/registre-traitements.md)
- [Bilan technique](../bilan-technique.md)

## Usage de l'IA générative
