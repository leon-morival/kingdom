'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { authClient } from '@/platform/auth/client'
import { Entity } from './entity'

/** Liens de navigation : chaque module ajouté au jeu y reçoit une entrée. */
export const NAV = [
  { href: '/village', kind: 'village', label: 'Village' },
  { href: '/dungeon', kind: 'dungeon', label: 'Donjon' },
]

/** Cadre de l'espace de jeu : navigation, nom du joueur et déconnexion. */
export function AppShell({ userName, children }: { userName: string; children: ReactNode }) {
  const pathname = usePathname()

  async function signOut() {
    // La session est supprimée côté serveur, puis la page est entièrement rechargée,
    // afin qu'aucun état de la session précédente ne subsiste dans le navigateur.
    await authClient.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      <nav className="border-b border-gray-200 bg-white" aria-label="Navigation principale">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4 text-gray-900 sm:flex-row sm:items-center sm:px-6">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-[current=page]:bg-blue-50 aria-[current=page]:text-blue-700"
                aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
              >
                <Entity kind={item.kind} /> {item.label}
              </Link>
            ))}
          </div>
          <div className="flex min-w-0 items-center justify-between gap-4 sm:ml-auto">
            <span className="truncate text-sm text-gray-500" title={userName}>
              {userName}
            </span>
            <button
              className="shrink-0 cursor-pointer rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              type="button"
              onClick={signOut}
            >
              Déconnexion
            </button>
          </div>
        </div>
      </nav>
      {children}
    </>
  )
}
