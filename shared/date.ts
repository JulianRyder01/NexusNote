/**
 * 本地时区日期工具（前后端共用）。
 *
 * 约定：卡片时间戳以 UTC ISO 字符串存储（`YYYY-MM-DDTHH:mm:ss.sssZ`）；
 *       而「某一天」始终按**本地时区**的自然日界定，因此需要把本地日边界
 *       换算成 UTC ISO 后再与存储值比较。
 */
import { toISODate } from './parser'

export { toISODate }

/** 解析 YYYY-MM-DD 为本地时区的 Date（零点） */
export function parseISODateLocal(dateISO: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO)
  if (!m) throw new Error(`非法日期：${dateISO}`)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** 在 YYYY-MM-DD 基础上按天偏移（本地时区） */
export function shiftISODate(dateISO: string, days: number): string {
  const d = parseISODateLocal(dateISO)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** 今天的本地日期 YYYY-MM-DD */
export function todayISO(now: Date = new Date()): string {
  return toISODate(now)
}

/**
 * 某一天（本地）对应的 UTC ISO 半开区间 [start, end)。
 * 与存储的 UTC 时间戳可直接做字符串 / 数值比较。
 */
export function dayRangeUTC(dateISO: string): { start: string; end: string } {
  const start = parseISODateLocal(dateISO)
  const end = parseISODateLocal(shiftISODate(dateISO, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

/** 校验是否为合法 YYYY-MM-DD */
export function isValidISODate(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return false
  const d = parseISODateLocal(v)
  return toISODate(d) === v
}

/** 相对今天的中文描述：今天 / 昨天 / 明天 / 2026-10-01 */
export function relativeDayLabel(dateISO: string, now: Date = new Date()): string {
  const today = todayISO(now)
  if (dateISO === today) return '今天'
  if (dateISO === shiftISODate(today, -1)) return '昨天'
  if (dateISO === shiftISODate(today, 1)) return '明天'
  return dateISO
}
