import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { QuestBoard } from '@/modules/quests/contracts'
import { claims } from '@/modules/quests/infrastructure/schema'
import { createDispatcher, enqueueMessages } from '@/platform/outbox/outbox'
import { outbox } from '@/platform/outbox/schema'
import { createTestApi, TEST_CRON_SECRET } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>
const body = { day: '2026-01-01', questId: 'builder' }
const board = async (api: TestApi, id = 'alice'): Promise<QuestBoard> =>
  (await api.get('/api/quests/board', id)).json()
async function builder(api: TestApi, id = 'alice') {
  expect((await api.post('/api/realm/village', { name: 'Valombre' }, id)).status).toBe(201)
  api.advance(2)
  expect((await api.post('/api/realm/village/upgrade', { building: 'mine' }, id)).status).toBe(200)
}
const stock = async (api: TestApi) =>
  (await (await api.get('/api/realm/village')).json()).view.stock

describe('API des Quêtes', () => {
  it('R10 : protège toutes ses lectures, commandes et canaux contre les anonymes', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/quests/board', null)).status).toBe(401)
    expect((await api.post('/api/quests/claim', body, null)).status).toBe(401)
    expect((await api.get('/api/stream/quests-alice', null)).status).toBe(401)
    expect((await api.get('/api/stream/quests-alice/events', null)).status).toBe(401)
  })
  it('présente trois objectifs et un accès au Village pour un nouveau joueur', async () => {
    const api = await createTestApi()
    const response = await api.get('/api/quests/board')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const view = await response.json()
    expect(view).toMatchObject({ day: body.day, hasVillage: false, pending: [] })
    expect(view.quests).toEqual(
      ['builder', 'hunter', 'merchant'].map((questId) => ({ questId, progress: 0, claim: null })),
    )
    expect((await api.post('/api/quests/claim', body)).status).toBe(409)
  })
  it('R6/R10 : refuse date invalide, contrat inconnu, joueur ou récompense forgés', async () => {
    const api = await createTestApi()
    for (const input of [
      { ...body, day: '2026-02-30' },
      { ...body, questId: 'admin' },
      { ...body, playerId: 'bob' },
      { ...body, reward: { gold: 9999 } },
      { ...body, day: '2026-1-1' },
      {},
    ])
      expect((await api.post('/api/quests/claim', input)).status).toBe(400)
  })
  it('R2/R7/R9 : crédite exactement la récompense, malgré un double clic et une remise répétée', async () => {
    const api = await createTestApi()
    await builder(api)
    expect((await board(api)).quests[0]).toMatchObject({ progress: 1, claim: null })
    const before = await stock(api)
    const responses = await Promise.all([
      api.post('/api/quests/claim', body),
      api.post('/api/quests/claim', body),
    ])
    expect(responses.map((res) => res.status)).toEqual([200, 200])
    expect((await board(api)).quests[0].claim).toMatchObject({
      status: 'paid',
      reward: { gold: 20 },
    })
    expect((await stock(api)).gold).toBe(before.gold + 20)
    // Réinjecter le même mouvement, comme après un crash du distributeur avant son acquittement.
    const [message] = await api.db.select().from(outbox).where(eq(outbox.topic, 'realm.deposit'))
    await api.db.transaction((tx) =>
      enqueueMessages(tx, [
        { topic: message.topic, payload: message.payload as Record<string, unknown> },
      ]),
    )
    await board(api)
    expect((await stock(api)).gold).toBe(before.gold + 20)
  })
  it('R1 : renouvelle les contrats sans tâche de fond et rejette une ancienne nouvelle réclamation', async () => {
    const api = await createTestApi()
    await builder(api)
    api.advance(24 * 60)
    const view = await board(api)
    expect(view.day).toBe('2026-01-02')
    expect(view.quests[0]).toMatchObject({ progress: 0, claim: null })
    expect(await (await api.post('/api/quests/claim', body)).json()).toEqual({
      error: { code: 'EXPIRED' },
    })
  })
  it('R4/R10 : ne donne la progression commerciale qu’aux deux participants', async () => {
    const api = await createTestApi()
    for (const id of ['alice', 'bob']) await api.post('/api/realm/village', { name: 'Village' }, id)
    const { offerId } = await (
      await api.post('/api/market/offers', { give: { wood: 10 }, want: { stone: 5 } })
    ).json()
    expect((await board(api)).quests[2].progress).toBe(0)
    await api.post(`/api/market/offers/${offerId}/accept`, {}, 'bob')
    for (const id of ['alice', 'bob']) expect((await board(api, id)).quests[2].progress).toBe(1)
    expect((await board(api, 'carol')).quests[2].progress).toBe(0)
    expect(
      (await api.post('/api/quests/claim', { ...body, questId: 'merchant' }, 'carol')).status,
    ).toBe(409)
  })
  it('B1 : isole le flux privé, masque les données et reprend après le dernier identifiant', async () => {
    const api = await createTestApi()
    await builder(api)
    await builder(api, 'bob')
    expect((await api.get('/api/stream/quests-alice/events', 'bob')).status).toBe(403)
    expect((await api.get('/api/stream/quests-alice', 'bob')).status).toBe(403)
    const { events } = await (await api.get('/api/stream/quests-alice/events?after=0')).json()
    expect(events.length).toBeGreaterThan(0)
    expect(
      events.every(
        (event: { stream: string; data: unknown }) =>
          event.stream === 'quests-alice' && JSON.stringify(event.data) === '{}',
      ),
    ).toBe(true)
    const after = events.at(-1).position
    await api.post('/api/quests/claim', body)
    const stream = await api.api.request('/api/stream/quests-alice', {
      headers: { 'x-test-user': 'alice', 'last-event-id': String(after) },
    })
    const text = await stream.text()
    expect(text).toContain('event: domain-event')
    expect(text).not.toContain('bob')
    expect(text).not.toContain(`id: ${after}\n`)
  })
  it('exporte et efface le module avec les droits du compte, sans données d’un autre joueur', async () => {
    const api = await createTestApi()
    await builder(api)
    await builder(api, 'bob')
    await api.post('/api/quests/claim', body)
    const { sections } = await (await api.get('/api/account/export')).json()
    expect(sections.quests.claims).toMatchObject([{ questId: 'builder', status: 'paid' }])
    expect(JSON.stringify(sections.quests)).not.toContain('bob')
    expect(
      (
        await api.api.request('/api/account', {
          method: 'DELETE',
          headers: { 'x-test-user': 'alice' },
        })
      ).status,
    ).toBe(200)
    expect(await api.db.select().from(claims)).toEqual([])
    expect((await board(api, 'bob')).quests[0].progress).toBe(1)
  })
  it('purge les progressions par le cron protégé et préserve les paiements non confirmés', async () => {
    const api = await createTestApi()
    await builder(api)
    await api.post('/api/quests/claim', body)
    api.advance(31 * 24 * 60)
    const res = await api.api.request('/api/cron/daily', {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    })
    expect((await res.json()).quests).toMatchObject({
      ok: true,
      result: { claims: 1, progress: 1 },
    })
  })
  it('R8 : reprend un versement après une panne du Village distant et après minuit', async () => {
    const api = await createTestApi({ villageService: true })
    await builder(api)
    const before = await stock(api)
    api.setServiceUp(false)
    const res = await api.post('/api/quests/claim', body)
    expect((await res.json()).claim.status).toBe('pending')
    api.advance(24 * 60)
    expect((await board(api)).pending).toMatchObject([{ day: body.day, status: 'pending' }])
    api.setServiceUp(true)
    api.advance(1)
    expect((await board(api)).pending).toEqual([])
    const [reward] = await api.db.select().from(claims)
    expect(reward.status).toBe('paid')
    // Le Village produit aussi de l'or pendant la panne : contrôler le mouvement du journal.
    const rows = await api.serviceDb?.execute(
      sql`SELECT data FROM platform.events WHERE type = 'ResourcesDeposited'`,
    )
    expect(
      (rows as unknown as { rows: { data: { resources: unknown } }[] }).rows.map(
        (row) => row.data.resources,
      ),
    ).toEqual([{ gold: 20 }])
    expect((await stock(api)).gold).toBeGreaterThan(before.gold)
    expect(await createDispatcher(api.db).status()).toEqual({ pending: 0, abandoned: 0 })
  }, 60_000)
})
