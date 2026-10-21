'use client'
import { hc } from 'hono/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { useCountdown } from '@/ui/use-countdown'
import type { DungeonApi } from './api'
import {
  type Action,
  type Effect,
  type GameError,
  type GameView,
  gameChannel,
  MAX_HEROES,
  MONSTERS,
  type Monster,
  type OpenGame,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<DungeonApi>('/api/dungeon')

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: GameError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  GAME_NOT_FOUND: 'Expédition introuvable.',
  ALREADY_EXISTS: 'Expédition déjà ouverte.',
  WRONG_PHASE: "Cette action n'est plus possible.",
  GAME_FULL: "L'expédition est complète.",
  ALREADY_JOINED: "Vous faites déjà partie de l'expédition.",
  NOT_A_MEMBER: "Vous ne faites pas partie de l'expédition.",
  NOT_HOST: "Seul l'hôte peut lancer l'expédition.",
  NOT_YOUR_TURN: "Ce n'est pas votre tour.",
  HERO_DOWN: 'Votre héros est tombé.',
  ROUND_OVER: 'La manche est déjà terminée.',
  ALREADY_CHOSEN: 'Vous avez déjà choisi votre action.',
  INVALID_TARGET: 'Cible invalide.',
}

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

// ---------------------------------------------------------------------------
// Liste des expéditions ouvertes
// ---------------------------------------------------------------------------

