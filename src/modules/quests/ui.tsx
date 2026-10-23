'use client'

import { hc } from 'hono/client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { useCountdown } from '@/ui/use-countdown'
import type { QuestsApi } from './api'
import {
  type Claim,
  QUESTS,
  type QuestBoard,
  type QuestId,
  questsChannel,
  type Reward,
} from './contracts'

const client = hc<QuestsApi>('/api/quests')
const ERRORS: Record<string, string> = {
  EXPIRED: 'Ce contrat a expiré. Les contrats du jour sont maintenant disponibles.',
  NOT_COMPLETE: 'L’objectif n’est pas encore validé. Actualisez après votre action.',
  VILLAGE_REQUIRED: 'Fondez un village pour recevoir vos récompenses.',
  ACCOUNT_ERASED: 'Ce compte a été effacé.',
}
const CONNECTION = {
  connecting: 'Connexion…',
  open: 'Tableau à jour en direct',
  reconnecting: 'Reconnexion en cours…',
}
const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-700'

function Rewards({ reward }: { reward: Reward }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-3 font-semibold tabular-nums">
      {Object.entries(reward).map(([kind, amount]) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          +{amount} <Entity kind={kind} showLabel />
        </span>
      ))}
    </span>
  )
}

function PendingReward({ claim }: { claim: Claim }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200 py-3 text-sm">
      <span>
        {QUESTS[claim.questId].title} <span className="text-stone-600">· {claim.day}</span>
      </span>
      <Rewards reward={claim.reward} />
    </li>
  )
}

