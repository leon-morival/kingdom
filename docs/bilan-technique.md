# Bilan technique de Royaumes

- Date : 2026-10-23
- Versions examinées : socle `td11-fin`, puis module `quests` avant finalisation de `eval-fin`
- Auteur : Leon Morival

Ce bilan rassemble les décisions, mesures et limites du système livré. Les résultats
locaux décrivent les scénarios exécutés ; ils ne certifient ni une capacité de production
ni une conformité générale aux exigences de sécurité et de protection des données.

## 0. Évaluation finale : module Quêtes

Le tableau des contrats ajoute trois objectifs quotidiens et des récompenses idempotentes,
avec projection privée, échéance UTC, SSE et tests navigateur. Le module représente
1 123 lignes hors tests ; le total `src/` passe de 8 232 à 9 409 lignes. Il y a maintenant
six modules de jeu, plus `system`. La migration `0013_quests.sql` crée seulement les sept
tables du schéma `quests`. Aucun test du socle n'a été supprimé ou affaibli, et aucune
règle de dependency-cruiser n'a été assouplie.

### Indicateurs de qualité comparés

| Indicateur | `td11-fin` | Avec les Quêtes |
| --- | --- | --- |
| Tests Vitest | 238 dans 33 fichiers | 269 dans 37 fichiers, tous réussis |
| Couverture des lignes Vitest | 73,99 % (1 178/1 592) | 73,09 % (1 369/1 873) |
| Couverture du domaine Quêtes | Sans objet | 100 % des lignes (21/21) et branches (20/20) |
| Règles de dépendance / violations | 7 / 0 | 7 / 0 (155 modules et 520 dépendances parcourus) |
| Fonctions d'aptitude existantes | 2 réussies | 2 réussies |
| Tests navigateur | Aucun | 4 passages : 2 scénarios × ordinateur/mobile Chromium |
| Dette technique | 25 entrées, 7 remboursées | 28 entrées, 7 remboursées ; DT-025 partiellement traitée |

`pnpm verify` réussit les 269 tests ; `pnpm build` inclut la nouvelle route `/quests`.
La couverture globale recule de 0,90 point : l'interface ajoutée n'est pas instrumentée
par Vitest. Les parcours Playwright sont mesurés séparément ; leur succès ne gonfle pas
le pourcentage. Le domaine est couvert à 100 %, ce qui ne constitue pas une preuve
exhaustive de toutes les propriétés du système.

Les tests du nouveau module couvrent la concurrence des réclamations, l'atomicité avec
la boîte d'envoi, les confirmations répétées, le rejeu d'une projection, la montée de
version, l'effacement sans recréation, la conservation et la panne du Village distant
jusqu'au lendemain. Les quatre passages navigateur ont réussi sur une construction de
production et une base locale dédiée : progression SSE depuis un autre onglet, versement
unique, persistance après rechargement, export, effacement et isolation à deux comptes.
Les captures à 1280 × 900 et 390 × 664 pixels CSS ne montrent pas de débordement ; les tests
contrôlent aussi l'absence d'erreur JavaScript. Le profil mobile est Chromium, pas Safari.

### Décisions, dette et risques du module

Les ADR 0010 et 0011 consignent le stockage, la projection, le versement et le canal privé.
La [revue de sécurité](qualite/revue-securite-quetes.md) comporte onze exigences conformes
et deux risques acceptés : les participations sans fin de partie (DT-026) et les marqueurs
pseudonymes/remises concurrentes pendant l'effacement (DT-027). Le traitement T9 précise
les données et conservations. DT-025 reste ouverte pour les autres écrans et les coupures
réseau prolongées. Les réserves antérieures sur l'hébergement, les journaux et le service
extrait ne sont pas closes par l'ajout des Quêtes.

### Performance et déploiement

Le test de charge **échoue au budget de 500 ms** : p99 de 965 ms pour les Quêtes,
650 ms pour les expéditions, 601 ms pour le Classement et 852 ms pour le Marché, sans
aucune erreur HTTP. Une contre-épreuve de `td11-fin`, sur une base neuve du même disque,
échoue aussi pour le Classement (724 ms) et le Marché (737 ms). Ces exécutions ne permettent
pas d'attribuer toutes les différences au module ni de garantir l'absence de régression.
La lecture atomique et l'évitement de distributions inutiles réduisent les opérations,
mais ne suffisent pas à respecter le budget. DT-028 reste ouverte ; le bonus B7 n'est pas
revendiqué. Le [protocole et les résultats bruts](../perf/evaluation-environment.md)
conservent aussi la première mesure. La production ne fait l'objet d'aucun test de charge.

