import { and, asc, eq, gt, gte, max } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createQuestsApi } from './api'
import { createQuestsService } from './application/quests-service'
import { QUESTS_CHANNEL_PREFIX, QUESTS_TOPICS, questsChannel, TransferReply } from './contracts'
import { DAY_MS, RETENTION_DAYS } from './domain/quests'
import { createDrizzleQuestsRepository } from './infrastructure/drizzle-quests-repository'
import { notifications } from './infrastructure/schema'
import { createQuestsPersonalData } from './personal-data'

export function createQuestsModule({
  db,
  projections,
  dispatch,
  clock = () => Date.now(),
}: {
  db: Db
  projections: ProjectionRunner
  dispatch: () => Promise<unknown>
  clock?: () => number
}) {
  const repo = createDrizzleQuestsRepository(db, projections, clock)
  const service = createQuestsService(repo, dispatch, clock)
  const handlers: Record<string, MessageHandler> = {
    [QUESTS_TOPICS.transferResult]: async (message) => {
      const reply = TransferReply.parse(message.payload)
      await service.confirm(reply.transferId)
    },
  }
  const channelPolicy: ChannelPolicy = {
    prefix: QUESTS_CHANNEL_PREFIX,
    canSubscribe: (channel, userId) => channel === questsChannel(userId),
    redact: true,
    sourceFor: (channel, playerId) => ({
      async start() {
        await repo.catchUp()
        const [row] = await db
          .select({ id: max(notifications.id) })
          .from(notifications)
          .where(eq(notifications.playerId, playerId))
        return row?.id ?? 0
      },
      async read(after) {
        await repo.catchUp()
        const rows = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.playerId, playerId),
              gt(notifications.id, after),
              gte(notifications.at, clock() - RETENTION_DAYS * DAY_MS),
            ),
          )
          .orderBy(asc(notifications.id))
          .limit(100)
        return rows.map((row) => ({
          position: row.id,
          version: row.id,
          stream: channel,
          type: 'QuestBoardChanged',
          data: {},
          occurredAt: new Date(row.at),
        }))
      },
    }),
  }
  return {
    api: createQuestsApi(service),
    handlers,
    channelPolicy,
    dailyTask: service.purge,
    personalData: createQuestsPersonalData(db, repo),
  }
}
export type { QuestsApi } from './api'
