import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { QuestsService } from './application/quests-service'
import { ClaimInput } from './contracts'

export function createQuestsApi(service: QuestsService) {
  return new Hono<AppEnv>()
    .get('/board', async (c) => {
      c.header('Cache-Control', 'private, no-store')
      return c.json(await service.board(c.var.userId))
    })
    .post('/claim', validateJson(ClaimInput), async (c) => {
      const { day, questId } = c.req.valid('json')
      const result = await service.claim(c.var.userId, day, questId)
      if (!result.ok) return c.json({ error: { code: result.error } }, 409)
      return c.json({ claim: result.claim })
    })
}
export type QuestsApi = ReturnType<typeof createQuestsApi>
