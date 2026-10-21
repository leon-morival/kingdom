# ADR-0008 - Stockage classique pour la Taverne et réécriture ciblée des champs personnels du journal

- Statut : accepté
- Date : 2026-10-21

## Contexte

Les messages et la présence dans la Taverne sont destinés à disparaître. Leur historique
n'alimente aucune règle de jeu ni projection. Les droits d'accès, de portabilité et
d'effacement concernent cependant l'ensemble du jeu, au-delà de ce nouveau module.

Des noms de joueurs sont déjà copiés dans les événements du Donjon et du Marché ; le
Village conserve le nom choisi à sa fondation. Certains flux sont partagés entre plusieurs
joueurs. Les supprimer détruirait aussi l'historique des autres participants. Le journal
en ajout seul ([ADR 0002](0002-event-sourcing-village.md)) et les projections qui en dérivent
([ADR 0006](0006-cqrs-projections.md)) doivent conserver les décisions de jeu.

L'hébergement ne dispose pas d'un serveur permanent pour détecter les déconnexions. Une
tâche quotidienne et les requêtes des navigateurs peuvent assurer le nettoyage.

## Décision

La Taverne stocke ses messages et sa présence dans des tables ordinaires de son propre
schéma. Les messages expirent après trente jours. Le module fournit une source au canal
temps réel : elle lit les messages par identifiant croissant sans les inscrire au journal.

Le navigateur signale sa présence toutes les trente secondes. Une seule ligne par joueur
contient son dernier signal, sans historique de visites. Un départ explicite la supprime ;
un silence de plus de deux minutes rend le joueur absent. La lecture supprime les lignes
périmées. La tâche quotidienne purge aussi messages et présence, même sans visite : la
suppression physique peut donc suivre l'échéance jusqu'au prochain passage réussi.
Les messages expirés ne sont plus exposés par l'historique ni par le canal.

Chaque module fournit un contributeur aux droits des joueurs : export, désignation des
champs personnels de ses événements et effacement de ses tables. La plateforme assemble
ces contributions sans connaître le métier. L'export appartient uniquement au joueur
connecté ; il exclut les secrets et les données des autres participants.

L'effacement autorise une exception strictement limitée à l'ajout seul : une fonction
unique de la plateforme remplace les seuls champs de nom du joueur et de son village par
des mentions neutres. Types, positions, versions, dates, graines, identifiants et décisions
de jeu restent inchangés. La transaction inscrit aussi dans `platform.erasures` une date
et un nombre d'événements réécrits, sans identifiant ni nom du demandeur. Cette trace porte
sur la réécriture validée, pas sur une garantie de fin de toutes les étapes suivantes.

Les contributeurs corrigent ensuite leurs tables. L'identité est supprimée en dernier,
avec les sessions et les moyens de connexion par cascade. Chaque étape est idempotente ;
le joueur peut relancer une opération interrompue tant que son compte existe. Le Donjon
retrouve toutes ses expéditions à chaque reprise, même si leur événement a déjà été réécrit.
Les identifiants conservés constituent une pseudonymisation, sans promesse d'anonymisation.

## Conséquences

### Positives

- Les joueurs exportent leurs données et suppriment leur compte depuis « Mes données ».
- Les parties, les totaux reconstruits et l'historique des autres joueurs restent intacts,
  aux noms remplacés près ; les projections peuvent toujours être reconstruites.
- La Taverne évite un journal inutile et bénéficie de suppressions simples et indexées.
- La purge quotidienne traite aussi les périodes sans activité ; le temps réel réutilise
  la diffusion, la reprise et le repli existants avec une autre source.

### Négatives

- L'exception à l'ajout seul doit rester confinée aux champs personnels ; elle ne justifie
  aucune correction arbitraire d'une décision passée.
- L'export et l'effacement parcourent le journal : leur coût augmente avec sa taille.
- Tout futur événement contenant une donnée personnelle exige une contribution explicite,
  sinon son champ échappera à l'effacement.
- Les étapes globales ne forment pas une transaction unique. Une panne peut laisser un
  effacement partiel, à relancer ; la tâche quotidienne peut aussi échouer.
- Les identifiants persistants peuvent encore être rapprochés de journaux techniques,
  sauvegardes ou données détenues par d'autres joueurs. La destruction du compte ne
  démontre pas à elle seule la disparition de tous les liens avec la personne.

## Alternatives écartées

- **Event Sourcing pour la Taverne** : aucun rejeu utile, alors que les messages doivent
  être supprimés régulièrement et sur demande.
- **Suppression des flux du joueur** : les expéditions et les échanges partagés perdraient
  aussi les actions des autres joueurs et les données nécessaires aux projections.
- **Effacement cryptographique** : demanderait une gestion de clés et le déchiffrement
  dans les modules et projections ; ne traite pas directement les noms déjà en clair.
- **Références sans copie de nom** : préférable dès la conception d'un nouveau module,
  mais ne suffit pas à effacer les copies déjà présentes dans le journal.
- **Service externe de présence** : ajoute une dépendance et un sous-traitant pour un
  besoin couvert par une ligne temporaire et un signal périodique.

## Réexamen

Revoir cette décision lors de la conception d'un nouveau module pour privilégier les
références sans copie, si le volume du journal dépasse la durée possible d'une requête,
ou si une procédure d'effacement durable et indépendante du navigateur devient nécessaire.
Une évolution des garanties d'hébergement, des durées de conservation, ou de l'analyse des
risques de réidentification impose aussi un réexamen. Les limites constatées figurent dans
la revue de conformité et le registre de dette technique.

## Usage de l'IA générative

Aide à la formulation et à la relecture. Vérification par comparaison avec le code,
les consignes du TD et les tests d'export, d'effacement, de reprise et de conservation.