Le contrôle fonctionnel du déploiement est consigné dans le document de rendu. Les mesures du TD11 conservées dans les sections
suivantes sont historiques et ne remplacent pas celles de la nouvelle version.

Les sections 1 à 7 conservent le bilan détaillé du socle au TD11 ; le tableau des décisions
est complété par les deux décisions de l'évaluation.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules | 5 modules de jeu et `system` |
| Briques de la plateforme | 9 : auth, cron, db, event-store, http, outbox, privacy, projection, realtime |
| Lignes de code, hors tests | 8232, dans `src/`, commentaires compris ; pages et scripts exclus |
| Fichiers de test, nombre de tests | 33 fichiers, 238 tests ; 31 fichiers et 224 tests à `td10-fin` |
| Historique | 73 commits au dernier ADR ; progression du TD11 consultable par `git log td10-fin..HEAD` |
| Hébergement | Vercel, fonctions en `fra1` ; PostgreSQL Neon, région effective à attester dans la console |
| Service extrait | Un service Village local de 82 lignes, non déployé |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Journal d’événements ; variante distante et relais | 1148 |
| `dungeon` | Journal, projection des expéditions ouvertes | 2175 |
| `market` | Journal, projection des offres, saga et boîte d’envoi | 1340 |
| `ranking` | Projection du journal | 474 |
| `tavern` | Tables ordinaires de messages et de présence | 727 |
| `system` | Aucun | 73 |

Comptage reproductible : fichiers `.ts` et `.tsx` de `src/`, hors `*.test.ts`, nombre de
lignes physiques. Le Village augmente surtout par son adaptateur distant, sans modifier
son domaine. Le Donjon demeure le module le plus volumineux ; son domaine est fortement testé.

## 2. Les décisions d’architecture

Les textes complets figurent dans le [registre des ADR](adr/README.md).

| ADR | Décision | Mise à l’épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction locale du Village, ajout de la règle des tables privées | Frontières tenues ; les dépendances au journal dépassent celles visibles par les imports |
| 0002 | Event Sourcing du Village | Projections, export, réécriture ciblée et relais distant | Reconstruction et concurrence conservées ; coût de lecture lié au volume du flux |
| 0003 | SSE alimentés par le journal | Canaux globaux, source Taverne et Village distant | Même transport réutilisé ; coût du polling et client React sans test navigateur |
| 0004 | Manches simultanées, échéances paresseuses | Actions tardives et absence d’un joueur | Équité et reproductibilité testées ; les notifications et écritures attendent une commande |
| 0005 | IA déterministe | Tests de stratégies, simulation et jeu avec compagnons | Rejeu stable ; quatre héros restent favorisés et les résultats ne prouvent pas une sécurité cryptographique |
| 0006 | Projections rattrapées à la lecture | Charge avant/après, reconstruction et tests de concurrence | Lecture à jour sans transaction ; premier rattrapage et reconstruction restent proportionnels au journal |
| 0007 | Saga et boîte d’envoi | Échange à deux processus, panne du Village, reprise et lettres mortes | Conservation des ressources vérifiée ; cohérence différée et intervention après abandon |
| 0008 | Taverne en tables, réécriture ciblée | Suppression reprise après interruption et deux copies du Village | Noms neutralisés dans les scénarios testés ; identifiants, journaux et sauvegardes restent pseudonymes |
| 0009 | Extraction préparée, non déployée | Huit tests de contrat et démonstration HTTP avec retour arrière | Extraction démontrée ; migration initiale, exploitation et dettes du service à traiter avant déploiement |
| 0010 | Réclamations en tables, progression reconstruisible | Concurrence, rejeu, montée de version, conservation | Récompenses conservées au rejeu ; progression cohérente à terme |
| 0011 | Messages idempotents et canal privé | Panne distante après minuit, doublons, SSE et deux joueurs | Versement repris sans doublon ; limites d'exploitation et d'effacement explicites |

## 3. La qualité

