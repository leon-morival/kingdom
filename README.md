# Royaumes

Jeu web multijoueur servant de support au module Architecture et pilotage technique.
Le projet est organisé en monolithe modulaire : une application Next.js unique, découpée
en une plateforme technique et en modules métier aux frontières vérifiées automatiquement.

## Prérequis

- Node.js 22 ou supérieur
- pnpm 12.14.0 (version indiquée dans `package.json`)

## Démarrage

```bash
pnpm install
pnpm dev
```

L'application est disponible à l'adresse http://localhost:3000.

## Comptes et configuration

L'espace de jeu est réservé aux joueurs connectés. Créez un compte depuis la page
http://localhost:3000/login.

Les variables d'environnement sont documentées dans le fichier `.env.example`. En local,
aucune n'est obligatoire. Pour définir vos propres valeurs, copiez ce fichier en
`.env.local`, qui n'est jamais versionné.

## Commandes

| Commande | Rôle |
| --- | --- |
| `pnpm dev` | Serveur de développement |
| `pnpm build` | Construction de la version de production |
| `pnpm start` | Serveur de production (après `pnpm build`) |
| `pnpm lint` | Formatage et analyse statique (Biome), sans modification |
| `pnpm lint:fix` | Application des corrections automatiques de Biome |
| `pnpm lint:archi` | Vérification des règles d'architecture (dependency-cruiser) |
| `pnpm typecheck` | Vérification des types (TypeScript) |
| `pnpm test` | Exécution des tests (Vitest) |
| `pnpm test:e2e` | Construction puis parcours Chromium ordinateur et mobile, avec une base locale isolée |
| `pnpm test:coverage` | Couverture des tests, rapport dans `coverage/` |
| `pnpm exec tsx scripts/load-test.ts <étiquette>` | Charge locale et comparaison au budget, application de production démarrée |
| `pnpm exec tsx scripts/dead-letters.ts [retry <id>]` | Liste des messages abandonnés ou relance d’un message |
| `pnpm exec tsx scripts/village-service.ts` | Service Village local, avec `SERVICE_SECRET` |
| `pnpm verify` | Ensemble des contrôles, à exécuter avant toute publication |
| `pnpm db:generate --name <nom>` | Production d'une migration après la modification d'un fichier `schema.ts` |
| `pnpm db:migrate` | Application des migrations à la base désignée par `DATABASE_URL_UNPOOLED` ou `DATABASE_URL` |
| `pnpm vercel-build` | Construction exécutée par Vercel : contrôles, migrations, puis construction |
| `pnpm exec tsx scripts/simulate-dungeon.ts` | Mesure de l'équilibre du Donjon par la simulation d'expéditions |

## Architecture

```
app/                  Pages et route unique de l'API (Next.js)
src/
  platform/           Plateforme technique, générique
  modules/            Modules métier, un répertoire par contexte délimité
  bootstrap/          Racine de composition
  services/           Service Village extrait, utilisé localement
  ui/                 Thème et composants d'interface partagés
scripts/              Scripts d'exploitation (migrations)
perf/                 Budget et mesures de charge
drizzle/              Migrations de la base de données
docs/
  adr/                Décisions d'architecture
  qualite/            Dette technique et revues
  rgpd/               Registre des traitements et revue de conformité
  architecture.md     Description de l'architecture (modèle C4)
```

Un module n'est accessible depuis l'extérieur que par ses entrées publiques : `index.ts`
(serveur), `contracts.ts` (types partagés) et `ui.tsx` (interface).

| Module | Rôle | Adresse de l'API |
| --- | --- | --- |
| `system` | Route de santé | `/api/system` |
| `realm` | Village : fondation, production de ressources, amélioration des bâtiments | `/api/realm` |
| `dungeon` | Donjon : expéditions de un à quatre héros, compagnons pilotés par l'ordinateur, deux niveaux de difficulté, combats en manches simultanées | `/api/dungeon` |
| `ranking` | Classement des joueurs, construit à partir des événements du Village et du Donjon | `/api/ranking` |
| `market` | Marché : échanges de ressources entre joueurs, par une saga orchestrée | `/api/market` |
| `quests` | Quêtes quotidiennes : objectifs, progression privée et récompenses versées au Village | `/api/quests` |
| `tavern` | Taverne : salon commun, messages et présence temporaire | `/api/tavern` |

