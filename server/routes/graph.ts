/** 图谱路由 */
import type { FastifyInstance } from 'fastify'
import type { CardType } from '@shared/types'
import { getGraph } from '../graph'

const CARD_TYPES = new Set(['todo', 'idea', 'note', 'link'])

export async function graphRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/graph', async (req) => {
    const q = req.query as Record<string, string | undefined>
    const type = typeof q.type === 'string' && CARD_TYPES.has(q.type) ? (q.type as CardType) : undefined
    return getGraph({
      tag: q.tag,
      days: q.days ? Number(q.days) : undefined,
      type,
      limit: q.limit ? Number(q.limit) : undefined,
    })
  })
}
