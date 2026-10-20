'use client'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { HealthStatus } from '@/modules/system/ui'
import { authClient } from '@/platform/auth/client'
import { Entity } from '@/ui/entity'

/**
 * Messages affichés pour les erreurs renvoyées par Better Auth.
 * Le message d'origine, en anglais, n'est jamais affiché tel quel.
 */
const ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Adresse ou mot de passe incorrect.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Cette adresse est déjà utilisée.',
  PASSWORD_TOO_SHORT: 'Le mot de passe doit comporter au moins 8 caractères.',
  VALIDATION_ERROR: 'Saisie invalide.',
}

/** Message d'erreur à partir de la réponse de Better Auth. */
function messageFor(error: { code?: string; status: number }): string {
  if (error.status === 429) return 'Trop de tentatives : réessayez dans une minute.'
  return (error.code && ERRORS[error.code]) || 'La connexion a échoué.'
}

/** Page de connexion et de création de compte. */
export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))

    setPending(true)
    setError(null)
    // Le client appelle /api/auth/sign-up/email ou /api/auth/sign-in/email.
    // En cas de succès, le serveur dépose le cookie de session dans le navigateur.
    const result =
      mode === 'signUp'
        ? await authClient.signUp.email({ email, password, name: String(form.get('name')) })
        : await authClient.signIn.email({ email, password })
    setPending(false)

    if (result.error) setError(messageFor(result.error))
    else router.push('/village')
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 sm:px-6">
      <div className="mx-auto max-w-md space-y-6">
        <header className="space-y-2">
          <h1 className="flex items-center gap-3 text-3xl font-bold">
            <Entity kind="village" /> Royaumes
          </h1>
          <p className="text-gray-600">{mode === 'signIn' ? 'Connexion' : 'Création de compte'}</p>
        </header>
        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signUp' && (
              <div className="space-y-2">
                <label htmlFor="name" className="block text-sm font-medium">
                  Pseudo
                </label>
                <input
                  id="name"
                  name="name"
                  placeholder="Pseudo"
                  required
                  minLength={2}
                  maxLength={30}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium">
                Adresse électronique
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="Adresse électronique"
                required
                autoComplete="email"
                className="w-full rounded-md border border-gray-300 px-3 py-2 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium">
                Mot de passe
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Mot de passe (8 caractères minimum)"
                required
                minLength={8}
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                className="w-full rounded-md border border-gray-300 px-3 py-2 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
            >
              {mode === 'signIn' ? 'Se connecter' : 'Créer mon compte'}
            </button>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
          </form>
          <p className="mt-4 text-center">
            <button
              className="cursor-pointer rounded-sm text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              type="button"
              onClick={() => {
                setMode(mode === 'signIn' ? 'signUp' : 'signIn')
                setError(null)
              }}
            >
              {mode === 'signIn' ? 'Pas de compte ? En créer un' : 'Déjà un compte ? Se connecter'}
            </button>
          </p>
        </div>
        <div className="text-sm text-gray-500">
          <HealthStatus />
        </div>
      </div>
    </div>
  )
}
