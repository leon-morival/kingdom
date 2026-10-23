/** Catalogue fixe : toute récompense est choisie ici, jamais par le navigateur. */
export const QUEST_IDS = ['builder', 'hunter', 'merchant'] as const
export type QuestId = (typeof QUEST_IDS)[number]
export type Reward = Partial<Record<'wood' | 'stone' | 'gold', number>>
export const DAY_MS = 86_400_000
export const RETENTION_DAYS = 30

export const QUESTS: Record<
  QuestId,
  {
    title: string
    description: string
    destination: string
    kind: string
    target: number
    reward: Reward
  }
> = {
  builder: {
    title: 'Bâtisseur du royaume',
    description: 'Améliorez un bâtiment de votre village.',
    destination: '/village',
    kind: 'village',
    target: 1,
    reward: { gold: 20 },
  },
  hunter: {
    title: 'Chasseur de monstres',
    description: 'Remportez une expédition dans le Donjon.',
    destination: '/dungeon',
    kind: 'dungeon',
    target: 1,
    reward: { wood: 40 },
  },
  merchant: {
    title: 'Commerçant du royaume',
    description: 'Concluez un échange au Marché, comme vendeur ou acheteur.',
    destination: '/market',
    kind: 'market',
    target: 1,
    reward: { stone: 30 },
  },
}

/** Journées entières UTC : aucun fuseau ou passage à l'heure d'été n'intervient. */
export const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10)
export const endsAt = (day: string) => Date.parse(`${day}T00:00:00.000Z`) + DAY_MS
export const retainedFrom = (now: number) => dayOf(now - (RETENTION_DAYS - 1) * DAY_MS)
export const progressAfter = (questId: QuestId, current: number) =>
  Math.min(QUESTS[questId].target, current + 1)

/** Seuls les joueurs humains enregistrés participent, indépendamment de leurs points de vie. */
export const victoryRecipients = (result: string, humanIds: string[]) =>
  result === 'won' ? [...new Set(humanIds)] : []
export const tradeRecipients = (completed: boolean, sellerId: string, buyerId: string | null) =>
  completed && buyerId !== null ? [...new Set([sellerId, buyerId].filter(Boolean))] : []

export interface Claim {
  day: string
  questId: QuestId
  reward: Reward
  status: 'pending' | 'paid'
  claimedAt: number
  paidAt: number | null
}
export type ClaimError = 'EXPIRED' | 'NOT_COMPLETE' | 'VILLAGE_REQUIRED' | 'ACCOUNT_ERASED'

export function canClaim(input: {
  day: string
  questId: QuestId
  progress: number
  hasVillage: boolean
  existing: Claim | null
  now: number
}): ClaimError | null {
  // Une répétition d'une commande acceptée ne crée rien, même le lendemain.
  if (input.existing) return null
  if (dayOf(input.now) !== input.day) return 'EXPIRED'
  if (!input.hasVillage) return 'VILLAGE_REQUIRED'
  if (input.progress < QUESTS[input.questId].target) return 'NOT_COMPLETE'
  return null
}

export function confirmClaim(claim: Claim, outcome: string, now: number): Claim {
  return outcome === 'deposited' && claim.status === 'pending'
    ? { ...claim, status: 'paid', paidAt: now }
    : claim
}
