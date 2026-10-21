'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type ChannelEvent, useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { RankingApi } from './api'
import { RANKING_CHANNEL, type Ranking } from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RankingApi>('/api/ranking')

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Délai entre deux relectures, tant que la projection n'a pas atteint l'événement annoncé. */
const RETRY_MS = 1_000

/** Nombre maximal de relectures pour un même événement annoncé. */
const MAX_READS = 10

/** Écran du Classement : les meilleurs joueurs, le joueur connecté étant mis en évidence. */
export function RankingScreen({ userId }: { userId: string }) {
  // undefined : chargement en cours.
  const [ranking, setRanking] = useState<Ranking | undefined>(undefined)

  // REQUÊTE : la lecture déclenche, côté serveur, le rattrapage de la projection.
  // Renvoie la position jusqu'à laquelle le classement reçu est à jour ; 0 en cas d'échec.
  const refresh = useCallback(async () => {
    const res = await client.players.$get()
    if (!res.ok) return 0
    const body = await res.json()
    setRanking(body)
    return body.position
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Position du dernier événement annoncé, et indicateur d'une relecture en cours.
  const wanted = useRef(0)
  const following = useRef(false)

  // TEMPS RÉEL : le canal annonce un événement qui modifie le classement. Le classement est
  // relu jusqu'à ce que la projection ait atteint la position de cet événement : elle peut
  // s'être arrêtée, quelques secondes, devant une position manquante.
  const follow = useCallback(
    async (event: ChannelEvent) => {
      wanted.current = Math.max(wanted.current, event.position)
      // Une relecture est déjà en cours : elle tiendra compte de la nouvelle position.
      if (following.current) return
      following.current = true
      try {
        for (let read = 0; read < MAX_READS; read++) {
          if ((await refresh()) >= wanted.current) return
          await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
        }
      } finally {
        following.current = false
      }
    },
    [refresh],
  )

  const status = useChannel(RANKING_CHANNEL, follow)
  const entries = ranking?.entries

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Entity kind="ranking" /> Classement
        </h1>
        <span
          role="status"
          className="text-sm text-gray-500 data-[status=open]:text-green-700"
          data-status={status}
        >
          {STATUS_LABELS[status]}
        </span>
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
