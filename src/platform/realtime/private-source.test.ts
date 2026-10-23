import { Hono } from 'hono'
import { expect, it, vi } from 'vitest'
import type { EventStore } from '../event-store/event-store'
import type { AppEnv } from '../http/types'
import { createRealtimeApi } from './stream-api'

it('isole la source de chaque abonné et refuse le canal avant de créer sa source', async () => {
  const sourceFor = vi.fn((channel: string, userId: string) => ({
    start: async () => 0,
    read: async (after: number) =>
      after >= 1
        ? []
        : [
            {
              position: 1,
              version: 1,
              stream: channel,
              type: 'PrivateChanged',
              data: { owner: userId },
              occurredAt: new Date(),
            },
          ],
  }))
  const app = new Hono<AppEnv>()
    .use(async (c, next) => {
      c.set('userId', c.req.header('x-test-user') ?? '')
      await next()
    })
    .route(
      '/stream',
      createRealtimeApi({
        store: {} as EventStore,
        policies: [
          {
            prefix: 'private-',
            canSubscribe: (channel, id) => channel === `private-${id}`,
            sourceFor,
          },
        ],
        maxStreamMs: 10,
        pollMs: 1,
      }),
    )
  const request = (path: string, id: string) =>
    app.request(`/stream/${path}`, { headers: { 'x-test-user': id } })
  expect((await request('private-bob/events', 'alice')).status).toBe(403)
  expect(sourceFor).not.toHaveBeenCalled()
  const [alice, bob] = await Promise.all([
    request('private-alice/events', 'alice'),
    request('private-bob/events', 'bob'),
  ])
  expect(await alice.text()).toContain('"owner":"alice"')
  expect(await bob.text()).toContain('"owner":"bob"')
  const resumed = await request('private-alice/events?after=1', 'alice')
  expect(await resumed.json()).toEqual({ events: [] })
  const sse = await request('private-alice', 'alice')
  expect(await sse.text()).toContain('"owner":"alice"')
})
