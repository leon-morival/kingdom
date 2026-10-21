'use client'
import { hc } from 'hono/client'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { TavernApi } from './api'
import {
  HEARTBEAT_MS,
  MESSAGE_MAX_LENGTH,
  type MessageError,
  type PresentPlayer,
  TAVERN_CHANNEL,
  type TavernMessage,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<TavernApi>('/api/tavern')

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Message affiché au joueur pour chaque erreur. */
function errorText(error: MessageError | { code: 'INVALID_INPUT' }): string {
  switch (error.code) {
    case 'EMPTY_MESSAGE':
      return 'Le message est vide.'
    case 'MESSAGE_TOO_LONG':
      return `Le message dépasse ${error.max} caractères.`
    case 'TOO_MANY_MESSAGES':
      return `Trop de messages : patientez ${Math.ceil(error.retryAfterMs / 1000)} secondes.`
    case 'INVALID_INPUT':
      return 'Saisie invalide.'
  }
}

/** Ajoute des messages à la liste, sans doublon, dans l'ordre de leurs identifiants. */
function merge(current: TavernMessage[], added: TavernMessage[]): TavernMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of added) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/**
 * Départ en cours de transmission. Un signal de présence attend qu'il soit reçu : sans cela,
 * un joueur qui quitte la Taverne puis y revient aussitôt pourrait voir son départ arriver
 * au serveur après son nouveau signal, et disparaître de la liste des présents.
 */
let leaving: Promise<unknown> = Promise.resolve()

/** Signale le départ du joueur. L'option keepalive maintient la requête pendant la fermeture de l'onglet. */
function leave() {
  leaving = fetch('/api/tavern/presence/leave', { method: 'POST', keepalive: true }).catch(() => {})
}

/** Heure d'un message, au format local. */
const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** Écran de la Taverne : salon de discussion et joueurs présents. */
export function TavernScreen({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<TavernMessage[]>([])
  const [players, setPlayers] = useState<PresentPlayer[]>([])
  const [sending, setSending] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  // REQUÊTE : les derniers messages.
  const refresh = useCallback(async () => {
    const res = await client.messages.$get()
    if (!res.ok) return
    const latest = (await res.json()).messages
    setMessages((current) => merge(current, latest))
    setLoaded(true)
  }, [])

  // TEMPS RÉEL : chaque nouveau message est reçu avec son contenu, et ajouté à la liste.
  const status = useChannel(TAVERN_CHANNEL, (event) => {
    setMessages((current) => merge(current, [event.data as unknown as TavernMessage]))
  })

  // À chaque ouverture du canal, y compris après une reconnexion, l'historique est relu :
  // un message publié avant l'abonnement, ou pendant une interruption, n'est pas transmis
  // par le canal, qui ne diffuse que les messages à venir.
  useEffect(() => {
    if (status === 'open') refresh()
  }, [status, refresh])

  // PRÉSENCE : un signal immédiat, puis un signal régulier tant que la page est affichée.
  // Le départ est signalé lorsque le joueur quitte la page ou ferme l'onglet.
  useEffect(() => {
    const beat = async () => {
      await leaving
      const res = await client.presence.$post()
      if (res.ok) setPlayers((await res.json()).players)
    }
    beat()
    const timer = setInterval(beat, HEARTBEAT_MS)
    window.addEventListener('pagehide', leave)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [])

  // COMMANDE : publication d'un message.
  async function send(event: FormEvent) {
    event.preventDefault()
    if (sending) return
    setSending(true)
    try {
      const res = await client.messages.$post({ json: { body: draft } })
      const body = await res.json()
      if ('error' in body) {
        setError(errorText(body.error as MessageError))
      } else {
        setError(null)
        setDraft('')
        setMessages((current) => merge(current, [body.message]))
      }
    } catch {
      setError('Connexion interrompue. Votre message est conservé pour un nouvel essai.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Entity kind="tavern" /> Taverne
        </h1>
        <span
          role="status"
          className="text-sm text-gray-500 data-[status=open]:text-green-700"
          data-status={status}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_200px]">
        <section
          className="min-w-0 space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
          aria-label="Messages"
        >
          {!loaded && <p className="text-sm text-gray-500">Chargement des messages…</p>}
          {loaded && messages.length === 0 && (
            <p className="text-sm text-gray-500">Aucun message pour le moment.</p>
          )}
          <ul
            className="grid max-h-[55vh] gap-2 overflow-y-auto"
            aria-label="Messages du salon"
            aria-live="polite"
          >
            {messages.map((message) => (
              <li
                className="rounded-lg bg-gray-50 px-3 py-2 text-sm [overflow-wrap:anywhere] data-[mine=true]:bg-blue-50"
                key={message.id}
                data-mine={message.authorId === userId || undefined}
              >
                <span className="text-sm text-gray-500">{timeOf(message.postedAt)}</span>{' '}
                <strong>{message.authorName}</strong> {message.body}
              </li>
            ))}
          </ul>
          <form className="flex flex-wrap gap-2" onSubmit={send}>
            <input
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline-blue-600"
              aria-label="Votre message"
              aria-describedby="message-count"
              value={draft}
              maxLength={MESSAGE_MAX_LENGTH * 2}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Votre message"
            />
            <button
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              type="submit"
              disabled={
                sending ||
                draft.trim().length === 0 ||
                [...draft.trim()].length > MESSAGE_MAX_LENGTH
              }
            >
              {sending ? 'Envoi…' : 'Envoyer'}
            </button>
          </form>
          <p id="message-count" className="text-sm text-gray-500">
            {[...draft.trim()].length} / {MESSAGE_MAX_LENGTH} caractères
          </p>
          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
        </section>

        <section
          className="min-w-0 space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
          aria-label="Joueurs présents"
        >
          <h2 className="text-xl font-semibold">Présents</h2>
          <ul className="grid gap-2 text-sm">
            {players.map((player) => (
              <li key={player.id}>{player.name}</li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
