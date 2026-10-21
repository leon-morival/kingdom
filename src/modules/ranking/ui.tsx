'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { Entity } from '@/ui/entity'
import type { RankingApi } from './api'
import type { RankingEntry } from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RankingApi>('/api/ranking')

/** Écran du Classement : les meilleurs joueurs, le joueur connecté étant mis en évidence. */
export function RankingScreen({ userId }: { userId: string }) {
  // undefined : chargement en cours.
  const [entries, setEntries] = useState<RankingEntry[] | undefined>(undefined)

  // REQUÊTE : la lecture déclenche, côté serveur, le rattrapage de la projection.
  const refresh = useCallback(async () => {
    const res = await client.players.$get()
    if (res.ok) setEntries((await res.json()).entries)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Entity kind="ranking" /> Classement
        </h1>
        <button
          className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          type="button"
          onClick={refresh}
        >
          Actualiser
        </button>
      </div>
      <section
        className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
        aria-label="Classement des joueurs"
        aria-busy={entries === undefined}
      >
        {entries === undefined && (
          <p className="text-sm text-gray-500">Chargement du classement…</p>
        )}
        {entries?.length === 0 && (
          <p className="text-sm text-gray-500">Aucun joueur classé pour le moment.</p>
        )}
        {entries && entries.length > 0 && (
          <table className="w-full border-collapse text-right text-sm tabular-nums [&_td]:border-b [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-3 [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-gray-200 [&_th]:px-3 [&_th]:py-3 [&_td:nth-child(2)]:text-left [&_th:nth-child(2)]:text-left [&_tr[aria-current=true]]:bg-blue-50 [&_tr[aria-current=true]]:font-semibold">
            <thead>
              <tr>
                <th>Rang</th>
                <th>Joueur</th>
                <th>Victoires</th>
                <th>Expéditions</th>
                <th>
                  <Entity kind="gold" />
                </th>
                <th>Meilleur butin</th>
                <th>Améliorations</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.playerId}
                  aria-current={entry.playerId === userId ? 'true' : undefined}
                >
                  <td>{entry.rank}</td>
                  <td>{entry.label}</td>
                  <td>{entry.gamesWon}</td>
                  <td>{entry.gamesPlayed}</td>
                  <td>{entry.gold}</td>
                  <td>{entry.bestLoot}</td>
                  <td>{entry.upgrades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
