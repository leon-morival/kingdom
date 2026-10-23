# Mesures de charge de l'évaluation, 23 octobre 2026

## Méthode

Poste Linux, Node 24.14.1, pnpm 12.14.0, Next.js 16.4.1, PGlite 0.5.9.
Constructions de production ; vingt comptes synthétiques, chacun avec village,
expédition, offre et message ; vingt connexions, dix secondes par lecture.
La limite d'authentification est désactivée uniquement sur les serveurs locaux de mesure.
Le script utilise le cookie du premier des vingt joueurs, comme au TD11.
Aucune préchauffe n'exclut le premier rattrapage d'une projection du résultat.
Les bases sont initialement vides et distinctes des données de développement.

Les fichiers sont les sorties brutes du script ; aucun seuil n'a été modifié :
p99 de 500 ms, zéro erreur. Les constructions et les tests ont été terminés avant
la mesure finale et avant la contre-épreuve du socle. Le poste héberge également
d'autres applications ; il n'est pas une machine de benchmark dédiée.

- `evaluation-quetes-initial.json` : première version du tableau, lectures séparées
  et distribution systématique ; des tests ciblés ont aussi tourné pendant le début
  de cette première exécution. Ce fichier est conservé comme diagnostic, pas comme
  référence pour un pourcentage d'amélioration.
- `evaluation-quetes.json` : lecture atomique du tableau et distribution seulement
  en présence de récompenses en attente, construction issue de `b709a47`.
  Serveur sur le port 3101 ; base `.data/perf-quests-final-20261023`.
- `evaluation-td11.json` : contre-épreuve du code exact à `td11-fin`, extrait dans
  `/tmp/royaumes-td11-benchmark`, construit séparément et servi sur le port 3102.
  Sa base `.data/benchmark-td11-fin/pglite` est sur le **même disque ext4** que la
  nouvelle version ; elle n'utilise pas le tmpfs de `/tmp` pour ses données.

## Résultats et limites

| Lecture | p99 `td11-fin` sur le poste actuel | p99 avec Quêtes | Erreurs avec Quêtes |
| --- | --- | --- | --- |
| Village | 213 ms | 327 ms | 0 |
| Expéditions ouvertes | 431 ms | 650 ms | 0 |
| Classement | 724 ms | 601 ms | 0 |
| Marché | 737 ms | 852 ms | 0 |
| Taverne | 302 ms | 430 ms | 0 |
| Quêtes | Sans objet | 965 ms | 0 |

**Le budget n'est pas respecté**, y compris pour deux lectures du socle non modifié.
Les 63–103 ms historiques du 22 octobre ne sont donc pas reproduits sur le poste actuel.
Ces exécutions seules ne permettent ni d'attribuer toute la différence aux Quêtes, ni
de prouver l'absence de régression. Le tableau ne revendique pas le bonus B7.

La lecture du tableau utilise désormais une seule instruction SQL pour ses données,
et évite la réservation de messages quand le joueur n'attend aucun versement. Cela
réduit les opérations, mais la mesure ne démontre pas un gain de débit. Le rattrapage
à la lecture reste proportionnel au journal. DT-028 demande une mesure sur environnement
stabilisé et volume croissant, distinguant démarrage, rattrapage et lecture à jour,
avant augmentation de la charge. Aucun chiffre de capacité de Vercel/Neon n'est déduit.

## Reproduction

Construire l'application, puis démarrer sur une base **neuve** (nouveau nom à chaque essai) :

```sh
pnpm build
DATABASE_URL= BETTER_AUTH_URL=http://localhost:3101 LOCAL_DATABASE_NAME=mesure-unique AUTH_RATE_LIMIT=off pnpm start --port 3101
```

Dans un autre terminal, sans lancer une construction ou des tests simultanément :

```sh
BASE_URL=http://localhost:3101 pnpm exec tsx scripts/load-test.ts nouvelle-mesure
```

Ne pas lancer le script de charge sur la production : il crée vingt comptes et du contenu.
Les bases locales de mesure sont exclues de Git et restent disponibles pour diagnostic.
