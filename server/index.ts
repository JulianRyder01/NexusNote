// 必须最先执行：把 .env 注入 process.env，供后续模块读取
import { DOTENV_FILE } from './env'

import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { APP_NAME, APP_VERSION } from '@shared/meta'
import { getDb } from './db'
import { cardRoutes } from './routes/cards'
import { tagRoutes } from './routes/tags'
import { authRoutes, requireAuth } from './routes/auth'
import { purgeExpiredSessions } from './auth'

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '127.0.0.1'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
  // 仅在信任反向代理（如 Nginx/Caddy）时才开启，避免 X-Forwarded-For 伪造绕过限流
  trustProxy: process.env.TRUST_PROXY === 'true',
})

await app.register(cookie)

// 全局限流：每分钟 120 次（登录接口单独收紧到 5 次）
await app.register(rateLimit, {
  global: true,
  max: Number(process.env.RATE_LIMIT_MAX ?? 120),
  timeWindow: '1 minute',
})

app.get('/api/health', async () => ({
  ok: true,
  app: APP_NAME,
  version: APP_VERSION,
  time: new Date().toISOString(),
}))

await app.register(authRoutes)

// 业务路由统一要求认证
await app.register(async (instance) => {
  instance.addHook('preHandler', requireAuth)
  await instance.register(cardRoutes)
  await instance.register(tagRoutes)
})

async function start() {
  try {
    getDb() // 触发数据库初始化与种子数据
    const purged = purgeExpiredSessions()
    if (purged > 0) app.log.info(`已清理 ${purged} 条过期会话`)
    if (DOTENV_FILE) app.log.info(`已加载环境变量：${DOTENV_FILE}`)
    await app.listen({ port: PORT, host: HOST })
    app.log.info(`${APP_NAME} v${APP_VERSION} 后端已启动`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void start()
