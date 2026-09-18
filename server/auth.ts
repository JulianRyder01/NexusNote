/** 认证与会话：bcryptjs 校验密码 + JWT 存 httpOnly cookie + sessions 表 */
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDb } from './db'
import { makeId, nowISO } from './seed'

export const SESSION_COOKIE = 'aplusnexus_session'

/** 会话有效期（天） */
export function sessionDays(): number {
  const n = Number(process.env.SESSION_DAYS ?? 30)
  return Number.isFinite(n) && n > 0 ? n : 30
}

/** JWT 密钥：生产环境必须通过环境变量提供 */
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.trim() === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('生产环境必须设置 JWT_SECRET')
    }
    return 'aplusnexus-dev-secret-do-not-use-in-production'
  }
  return secret
}

/**
 * 解析期望的密码哈希。
 * 优先使用环境变量 APLUSNEXUS_PASSWORD_HASH；否则由 APLUSNEXUS_PASSWORD 现算。
 * 缺省口令为 aplusnexus（仅用于开发，可在 .env 修改）。
 */
export async function resolvePasswordHash(): Promise<string> {
  const configuredHash = process.env.APLUSNEXUS_PASSWORD_HASH
  if (configuredHash && configuredHash.trim() !== '') return configuredHash.trim()

  const plain = process.env.APLUSNEXUS_PASSWORD ?? 'aplusnexus'
  return bcrypt.hash(plain, 10)
}

/** 校验密码 */
export async function verifyPassword(plain: string): Promise<boolean> {
  const hash = await resolvePasswordHash()
  return bcrypt.compare(plain, hash)
}

export interface SessionRecord {
  token: string
  created_at: string
  expires_at: string
  user_agent: string | null
  ip: string | null
}

/** 创建会话：生成 jti 并写入 sessions 表（cookie 中的 JWT 由 signToken 签发） */
export function createSession(userAgent: string | null, ip: string | null): SessionRecord {
  const db = getDb()
  const days = sessionDays()
  const now = new Date()
  const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  const jti = makeId(16)

  const record: SessionRecord = {
    token: jti,
    created_at: nowISO(),
    expires_at: expires.toISOString(),
    user_agent: userAgent,
    ip,
  }
  db.prepare(
    'INSERT INTO sessions (token, created_at, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?)',
  ).run(record.token, record.created_at, record.expires_at, record.user_agent, record.ip)

  return record
}

/** 签发用于 cookie 的 JWT（与会话 jti 绑定） */
export function signToken(jti: string): string {
  return jwt.sign({ sub: 'owner', jti }, jwtSecret(), { expiresIn: `${sessionDays()}d` })
}

/** 校验 cookie 中的 JWT，并确认对应会话仍在数据库中且未过期 */
export function verifyToken(token: string): { jti: string } | null {
  let payload: jwt.JwtPayload
  try {
    payload = jwt.verify(token, jwtSecret()) as jwt.JwtPayload
  } catch {
    return null
  }
  const jti = typeof payload.jti === 'string' ? payload.jti : null
  if (!jti) return null

  const db = getDb()
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(jti) as
    | unknown as { expires_at: string }
    | undefined
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(jti)
    return null
  }
  return { jti }
}

/** 销毁会话（登出／强制下线） */
export function destroySession(jti: string): void {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE token = ?').run(jti)
}

/** 清理过期会话 */
export function purgeExpiredSessions(): number {
  const db = getDb()
  const res = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowISO())
  return Number(res.changes)
}
