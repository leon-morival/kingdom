# Fiche de cadrage : Tableau des contrats

- Auteur : Leon Morival
- Date : 2026-10-23
- Nom technique du module : `quests`
- Point de départ : `td11-fin`

## L'idée

Chaque jour, trois contrats encouragent le joueur à visiter le Village, le Donjon et
le Marché. Améliorer un bâtiment rapporte 20 or ; gagner une expédition rapporte
40 bois ; conclure un échange, comme vendeur ou acheteur, rapporte 30 pierre.
Le tableau affiche la progression et permet de réclamer chaque récompense.
Le catalogue est fixe : les mêmes objectifs sont proposés à tous chaque jour.

## Les règles métier

1. La journée commence à minuit UTC et se termine au minuit UTC suivant, borne exclue.
   Les trois contrats sont renouvelés sans tâche de fond ; les actions antérieures à
   l'ouverture de l'écran comptent si elles appartiennent à la journée.
2. Une amélioration réussie valide le contrat Bâtisseur pour le propriétaire du Village.
3. Une victoire valide le contrat Chasseur pour les joueurs humains de l'expédition,
   y compris ceux qui ne sont plus en vie ; une défaite ou un compagnon ne compte pas.
4. Un échange conclu valide le contrat Commerçant pour le vendeur et l'acheteur.
   Une offre simplement publiée, refusée ou retirée ne compte pas.
5. La progression est plafonnée à l'objectif (une action). Le rejeu d'un événement
   ou la reconstruction de la projection ne double ni progression ni récompense.
6. Une nouvelle réclamation exige un objectif atteint, un village fondé et une
   journée encore en cours. L'heure, le joueur et la récompense viennent du serveur.
7. Une récompense est réclamable une seule fois par joueur, jour et contrat.
   Répéter une réclamation acceptée renvoie son état, même après minuit.
8. Une réclamation acceptée reste due après l'expiration. La livraison peut être
   retentée ; le même identifiant de mouvement empêche un double versement au Village.
9. L'état « versée » n'est affiché qu'après la confirmation du Village.
10. Un joueur ne peut lire, réclamer ou écouter que ses propres contrats.

Les règles pures sont testées dans le domaine ; leurs effets de concurrence, de
livraison et de contrôle d'accès sont aussi vérifiés par des tests d'intégration/API.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Consulter le tableau et les versements en attente | Lecture | `GET /api/quests/board` |
| Réclamer une récompense | Commande | `POST /api/quests/claim` |
| Suivre son tableau | Lecture SSE | `GET /api/stream/quests-<joueur>` |

## Le stockage envisagé

Tables classiques dans le schéma `quests`. Les réclamations sont la source de vérité
des récompenses et sont enregistrées avec leur message de versement dans une transaction.
La progression est une projection versionnée du journal des partenaires, avec point de
reprise. Une reconstruction ne touche jamais aux réclamations. ADR 0010.

## La communication avec les modules existants

Lecture du langage publié de `realm`, `dungeon` et `market`. Le versement utilise
`realm.deposit`, avec une réponse `quests.transfer-result`, par la boîte d'envoi.
Les tables des partenaires restent privées. ADR 0011.

## Les données personnelles

Identifiant du joueur, progression datée, participations nécessaires au calcul,
réclamations et notifications privées. Aucun nom ni message libre n'est recopié.
Export et effacement par `personal-data.ts`. Un marqueur pseudonyme d'effacement
empêche une reconstruction de recréer les données du joueur. Les limites générales
du journal, des sauvegardes et des effacements concurrents du projet s'appliquent.

## Les bonus visés

1. B4 : projection versionnée avec point de reprise.
2. B6 : communication avec trois modules existants.
3. B2 : échéance à minuit UTC, sans processus permanent.
4. B1 : canal privé, reprise et contrôle d'accès.
5. B10 : parcours navigateur avec Playwright.

Le versement simple ne revendique pas B5 (saga compensable).

## Usage de l'IA générative

Codex a proposé cette idée, retenue par Leon, puis aidé au cadrage. Il est utilisé
pour l'implémentation, les tests et la documentation. Le rendu précisera les
vérifications réellement exécutées ; aucune relecture humaine n'est présumée.
