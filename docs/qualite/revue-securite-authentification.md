# Revue de sécurité du parcours d'authentification

- Date : 2026-10-20
- Périmètre : inscription, connexion, déconnexion, sessions, accès à l'API, aux pages du jeu
  et aux canaux temps réel ajoutés au TD5.
- Références : OWASP Top 10, OWASP ASVS.
- Versions examinées : Better Auth 1.7.7 et Next.js 16.4.0, d'après les dépendances installées.
- Méthode : lecture du code et des dépendances, revue indépendante, tests et requêtes HTTP
  sur une copie isolée du projet, puis inspection du cookie dans un navigateur en
  production sur Vercel avec un compte de vérification.

Les statuts utilisés sont « Conforme », « Non conforme » et « Risque accepté ».
Une protection qui ne couvre qu'une partie de l'exigence reste notée non conforme.
L'acceptation d'un risque doit être justifiée dans le constat.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| S1 | Les mots de passe ne sont conservés que sous forme d'empreinte, par une fonction dédiée | Test « ne conserve qu'une empreinte du mot de passe » ; implémentation installée de Better Auth | Le mot de passe n'apparaît pas en clair en base. Better Auth enregistre une empreinte `scrypt` avec un sel aléatoire de 16 octets. | Conforme |
| S2 | Les mots de passe comportent au moins 8 caractères | Test « refuse un mot de passe trop court » ; configuration serveur | Le serveur refuse les mots de passe de moins de 8 caractères avec une réponse `400`. | Conforme |
| S3 | Les tentatives répétées d'inscription et de connexion sont limitées | Configuration et essais aux seuils ; lecture du traitement des adresses IP | Les essais sont bloqués à partir de la 41e inscription ou de la 61e connexion en une minute (`429`). Mais la limitation reste désactivable en production hors Vercel et les compteurs ne sont pas partagés entre instances. Sur un serveur Next directement exposé, changer `X-Forwarded-For` permet aussi de contourner la limite (A2). | Non conforme |
| S4 | Le cookie de session est inaccessible au JavaScript de la page | Test sur l'attribut `HttpOnly` | Le cookie porte bien l'attribut `HttpOnly` : le JavaScript de la page ne peut pas le lire. | Conforme |
| S5 | Le cookie de session n'est pas envoyé par les requêtes émises depuis un autre site | Test sur l'attribut `SameSite` ; lecture des attributs effectifs | Le cookie utilise `SameSite=Lax`. Il peut donc encore être envoyé quand on arrive sur le site par un lien externe. Ce réglage ne répond pas complètement à l'exigence. Les requêtes de modification sont vérifiées en S15. | Non conforme |
| S6 | Le cookie de session ne circule que sur des connexions chiffrées | Inspection du cookie dans le navigateur ; comparaison entre le serveur local et le déploiement Vercel | En production, le cookie se nomme `__Secure-better-auth.session_token` et porte les attributs `Secure` et `HttpOnly` : le navigateur ne le transmet que sur HTTPS. En local, sur `http://localhost`, l'attribut `Secure` est absent. | Conforme |
| S7 | Le secret de signature n'est pas versionné, et son absence en production empêche le démarrage | Recherche des références versionnées ; `resolveSecret` ; essais sans secret | Sans secret configuré, seule la production sur Vercel est bloquée. Ailleurs, le code reprend le secret de développement présent dans le dépôt. Ce secret a permis d'obtenir la session d'un compte de test (A1). | Non conforme |
| S8 | La connexion ne révèle pas si une adresse est inscrite | Test comparant statut et corps pour adresse inconnue et mauvais mot de passe | Une adresse inconnue et un mauvais mot de passe donnent la même réponse : `401`, avec `INVALID_EMAIL_OR_PASSWORD`. Les temps de réponse n'ont pas été comparés. | Conforme |
| S9 | L'inscription ne révèle pas si une adresse est inscrite | Deux inscriptions avec la même adresse de test | La première inscription réussit (`200`). La seconde est refusée (`422`) et affiche « Cette adresse est déjà utilisée. ». On peut donc savoir si une adresse possède un compte. | Non conforme |
| S10 | Toute route de l'API réservée aux joueurs refuse une requête anonyme | Tests du Village ; essais avec le véritable adaptateur et sans cookie | Sans session, les trois routes du Village renvoient `401` : lecture, création et amélioration d'un bâtiment. La route de santé reste publique. La protection est ajoutée module par module : pour éviter un oubli, chaque nouveau module protégé devra avoir son test d'accès anonyme. | Conforme |
| S11 | Un joueur ne peut accéder qu'à ses propres données | Test d'isolation ; suivi de `userId` ; essai avec un identifiant ajouté au corps | Chaque compte de test ne retrouve que son village. L'identifiant du joueur vient de la session ; en ajouter un autre dans la requête ne change pas le propriétaire. Le problème de secret décrit en S7 reste toutefois à corriger. | Conforme |
| S12 | Les pages du jeu sont protégées sur le serveur, avant tout rendu | Lecture du layout ; requête HTTP anonyme ; guide Next.js installé | Sans session, `/village` redirige vers `/login` (`307`). Mais le layout n'est pas revérifié à chaque navigation et n'empêche pas à lui seul l'exécution des composants enfants. Les données du Village restent protégées par l'API. | Non conforme |
| S13 | Les erreurs imprévues ne révèlent aucun détail technique au client | Lecture de `onError` ; exception injectée dans la garde de l'API | L'erreur provoquée pendant le test renvoie `500` avec le message « Erreur interne ». Les détails restent dans les logs du serveur. Les erreurs survenant avant Hono ne sont pas couvertes par ce contrôle. | Conforme |
| S14 | La déconnexion invalide la session sur le serveur | Conservation du cookie, déconnexion, puis nouvelle lecture de session | Après déconnexion, réutiliser l'ancien cookie ne donne plus accès à la session (`null`). Le résultat est le même dans le test et par HTTP. | Conforme |
| S15 | Une requête d'authentification accompagnée d'un cookie et émise depuis une autre origine est refusée | `POST /api/auth/sign-out` avec cookie valide et `Origin: https://foreign.example`, sur serveur local hors mode test | La déconnexion depuis une origine étrangère est refusée (`403`, `INVALID_ORIGIN`) et la session reste ouverte. Depuis l'origine autorisée, elle fonctionne. | Conforme |
| S16 | Un flux temps réel n'est accessible qu'aux joueurs connectés, et seulement pour les canaux auxquels ils ont droit | Tests « réserve le temps réel aux joueurs connectés (401) », « refuse l'écoute du village d'un autre joueur (403) » et « refuse un canal qu'aucune règle ne couvre (403) » ; lecture de `channel-policy.ts` et de la route de repli | Un visiteur anonyme reçoit `401`, un joueur visant le village d'un autre joueur reçoit `403`. Un canal sans règle est refusé par défaut. La route JSON de repli applique les mêmes contrôles. | Conforme |

