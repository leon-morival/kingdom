'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { RealmApi } from './api'
import {
  BUILDINGS,
  type Building,
  type DomainError,
  RESOURCES,
  type Stock,
  stockAt,
  type VillageView,
  villageChannel,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RealmApi>('/api/realm')

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: DomainError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  ALREADY_FOUNDED: 'Village déjà fondé.',
  NOT_FOUNDED: "Aucun village pour l'instant.",
  MAX_LEVEL_REACHED: 'Niveau maximum atteint.',
  INSUFFICIENT_RESOURCES: 'Ressources insuffisantes.',
}

/** Indique si le stock couvre un coût ; faux si le coût est absent (niveau maximal). */
function canAfford(stock: Stock, cost: Partial<Stock> | null) {
  return !!cost && Object.entries(cost).every(([r, n]) => stock[r as keyof Stock] >= (n ?? 0))
}

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Écran du Village : fondation, stock et bâtiments, mis à jour en temps réel. */
export function VillageScreen({ userId }: { userId: string }) {
  // undefined : chargement en cours ; null : aucun village fondé.
  const [view, setView] = useState<VillageView | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  // REQUÊTE : lecture de la vue du village.
  const refresh = useCallback(async () => {
    const res = await client.village.$get()
    if (res.ok) setView((await res.json()).view)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : chaque événement du village, y compris s'il provient d'un autre onglet
  // ou d'un autre appareil, provoque une relecture de la vue.
  const status = useChannel(villageChannel(userId), refresh)

  // Le stock est extrapolé localement deux fois par seconde, sans interroger le serveur.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  async function found(name: string) {
    const res = await client.village.$post({ json: { name } })
    handle(await res.json())
  }
  async function upgrade(building: Building) {
    const res = await client.village.upgrade.$post({ json: { building } })
    handle(await res.json())
  }
  function handle(body: { view: VillageView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
    } else {
      setError(null)
      setView(body.view)
    }
  }

  const title = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="flex min-w-0 items-center gap-3 text-3xl font-bold">
        <Entity kind="village" />
        <span className="min-w-0 break-words">{view?.name ?? 'Royaumes'}</span>
      </h1>
      <span
        role="status"
        className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-gray-50 px-3 py-1 text-[0.85rem] font-medium text-gray-500 before:size-2 before:rounded-full before:bg-current sm:self-auto data-[status=open]:bg-emerald-50 data-[status=open]:text-emerald-700 data-[status=reconnecting]:bg-amber-50 data-[status=reconnecting]:text-amber-700"
        data-status={status}
      >
        {STATUS_LABELS[status]}
      </span>
    </div>
  )

  // Chargement en cours.
  if (view === undefined) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 text-gray-900 sm:px-6">
        {title}
      </div>
    )
  }

  // Aucun village : formulaire de fondation.
  if (view === null) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 text-gray-900 sm:px-6">
        {title}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              found(String(new FormData(e.currentTarget).get('name')))
            }}
          >
            <label htmlFor="name" className="block text-sm font-medium">
              Nommez votre village
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={30}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="submit"
              className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Fonder
            </button>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
          </form>
        </div>
      </div>
    )
  }

  // Village fondé : stock extrapolé à l'instant courant, puis bâtiments.
  const stock = stockAt(view, now)
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 text-gray-900 sm:px-6">
      {title}
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Ressources">
        {RESOURCES.map((r) => (
          <div key={r} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-medium text-gray-600">
              <Entity kind={r} showLabel />
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{Math.floor(stock[r])}</p>
            <small className="text-gray-500">+{view.ratesPerMinute[r]} / min</small>
          </div>
        ))}
      </section>
      <section
        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
        aria-label="Bâtiments"
      >
        <h2 className="mb-2 text-lg font-semibold">Bâtiments</h2>
        <div className="divide-y divide-gray-100">
          {BUILDINGS.map((b) => {
            const cost = view.nextCosts[b]
            return (
              <div
                key={b}
                className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  <Entity kind={b} showLabel />
                  <span className="text-sm font-normal text-gray-500">niveau {view.levels[b]}</span>
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  {cost &&
                    Object.entries(cost).map(([r, n]) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1 text-sm text-gray-500 tabular-nums"
                      >
                        <Entity kind={r} /> {n}
                      </span>
                    ))}
                  <button
                    type="button"
                    className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    disabled={!canAfford(stock, cost)}
                    onClick={() => upgrade(b)}
                  >
                    {view.levels[b] === 0 ? 'Construire' : 'Améliorer'}
                  </button>
                </span>
              </div>
            )
          })}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}
