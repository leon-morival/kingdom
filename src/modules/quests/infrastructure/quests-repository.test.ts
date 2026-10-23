import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import { outbox } from '@/platform/outbox/schema'
import { createProjectionRunner } from '@/platform/projection/projection'
import { DAY_MS } from '../domain/quests'
import { createQuestsPersonalData } from '../personal-data'
import { createDrizzleQuestsRepository } from './drizzle-quests-repository'
import { createQuestsProjection } from './quests-projection'
import { claims, notifications, progress } from './schema'

async function setup() {
  const db = await createTestDatabase()
  const store = createEventStore(db)
  let now = Date.UTC(2026, 9, 23, 12)
  const clock = () => now
  const projections = createProjectionRunner(db)
  const repo = createDrizzleQuestsRepository(db, projections, clock)
  const append = async (stream: string, type: string, data: Record<string, unknown> = {}) => {
    const version = (await store.read(stream)).length
    await store.append(stream, version, [{ type, data: { at: now, ...data } }])
  }
  const builder = async (id = 'alice') => {
    await append(`village-${id}`, 'VillageFounded', { name: 'Village' })
    await append(`village-${id}`, 'BuildingUpgraded')
    await repo.catchUp()
  }
  return {
    db,
    store,
    projections,
    repo,
    append,
    builder,
    clock,
    advance: (days: number) => {
      now += days * DAY_MS
    },
  }
}
let ctx: Awaited<ReturnType<typeof setup>>
beforeEach(async () => {
  ctx = await setup()
})

