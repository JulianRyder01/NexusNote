import Fastify from 'fastify'
import { APP_NAME, APP_VERSION } from '@shared/meta'
import { getDb } from './db'
import { cardRoutes } from './routes/cards'
import { tagRoutes } from './routes/tags'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '127.0.0.1'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
})

app.get('/api/health', async () => ({
  ok: true,
  app: APP_NAME,
  version: APP_VERSION,
  time: new Date().toISOString(),
}))

await app.register(cardRoutes)
await app.register(tagRoutes)

async function start() {
  try {
    getDb() // 触发数据库初始化与种子数据
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`${APP_NAME} v${APP_VERSION} 后端已启动`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void start()
