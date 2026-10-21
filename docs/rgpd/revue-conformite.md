# Revue de conformité au RGPD

- Date : 2026-10-21.
- Périmètre : application et base active de développement, export et effacement,
  conservation, code des journaux techniques et garanties publiques d'hébergement.
- Références : RGPD, articles 5, 15, 17, 20, 25 et 30 ;
  [registre des traitements](registre-traitements.md) ; [ADR 0008](../adr/0008-donnees-personnelles.md).
- Méthode : 224 tests automatisés, parcours HTTP avec deux véritables comptes et cookies,
  flux SSE, requêtes SQL sur PGlite arrêté, lecture des dépendances installées et des
  documents publics des hébergeurs. Aucun journal privé Vercel ni réglage de sauvegarde
  Neon n'a pu être consulté ; ces vérifications ne sont pas présentées comme réalisées.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| R1 | Chaque emplacement de données personnelles figure au registre | Inventaire des schémas et rapprochement avec les sept traitements | Identité, sessions, événements, boîte d'envoi, projections, messages, présence et journaux hébergés sont recensés ; le registre distingue données actives, pseudonymes et copies externes | Conforme |
| R2 | L'export contient toutes les données du joueur, module par module | Test « exporte les données du joueur… » et téléchargement réel | Les six sections sont présentes et utiles : compte, sessions avec IP et navigateur, village, participations, offres, classement, messages et présence. Toutefois, Village et Donjon exportent des résumés, pas tout l'historique individuel conservé ; les journaux hébergés ne sont pas inclus. La portée littérale « toutes » n'est pas démontrée : DT-014 | Non conforme |
| R3 | L'export ne contient ni données d'autrui ni secrets | Test « ne contient ni les données des autres joueurs… » ; inspection du JSON réel | Ni nom du second village, ni messages du second joueur, ni graine ; aucune clé `password` ou `token`. Les routes tirent le joueur de la session et refusent un visiteur anonyme avec 401 ; téléchargement sans mise en cache | Conforme |
| R4 | Le nom du joueur et du village disparaissent des tables après suppression | Compte synthétique Zéphyrine et village Brumeval, expédition, offre et messages ; recherche SQL dans toutes les tables du projet après effacement | **14 tables examinées, 0 ligne contenant l'un des deux noms complets**. Aucun compte restant pour cet identifiant ; les vues Donjon, Marché et Classement affichent une mention neutre. Le test ne couvre pas une citation libre écrite par un autre joueur, une copie externe ni une écriture concurrente à l'effacement | Conforme sur le scénario contrôlé |
| R5 | L'effacement est tracé sans identité et peut être relancé | Tests du registre, du second appel et d'une interruption après réécriture du journal | La trace ne comporte que `id`, `erased_at`, `events_rewritten`. Une reprise ne réécrit rien de plus et corrige aussi les expéditions déjà pseudonymisées. L'identité reste disponible tant que les corrections n'ont pas abouti. La trace certifie la réécriture, pas la fin de toutes les étapes | Conforme |
| R6 | Aucun message n'est conservé plus de trente jours, même sans visite | Tests de purge à la lecture et quotidienne, exclusion du canal ; lecture de `vercel.json` | L'affichage et le canal excluent les messages expirés. La purge quotidienne fonctionne en test et l'échec d'une autre tâche ne la bloque pas. Une ligne peut toutefois rester physiquement après trente jours jusqu'au prochain passage réussi ; une panne prolonge ce délai. L'exécution manuelle du cron en production reste à constater dans Vercel : DT-013 | Non conforme à la borne stricte |
| R7 | La présence ne constitue aucun historique de visites | Tests de présence, départ explicite et silence réel de plus de deux minutes | Une clé par joueur, un `upsert` du dernier signal serveur et suppression des lignes périmées. Le second joueur disparaît après 123 secondes sans signal. Aucun événement de présence n'est écrit ; la suppression physique attend une lecture ou la purge | Conforme |
| R8 | Les sessions expirées ne restent pas indéfiniment | SQL `SELECT count(*) FROM identity.session WHERE expires_at < now()` ; lecture de Better Auth installé | **0 session expirée sur 4 lignes** dans la base inspectée. Ce constat ponctuel ne garantit pas le nettoyage : Better Auth supprime notamment la session expirée lorsqu'elle est présentée à nouveau ; aucune tâche du projet ne purge les sessions abandonnées. IP et navigateur sont alors conservés sans borne : DT-009 | Non conforme |
| R9 | Les journaux ne contiennent que les données nécessaires | Lecture de `app.onError`, de l'outbox et expérience d'insertion SQL en échec sur une base isolée | `console.error(error)` transmet l'erreur entière. L'erreur Drizzle observée contient le corps synthétique du message dans `message` et `params`, ainsi que la requête. L'outbox conserve aussi `lastError`. La réponse au joueur est générique, mais cela ne minimise pas les journaux serveur : DT-010 | Non conforme |
| R10 | L'identifiant restant ne peut plus être relié à une personne | SQL identité/outbox après suppression ; chemin du canal Village et documentation Vercel | **0 compte, 1 message de boîte d'envoi** mentionnant encore l'identifiant testé. Un chemin `/api/stream/village-<id>` peut être rapproché de l'IP et du navigateur consignés par Vercel. La fenêtre Runtime Logs Hobby publiée est d'une heure, sans preuve d'effacement de toutes les copies. Une anonymisation irréversible n'est donc pas établie : DT-011 | Non conforme |

