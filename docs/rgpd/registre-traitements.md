# Registre des traitements de données personnelles

Ce registre, prévu par l'article 30 du RGPD, recense les traitements de Royaumes. Toute
évolution des données doit mettre à jour leur finalité, leur conservation et leurs
mesures de protection dans le même changement que le code.

- Responsable du traitement : Leon Morival — leon.morival@gmail.com.
- Dernière mise à jour : 2026-10-22.
- Personnes concernées : joueurs inscrits et visiteurs pour les journaux techniques.
- Périmètre : application, base active, journaux et prestations d'hébergement. Les bases
  de développement et de test utilisent des données synthétiques pour la présente revue.

## Sous-traitants

Constats issus des documents publics consultés le 21 octobre 2026. L'existence d'un DPA
ne démontre pas à elle seule son application au compte ni la conformité du service.

| Sous-traitant | Rôle | Localisation des données | Garanties à vérifier |
| --- | --- | --- | --- |
| Vercel | Exécution de l'application, diffusion web, journaux techniques | Fonctions configurées en `fra1` dans `vercel.json` ; ce réglage ne garantit pas la localisation de tous les journaux, services de contrôle et accès de support | Le [DPA public](https://vercel.com/legal/dpa), effectif le 31 mars 2026, vise Pro et Enterprise dans son introduction ; sa couverture de Hobby n'est pas établie. Il prévoit des clauses contractuelles types pour certains transferts internationaux. Obtenir la garantie applicable au compte Hobby, les lieux de traitement et les règles de suppression des copies (DT-012). |
| Neon / Databricks | Base PostgreSQL et sauvegardes | Francfort est une [région disponible](https://neon.com/docs/introduction/regions) ; la région effective du projet et ses sauvegardes doivent être attestées dans la console, non déduites du réglage Vercel | Les [conditions Neon du 14 octobre 2026](https://neon.com/platform-terms) renvoient au [contrat Databricks](https://www.databricks.com/legal/mcsa), qui incorpore le DPA. Elles mentionnent notamment Grafana Labs aux États-Unis. Le [DPA lié par ce contrat](https://www.databricks.com/sites/default/files/legal/dpa-20230721.pdf) prévoit des clauses contractuelles types pour les transferts restreints. Vérifier le contrat applicable, les sous-traitants, les accès hors UE et la fenêtre de restauration du projet (DT-012). |

La sélection d'une région européenne ne suffit donc pas à conclure à l'absence de
transferts hors UE. Aucun contrat supplémentaire n'a été signé à l'occasion de cette revue.

## Traitements

Les bases légales ci-dessous expriment les finalités retenues pour le service. Elles
restent à accompagner d'une information accessible aux joueurs et de conditions du jeu
adaptées ; un document technique ne remplace pas cette information (DT-012).

| N° | Traitement | Finalité | Données | Personnes concernées | Base légale | Durée de conservation effective et cible | Emplacement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Comptes | Accès au jeu | Identifiant, nom, courriel, empreinte du mot de passe, dates ; champs Better Auth de vérification, image et identifiants de connexion | Joueurs | Exécution du contrat de jeu | Jusqu'à suppression du compte ; sessions et comptes de connexion supprimés par cascade. Les mécanismes de vérification/réinitialisation ne sont pas activés ; leur table technique est inventoriée avant toute évolution | `identity.user`, `identity.account`, `identity.verification` |
| T2 | Sessions | Maintien de la connexion ; sécurité à justifier pour IP et navigateur | Identifiant et jeton de session, identifiant du joueur, IP, navigateur, dates de création, mise à jour et expiration | Joueurs | Exécution du contrat ; intérêt légitime de sécurité à documenter | Cible : expiration, déconnexion ou suppression du compte. Les sessions abandonnées ne sont pas purgées périodiquement : leur durée physique n'est pas bornée par le code actuel (DT-009) | `identity.session` |
| T3 | Activité de jeu et projections | Fonctionnement du Village, Donjon, Marché et Classement ; reprise des échanges | Identifiants, noms du joueur et du village, actions, dates, participations, scores, mouvements de ressources, messages de saga et erreurs de distribution | Joueurs | Exécution du contrat ; conservation résiduelle à justifier | Noms remplacés à la suppression du compte. Événements, identifiants pseudonymes, projections et messages traités de la boîte d'envoi restent conservés sans limite définie. Les liens résiduels et cette durée sont à revoir (DT-011) | `platform.events`, `platform.outbox`, `ranking.players`, `ranking.game_players`, `dungeon.open_games`, `market.offers` |
| T4 | Messagerie | Discussion entre joueurs | Corps du message, identifiant et nom de l'auteur, date | Joueurs | Exécution du contrat | Trente jours de visibilité ; suppression physique à la lecture suivante ou au prochain passage quotidien réussi, ou lors de la suppression du compte. Dépassement possible jusqu'au passage de purge, davantage en cas de panne (DT-013) | `tavern.messages` |
| T5 | Présence | Affichage des joueurs présents | Identifiant, nom, dernier signal horodaté par le serveur | Joueurs | Exécution du contrat | Une ligne actualisée, aucun historique. Absence après deux minutes sans signal ; suppression lors d'un départ explicite, d'une lecture ou d'une purge quotidienne, ou avec le compte | `tavern.presence` |
| T6 | Registre des effacements | Traçabilité des réécritures et responsabilité | Identifiant de trace, date, nombre d'événements réécrits ; aucun identifiant ni nom du joueur | Aucune identité enregistrée directement ; un rapprochement temporel externe reste possible | Responsabilité au titre de l'article 5 ; durée à réexaminer avec les traces techniques | Pas de purge actuellement. Une ligne par transaction de réécriture validée, y compris lors d'une reprise ; ne certifie pas l'achèvement des étapes suivantes | `platform.erasures` |
| T7 | Journaux techniques | Diagnostic et sécurité | IP, navigateur, chemin et paramètres de requête, dates, erreurs ; contenu personnel possible dans une erreur SQL | Joueurs et visiteurs | Intérêt légitime de maintenance et sécurité, avec minimisation | Runtime Logs : fenêtre publiée de **1 heure pour Hobby** ; Pro 1 jour, Enterprise 3 jours, extensions possibles. Les logs de construction ont une conservation distincte. La suppression de compte ne purge pas ces traces ; durée des copies et sauvegardes non attestée (DT-010, DT-011, DT-012) | Vercel ; sortie du serveur local en développement |
| T8 | Limitation des connexions et inscriptions | Prévenir les essais massifs avec des compteurs communs aux instances | Clé composée de l’IP et du chemin, compteur et date de dernière tentative ; pas d’identifiant de compte | Joueurs et visiteurs | Intérêt légitime de sécurité à documenter | Fenêtres configurées de 60 secondes ; Better Auth élague les anciennes lignes lors de certaines requêtes réinitialisant une fenêtre, sans purge quotidienne. Une ligne peut donc subsister pendant l’inactivité ; pas d’effacement par compte (DT-024) | `identity.rate_limit` |

La [documentation Runtime Logs](https://vercel.com/docs/logs/runtime) décrit les durées
par offre, `requestPath` et le filtrage par IP/navigateur. La fenêtre consultable n'est pas
une preuve d'effacement de toute copie interne, notamment après changement d'offre.
Les [limites Vercel](https://vercel.com/docs/limits) distinguent les journaux de construction.

## Destinataires et mesures de sécurité

Les autres joueurs voient les noms publics, les messages, la présence et les vues de jeu
autorisées. Le courriel, les sessions et l'export ne leur sont pas accessibles. Le responsable
et les prestataires d'hébergement peuvent accéder aux données nécessaires à l'exploitation.
Better Auth est une bibliothèque intégrée, pas un service d'identité tiers du projet.

HTTPS protège les échanges de production. Better Auth signe les cookies et conserve une
empreinte du mot de passe. `requireUser` protège les routes ; les contrôles métier limitent
l'accès aux villages et aux expéditions. L'export exclut mots de passe, jetons, graines et
données des autres joueurs et utilise `Cache-Control: private, no-store`. Les secrets sont
dans les variables d'environnement ; `/api/cron/daily` reste fermée sans `CRON_SECRET`.
Les compteurs de connexion sont partagés en base ; le test de limitation vérifie le refus
de la 61e tentative et la présence du compteur à 60. La clé IP/route n’est pas reliée à
un compte : elle n’est pas incluse dans son export individuel.
Les garanties et limites sont examinées dans les revues de sécurité et de conformité.

## Droits des personnes

| Droit | Mise en œuvre et limites |
| --- | --- |
| Accès et portabilité (articles 15 et 20) | « Mes données », export JSON via `/api/account/export` : six contributeurs, compte et sessions, village courant, participations, offres, messages, présence et classement. L'export ne contient pas encore tout l'historique individuel des actions ni les traces hébergées : DT-014. |
| Effacement (article 17) | `DELETE /api/account`, uniquement pour le joueur connecté : réécriture des noms, correction des projections, suppression des messages, présence et identité en dernier. Reprise possible après interruption. Les sauvegardes, journaux externes et copies faites par autrui restent hors de cette opération : DT-011. |
| Rectification (article 16) | Aucun parcours de correction coordonnée du nom et de ses copies ; une modification isolée de l'identité ne corrigerait pas les événements existants : DT-008. |

Références : [droits des personnes, texte du RGPD publié par la CNIL](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3),
[ADR 0008](../adr/0008-donnees-personnelles.md), [revue de conformité](revue-conformite.md).
