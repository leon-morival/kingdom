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
  ui/                 Thème et composants d'interface partagés
scripts/              Scripts d'exploitation (migrations)
drizzle/              Migrations de la base de données
docs/
  adr/                Décisions d'architecture
  qualite/            Dette technique et revues
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

## Temps réel

Les changements sont diffusés aux navigateurs par des Server-Sent Events, à l'adresse
`/api/stream/<canal>`. Chaque canal n'est accessible qu'aux joueurs connectés autorisés par
la règle du module concerné. Le canal `village-<joueur>` n'est ainsi accessible qu'au
propriétaire du village, et le canal `dungeon-<expédition>` aux seuls membres de l'expédition.

La plupart des canaux correspondent à un flux du journal d'événements. Le canal `ranking`
est un canal global : il suit, dans tout le journal, les événements qui modifient le
classement. Sans point de reprise, il commence à la dernière position du journal ;
une reconnexion reprend après la position précédemment reçue.

Les canaux du Donjon et du Classement sont discrets : ils ne transmettent que la position,
le flux, le type et la version des événements, et chaque navigateur relit sa propre vue, filtrée
par le serveur.

Un flux se ferme de lui-même au bout de 240 secondes, et le navigateur s'y reconnecte
sans perte d'événement. En développement, la variable `STREAM_MAX_SECONDS` permet de
raccourcir cette durée pour observer la reconnexion.

## Base de données

En développement, la base PostgreSQL est fournie par PGlite et conservée dans le répertoire
`.data/`, exclu du dépôt. Les migrations du répertoire `drizzle/` y sont appliquées au
démarrage. Pour repartir d'une base vide, arrêtez le serveur et supprimez le répertoire `.data/`.

Les tests utilisent une base PGlite en mémoire, recréée pour chaque fichier de test.

Le classement et la liste des expéditions ouvertes sont des modèles de lecture, tenus à jour
par des projections du journal (ADR 0006). Le rattrapage a lieu à la consultation. Une
version de projection supérieure à celle des tables déclenche leur reconstruction ;
un code plus ancien s'abstient de les modifier. Tout changement du contenu calculé
doit donc augmenter cette version. Le journal reste la seule source de vérité.

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

## Documentation

- [Architecture](docs/architecture.md)
- [Décisions d'architecture](docs/adr/README.md)
- [Registre de la dette technique](docs/qualite/dette-technique.md)
- [Revue de sécurité de l'authentification](docs/qualite/revue-securite-authentification.md)
- [Revue de sécurité du Donjon](docs/qualite/revue-securite-donjon.md)

## Conventions

- Messages de commit conformes à Conventional Commits.
- `pnpm verify` doit réussir avant tout envoi sur la branche `main`.

## Limites actuelles

Chaque flux temps réel relit le journal d'événements deux fois par seconde : la charge de
la base croît avec le nombre de joueurs connectés. Ce compromis, acceptable pour le nombre
de joueurs du projet, est décrit dans l'ADR 0003.

Une échéance du Donjon, en combat ou pendant l'exploration, n'est enregistrée qu'à la
prochaine commande acceptée ; toute lecture en affiche néanmoins les effets (ADR 0004).
Les expéditions de quatre joueurs restent faciles, même au niveau difficile :
l'équilibre est mesuré par le script de simulation, et décrit dans l'ADR 0005.

Le classement et la liste des expéditions ouvertes peuvent avoir quelques secondes de
retard sur les derniers événements. Leur reconstruction s'exécute pendant une consultation
et sa durée croît avec la taille du journal (ADR 0006). L'interface du classement attend
que sa projection atteigne la position annoncée par le canal. Les autres limites connues
sont recensées dans le registre de la dette technique.