/** Tableau privé ; les événements ne servent qu'à relire une vue calculée côté serveur. */
export function QuestsScreen({ userId }: { userId: string }) {
  const [state, setState] = useState<{ board: QuestBoard; receivedAt: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [claiming, setClaiming] = useState<QuestId | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const request = useRef(0)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const id = ++request.current
    setRefreshing(true)
    try {
      const response = await client.board.$get()
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? 'Votre session a expiré. Reconnectez-vous.'
            : 'Le tableau est indisponible. Réessayez dans un instant.',
        )
      const board = await response.json()
      if (alive.current && id === request.current) {
        setState({ board, receivedAt: Date.now() })
        setError(null)
      }
    } catch (cause) {
      if (alive.current && id === request.current)
        setError(cause instanceof Error ? cause.message : 'Connexion interrompue. Réessayez.')
    } finally {
      if (alive.current && id === request.current) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive.current = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const status = useChannel(questsChannel(userId), refresh)
  // Une reconnexion peut suivre une purge des notifications : relire dans tous les cas.
  useEffect(() => {
    if (status === 'open') void refresh()
  }, [status, refresh])
  const board = state?.board
  const deadline = state ? state.receivedAt + state.board.expiresAt - state.board.serverNow : null
  const remaining = useCountdown(deadline, () => {
    if (!refreshing) void refresh()
  })
  const hasPending =
    !!board && (board.pending.length > 0 || board.quests.some((q) => q.claim?.status === 'pending'))
  useEffect(() => {
    if (!hasPending) return
    const timer = setInterval(() => {
      void refresh()
    }, 5_000)
    return () => clearInterval(timer)
  }, [hasPending, refresh])

  async function claimReward(questId: QuestId) {
    if (!board || claiming) return
    setClaiming(questId)
    setError(null)
    setNotice(null)
    try {
      const response = await client.claim.$post({ json: { day: board.day, questId } })
      const result = await response.json()
      if ('error' in result) {
        if (result.error.code === 'EXPIRED') await refresh()
        setError(ERRORS[result.error.code] ?? 'La récompense n’a pas pu être réclamée.')
      } else {
        setNotice(
          result.claim.status === 'paid'
            ? 'Récompense versée dans votre village.'
            : 'Récompense réservée. Le versement est en cours, même si vous quittez cette page.',
        )
        await refresh()
      }
    } catch {
      setError(
        'Connexion interrompue. Vous pouvez réessayer : une récompense n’est versée qu’une fois.',
      )
    } finally {
      setClaiming(null)
    }
  }

  const completed = board?.quests.filter((q) => q.progress >= QUESTS[q.questId].target).length ?? 0
  const paid = board?.quests.filter((q) => q.claim?.status === 'paid').length ?? 0
  const hours = Math.floor((remaining ?? 0) / 3600)
  const minutes = Math.floor(((remaining ?? 0) % 3600) / 60)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 text-stone-900 sm:px-6">
      <header className="relative overflow-hidden rounded-2xl bg-emerald-950 px-6 py-8 text-amber-50 shadow-lg sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-24 h-72 w-72 rounded-full border-[32px] border-emerald-900/70"
        />
        <div className="relative space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
            Royaumes · Contrats quotidiens
          </p>
          <h1 className="flex items-center gap-3 font-serif text-3xl sm:text-4xl">
            <Entity kind="quests" /> Le tableau des contrats
          </h1>
          <p className="max-w-xl text-sm leading-6 text-emerald-100">
            Bâtissez, explorez, échangez. Trois occasions de faire prospérer votre royaume, chaque
            jour.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-emerald-800 pt-5">
            <p className="text-sm">
              <strong className="text-amber-200">{completed} / 3</strong> objectifs accomplis{' '}
              <span className="mx-2 text-emerald-600">·</span> {paid} récompense
              {paid > 1 ? 's' : ''} versée{paid > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-emerald-100">
              {board ? (
                <>
                  Renouvellement dans{' '}
                  <strong className="tabular-nums text-amber-100">
                    {hours} h {String(minutes).padStart(2, '0')}
                  </strong>
                </>
              ) : (
                'Chargement des contrats…'
              )}
              <span className="mt-1 block text-right text-emerald-200">
                Chaque jour à 00:00 UTC
              </span>
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-stone-600" role="status">
          <span
            aria-hidden="true"
            className={`mr-2 inline-block h-2 w-2 rounded-full ${status === 'open' ? 'bg-emerald-600' : 'bg-amber-500'}`}
          />
          {CONNECTION[status]}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className={`cursor-pointer rounded px-2 py-1 text-stone-700 underline decoration-stone-300 underline-offset-4 disabled:opacity-50 ${focus}`}
        >
          {refreshing ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {board && !board.hasVillage && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">
          Vos aventures comptent déjà.{' '}
          <Link href="/village" className={`font-semibold underline underline-offset-4 ${focus}`}>
            Fondez votre village
          </Link>{' '}
          pour pouvoir y recevoir vos récompenses.
        </p>
      )}

      <section
        aria-label="Contrats du jour"
        aria-busy={!board}
        className="grid gap-4 md:grid-cols-3"
      >
        {!board && (
          <p className="col-span-full rounded-xl border border-stone-200 bg-white p-8 text-center text-stone-600">
            Chargement du tableau…
          </p>
        )}
        {board?.quests.map((quest, index) => {
          const content = QUESTS[quest.questId]
          const complete = quest.progress >= content.target
          const rewardStatus = quest.claim?.status
          const ready = complete && !rewardStatus && board.hasVillage
          return (
            <article
              key={quest.questId}
              aria-labelledby={`title-${quest.questId}`}
              className={`flex flex-col rounded-xl border bg-[#fffdf6] p-5 shadow-sm transition-shadow motion-safe:hover:shadow-md ${ready ? 'border-amber-500 ring-1 ring-amber-200' : 'border-stone-200'}`}
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-2xl">
                  <Entity kind={content.kind} />
                </span>
                <span className="font-serif text-lg text-stone-400">
                  {['I', 'II', 'III'][index]}
                </span>
              </div>
              <p
                className={`mb-2 text-xs font-semibold uppercase tracking-wider ${rewardStatus === 'paid' ? 'text-emerald-700' : ready ? 'text-amber-800' : 'text-stone-500'}`}
              >
                {rewardStatus === 'paid'
                  ? 'Contrat honoré'
                  : rewardStatus === 'pending'
                    ? 'Versement en cours'
                    : complete
                      ? 'Objectif accompli'
                      : 'À accomplir'}
              </p>
              <h2 id={`title-${quest.questId}`} className="font-serif text-2xl leading-tight">
                {content.title}
              </h2>
              <p className="mb-6 mt-3 flex-1 text-sm leading-6 text-stone-600">
                {content.description}
              </p>
              <div className="mb-5 space-y-2">
                <div className="flex justify-between text-xs text-stone-600">
                  <span>Progression</span>
                  <span>
                    {quest.progress} / {content.target}
                  </span>
                </div>
                <progress
                  aria-label={`Progression — ${content.title}`}
                  max={content.target}
                  value={quest.progress}
                  className="block h-1.5 w-full overflow-hidden rounded-full accent-emerald-700 [&::-webkit-progress-bar]:bg-stone-200 [&::-webkit-progress-value]:bg-emerald-700"
                />
              </div>
              <div className="mb-5 border-t border-dashed border-stone-300 pt-4">
                <p className="mb-2 text-xs text-stone-500">Récompense</p>
                <Rewards reward={quest.claim?.reward ?? content.reward} />
              </div>
              {complete || rewardStatus ? (
                <button
                  type="button"
                  disabled={!ready || claiming !== null || remaining === 0}
                  onClick={() => void claimReward(quest.questId)}
                  className={`min-h-11 w-full cursor-pointer rounded-lg bg-emerald-900 px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-default disabled:bg-stone-100 disabled:text-stone-500 ${focus}`}
                >
                  {claiming === quest.questId
                    ? 'Réclamation…'
                    : rewardStatus === 'paid'
                      ? 'Récompense versée'
                      : rewardStatus === 'pending'
                        ? 'Versement en cours…'
                        : !board.hasVillage
                          ? 'Village requis'
                          : 'Réclamer la récompense'}
                </button>
              ) : (
                <Link
                  href={content.destination}
                  className={`block min-h-11 rounded-lg border border-stone-300 px-3 py-3 text-center text-sm font-semibold text-stone-700 transition-colors hover:border-emerald-800 hover:bg-emerald-50 ${focus}`}
                >
                  Aller au{' '}
                  {content.kind === 'village'
                    ? 'Village'
                    : content.kind === 'dungeon'
                      ? 'Donjon'
                      : 'Marché'}{' '}
                  <span aria-hidden="true">→</span>
                </Link>
              )}
            </article>
          )
        })}
      </section>

      {paid === 3 && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-5 text-center font-serif text-xl text-emerald-900"
        >
          Une belle journée pour le royaume. À demain pour trois nouveaux contrats !
        </p>
      )}
      {board && board.pending.length > 0 && (
        <section
          className="rounded-xl border border-amber-200 bg-amber-50 p-5"
          aria-label="Récompenses en attente"
        >
          <h2 className="font-serif text-xl">Vos récompenses restent réservées</h2>
          <p className="my-3 text-sm leading-6 text-stone-700">
            Ces contrats ont été réclamés à temps. Leur versement continue, même après le
            renouvellement du tableau.
          </p>
          <ul>
            {board.pending.map((claim) => (
              <PendingReward key={`${claim.day}-${claim.questId}`} claim={claim} />
            ))}
          </ul>
        </section>
      )}
      <p className="text-center text-xs leading-5 text-stone-500">
        Les actions du jour comptent même avant votre visite. Réclamez vos récompenses avant minuit
        UTC.
        <br />
        Une seule récompense par contrat et par jour.
      </p>
    </div>
  )
}
