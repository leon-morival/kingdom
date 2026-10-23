import { describe, expect, it } from 'vitest'
import {
  type Claim,
  canClaim,
  confirmClaim,
  DAY_MS,
  dayOf,
  endsAt,
  progressAfter,
  QUEST_IDS,
  QUESTS,
  retainedFrom,
  tradeRecipients,
  victoryRecipients,
} from './quests'

const now = Date.UTC(2026, 9, 23, 12)
const input = {
  day: '2026-10-23',
  questId: 'builder' as const,
  progress: 1,
  hasVillage: true,
  existing: null,
  now,
}
const claim: Claim = {
  day: input.day,
  questId: 'builder',
  reward: { gold: 20 },
  status: 'pending',
  claimedAt: now,
  paidAt: null,
}

describe('Règles des contrats quotidiens', () => {
  it('R1 : change de journée exactement à minuit UTC, même autour du changement d’heure', () => {
    const end = endsAt('2026-10-25')
    expect(dayOf(end - 1)).toBe('2026-10-25')
    expect(dayOf(end)).toBe('2026-10-26')
    expect(end - Date.UTC(2026, 9, 25)).toBe(DAY_MS)
    expect(retainedFrom(now)).toBe('2026-09-24')
  })
  it('R2/R5 : une amélioration remplit et plafonne le contrat Bâtisseur', () => {
    expect(progressAfter('builder', 0)).toBe(1)
    expect(progressAfter('builder', 1)).toBe(1)
    for (const id of QUEST_IDS) expect(progressAfter(id, 1)).toBe(QUESTS[id].target)
  })
  it('R3 : une victoire récompense les participants humains, une défaite personne', () => {
    expect(victoryRecipients('won', ['alice', 'bob', 'alice'])).toEqual(['alice', 'bob'])
    expect(victoryRecipients('lost', ['alice'])).toEqual([])
  })
  it('R4 : seul un échange conclu compte, pour ses deux parties', () => {
    expect(tradeRecipients(true, 'alice', 'bob')).toEqual(['alice', 'bob'])
    expect(tradeRecipients(false, 'alice', 'bob')).toEqual([])
    expect(tradeRecipients(true, 'alice', null)).toEqual([])
  })
  it('R6 : exige le bon jour, un village et une progression complète', () => {
    expect(canClaim(input)).toBeNull()
    expect(canClaim({ ...input, progress: 0 })).toBe('NOT_COMPLETE')
    expect(canClaim({ ...input, hasVillage: false })).toBe('VILLAGE_REQUIRED')
    expect(canClaim({ ...input, now: endsAt(input.day) })).toBe('EXPIRED')
    expect(canClaim({ ...input, day: '2026-10-24' })).toBe('EXPIRED')
  })
  it('R7/R8 : une commande déjà acceptée reste valable après expiration', () => {
    expect(canClaim({ ...input, now: now + DAY_MS, existing: claim })).toBeNull()
    expect(confirmClaim(claim, 'deposited', now + DAY_MS)).toMatchObject({
      status: 'paid',
      paidAt: now + DAY_MS,
    })
  })
  it('R9 : une confirmation seule marque le versement, sans modifier sa date au rejeu', () => {
    expect(confirmClaim(claim, 'refused', now)).toBe(claim)
    const paid = confirmClaim(claim, 'deposited', now)
    expect(confirmClaim(paid, 'deposited', now + DAY_MS)).toBe(paid)
  })
})