| Caractéristique | Indicateur | Valeur mesurée | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests et couverture des domaines | 238 tests réussis ; Village, Marché et Taverne : 100 % des lignes ; Donjon : 252/253, soit 99,60 % | Règles et scénarios contrôlés ; couvrir une ligne ne prouve pas toutes ses branches |
| Efficacité des performances | Charge de vingt connexions | Après : p99 de 63 à 103 ms, zéro erreur sur cinq lectures | Budget local de 500 ms respecté ; aucun chiffre de capacité Vercel déduit |
| Fiabilité | Concurrence, reprise, idempotence | Tests de saga, huit contrats distants, un test de position monotone, examen/relance des abandons | Panne partielle récupérable ; DT-017 limite la distribution des réponses du service local |
| Sécurité | Revues existantes | 16 + 14 + 10 exigences de sécurité ; 10 exigences RGPD | Les non-conformités des revues restent ouvertes, voir section 5 |
| Maintenabilité | Dépendances et tests d’aptitude | 7 règles de dépendance, 0 violation ; 2 tests d’aptitude ; couverture globale 73,99 % des lignes | Progression depuis 72,42 % avant TD11 ; l’interface reste sans tests automatiques de navigateur |
| Flexibilité | Deux bases et deux processus | Huit contrats Hono avec bases indépendantes ; TCP testé séparément ; retour intégré réussi | PGlite en local, pilote PostgreSQL en production ; pas de déploiement du service |

`pnpm verify` a exécuté les 238 tests en environ 20 secondes ; `pnpm test:coverage` en
27,35 secondes, couverture comprise. Le rapport final indique 1 178/1 592 lignes,
72,53 % des instructions, 62,67 % des branches et 69,31 % des fonctions. Le rapport HTML
se régénère dans `coverage/` ; il n’est pas versionné. Les composants `ui.tsx`, les écrans
et le client temps réel ne disposent pas d’un parcours navigateur rejoué automatiquement.

Le déploiement du 22 octobre a révélé deux dépassements du délai de 20 secondes sur
Vercel. La concurrence des tests est désormais limitée à deux fichiers en CI/Vercel.
Seuls le scénario des 61 tentatives de connexion et la préparation des deux bases du
Village extrait disposent de 60 secondes. La préparation habituelle d'une base dispose
de 30 secondes, après deux dépassements des 15 secondes observés lors d'une nouvelle
exécution locale contrainte. Les assertions et le délai des autres tests restent inchangés.
Le 23 octobre, `CI=1 VERCEL=1 taskset -c 0,1 pnpm verify` réussit les 238 tests en
75,05 secondes sur deux processeurs logiques, avec les contrôles de style, de types et
de dépendances. Cette vérification locale ne reproduit pas exactement les ressources de Vercel.

