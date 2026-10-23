import { eq } from 'drizzle-orm'
import { REALM_TOPICS } from '@/modules/realm/contracts'
import type { Db } from '@/platform/db/client'
import { discardMessages } from '@/platform/outbox/outbox'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import type { QuestsRepository } from './application/quests-repository'
import { QUESTS_TOPICS } from './contracts'
import {
  claims,
  erasedPlayers,
  notifications,
  participants,
  progress,
  trades,
  villages,
} from './infrastructure/schema'

export function createQuestsPersonalData(db: Db, repo: QuestsRepository): PersonalDataContributor {
  return {
    name: 'quests',
    async export(playerId) {
      await repo.catchUp()
      return {
        progress: await db
          .select({ day: progress.day, questId: progress.questId, count: progress.count })
          .from(progress)
          .where(eq(progress.playerId, playerId)),
        claims: await db
          .select({
            day: claims.day,
            questId: claims.questId,
            reward: claims.reward,
            status: claims.status,
            claimedAt: claims.claimedAt,
            paidAt: claims.paidAt,
          })
          .from(claims)
          .where(eq(claims.playerId, playerId)),
        participations: await db
          .select({ gameId: participants.gameId })
          .from(participants)
          .where(eq(participants.playerId, playerId)),
        sales: await db
          .select({ offerId: trades.offerId })
          .from(trades)
          .where(eq(trades.sellerId, playerId)),
        purchases: await db
          .select({ offerId: trades.offerId })
          .from(trades)
          .where(eq(trades.buyerId, playerId)),
        notifications: await db
          .select({ id: notifications.id, at: notifications.at })
          .from(notifications)
          .where(eq(notifications.playerId, playerId)),
        villages: await db.select().from(villages).where(eq(villages.playerId, playerId)),
      }
    },
    async erase(playerId) {
      await db.transaction(async (tx) => {
        await tx.insert(erasedPlayers).values({ playerId }).onConflictDoNothing()
        const rewards = await tx.select().from(claims).where(eq(claims.playerId, playerId))
        for (const row of rewards) {
          await discardMessages(tx, REALM_TOPICS.deposit, { transferId: row.transferId })
          await discardMessages(tx, QUESTS_TOPICS.transferResult, { transferId: row.transferId })
        }
        await tx.delete(claims).where(eq(claims.playerId, playerId))
        await tx.delete(progress).where(eq(progress.playerId, playerId))
        await tx.delete(participants).where(eq(participants.playerId, playerId))
        await tx.delete(villages).where(eq(villages.playerId, playerId))
        await tx.delete(notifications).where(eq(notifications.playerId, playerId))
        // Conserver l'autre partie pour son éventuel contrat à la conclusion de l'échange.
        await tx.update(trades).set({ sellerId: '' }).where(eq(trades.sellerId, playerId))
        await tx.update(trades).set({ buyerId: '' }).where(eq(trades.buyerId, playerId))
      })
    },
  }
}
