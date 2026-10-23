import type { QuestBoard } from '../contracts'
import { dayOf, endsAt, QUEST_IDS, type QuestId } from '../domain/quests'
import type { QuestsRepository } from './quests-repository'

export function createQuestsService(
  repo: QuestsRepository,
  dispatch: () => Promise<unknown>,
  clock = () => Date.now(),
) {
  async function board(playerId: string): Promise<QuestBoard> {
    // DETTE TECHNIQUE DT-028 : le rattrapage reste dans la requête ; le budget local
    // sous vingt connexions est dépassé. Voir les mesures de l'évaluation avant montée en charge.
    await repo.catchUp()
    const now = clock()
    const day = dayOf(now)
    let snapshot = await repo.snapshot(playerId, day)
    if (
      snapshot.pending.length > 0 ||
      snapshot.claims.some((claim) => claim.status === 'pending')
    ) {
      await dispatch()
      snapshot = await repo.snapshot(playerId, day)
    }
    return {
      day,
      expiresAt: endsAt(day),
      serverNow: now,
      position: await repo.position(),
      hasVillage: snapshot.hasVillage,
      quests: QUEST_IDS.map((questId) => ({
        questId,
        progress: snapshot.progress.find((row) => row.questId === questId)?.count ?? 0,
        claim: snapshot.claims.find((row) => row.questId === questId) ?? null,
      })),
      pending: snapshot.pending,
    }
  }

  async function claim(playerId: string, day: string, questId: QuestId) {
    await repo.catchUp()
    const result = await repo.claim(playerId, day, questId, clock())
    if (!result.ok) return result
    await dispatch()
    // Relire après la distribution : le Village a pu confirmer pendant cette requête.
    const snapshot = await repo.snapshot(playerId, day)
    return {
      ok: true as const,
      claim: snapshot.claims.find((row) => row.questId === questId) ?? result.claim,
    }
  }
  return {
    board,
    claim,
    confirm: (id: string) => repo.confirm(id, clock()),
    purge: () => repo.purge(clock()),
  }
}

export type QuestsService = ReturnType<typeof createQuestsService>