## Manipulations et portée des résultats

Deux comptes synthétiques distincts ont fondé leur village ; l'un a ouvert une expédition
rejointe par l'autre et publié une offre. Les cinq messages du premier ont été exportés,
puis supprimés avec sa présence et ses sessions. Une tentative de connexion avec les anciens
identifiants reçoit 401. Le second compte constate l'absence de ces messages et les noms
neutres des projections. Les comptes créés pour ces manipulations ont ensuite été effacés.

La recherche SQL R4 a utilisé des suffixes uniques pour éviter les homonymes, puis cherché
les noms complets dans la représentation textuelle de chaque ligne des 14 tables métier et
de plateforme. Le serveur était arrêté ; le script temporaire a été supprimé et n'est pas
versionné. Le contrôle R8 a été exécuté sur la même base, sans insérer de fausse session
expirée. Pour R9, une autre base en mémoire avec une contrainte sur le message a produit
l'erreur ; aucune erreur contenant des données réelles n'a été provoquée en production.

Le parcours HTTP valide les sessions, les réponses et les flux, sans valider visuellement
l'interface dans deux fenêtres. Le bouton `SUPPRIMER`, son état désactivé et son traitement
réseau ont été relus dans le code ; la construction de production réussit.

La [documentation Vercel](https://vercel.com/docs/logs/runtime) décrit `requestPath`, le
filtrage par IP/navigateur et les fenêtres de conservation. Le rapprochement de R10 est
une déduction de ces champs et des URL de l'application, pas l'observation d'une entrée
privée du projet. Le [registre](registre-traitements.md) précise les garanties contractuelles
qui restent à obtenir. Un export téléchargé ou une citation par un autre joueur peut aussi
conserver un lien hors des lignes supprimées.

## Synthèse

Sur les dix exigences : **5 conformes dans le périmètre contrôlé, 5 non conformes,
0 en risque accepté**. Le succès des 224 tests confirme les comportements programmés ;
il ne transforme pas les limites relevées en conformité globale au RGPD.

Les actions sont inscrites au [registre de dette technique](../qualite/dette-technique.md),
avec réexamen au TD11 : rectification coordonnée (DT-008), purge des sessions (DT-009),
minimisation des erreurs (DT-010), identifiants et copies résiduelles (DT-011), information
et garanties d'hébergement (DT-012), délai réel et surveillance des purges (DT-013),
complétude de l'export (DT-014). Une mise à disposition hors du cadre pédagogique demande
notamment de lever les réserves sur l'information et les sous-traitants.