describe('Projection et réclamations des Quêtes', () => {
  it('compte les actions avant la première visite, selon leur heure métier et leur propriétaire', async () => {
    await ctx.builder()
    await ctx.append('village-alice', 'BuildingUpgraded')
    await ctx.append('other-alice', 'BuildingUpgraded')
    await ctx.append('village-bob', 'BuildingUpgraded', { at: ctx.clock() - DAY_MS })
    await ctx.repo.catchUp()
    expect((await ctx.repo.snapshot('alice', '2026-10-23')).progress).toMatchObject([
      { questId: 'builder', count: 1 },
    ])
    expect((await ctx.repo.snapshot('bob', '2026-10-23')).progress).toEqual([])
    expect((await ctx.repo.snapshot('bob', '2026-10-22')).progress).toHaveLength(1)
  })

  it('attribue une victoire aux humains, pas aux compagnons ni aux joueurs d’une défaite', async () => {
    await ctx.append('dungeon-one', 'GameCreated', { hostId: 'alice' })
    await ctx.append('dungeon-one', 'PlayerJoined', { playerId: 'bob' })
    await ctx.append('dungeon-one', 'CompanionAdded', { companionId: 'robot' })
    await ctx.append('dungeon-one', 'GameEnded', {
      result: 'won',
      heroIds: ['alice', 'bob', 'robot'],
    })
    await ctx.append('dungeon-two', 'GameCreated', { hostId: 'carol' })
    await ctx.append('dungeon-two', 'GameEnded', { result: 'lost' })
    await ctx.repo.catchUp()
    for (const id of ['alice', 'bob'])
      expect((await ctx.repo.snapshot(id, '2026-10-23')).progress).toMatchObject([
        { questId: 'hunter', count: 1 },
      ])
    for (const id of ['robot', 'carol'])
      expect((await ctx.repo.snapshot(id, '2026-10-23')).progress).toEqual([])
  })

  it('crédite les deux parties du marché seulement à la conclusion et ignore le paiement refusé', async () => {
    await ctx.append('market-one', 'OfferPublished', { sellerId: 'alice' })
    await ctx.append('market-one', 'OfferAccepted', { buyerId: 'carol' })
    await ctx.append('market-one', 'PaymentRefused')
    await ctx.repo.catchUp()
    expect((await ctx.repo.snapshot('alice', '2026-10-23')).progress).toEqual([])
    await ctx.append('market-one', 'OfferAccepted', { buyerId: 'bob' })
    await ctx.append('market-one', 'TradeCompleted')
    await ctx.repo.catchUp()
    for (const id of ['alice', 'bob'])
      expect((await ctx.repo.snapshot(id, '2026-10-23')).progress).toMatchObject([
        { questId: 'merchant', count: 1 },
      ])
    expect((await ctx.repo.snapshot('carol', '2026-10-23')).progress).toEqual([])
  })

  it('enregistre une seule réclamation et un seul message lors de deux demandes concurrentes', async () => {
    await ctx.builder()
    const results = await Promise.all(
      [1, 2].map(() => ctx.repo.claim('alice', '2026-10-23', 'builder', ctx.clock())),
    )
    expect(results.every((result) => result.ok)).toBe(true)
    expect(await ctx.db.select().from(claims)).toHaveLength(1)
    const messages = await ctx.db.select().from(outbox)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      topic: 'realm.deposit',
      payload: { playerId: 'alice', resources: { gold: 20 }, replyTo: 'quests.transfer-result' },
    })
  })

  it('conserve réclamations et progression lors d’un rejeu et d’une montée de version', async () => {
    await ctx.builder()
    await ctx.repo.claim('alice', '2026-10-23', 'builder', ctx.clock())
    const before = await ctx.repo.snapshot('alice', '2026-10-23')
    await ctx.projections.catchUp({ ...createQuestsProjection(ctx.clock), version: 2 })
    expect(await ctx.repo.snapshot('alice', '2026-10-23')).toEqual(before)
    await ctx.repo.claim('alice', '2026-10-23', 'builder', ctx.clock())
    expect(await ctx.db.select().from(outbox)).toHaveLength(1)
    expect(await ctx.projections.positionOf('quests-progress')).toBe(await ctx.store.lastPosition())
  })

  it('refuse un objectif incomplet, un village absent et une nouvelle réclamation expirée', async () => {
    expect(await ctx.repo.claim('alice', '2026-10-23', 'builder', ctx.clock())).toEqual({
      ok: false,
      error: 'VILLAGE_REQUIRED',
    })
    await ctx.builder()
    expect(await ctx.repo.claim('alice', '2026-10-23', 'hunter', ctx.clock())).toEqual({
      ok: false,
      error: 'NOT_COMPLETE',
    })
    ctx.advance(1)
    expect(await ctx.repo.claim('alice', '2026-10-23', 'builder', ctx.clock())).toEqual({
      ok: false,
      error: 'EXPIRED',
    })
    expect(await ctx.db.select().from(outbox)).toEqual([])
  })

  it('confirme une récompense après minuit, et ignore les confirmations répétées ou inconnues', async () => {
    await ctx.builder()
    await ctx.repo.claim('alice', '2026-10-23', 'builder', ctx.clock())
    const [row] = await ctx.db.select().from(claims)
    ctx.advance(1)
    expect((await ctx.repo.snapshot('alice', '2026-10-24')).pending).toHaveLength(1)
    await ctx.repo.confirm(row.transferId, ctx.clock())
    const expected = await ctx.db.select().from(claims)
    await ctx.repo.confirm(row.transferId, ctx.clock() + 100)
    await ctx.repo.confirm('unknown', ctx.clock())
    expect(await ctx.db.select().from(claims)).toEqual(expected)
    expect(expected[0]).toMatchObject({ status: 'paid', paidAt: ctx.clock() })
    expect((await ctx.repo.claim('alice', '2026-10-23', 'builder', ctx.clock())).ok).toBe(true)
  })

  it('efface les données et messages propres, et empêche leur recréation au rejeu', async () => {
    await ctx.builder()
    await ctx.builder('bob')
    await ctx.repo.claim('alice', '2026-10-23', 'builder', ctx.clock())
    const privacy = createQuestsPersonalData(ctx.db, ctx.repo)
    expect(JSON.stringify(await privacy.export('alice'))).not.toContain('bob')
    await privacy.erase?.('alice', [])
    await ctx.projections.rebuild(createQuestsProjection(ctx.clock))
    expect((await ctx.repo.snapshot('alice', '2026-10-23')).progress).toEqual([])
    expect((await ctx.repo.snapshot('bob', '2026-10-23')).progress).toHaveLength(1)
    expect(await ctx.db.select().from(outbox)).toEqual([])
    expect(
      await ctx.db.select().from(notifications).where(eq(notifications.playerId, 'alice')),
    ).toEqual([])
    expect(await ctx.repo.claim('alice', '2026-10-23', 'builder', ctx.clock())).toEqual({
      ok: false,
      error: 'ACCOUNT_ERASED',
    })
  })

  it('préserve le contrat du vendeur quand son acheteur est effacé avant la conclusion', async () => {
    await ctx.append('market-one', 'OfferPublished', { sellerId: 'alice' })
    await ctx.append('market-one', 'OfferAccepted', { buyerId: 'bob' })
    await ctx.repo.catchUp()
    await createQuestsPersonalData(ctx.db, ctx.repo).erase?.('bob', [])
    await ctx.append('market-one', 'TradeCompleted')
    await ctx.projections.rebuild(createQuestsProjection(ctx.clock))
    expect((await ctx.repo.snapshot('alice', '2026-10-23')).progress).toMatchObject([
      { questId: 'merchant' },
    ])
    expect((await ctx.repo.snapshot('bob', '2026-10-23')).progress).toEqual([])
  })

  it('purge les données échues mais conserve une récompense en attente, même après rejeu', async () => {
    await ctx.builder()
    await ctx.builder('bob')
    await ctx.repo.claim('alice', '2026-10-23', 'builder', ctx.clock())
    await ctx.repo.claim('bob', '2026-10-23', 'builder', ctx.clock())
    const [bob] = await ctx.db.select().from(claims).where(eq(claims.playerId, 'bob'))
    await ctx.repo.confirm(bob.transferId, ctx.clock())
    ctx.advance(31)
    const result = await ctx.repo.purge(ctx.clock())
    expect(result).toMatchObject({ progress: 2, claims: 1 })
    expect(result.notifications).toBeGreaterThan(0)
    await ctx.projections.rebuild(createQuestsProjection(ctx.clock))
    expect(await ctx.db.select().from(progress)).toEqual([])
    expect(await ctx.db.select().from(claims)).toMatchObject([
      { playerId: 'alice', status: 'pending' },
    ])
  })
})