## Temps réel

Les changements sont diffusés aux navigateurs par des Server-Sent Events, à l'adresse
`/api/stream/<canal>`. Chaque canal n'est accessible qu'aux joueurs connectés autorisés par
la règle du module concerné. Le canal `village-<joueur>` n'est ainsi accessible qu'au
propriétaire du village, et le canal `dungeon-<expédition>` aux seuls membres de l'expédition.

La plupart des canaux correspondent à un flux du journal d'événements. Les canaux `ranking`
et `market` sont globaux : ils suivent, dans tout le journal, les événements qui modifient
le classement ou les offres. Sans point de reprise, ils commencent à la dernière position
du journal ; une reconnexion reprend après la position précédemment reçue.

Le canal `tavern` lit directement la table des messages, par identifiant croissant. Il
transmet leur contenu ; l'historique charge les cinquante derniers messages encore conservés.
La présence est signalée toutes les trente secondes, avec une expiration après deux minutes
sans signal. Les messages expirent après trente jours.

Les canaux du Donjon, du Classement et du Marché sont discrets : ils ne transmettent que la position,
le flux, le type et la version des événements, et chaque navigateur relit sa propre vue, filtrée
par le serveur.

Un flux se ferme de lui-même au bout de 240 secondes, et le navigateur s'y reconnecte
sans perte d'événement. En développement, la variable `STREAM_MAX_SECONDS` permet de
raccourcir cette durée pour observer la reconnexion.

## Données personnelles

La page « Mes données » permet de télécharger un export JSON des données du joueur, puis de
supprimer son compte après saisie de `SUPPRIMER`. Chaque module fournit un contributeur :
export, réécriture de ses champs personnels et effacement de ses tables. Les graines des
expéditions, les secrets et les données des autres joueurs ne sont pas exportés.

L'effacement supprime les messages et la présence, remplace les noms du journal et des
projections par des mentions neutres, puis supprime l'identité et ses sessions en dernier.
La réécriture ciblée est la seule exception à l'ajout seul du journal ; une trace sans
identifiant de joueur en conserve la date et le nombre d'événements concernés
([ADR 0008](docs/adr/0008-donnees-personnelles.md)). Les identifiants demeurent pseudonymes :
les journaux de l'hébergeur et les sauvegardes empêchent de promettre une anonymisation.

L'historique de la Taverne supprime les messages expirés ; son canal les exclut aussi.
La route quotidienne purge les messages et la présence même sans visite, au prochain
passage réussi. Le [registre des traitements](docs/rgpd/registre-traitements.md) et la
[revue de conformité](docs/rgpd/revue-conformite.md) décrivent les durées et limites réelles.

## Quêtes quotidiennes

Le [tableau des contrats](/quests) propose chaque jour trois objectifs : améliorer un
bâtiment (20 or), gagner une expédition (40 bois), conclure un échange au Marché
(30 pierre, pour chacun des deux participants). Les journées commencent à **00:00 UTC**.
Les actions du jour comptent même avant la première visite. Un village est nécessaire
pour réclamer les récompenses. Chaque contrat ne peut être réclamé qu'une fois par jour.

La progression vient d'une projection versionnée du journal. Les réclamations sont des
lignes indépendantes de cette projection, accompagnées d'un message transactionnel vers
le Village. « Versement en cours » signifie que la demande est enregistrée ; « Récompense
versée » signifie que le Village a confirmé. Une demande acceptée avant minuit reste due
le lendemain. La distribution est relancée à la consultation et par le cron existant.

`GET /api/quests/board` renvoie seulement le tableau du joueur connecté ;
`POST /api/quests/claim` accepte uniquement `day` et `questId`. Le canal
`quests-<joueur>` est privé et ne diffuse que des invalidations, sans contenu du journal.
La reconnexion et le retour sur l'onglet relisent le tableau. Le renouvellement à minuit
ne dépend pas du cron. La tâche quotidienne purge les progressions, notifications et
réclamations versées anciennes ; les versements en attente sont conservés.

