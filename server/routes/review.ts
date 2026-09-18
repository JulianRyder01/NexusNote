/** 每日回顾路由 */
import type { FastifyInstance } from 'fastify'
import { isValidISODate } from '@shared/date'
import { getDailyReview } from '../review'

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/review/daily', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>
    if (q.date !== undefined && !isValidISODate(q.date)) {
      return reply.code(400).send({ error: 'date 需为 YYYY-MM-DD' })
    }
    return getDailyReview(q.date)
  })
}
