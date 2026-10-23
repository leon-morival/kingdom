import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { QuestId, Reward } from '../domain/quests'

export const quests = pgSchema('quests')

/** Source de vérité : une reconstruction ne touche pas aux récompenses réclamées. */
export const claims = quests.table(
  'claims',
  {
    playerId: text('player_id').notNull(),
    day: text('day').notNull(),
    questId: text('quest_id').$type<QuestId>().notNull(),
    transferId: text('transfer_id').notNull(),
    reward: jsonb('reward').$type<Reward>().notNull(),
    status: text('status').$type<'pending' | 'paid'>().notNull(),
    claimedAt: bigint('claimed_at', { mode: 'number' }).notNull(),
    paidAt: bigint('paid_at', { mode: 'number' }),
  },
  (t) => [
    primaryKey({ columns: [t.playerId, t.day, t.questId] }),
    uniqueIndex('claims_transfer_idx').on(t.transferId),
  ],
)

export const progress = quests.table(
  'progress',
  {
    playerId: text('player_id').notNull(),
    day: text('day').notNull(),
    questId: text('quest_id').$type<QuestId>().notNull(),
    count: integer('count').notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.day, t.questId] })],
)

export const villages = quests.table('villages', { playerId: text('player_id').primaryKey() })
export const participants = quests.table(
  'participants',
  {
    gameId: text('game_id').notNull(),
    playerId: text('player_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.playerId] }),
    index('participants_player_idx').on(t.playerId),
  ],
)
export const trades = quests.table('trades', {
  offerId: text('offer_id').primaryKey(),
  sellerId: text('seller_id').notNull(),
  buyerId: text('buyer_id'),
})

/** Invalidations privées : leur séquence ne redémarre jamais pendant une reconstruction. */
export const notifications = quests.table(
  'notifications',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    playerId: text('player_id').notNull(),
    at: bigint('at', { mode: 'number' }).notNull(),
  },
  (t) => [index('notifications_player_id_idx').on(t.playerId, t.id)],
)

/** Marqueur pseudonyme, hors projection : interdit la recréation des données supprimées. */
export const erasedPlayers = quests.table('erased_players', {
  playerId: text('player_id').primaryKey(),
})