## Synthèse

**16 exigences : 11 conformes, 5 non conformes et 0 risque accepté.**

Les contrôles d'accès au Village, le stockage des mots de passe et la révocation
normale des sessions fonctionnent dans les scénarios vérifiés. S6 et S16 sont conformes :
le cookie de production est limité à HTTPS et les canaux temps réel sont protégés.

Les non-conformités S3, S5, S7, S9 et S12 restent documentées. En particulier, le
repli sur le secret de développement doit être corrigé avant une exposition hors
Vercel ; la production Vercel refuse déjà de démarrer sans secret configuré.

## Actions à traiter

| Action | Exigences | Correction attendue | Critère de clôture |
| --- | --- | --- | --- |
| A1 — Prioritaire avant exposition publique | S7 | Refuser toute production sans secret aléatoire propre à l'installation, indépendamment de Vercel. Réserver le repli aux environnements locaux. Vérifier la configuration avant de servir les requêtes. | Tests avec et sans `VERCEL` : aucune initialisation de production sans secret. Un jeton signé avec la constante de développement est rejeté. |
| A2 — Avant exposition publique | S3 | Interdire la désactivation de la limitation en production ; définir une source d'adresse IP fiable. Si un proxy est utilisé, lui faire remplacer les en-têtes entrants et empêcher l'accès direct au serveur. Partager les compteurs entre instances lorsque nécessaire. | Dépassements renvoyant `429`, y compris avec `AUTH_RATE_LIMIT=off` en production ; changement d'un en-tête fourni par le client sans remise à zéro du compteur effectif. |
| A3 — Vérifiée sur Vercel | S6 | Contrôler HTTPS et les attributs du cookie sur le déploiement réel. Imposer également HTTPS si un autre hébergement est utilisé. | Sur Vercel, cookie `__Secure-better-auth.session_token` observé avec `Secure` et `HttpOnly`. Le comportement `SameSite=Lax` reste traité séparément en S5. |
| A4 — À décider avant validation de la revue | S9 | Concevoir une inscription à réponse générique, avec un parcours de vérification adapté et sans connexion automatique révélant la différence entre adresse nouvelle et existante. Changer seulement le texte du formulaire ne suffit pas. | Statut, corps et effets observables du parcours ne permettent plus de distinguer les deux cas ; sinon, décision explicite et documentée d'acceptation du risque. |
| A5 — Clarifier l'exigence | S5 | Choisir entre l'interdiction stricte des envois intersites et le comportement `Lax` actuel. Si `Lax` est conservé, reformuler l'exigence et documenter les navigations permises avec les contrôles CSRF complémentaires. | Exigence cohérente avec la politique du cookie et tests navigateur des scénarios retenus. |
| A6 — Consolider la protection des pages | S12 | Conserver la redirection du layout et vérifier l'identité au plus près de tout futur accès serveur à des données privées. Ne pas utiliser le layout comme unique frontière d'autorisation. | Tests d'accès direct, de navigation et de session expirée ; aucun accès aux données privées sans contrôle serveur. |

