/** 每日回顾与随机漫游路由 */
import type { FastifyInstance } from 'fastify'
import { isValidISODate } from '@shared/date'
import { getDailyReview, getRandomCard } from '../review'

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/review/daily', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>
    if (q.date !== undefined && !isValidISODate(q.date)) {
      return reply.code(400).send({ error: 'date 需为 YYYY-MM-DD' })
    }
    return getDailyReview(q.date)
  })

  app.get('/api/random', async (req) => {
    const q = req.query as Record<string, string | undefined>
    const tag = typeof q.tag === 'string' && q.tag.trim() !== '' ? q.tag.trim() : undefined
    const exclude =
      typeof q.exclude === 'string' && q.exclude.trim() !== '' ? q.exclude.trim() : undefined
    return getRandomCard({ tag, exclude })
  })
}