L'export contient la progression, les réclamations, les participations de calcul et les
notifications. L'effacement les supprime et conserve un marqueur pseudonyme empêchant
leur recréation au rejeu. Voir les [ADR 0010](docs/adr/0010-quetes-stockage.md) et
[0011](docs/adr/0011-quetes-communication.md).

## Tests navigateur

Installer Chromium une fois : `pnpm exec playwright install chromium`, puis lancer
`pnpm test:e2e`. Le serveur de production est démarré par Playwright sur
`http://localhost:3100`, avec une base PGlite `.data/e2e-<processus>` distincte de la base
habituelle. Aucun serveur ne doit déjà occuper ce port. Les comptes synthétiques sont
supprimés à la fin des parcours ; les bases locales restent disponibles pour diagnostic.
Les traces en cas d'échec et les captures sont dans `test-results/`, exclu de Git.
Les deux parcours sont exécutés en Chromium à 1280 × 900 et avec le profil mobile iPhone 13.
Ce profil utilise Chromium : il ne prétend pas vérifier Safari sur iOS.

Le parcours principal fonde un village, améliore sa scierie dans un deuxième onglet,
observe la progression en direct, réclame la récompense, contrôle le stock, recharge,
exporte les données et efface le compte. Le second vérifie l'isolation entre deux joueurs.
Les tests HTTP/Vitest restent exécutés par `pnpm verify` ; les tests navigateur sont
une commande séparée, car ils démarrent une construction et un serveur.

## Échanges entre modules

Une opération qui modifie les données de plusieurs modules, comme un échange du Marché, est
une saga ([ADR 0007](docs/adr/0007-saga-boite-envoi.md)). Chaque étape est une transaction locale
à un module. Les messages sont enregistrés dans la boîte d'envoi (`platform.outbox`), dans
la même transaction que les événements qui les déclenchent. Les gestionnaires sont idempotents,
car la reprise après une interruption peut remettre un même message plusieurs fois.

Le Marché réserve les ressources du vendeur, puis demande le paiement de l'acheteur. Après
ce paiement, il déclenche les deux versements. Le retrait ou l'expiration d'une offre ouverte
restitue les ressources en séquestre. La distribution a lieu après les commandes, à la consultation
de la liste du Marché et chaque jour par `/api/cron/daily`, une tâche planifiée Vercel.

## Service Village extrait

Le Village peut s’exécuter dans un service distinct, avec une base, un journal et une boîte
d’envoi propres ([ADR 0009](docs/adr/0009-extraction-village.md)). Cette configuration reste
locale. Sur deux terminaux, utilisez le même secret, généré par `openssl rand -base64 32` :

```bash
SERVICE_SECRET=<secret> pnpm exec tsx scripts/village-service.ts
REALM_SERVICE_URL=http://localhost:4000 SERVICE_SECRET=<secret> pnpm dev
```

Le service utilise `.data/village`, ou `VILLAGE_DATABASE_URL` si elle est définie. Ses
requêtes passent par la passerelle de l’application, qui transmet l’identité de session.
Un relais alimente le Classement et le temps réel par des copies du journal distant.
L’export et l’effacement atteignent les deux processus. La tâche quotidienne rattrape le relais.

Une base de service vide ne connaît pas les villages déjà présents dans l’application :
utilisez des bases d’essai distinctes ou préparez leur migration. Le retour au mode intégré
est possible une fois tous les événements relayés. Sans les deux variables du service,
le Village reste intégré, comme sur Vercel ; ne les ajoutez pas à la production.

## Performance

Le [budget](perf/budget.json) impose un p99 inférieur à 500 ms, sans erreur, sous vingt
connexions simultanées. `scripts/load-test.ts` crée vingt joueurs avec village, expédition,
offre et message, puis mesure six lectures, Quêtes comprises, pendant dix secondes chacune. Le script
échoue si la préparation des données ou le budget échoue. Il est exécuté séparément de
`pnpm verify`, avant les publications qui modifient les performances.

