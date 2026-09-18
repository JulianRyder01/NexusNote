/** 排期路由：甘特图与矩阵视图的数据源 */
import type { FastifyInstance } from 'fastify'
import { getSchedule } from '../schedule'

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/schedule', async () => getSchedule())
}
