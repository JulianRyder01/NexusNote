/**
 * AplusNexus 输入解析器（前后端共用唯一真源）
 *
 * 语法速查：
 *   [ ] 开头              -> todo
 *   ? 开头                -> idea（问题式）
 *   ! 开头                -> idea（灵感式）
 *   http 开头             -> link
 *   其他                  -> note
 *   内嵌 #标签            -> tags
 *   内嵌 [[卡片]]         -> links
 *   内嵌 P0~P3 或自定义名 -> priority
 *   内嵌 @今天/@明天/@YYYY-MM-DD -> due date
 */
import type { CardType, ParsedInput } from './types'

/** 匹配 #标签：允许中文、字母数字、下划线、连字符、斜杠、点 */
const TAG_RE = /#([^\s#\[\]]+)/g
/** 匹配 [[显式链接]] */
const LINK_RE = /\[\[([^\]]+)\]\]/g
/** 匹配 P0~P9 形式优先级 */
const PRIORITY_RE = /(?:^|\s)(P[0-9])(?=\s|$)/g
/** 匹配 @日期 token */
const AT_TOKEN_RE = /@([^\s#\[\]@]+)/g
/** 匹配 @起~@止 或 @起~止 区间（~ 支持全角～；终点可省略，表示「自该日起」） */
const RANGE_RE = /@([^\s#\[\]@~～]+)\s*[~～]\s*(?:@([^\s#\[\]@~～]+))?/g
/** 匹配行内重要性标记：! / !! / !!!（前后为空白或行首尾） */
const IMPORTANCE_RE = /(?:^|\s)(!{1,3})(?=\s|$)/g

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

/** 把 Date 格式化为本地时区的 YYYY-MM-DD */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 校验并规范化 YYYY-MM-DD */
function normalizeISODate(s: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (!m) return null
  const [, ys, ms, ds] = m
  const y = Number(ys)
  const mo = Number(ms)
  const d = Number(ds)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return toISODate(date)
}

/**
 * 解析 @日期 token。
 * 支持：今天/明天/后天/昨天、周X/星期X/礼拜X、YYYY-MM-DD、M/D、M月D日。
 */
export function parseDueToken(token: string, now: Date = new Date()): string | null {
  const t = token.trim()
  if (!t) return null

  const iso = normalizeISODate(t)
  if (iso) return iso

  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const shift = (days: number) => {
    const d = new Date(base)
    d.setDate(d.getDate() + days)
    return toISODate(d)
  }

  switch (t) {
    case '今天':
    case '今日':
      return shift(0)
    case '明天':
    case '明日':
      return shift(1)
    case '后天':
      return shift(2)
    case '昨天':
    case '昨日':
      return shift(-1)
  }

  // 周X / 星期X / 礼拜X：默认指向「下一个」该星期几（含今天）
  const wm = /^(?:周|星期|礼拜)([一二三四五六日天])$/.exec(t)
  if (wm) {
    const label = wm[1] === '天' ? '日' : wm[1]
    const target = WEEKDAY_CN.indexOf(label!)
    if (target >= 0) {
      const diff = (target - base.getDay() + 7) % 7
      return shift(diff)
    }
  }

  // M/D 或 M-D（当年）
  const md = /^(\d{1,2})[/-](\d{1,2})$/.exec(t)
  if (md) {
    const mo = Number(md[1])
    const d = Number(md[2])
    const candidate = new Date(base.getFullYear(), mo - 1, d)
    // 若已过去则顺延到明年
    if (toISODate(candidate) < toISODate(base)) candidate.setFullYear(base.getFullYear() + 1)
    return normalizeISODate(toISODate(candidate))
  }

  // M月D日（当年）
  const cn = /^(\d{1,2})月(\d{1,2})[日号]?$/.exec(t)
  if (cn) {
    const candidate = new Date(base.getFullYear(), Number(cn[1]) - 1, Number(cn[2]))
    if (toISODate(candidate) < toISODate(base)) candidate.setFullYear(base.getFullYear() + 1)
    return normalizeISODate(toISODate(candidate))
  }

  return null
}

/** 依据行首语法推断卡片类型，并返回剥除前缀后的正文 */
export function detectType(raw: string): { type: CardType; content: string; done: boolean } {
  const trimmed = raw.trimStart()

  if (/^\[\s*\]/.test(trimmed)) {
    return { type: 'todo', content: trimmed.replace(/^\[\s*\]\s*/, ''), done: false }
  }
  if (/^\[[xX]\]/.test(trimmed)) {
    return { type: 'todo', content: trimmed.replace(/^\[[xX]\]\s*/, ''), done: true }
  }
  if (trimmed.startsWith('?')) {
    return { type: 'idea', content: trimmed.replace(/^\?\s*/, ''), done: false }
  }
  if (trimmed.startsWith('!')) {
    return { type: 'idea', content: trimmed.replace(/^!\s*/, ''), done: false }
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: 'link', content: trimmed, done: false }
  }
  return { type: 'note', content: trimmed, done: false }
}

/** 提取全部 #标签（去重，保持出现顺序） */
export function extractTags(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(TAG_RE)) {
    const name = m[1]?.trim()
    if (!name) continue
    if (seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/** 提取全部 [[显式链接]] 目标（去重） */
export function extractLinks(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(LINK_RE)) {
    const name = m[1]?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/**
 * 提取优先级名。仅识别 P0~P9 形式（自定义优先级名由调用方按已有列名另行匹配）。
 */
export function extractPriority(text: string, knownNames: string[] = []): string | null {
  // 先匹配已知自定义名（更长的名字优先，避免 P1 抢先匹配 P10）
  if (knownNames.length > 0) {
    const sorted = [...knownNames].sort((a, b) => b.length - a.length)
    for (const name of sorted) {
      if (!name) continue
      const re = new RegExp(`(?:^|\\s)${escapeRegExp(name)}(?=\\s|$)`)
      if (re.test(text)) return name
    }
  }
  const m = PRIORITY_RE.exec(text)
  PRIORITY_RE.lastIndex = 0
  return m ? (m[1] ?? null) : null
}

/**
 * 成对提取时间区间：同时返回 start 与 due，保证两者一致。
 *
 * 规则：
 *   - 有 `@起~@止` 区间语法时，两端都解析成功则取用；起止颠倒则自动交换。
 *   - 否则退化到第一个可解析的 `@token` 作为 due（start 为 null → 甘特图里程碑点）。
 *
 * 之所以成对返回：避免 start 与 due 分别解析，导致「只交换了其中一个」这类不一致。
 */
export function extractDateRange(
  text: string,
  now: Date = new Date(),
): { start: string | null; due: string | null } {
  for (const m of text.matchAll(RANGE_RE)) {
    const a = m[1] ? parseDueToken(m[1], now) : null
    const b = m[2] ? parseDueToken(m[2], now) : null
    if (a && b) return a <= b ? { start: a, due: b } : { start: b, due: a }
    if (a) return { start: a, due: a }
    if (b) return { start: null, due: b }
  }
  for (const m of text.matchAll(AT_TOKEN_RE)) {
    const iso = m[1] ? parseDueToken(m[1], now) : null
    if (iso) return { start: null, due: iso }
  }
  return { start: null, due: null }
}

/** 提取 due date（便捷包装，取区间的「止」） */
export function extractDueDate(text: string, now: Date = new Date()): string | null {
  return extractDateRange(text, now).due
}

/** 提取开始日期（便捷包装，仅在 `@起~@止` 区间语法下非空） */
export function extractStartDate(text: string, now: Date = new Date()): string | null {
  return extractDateRange(text, now).start
}

/**
 * 提取重要性：行内独立的 `!` 数量（1/2/3，最多取 3）。
 * 注意仅匹配被空白包夹的 `!`，因此正文里的感叹号不受影响。
 */
export function extractImportance(text: string): number | null {
  let max = 0
  for (const m of text.matchAll(IMPORTANCE_RE)) {
    const n = m[1]?.length ?? 0
    if (n > max) max = n
  }
  return max > 0 ? Math.min(max, 3) : null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 综合解析一行快速输入。
 * @param raw        用户原始输入
 * @param knownPriorities 已知优先级名列表（含自定义），用于匹配优先级
 */
export function parseInput(
  raw: string,
  knownPriorities: string[] = [],
  now: Date = new Date(),
): ParsedInput {
  const { type, content, done } = detectType(raw)
  const range = extractDateRange(content, now)
  return {
    raw,
    content,
    type,
    done,
    priorityName: extractPriority(content, knownPriorities),
    tags: extractTags(content),
    links: extractLinks(content),
    startDate: range.start,
    dueDate: range.due,
    importance: extractImportance(content),
  }
}

/**
 * 从正文中剥离语法标记，得到用于展示的纯文本。
 * 保留标签文本（标签本身是内容的一部分），去除优先级、日期 token 与重要性标记。
 */
export function stripSyntaxGlue(text: string, knownPriorities: string[] = []): string {
  let out = text
    // 先剥离区间整体，再剥离剩余单点日期 token
    .replace(RANGE_RE, '')
    .replace(AT_TOKEN_RE, '')
    .replace(IMPORTANCE_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  for (const name of knownPriorities) {
    if (!name) continue
    out = out.replace(new RegExp(`(?:^|\\s)${escapeRegExp(name)}(?=\\s|$)`, 'g'), ' ').trim()
  }
  return out.replace(/\s{2,}/g, ' ').trim()
}
