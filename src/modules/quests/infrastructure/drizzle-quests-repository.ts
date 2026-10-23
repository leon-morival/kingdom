import { and, eq, lt, sql } from 'drizzle-orm'
import { REALM_TOPICS } from '@/modules/realm/contracts'
import type { Db } from '@/platform/db/client'
import { enqueueMessages } from '@/platform/outbox/outbox'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { QuestSnapshot, QuestsRepository } from '../application/quests-repository'
import { QUESTS_TOPICS } from '../contracts'
import {
  type Claim,
  canClaim,
  confirmClaim,
  DAY_MS,
  QUESTS,
  RETENTION_DAYS,
  retainedFrom,
} from '../domain/quests'
import { createQuestsProjection, progressKey } from './quests-projection'
import { claims, erasedPlayers, notifications, progress, villages } from './schema'

export const claimView = (row: typeof claims.$inferSelect): Claim => ({
  day: row.day,
  questId: row.questId,
  reward: row.reward,
  status: row.status,
  claimedAt: row.claimedAt,
  paidAt: row.paidAt,
})

export function createDrizzleQuestsRepository(
  db: Db,
  projections: ProjectionRunner,
  clock: () => number,
): QuestsRepository {
  const projection = createQuestsProjection(clock)
  return {
    async catchUp() {
      await projections.catchUp(projection)
    },
    position: () => projections.positionOf(projection.name),
    async snapshot(playerId, day) {
      // Une instruction donne une vue cohérente des trois tables, avec un seul aller-retour.
      const result = await db.execute(sql`
        SELECT EXISTS(SELECT 1 FROM ${villages} WHERE ${villages.playerId} = ${playerId}) AS "hasVillage",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('questId', ${progress.questId}, 'count', ${progress.count}))
          FROM ${progress} WHERE ${progress.playerId} = ${playerId} AND ${progress.day} = ${day}), '[]'::jsonb) AS progress,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'day', ${claims.day}, 'questId', ${claims.questId}, 'reward', ${claims.reward},
          'status', ${claims.status}, 'claimedAt', ${claims.claimedAt}, 'paidAt', ${claims.paidAt}))
          FROM ${claims} WHERE ${claims.playerId} = ${playerId}
          AND (${claims.day} = ${day} OR ${claims.status} = 'pending')), '[]'::jsonb) AS rewards`)
      const [row] = (
        result as unknown as {
          rows: { hasVillage: boolean; progress: QuestSnapshot['progress']; rewards: Claim[] }[]
        }
      ).rows
      return {
        hasVillage: row.hasVillage,
        progress: row.progress,
        claims: row.rewards.filter((claim) => claim.day === day),
        pending: row.rewards.filter((claim) => claim.day !== day),
      }
    },
    async claim(playerId, day, questId, now) {
      return db.transaction(async (tx) => {
        const key = and(
          eq(claims.playerId, playerId),
          eq(claims.day, day),
          eq(claims.questId, questId),
        )
        const [erased] = await tx
          .select()
          .from(erasedPlayers)
          .where(eq(erasedPlayers.playerId, playerId))
        if (erased) return { ok: false, error: 'ACCOUNT_ERASED' }
        const [existing] = await tx.select().from(claims).where(key)
        const [village] = await tx.select().from(villages).where(eq(villages.playerId, playerId))
        const [row] = await tx
          .select()
          .from(progress)
          .where(progressKey(playerId, day, questId))
        const error = canClaim({
          day,
          questId,
          now,
          existing: existing ?? null,
          hasVillage: !!village,
          progress: row?.count ?? 0,
        })
        if (error) return { ok: false, error }
        if (existing) return { ok: true, claim: claimView(existing) }
        const transferId = `quests:${crypto.randomUUID()}`
        const [inserted] = await tx
          .insert(claims)
          .values({
            playerId,
            day,
            questId,
            transferId,
            reward: QUESTS[questId].reward,
            status: 'pending',
            claimedAt: now,
          })
          .onConflictDoNothing()
          .returning()
        if (!inserted) {
          const [concurrent] = await tx.select().from(claims).where(key)
          return { ok: true, claim: claimView(concurrent) }
        }
        await enqueueMessages(tx, [
          {
            topic: REALM_TOPICS.deposit,
            payload: {
              transferId,
              playerId,
              resources: inserted.reward,
              replyTo: QUESTS_TOPICS.transferResult,
            },
          },
        ])
        await tx.insert(notifications).values({ playerId, at: now })
        return { ok: true, claim: claimView(inserted) }
      })
    },
    async confirm(transferId, now) {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(claims)
          .where(eq(claims.transferId, transferId))
          .for('update')
        if (!row || row.status === 'paid') return
        const updated = confirmClaim(claimView(row), 'deposited', now)
        await tx
          .update(claims)
          .set({ status: updated.status, paidAt: updated.paidAt })
          .where(eq(claims.transferId, transferId))
        await tx.insert(notifications).values({ playerId: row.playerId, at: now })
      })
    },
    async purge(now) {
      return db.transaction(async (tx) => {
        const oldProgress = await tx
          .delete(progress)
          .where(lt(progress.day, retainedFrom(now)))
          .returning()
        const oldClaims = await tx
          .delete(claims)
          .where(and(eq(claims.status, 'paid'), lt(claims.day, retainedFrom(now))))
          .returning()
        const oldNotifications = await tx
          .delete(notifications)
          .where(lt(notifications.at, now - RETENTION_DAYS * DAY_MS))
          .returning()
        return {
          progress: oldProgress.length,
          claims: oldClaims.length,
          notifications: oldNotifications.length,
        }
      })
    },
  }
}