La construction du 23 octobre a aussi signalé trois avis de sécurité sur Next.js 16.4.0.
La dépendance et son verrou passent à [16.4.1](https://github.com/vercel/next.js/releases/tag/v16.4.1),
version corrective ; `pnpm audit --prod` ne signale ensuite aucune vulnérabilité connue.
La validation finale sur deux processeurs réussit les 238 tests en 170 secondes avec
les délais ajustés, et `pnpm build` termine sans erreur avec Next.js 16.4.1.
Les mesures de charge ci-dessous restent celles de la version 16.4.0 du 22 octobre.

Sur le déploiement `d6e1830` du 23 octobre, les parcours HTTP de connexion, Village,
Donjon, Classement, échange au Marché avec contrôle des stocks, Taverne en SSE et export
ont réussi ; les deux comptes de test ont ensuite été effacés. Dans la console Vercel,
le bouton « Run » de `/api/cron/daily` a produit une réponse HTTP 200 à 09:41, heure de
Paris. Dans l'éditeur Neon en lecture seule, `SELECT count(*) FROM identity.rate_limit;`
a renvoyé 3 : la table des compteurs existe et contient des lignes après les connexions.

### Mesure de l’optimisation

Mesures du 22 octobre sur le même poste, Node 24.14.1, Next 16.4.0 en mode production,
PGlite vide avant chaque mesure, vingt joueurs préparés par l’API, vingt connexions et dix
secondes par scénario, limitation locale désactivée. Les bases de travail ont été conservées
à part puis restaurées. Résultats bruts : [avant](../perf/avant.json), [après](../perf/apres.json),
[budget](../perf/budget.json), [script](../scripts/load-test.ts).

| Lecture | Débit avant (req/s) | Débit après | p99 avant (ms) | p99 après |
| --- | --- | --- | --- | --- |
| Village | 446 | 445 | 66 | 63 |
| Expéditions ouvertes | 256 | 359 | 96 | 68 |
| Classement | 220 | 299 | 119 | 85 |
| Marché | 191 | 248 | 138 | 103 |
| Taverne | 418 | 410 | 69 | 64 |

Le budget était déjà respecté avant la modification. Le gain de débit atteint environ
40 %, 36 % et 30 % pour les trois lectures avec projection ; Village et Taverne restent
stables (moins de 2 %). Cette contre-épreuve est cohérente avec l’hypothèse du verrou et
de l’écriture inutiles. Il s’agit d’une paire de mesures, pas d’une estimation statistique
ni d’une mesure des démarrages à froid ou du réseau Neon.

Trois contre-épreuves ont été exécutées puis retirées : import interdit de la table du
journal, retour de Better Auth au stockage mémoire, désactivation du chemin rapide des
projections. Chacune fait échouer son contrôle. Le test du chemin rapide vérifie aussi
qu’aucune transaction n’est appelée, sans dépendre de la précision de l’horloge.

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 25 |
| Entrées remboursées | 7 : DT-001 à DT-007, au TD prévu |
| Entrées ouvertes | 18 : DT-008 à DT-025 |
| Dettes préalables au déploiement du service | DT-015 à DT-017 |

Le [registre](qualite/dette-technique.md) conserve l’historique. DT-004 est remboursée par
les compteurs partagés ; DT-007 par l’avertissement quotidien et le script d’examen/relance.
Les sept dettes RGPD du TD10 n’ont pas été remboursées à leur réexamen prévu au TD11 :
l’échéance est dépassée et leur replanification est explicite. Les autres entrées rattachent
les actions des anciennes revues au registre, ainsi que la conservation des nouvelles clés
IP/route et l’absence de tests d’interface. Le nombre d’entrées augmente en partie par
un meilleur inventaire, sans constituer une correction des risques correspondants.

Les commentaires se retrouvent par `git grep -n "DETTE TECHNIQUE" -- src scripts app`.
DT-012 concerne les attestations et informations documentaires, sans raccourci de code.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes | Risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- | --- |
| [Authentification](qualite/revue-securite-authentification.md) | 16 | 11 | 5 | 0 | A1/A2 : DT-018 ; A4 : DT-019 ; A5 : DT-021 ; A6 : DT-020. Compteurs partagés corrigés, autres limites de S3 conservées |
| [Donjon](qualite/revue-securite-donjon.md) | 14 | 12 aux contrôles du TD | 2 | 0 | D10 : échéance par un non-membre, DT-022 ; D14 : métadonnées globales, DT-023 |
| [Marché](qualite/revue-securite-marche.md) | 10 | 10 | 0 | 0 | Pas d’action de sécurité ouverte dans cette revue ; conservation outbox suivie par DT-011 |
| [RGPD](rgpd/revue-conformite.md) | 10 | 5 | 5 | 0 | DT-008 à DT-014 ; nouveaux compteurs inventoriés en T8 et DT-024 |

La conformité du Donjon ne démontre pas l’imprévisibilité cryptographique de son générateur.
La revue RGPD demeure celle du TD10, complétée par l’inventaire des compteurs dans le
[registre des traitements](rgpd/registre-traitements.md). Aucune conclusion globale de
conformité n’est déduite du succès des tests. Les garanties contractuelles et la région Neon
restent à attester ; le parcours visuel du jeu n’a pas été vérifié. Les contrôles dans
les consoles Vercel et Neon sont consignés dans la section 3.

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | Charge et croissance du journal, des flux SSE et de la boîte d’envoi | p99 proche de 500 ms, première lecture lente, erreurs ou messages abandonnés | Rejouer la charge sur volume croissant, surveiller le cron et les abandons, définir les conservations ; mesurer avant toute autre optimisation |
| 2 | Réserves de sécurité et de données personnelles non clôturées | Ouverture hors cadre pédagogique, autre hébergement, demande de rectification/export complet | Prioriser DT-008 à DT-014 et DT-018 à DT-024, attester les prestataires ; ne pas présenter les revues comme une certification |
| 3 | Régression du parcours navigateur | Changement d’un écran, du cycle React ou de la reconnexion, absent des tests HTTP | Ajouter un parcours de bout en bout à deux joueurs avant refonte, surveiller les délais SSE ; DT-025 |

## 7. Conclusion

Le système peut être repris grâce aux contrats publics, aux tests, aux mesures et à la
documentation des décisions. Son évolution demande de conserver ces contrôles, de vérifier
les parcours déployés et de traiter les réserves ouvertes. Le monolithe reste adapté à
l’exploitation actuelle. L’extraction est techniquement démontrée ; son déploiement ne
serait justifié qu’après un besoin observable et le remboursement de ses dettes.

## Usage de l’IA générative

Assistance à la rédaction et à la relecture. Vérification des chiffres par les commandes
de tests et de couverture, les mesures de charge, les essais HTTP et le rapprochement des
revues avec le code et le registre de dette.
