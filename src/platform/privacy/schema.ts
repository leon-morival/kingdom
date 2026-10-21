import { bigserial, integer, timestamp } from 'drizzle-orm/pg-core'
import { platform } from '../event-store/schema'

/**
 * Registre des effacements : une ligne par réécriture validée, avec sa date et le
 * nombre d'événements réécrits. Il ne contient, à dessein, aucune donnée sur le joueur effacé :
 * il trace les réécritures, y compris les reprises, sans conserver leur contenu.
 */
export const erasures = platform.table('erasures', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  erasedAt: timestamp('erased_at', { withTimezone: true }).notNull().defaultNow(),
  eventsRewritten: integer('events_rewritten').notNull(),
})
