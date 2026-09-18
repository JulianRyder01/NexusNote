/** 认证路由：登录 / 登出 / 当前会话 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  sessionDays,
  signToken,
  verifyPassword,
  verifyToken,
} from '../auth'

declare module 'fastify' {
  interface FastifyRequest {
    sessionJti?: string
  }
}

/** cookie 选项：httpOnly + SameSite=Lax；生产环境加 Secure */
function cookieOptions() {
  const days = sessionDays()
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: days * 24 * 60 * 60,
  }
}

/** 认证守卫：未登录统一返回 401 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const raw = req.cookies[SESSION_COOKIE]
  if (!raw) {
    await reply.code(401).send({ error: '未登录' })
    return
  }
  const verified = verifyToken(raw)
  if (!verified) {
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    await reply.code(401).send({ error: '会话已失效' })
    return
  }
  req.sessionJti = verified.jti
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 5),
          timeWindow: '1 minute',
        },
      },
    },
    async (req, reply) => {
      const body = req.body as Record<string, unknown>
      const password = typeof body.password === 'string' ? body.password : ''
      if (!password) return reply.code(400).send({ error: '请输入密码' })

      const ok = await verifyPassword(password)
      if (!ok) return reply.code(401).send({ error: '密码不正确' })

      const ua = (req.headers['user-agent'] as string | undefined) ?? null
      const session = createSession(ua, req.ip)

      // 用同一个 jti 重新签发，确保 cookie 与 sessions 记录一致
      const token = signToken(session.token)
      reply.setCookie(SESSION_COOKIE, token, cookieOptions())
      return { ok: true, expires_at: session.expires_at }
    },
  )

  app.post('/api/auth/logout', async (req, reply) => {
    const raw = req.cookies[SESSION_COOKIE]
    if (raw) {
      const verified = verifyToken(raw)
      if (verified) destroySession(verified.jti)
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/api/auth/me', { preHandler: requireAuth }, async () => {
    // 不返回 jti，避免会话标识泄露到前端
    return { authenticated: true }
  })
}
