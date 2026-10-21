'use client'
import { useState } from 'react'

/** Phrase que le joueur doit saisir pour confirmer la suppression de son compte. */
const CONFIRMATION = 'SUPPRIMER'

/** Export et effacement des données du joueur dans l'ensemble du jeu. */
export function AccountScreen() {
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function erase() {
    if (busy || confirmation !== CONFIRMATION) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      if (!res.ok) throw new Error('Effacement interrompu')
      window.location.href = '/login'
    } catch {
      setError("La suppression n'a pas abouti. Vous pouvez la relancer.")
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Mes données</h1>

      <section
        className="space-y-4 rounded-xl border border-gray-200 bg-white p-6"
        aria-labelledby="export-title"
      >
        <h2 id="export-title" className="text-lg font-semibold text-gray-900">
          Exporter mes données
        </h2>
        <p className="text-sm leading-6 text-gray-600">
          Téléchargez vos données au format JSON : compte, sessions, village, participations aux
          expéditions, offres, messages, présence et classement.
        </p>
        <a
          href="/api/account/export"
          download
          className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Télécharger mes données
        </a>
      </section>

      <section
        className="space-y-4 rounded-xl border border-red-200 bg-white p-6"
        aria-labelledby="erase-title"
      >
        <h2 id="erase-title" className="text-lg font-semibold text-gray-900">
          Supprimer mon compte
        </h2>
        <p className="text-sm leading-6 text-gray-600">
          Votre compte, vos sessions, vos messages et votre présence dans la Taverne seront
          supprimés. Votre nom et celui de votre village seront remplacés dans les données du jeu
          par une mention neutre. Les parties et leurs scores resteront consultables. Cette
          opération est irréversible.
        </p>
        <div className="flex flex-col items-start gap-3">
          <label htmlFor="confirmation" className="text-sm font-medium text-gray-700">
            Saisissez {CONFIRMATION} pour confirmer
          </label>
          <input
            id="confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="button"
            disabled={busy || confirmation !== CONFIRMATION}
            onClick={erase}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Suppression en cours…' : 'Supprimer mon compte'}
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-700" role="status">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}