/** Écran d'accueil du Donjon : expéditions ouvertes et ouverture d'une expédition. */
export function DungeonLobby() {
  const router = useRouter()
  const [games, setGames] = useState<OpenGame[] | undefined>(undefined)

  const refresh = useCallback(async () => {
    const res = await client.games.$get()
    if (res.ok) setGames((await res.json()).games)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function open() {
    const res = await client.games.$post()
    if (res.ok) router.push(`/dungeon/${(await res.json()).gameId}`)
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 text-gray-900 sm:px-6">
      <h1 className="flex items-center gap-3 text-3xl font-bold">
        <Entity kind="dungeon" /> Donjon
      </h1>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <button
          type="button"
          className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          onClick={open}
        >
          Ouvrir une nouvelle expédition
        </button>
      </div>
      <section
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
        aria-label="Expéditions ouvertes"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Expéditions ouvertes</h2>
          <button
            className="cursor-pointer rounded-sm text-sm font-medium text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            type="button"
            onClick={refresh}
          >
            Actualiser
          </button>
        </div>
        {games?.length === 0 && (
          <p className="text-sm text-gray-500">Aucune expédition ouverte pour le moment.</p>
        )}
        <ul className="divide-y divide-gray-100">
          {games?.map((game) => (
            <li
              key={game.gameId}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <span className="min-w-0 break-words">
                Expédition de {game.hostName}{' '}
                <span className="text-sm text-gray-500">
                  ({game.heroCount}/{MAX_HEROES} héros)
                </span>
              </span>
              <Link
                className="rounded-sm text-sm font-medium text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                href={`/dungeon/${game.gameId}`}
              >
                Voir
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expédition
// ---------------------------------------------------------------------------

/** Nom affiché d'un monstre, numéroté si la salle en contient plusieurs du même type. */
function monsterName(monster: Monster, monsters: Monster[]) {
  const sameKind = monsters.filter((other) => other.kind === monster.kind)
  const name = MONSTERS[monster.kind].name
  return sameKind.length > 1 ? `${name} ${sameKind.indexOf(monster) + 1}` : name
}

/** Description d'une action, telle que le joueur l'a choisie. */
function describeAction(action: Action, nameOf: (id: string) => string) {
  if (action.type === 'attack') return `attaquer ${nameOf(action.target)}`
  if (action.type === 'heal') return `soigner ${nameOf(action.target)}`
  return 'se défendre'
}

/** Description d'un effet de la dernière manche. */
function describeEffect(effect: Effect, nameOf: (id: string) => string) {
  return effect.kind === 'damage'
    ? `${nameOf(effect.source)} inflige ${effect.amount} dégâts à ${nameOf(effect.target)}`
    : `${nameOf(effect.source)} rend ${effect.amount} points de vie à ${nameOf(effect.target)}`
}

/** Écran d'une expédition : salon, exploration, combat et fin de l'expédition. */
export function DungeonGame({ gameId, userId }: { gameId: string; userId: string }) {
  // undefined : chargement en cours ; null : expédition introuvable.
  const [view, setView] = useState<GameView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const param = { id: gameId }

  // REQUÊTE : lecture de la vue de l'expédition, filtrée pour le joueur.
  const refresh = useCallback(async () => {
    const res = await client.games[':id'].$get({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
    else if (res.status === 404) setView(null)
  }, [gameId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : seuls les membres écoutent le canal de l'expédition. Le canal ne transmet
  // aucune donnée : chaque notification provoque une relecture de la vue filtrée.
  const status = useChannel(view?.isMember ? gameChannel(gameId) : null, refresh)

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  function handle(body: { view: GameView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
      refresh()
    } else {
      setError(null)
      setView(body.view)
    }
  }
  const join = async () => handle(await (await client.games[':id'].join.$post({ param })).json())
  const start = async () => handle(await (await client.games[':id'].start.$post({ param })).json())
  const openDoor = async () =>
    handle(await (await client.games[':id'].door.$post({ param })).json())
  async function act(action: Action) {
    if (!view) return
    const res = await client.games[':id'].action.$post({
      param,
      json: { round: view.round, action },
    })
    handle(await res.json())
  }

  // ÉCHÉANCE : lorsque le compte à rebours atteint zéro, la commande d'échéance fait
  // enregistrer la résolution de la manche, et donc notifier tous les membres.
  const checkDeadline = useCallback(async () => {
    const res = await client.games[':id'].deadline.$post({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
  }, [gameId])
  const remaining = useCountdown(
    view?.isMember && view.phase === 'combat' ? view.deadline : null,
    checkDeadline,
  )

  const title = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="flex items-center gap-3 text-3xl font-bold">
        <Entity kind="dungeon" /> Expédition
      </h1>
      {view?.isMember && (
        <span
          role="status"
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-gray-50 px-3 py-1 text-[0.85rem] font-medium text-gray-500 before:size-2 before:rounded-full before:bg-current sm:self-auto data-[status=open]:bg-emerald-50 data-[status=open]:text-emerald-700 data-[status=reconnecting]:bg-amber-50 data-[status=reconnecting]:text-amber-700"
          data-status={status}
        >
          {STATUS_LABELS[status]}
        </span>
      )}
    </div>
  )

  if (view === undefined) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 text-gray-900 sm:px-6">
        {title}
      </div>
    )
  }
  if (view === null) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 text-gray-900 sm:px-6">
        {title}
        <p role="alert" className="text-sm text-red-600">
          {ERRORS.GAME_NOT_FOUND}
        </p>
        <Link
          className="inline-block rounded-sm text-sm font-medium text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          href="/dungeon"
        >
          Retour au Donjon
        </Link>
      </div>
    )
  }

  // Noms des combattants, pour décrire les actions et les effets.
  const nameOf = (id: string) => {
    const hero = view.heroes.find((h) => h.id === id)
    if (hero) return hero.name
    const monster = view.monsters.find((m) => m.id === id)
    return monster ? monsterName(monster, view.monsters) : id
  }
  const me = view.heroes.find((hero) => hero.id === userId)
  const standingMonsters = view.monsters.filter((monster) => monster.hp > 0)
  const standingHeroes = view.heroes.filter((hero) => hero.hp > 0)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 text-gray-900 sm:px-6">
      {title}

      {/* Héros de l'expédition. */}
      <section
        className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-6"
        aria-label="Héros"
      >
        {view.heroes.map((hero) => (
          <div
            key={hero.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3 data-[down=true]:opacity-50"
            data-down={hero.hp <= 0}
          >
            <span className="min-w-0 break-words font-medium">
              <Entity kind="hero" /> {hero.name}
              {hero.id === view.hostId && (
                <span className="text-sm font-normal text-gray-500"> (hôte)</span>
              )}
            </span>
            <span className="text-sm text-gray-500 tabular-nums">
              {hero.hp}/{hero.maxHp} PV
            </span>
            {view.phase === 'combat' && hero.ready && (
              <span className="text-sm font-medium text-emerald-700">prêt</span>
            )}
            {view.turnHeroId === hero.id && (
              <span className="text-sm font-medium text-emerald-700">à son tour</span>
            )}
          </div>
        ))}
      </section>

      {/* Salon : rejoindre ou lancer l'expédition. */}
      {view.phase === 'lobby' && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-sm text-gray-500">
            Communiquez l'adresse de cette page aux joueurs que vous souhaitez inviter.
          </p>
          {!view.isMember && view.heroes.length < MAX_HEROES && (
            <button
              type="button"
              className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              onClick={join}
            >
              Rejoindre l'expédition
            </button>
          )}
          {view.isHost && (
            <button
              type="button"
              className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              onClick={start}
            >
              Entrer dans le donjon
            </button>
          )}
          {view.isMember && !view.isHost && (
            <p className="text-sm text-gray-500">En attente du lancement par l'hôte.</p>
          )}
        </div>
      )}

      {/* Exploration : ouvrir la porte suivante, à tour de rôle. */}
      {view.phase === 'exploring' && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">Exploration</h2>
          <p>
            Salle {view.room + 1} sur {view.roomCount}
            {view.currentRoom?.kind === 'treasure' && ` : un trésor de ${view.currentRoom.gold} or`}
            {view.currentRoom?.kind === 'empty' && ' : une salle vide'}
            {' - '}
            <Entity kind="gold" /> {view.loot}
          </p>
          {view.turnHeroId === userId ? (
            <button
              type="button"
              className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              onClick={openDoor}
            >
              <Entity kind="door" /> Ouvrir la porte suivante
            </button>
          ) : (
            <p className="text-sm text-gray-500">Au tour de {nameOf(view.turnHeroId ?? '')}.</p>
          )}
        </div>
      )}

      {/* Combat : monstres, compte à rebours et choix de l'action. */}
      {view.phase === 'combat' && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              Combat - salle {view.room + 1}, manche {view.round}
            </h2>
            {remaining !== null && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700 tabular-nums">
                {remaining} s
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {view.monsters.map((monster) => (
              <div
                key={monster.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 data-[down=true]:opacity-50"
                data-down={monster.hp <= 0}
              >
                <span className="min-w-0 break-words font-medium">
                  <Entity kind={monster.kind} /> {monsterName(monster, view.monsters)}
                </span>
                <span className="text-sm text-gray-500 tabular-nums">
                  {monster.hp}/{monster.maxHp} PV
                </span>
              </div>
            ))}
          </div>
          {me && me.hp > 0 && !me.action && (
            <div className="flex flex-wrap gap-2">
              {standingMonsters.map((monster) => (
                <button
                  key={monster.id}
                  type="button"
                  className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  onClick={() => act({ type: 'attack', target: monster.id })}
                >
                  Attaquer {monsterName(monster, view.monsters)}
                </button>
              ))}
              <button
                type="button"
                className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                onClick={() => act({ type: 'defend' })}
              >
                Se défendre
              </button>
              {standingHeroes.map((hero) => (
                <button
                  key={hero.id}
                  type="button"
                  className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  onClick={() => act({ type: 'heal', target: hero.id })}
                >
                  Soigner {hero.name}
                </button>
              ))}
            </div>
          )}
          {me?.action && (
            <p className="text-sm text-gray-500">
              Votre choix : {describeAction(me.action, nameOf)}. En attente des autres héros.
            </p>
          )}
        </div>
      )}

      {/* Fin de l'expédition. */}
      {(view.phase === 'won' || view.phase === 'lost') && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">
            {view.phase === 'won' ? 'Victoire !' : 'Défaite...'}
          </h2>
          <p>
            Butin de l'expédition : <Entity kind="gold" /> {view.loot}
          </p>
          <Link
            className="inline-block rounded-sm text-sm font-medium text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            href="/dungeon"
          >
            Retour au Donjon
          </Link>
        </div>
      )}

      {/* Résultat de la dernière manche, connu de tous une fois la manche résolue. */}
      {view.lastRound && (
        <section
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
          aria-label="Dernière manche"
        >
          <h2 className="text-lg font-semibold">Manche {view.lastRound.round}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
            {Object.entries(view.lastRound.actions).map(([heroId, action]) => (
              <li key={heroId}>
                {nameOf(heroId)} a choisi de {describeAction(action, nameOf)}.
              </li>
            ))}
            {view.lastRound.effects.map((effect) => (
              // Chaque combattant n'agit qu'une fois par manche : ce triplet identifie l'effet.
              <li key={`${effect.kind}-${effect.source}-${effect.target}`}>
                {describeEffect(effect, nameOf)}.
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
