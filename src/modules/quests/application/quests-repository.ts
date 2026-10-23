import type { Claim, ClaimError, QuestId } from '../domain/quests'

export interface QuestSnapshot {
  hasVillage: boolean
  progress: { questId: QuestId; count: number }[]
  claims: Claim[]
  pending: Claim[]
}

export interface QuestsRepository {
  catchUp(): Promise<void>
  position(): Promise<number>
  snapshot(playerId: string, day: string): Promise<QuestSnapshot>
  claim(
    playerId: string,
    day: string,
    questId: QuestId,
    now: number,
  ): Promise<{ ok: true; claim: Claim } | { ok: false; error: ClaimError }>
  confirm(transferId: string, now: number): Promise<void>
  purge(now: number): Promise<{ progress: number; claims: number; notifications: number }>
}