Pour une mesure comparable, arrêtez tout serveur utilisant la base locale, conservez cette
base à part, puis utilisez une base PGlite vide pour chaque exécution : `pnpm build`,
`AUTH_RATE_LIMIT=off pnpm start`, puis `pnpm exec tsx scripts/load-test.ts <étiquette>` dans
un second terminal. Restaurez votre base après l’arrêt du serveur de mesure.

Les [mesures avant](perf/avant.json) et [après](perf/apres.json), prises sur le même poste,
montrent un gain de débit de 30 à 40 % pour les lectures utilisant une projection ; les
lectures du Village et de la Taverne restent stables. Le chemin rapide évite une transaction
si la projection est déjà à jour. Ces résultats locaux ne mesurent pas la production.

La [mesure de l'évaluation](perf/evaluation-environment.md) du 23 octobre ne reproduit
pas ces latences : plusieurs scénarios dépassent le budget, y compris sur la contre-épreuve
du socle `td11-fin`. Les Quêtes atteignent un p99 de 965 ms sous vingt connexions, sans
erreur. Cette limite est suivie dans DT-028 ; le bonus B7 n'est pas revendiqué.

## Base de données

En développement, la base PostgreSQL est fournie par PGlite et conservée dans le répertoire
`.data/`, exclu du dépôt. Les migrations du répertoire `drizzle/` y sont appliquées au
démarrage. Pour repartir d'une base vide, arrêtez le serveur et supprimez le répertoire `.data/`.

Les tests utilisent une base PGlite en mémoire, recréée pour chaque fichier de test.

Le classement, la liste des expéditions ouvertes et celle des offres sont des modèles de lecture, tenus à jour
par des projections du journal (ADR 0006). Le rattrapage a lieu à la consultation. Une
version de projection supérieure à celle des tables déclenche leur reconstruction ;
un code plus ancien s'abstient de les modifier. Tout changement du contenu calculé
doit donc augmenter cette version. Le journal reste la source de vérité de ces modèles.
La Taverne conserve directement
ses messages et sa présence dans `tavern` : ces tables ne sont pas des projections et ne
peuvent pas être reconstruites à partir du journal.

La configuration de production utilise Neon. Les migrations y sont appliquées lors de
chaque déploiement, après les contrôles et avant la construction de l'application.

## Déploiement

L'application est déployée sur Vercel, dans la région de Francfort (`fra1`), avec une base
Neon. Chaque envoi sur `main` déclenche la commande `pnpm vercel-build` :
contrôles, migrations, construction.
L'adresse de production figure dans le champ « Website » de la rubrique « About » du
dépôt GitHub.

Les variables `DATABASE_URL` et `DATABASE_URL_UNPOOLED` sont fournies par l'intégration
Neon de Vercel. La variable `BETTER_AUTH_SECRET` est définie dans les réglages du projet
Vercel ; elle n'est jamais versionnée, et l'application refuse de démarrer sans elle
en production sur Vercel. Les limites hors Vercel sont décrites dans la revue de sécurité.

La variable `CRON_SECRET` doit aussi être définie dans l'environnement Production du projet
Vercel, avant le déploiement. Elle protège `/api/cron/daily`, appelée chaque jour à 4 h UTC
selon `vercel.json`, pour distribuer la boîte d'envoi puis purger la Taverne. Chaque tâche
renvoie son résultat ou son erreur ; l'échec de l'une n'empêche pas la suivante. Un HTTP 200
demande donc aussi de vérifier les champs `ok` du compte rendu. Sans ce secret, la route
reste fermée ; une requête sans le bon en-tête
`Authorization` reçoit HTTP 401. Le secret n'est jamais versionné.

## Documentation

- [Rendu de l’évaluation](docs/evaluation/rendu.md)
- [Fiche de cadrage des Quêtes](docs/evaluation/fiche-cadrage.md)
- [Revue de sécurité des Quêtes](docs/qualite/revue-securite-quetes.md)
- [Bilan technique](docs/bilan-technique.md)
- [Architecture](docs/architecture.md)
- [Décisions d'architecture](docs/adr/README.md)
- [Registre de la dette technique](docs/qualite/dette-technique.md)
- [Revue de sécurité de l'authentification](docs/qualite/revue-securite-authentification.md)
- [Revue de sécurité du Donjon](docs/qualite/revue-securite-donjon.md)
- [Revue de sécurité du Marché](docs/qualite/revue-securite-marche.md)
- [Registre des traitements de données personnelles](docs/rgpd/registre-traitements.md)
- [Revue de conformité au RGPD](docs/rgpd/revue-conformite.md)

## Conventions

- Messages de commit conformes à Conventional Commits.
- `pnpm verify` doit réussir avant tout envoi sur la branche `main`.

## Limites actuelles

Chaque flux temps réel relit sa source deux fois par seconde : la charge de
la base croît avec le nombre de joueurs connectés. Ce compromis, acceptable pour le nombre
de joueurs du projet, est décrit dans l'ADR 0003.

Une échéance du Donjon, en combat ou pendant l'exploration, n'est enregistrée qu'à la
prochaine commande acceptée ; toute lecture en affiche néanmoins les effets (ADR 0004).
Les expéditions de quatre joueurs restent faciles, même au niveau difficile :
l'équilibre est mesuré par le script de simulation, et décrit dans l'ADR 0005.

Le classement, la liste des expéditions ouvertes et celle des offres peuvent avoir quelques secondes de
retard sur les derniers événements. Leur reconstruction s'exécute pendant une consultation
et sa durée croît avec la taille du journal (ADR 0006). L'interface du classement attend
que sa projection atteigne la position annoncée par le canal. Les autres limites connues
sont recensées dans le registre de la dette technique.

Une offre échue ne peut plus être acceptée ni être proposée aux autres joueurs. Ses ressources
ne sont toutefois restituées qu'à la prochaine distribution, déclenchée par le Marché ou par
la tâche quotidienne. Des états intermédiaires restent visibles pendant un échange ; un message
abandonné après dix tentatives demande un diagnostic manuel. La tâche quotidienne le signale ;
`scripts/dead-letters.ts` le liste et permet sa relance une fois la cause corrigée (DT-007 remboursée).
La boîte d'envoi conserve aussi les messages traités et croît tant qu'aucune purge n'est définie.

La limitation des messages compte les insertions récentes en base ; des publications
simultanées peuvent légèrement dépasser cinq messages en trente secondes. La présence
n'est pas une preuve de connexion et plusieurs onglets partagent une même ligne.

L'effacement et l'export parcourent le journal et doivent évoluer si son volume dépasse
le temps disponible pour une requête. La rectification du nom n'a pas de parcours dédié.
La purge des sessions expirées, la minimisation des erreurs journalisées, les liens de
réidentification et les garanties contractuelles des hébergeurs restent ouvertes après la revue du TD11 ; leurs échéances sont précisées dans le registre.
La revue RGPD ne conclut pas à une conformité globale du service.

Le service extrait demande encore des migrations dédiées, la pagination du flux publié et
une distribution autonome des réponses en attente (DT-015 à DT-017). Le secret partagé
permet l’usurpation de tout joueur auprès du service en cas de fuite. L’interface n’a
pas de tests automatiques de bout en bout ; les contrôles HTTP ne vérifient pas son rendu.


Les Quêtes utilisent un catalogue fixe. La progression est cohérente à terme ; le joueur
peut devoir actualiser après une action très récente. Les participations aux expéditions
jamais terminées restent conservées (DT-026). Le marqueur d'effacement est pseudonyme et
les remises déjà en cours ne sont pas annulables (DT-027). Les messages abandonnés passent
par l'outil d'exploitation existant, sans garantie de délai de versement. Les tests
navigateur couvrent les Quêtes et le Village, pas encore tous les écrans du jeu (DT-025).

La mesure locale de charge des Quêtes dépasse le budget de 500 ms (DT-028). Les résultats
ne permettent pas d'affirmer une capacité de production ni l'absence de régression ;
une mesure stabilisée doit précéder l'augmentation de charge.
