import { and, eq } from 'drizzle-orm'
import { GAME_CHANNEL_PREFIX } from '@/modules/dungeon/contracts'
import { OFFER_STREAM_PREFIX } from '@/modules/market/contracts'
import { VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { DbTransaction, Projection } from '@/platform/projection/projection'
import {
  dayOf,
  progressAfter,
  type QuestId,
  retainedFrom,
  tradeRecipients,
  victoryRecipients,
} from '../domain/quests'
import { erasedPlayers, notifications, participants, progress, trades, villages } from './schema'

async function active(tx: DbTransaction, playerId: string) {
  if (!playerId) return false
  const [erased] = await tx.select().from(erasedPlayers).where(eq(erasedPlayers.playerId, playerId))
  return !erased
}

/** Langage publié : seuls les événements et champs utiles sont lus, pas les états internes. */
export function createQuestsProjection(clock = () => Date.now()): Projection {
  async function credit(tx: DbTransaction, playerId: string, questId: QuestId, at: number) {
    if (!Number.isFinite(at) || !(await active(tx, playerId))) return
    const day = dayOf(at)
    if (day < retainedFrom(clock())) return
    const inserted = await tx
      .insert(progress)
      .values({ playerId, day, questId, count: progressAfter(questId, 0) })
      .onConflictDoNothing()
      .returning()
    if (inserted.length) await tx.insert(notifications).values({ playerId, at: clock() })
  }

  return {
    name: 'quests-progress',
    version: 1,
    eventTypes: [
      'VillageFounded',
      'BuildingUpgraded',
      'GameCreated',
      'PlayerJoined',
      'GameEnded',
      'OfferPublished',
      'OfferAccepted',
      'PaymentRefused',
      'TradeCompleted',
      'OfferWithdrawn',
      'OfferRejected',
    ],
    async apply(event, tx) {
      const data = event.data
      if (event.stream.startsWith(VILLAGE_CHANNEL_PREFIX)) {
        const playerId = event.stream.slice(VILLAGE_CHANNEL_PREFIX.length)
        if (event.type === 'VillageFounded' && (await active(tx, playerId))) {
          const inserted = await tx
            .insert(villages)
            .values({ playerId })
            .onConflictDoNothing()
            .returning()
          if (inserted.length) await tx.insert(notifications).values({ playerId, at: clock() })
        } else if (event.type === 'BuildingUpgraded') {
          await credit(tx, playerId, 'builder', data.at as number)
        }
      } else if (event.stream.startsWith(GAME_CHANNEL_PREFIX)) {
        const gameId = event.stream.slice(GAME_CHANNEL_PREFIX.length)
        if (event.type === 'GameCreated' || event.type === 'PlayerJoined') {
          const playerId = (event.type === 'GameCreated' ? data.hostId : data.playerId) as string
          if (await active(tx, playerId))
            await tx.insert(participants).values({ gameId, playerId }).onConflictDoNothing()
        } else if (event.type === 'GameEnded') {
          const humans = await tx.select().from(participants).where(eq(participants.gameId, gameId))
          for (const id of victoryRecipients(
            data.result as string,
            humans.map((row) => row.playerId),
          )) {
            await credit(tx, id, 'hunter', data.at as number)
          }
          await tx.delete(participants).where(eq(participants.gameId, gameId))
        }
      } else if (event.stream.startsWith(OFFER_STREAM_PREFIX)) {
        const offerId = event.stream.slice(OFFER_STREAM_PREFIX.length)
        if (event.type === 'OfferPublished') {
          const id = data.sellerId as string
          await tx
            .insert(trades)
            .values({ offerId, sellerId: (await active(tx, id)) ? id : '' })
            .onConflictDoNothing()
        } else if (event.type === 'OfferAccepted') {
          const id = data.buyerId as string
          await tx
            .update(trades)
            .set({ buyerId: (await active(tx, id)) ? id : '' })
            .where(eq(trades.offerId, offerId))
        } else if (event.type === 'PaymentRefused') {
          await tx.update(trades).set({ buyerId: null }).where(eq(trades.offerId, offerId))
        } else if (['TradeCompleted', 'OfferWithdrawn', 'OfferRejected'].includes(event.type)) {
          const [trade] = await tx.select().from(trades).where(eq(trades.offerId, offerId))
          if (trade)
            for (const id of tradeRecipients(
              event.type === 'TradeCompleted',
              trade.sellerId,
              trade.buyerId,
            )) {
              await credit(tx, id, 'merchant', data.at as number)
            }
          await tx.delete(trades).where(eq(trades.offerId, offerId))
        }
      }
    },
    async reset(tx) {
      await tx.delete(progress)
      await tx.delete(participants)
      await tx.delete(trades)
      await tx.delete(villages)
      // Réclamations, marqueurs d'effacement et séquence SSE sont indépendants du rejeu.
    },
  }
}

export const progressKey = (playerId: string, day: string, questId: QuestId) =>
  and(eq(progress.playerId, playerId), eq(progress.day, day), eq(progress.questId, questId))