Pour A1, le risque ne se limite pas à la signature du cookie. Le secret de repli
est aussi utilisé par les routes standard de Better Auth montées sous
`/api/auth/*`. Dans la copie isolée, un jeton de vérification d'adresse fabriqué
avec cette clé a permis d'obtenir une session d'un compte de test existant.
Ce scénario exige une instance utilisant effectivement le repli ; il n'établit
pas qu'un déploiement réel est compromis. Si cette configuration a déjà été
exposée, prévoir une rotation du secret et la révocation des sessions concernées.

## Vérifications exécutées

La suite existante a été exécutée dans une copie du répertoire de travail, avec
une base PGlite de test :

```sh
pnpm exec vitest run \
  src/platform/auth/better-auth.test.ts \
  src/bootstrap/realm-api.test.ts \
  src/bootstrap/create-api.test.ts
```

Résultat : **19 tests réussis dans 3 fichiers**.

Des vérifications ponctuelles, hors de la suite versionnée, ont également été
exécutées dans cette copie :

- **12 tests réussis** : doublon d'inscription, révocation, cookies HTTP/HTTPS,
  configurations de secret, contrôle des trois routes avec le véritable adaptateur,
  isolation, erreur interne, seuils de limitation et reproduction locale de S7.
  Une réussite peut confirmer une non-conformité : ces tests caractérisent
  le comportement actuel.
- **1 cas écarté de l'exécution Vitest finale et vérifié par HTTP** : S15.
  Better Auth désactive par défaut le contrôle d'origine lorsque son environnement
  est détecté comme `test`. Le premier essai sous Vitest a donc renvoyé `200` ;
  il ne permettait pas de conclure sur le fonctionnement hors test.
- **Contrôles HTTP sur Next.js en développement, sur la boucle locale** :
  `/village` anonyme → `307 /login` ; API Village anonyme → `401` ;
  déconnexion d'origine étrangère → `403 INVALID_ORIGIN` sans révocation ;
  déconnexion autorisée → `200`, puis ancienne session → `null`.

Les essais n'ont modifié ni la base de travail du projet, ni le code applicatif.
Les vérifications ponctuelles devront être intégrées à la suite de régression
lors des corrections, notamment S6, S7, S14 et S15.

## Preuves et limites

Les principaux points de contrôle se trouvent dans :

- [L'adaptateur Better Auth](../../src/platform/auth/better-auth.ts) :
  URL, secret, mots de passe, limitation et lecture de session.
- [Les tests d'authentification](../../src/platform/auth/better-auth.test.ts) :
  empreinte, longueur, cookie et réponses de connexion.
- [La composition de l'API](../../src/bootstrap/create-api.ts),
  [la garde](../../src/platform/http/require-user.ts) et
  [les routes du Village](../../src/modules/realm/api.ts) :
  authentification, erreurs et identité du propriétaire.
- [Le layout du jeu](../../app/(jeu)/layout.tsx),
  [l'initialisation du serveur](../../src/bootstrap/server.ts) et
  [la déconnexion côté interface](../../src/ui/app-shell.tsx).

Les comportements de bibliothèque ont été vérifiés dans les sources installées :
`better-auth/dist/cookies/index.mjs`, `context/create-context.mjs`,
`api/rate-limiter/index.mjs`, `api/routes/sign-up.mjs`,
`api/routes/sign-out.mjs`, `api/routes/email-verification.mjs` et
`api/middlewares/origin-check.mjs`. L'implémentation de `scrypt` se trouve dans
`@better-auth/utils/dist/password.node.mjs`. Pour S12, le guide local
`node_modules/next/dist/docs/01-app/02-guides/authentication.md`,
section « Layouts and auth checks », décrit les limites d'une garde de layout.

La revue n'est pas une certification OWASP. Elle ne vérifie ni l'historique Git
des secrets, ni l'ensemble de la configuration de l'hébergement, ni la résistance
temporelle de l'authentification. Le cookie HTTPS a été vérifié sur Vercel ; ce constat
ne couvre pas un autre hébergement. La garantie S13
ne couvre pas les erreurs d'initialisation survenant avant l'entrée dans Hono.
Pour S14, une panne de base pendant la suppression de session n'a pas été
simulée ; Better Auth journalise cette erreur, ce qui mérite un test de panne
distinct. Aucun de ces points non vérifiés n'est présenté comme un risque accepté.
