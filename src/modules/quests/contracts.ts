import { z } from 'zod'
import { type Claim, dayOf, QUEST_IDS, type QuestId } from './domain/quests'

export type { Claim, ClaimError, QuestId, Reward } from './domain/quests'
export { DAY_MS, QUEST_IDS, QUESTS } from './domain/quests'

const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const at = Date.parse(`${day}T00:00:00Z`)
    return Number.isFinite(at) && dayOf(at) === day
  }, 'Date invalide')

export const ClaimInput = z.object({ day: Day, questId: z.enum(QUEST_IDS) }).strict()
export const TransferReply = z
  .object({ transferId: z.string().min(1), outcome: z.literal('deposited') })
  .strict()
export const QUESTS_TOPICS = { transferResult: 'quests.transfer-result' } as const
export const QUESTS_CHANNEL_PREFIX = 'quests-'
export const questsChannel = (userId: string) => `${QUESTS_CHANNEL_PREFIX}${userId}`

export interface QuestBoard {
  day: string
  expiresAt: number
  serverNow: number
  position: number
  hasVillage: boolean
  quests: { questId: QuestId; progress: number; claim: Claim | null }[]
  pending: Claim[]
}
