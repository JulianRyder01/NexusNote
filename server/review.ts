/**
 * 回顾与漫游服务。
 *
 * 时间线说明：当前 schema 只在 cards 上保存 created_at / updated_at，
 * 没有独立的事件日志表。因此「昨日完成」近似为
 * `status = 'done' AND updated_at ∈ 昨日`——若一张卡完成后又被编辑，
 * 它会从「昨日完成」中消失。这是有意的取舍（不加迁移、成本低）。
 * 上下文标签（activeTags）按该时间段内新增/更新的卡片统计。
 */
import { getDb } from './db'
import { dayRangeUTC, shiftISODate, todayISO } from '@shared/date'
import type { CardStatus, CardType, DailyReview, ReviewCard } from '@shared/types'

interface CardRow {
  id: string
  content: string
  type: CardType
  status: CardStatus
  due_date: string | null
  created_at: string
  updated_at: string
}

/** 批量取这些卡片的标签名（避免 N+1 查询） */
function tagsForCards(ids: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  if (ids.length === 0) return map
  const db = getDb()
  const marks = ids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT ct.card_id, t.name
       FROM card_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.card_id IN (${marks})
       ORDER BY t.name`,
    )
    .all(...ids) as unknown as { card_id: string; name: string }[]
  for (const r of rows) {
    const arr = map.get(r.card_id) ?? []
    arr.push(r.name)
    map.set(r.card_id, arr)
  }
  return map
}

function toReviewCards(rows: CardRow[]): ReviewCard[] {
  const tagMap = tagsForCards(rows.map((r) => r.id))
  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    type: r.type,
    status: r.status,
    due_date: r.due_date,
    updated_at: r.updated_at,
    tags: tagMap.get(r.id) ?? [],
  }))
}

/** 区间内新增（created_at ∈ [start, end)）且未归档的卡片 */
function createdIn(startISO: string, endISO: string): CardRow[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT id, content, type, status, due_date, created_at, updated_at
       FROM cards
       WHERE archived = 0 AND created_at >= ? AND created_at < ?
       ORDER BY created_at DESC`,
    )
    .all(startISO, endISO) as unknown as CardRow[]
}

/** 区间内完成的 todo（近似：status=done 且 updated_at ∈ 区间） */
function doneIn(startISO: string, endISO: string): CardRow[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT id, content, type, status, due_date, created_at, updated_at
       FROM cards
       WHERE archived = 0 AND status = 'done' AND updated_at >= ? AND updated_at < ?
       ORDER BY updated_at DESC`,
    )
    .all(startISO, endISO) as unknown as CardRow[]
}

/** 区间内活跃标签：对这些卡片上的标签计数，降序取前 N */
function activeTagsIn(
  rows: CardRow[],
  limit = 8,
): { name: string; color: string | null; count: number }[] {
  if (rows.length === 0) return []
  const db = getDb()
  const marks = rows.map(() => '?').join(',')
  const hits = db
    .prepare(
      `SELECT t.name, t.color, COUNT(*) AS count
       FROM card_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.card_id IN (${marks})
       GROUP BY t.id
       ORDER BY count DESC, t.name ASC
       LIMIT ?`,
    )
    .all(...rows.map((r) => r.id), limit) as unknown as {
    name: string
    color: string | null
    count: number
  }[]
  return hits
}

/** 指定 due 日期的卡片 */
function dueOn(dateISO: string): CardRow[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT id, content, type, status, due_date, created_at, updated_at
       FROM cards
       WHERE archived = 0 AND due_date = ?
       ORDER BY updated_at DESC`,
    )
    .all(dateISO) as unknown as CardRow[]
}

/** 温故：随机一张「创建于 7 天前或更早」的卡片 */
function throwbackCard(todayDate: string): CardRow | null {
  const db = getDb()
  const cutoff = dayRangeUTC(shiftISODate(todayDate, -7)).start
  const row = db
    .prepare(
      `SELECT id, content, type, status, due_date, created_at, updated_at
       FROM cards
       WHERE archived = 0 AND created_at < ?
       ORDER BY RANDOM() LIMIT 1`,
    )
    .get(cutoff) as unknown as CardRow | undefined
  return row ?? null
}

/**
 * 生成每日回顾（实时计算，不落库）。
 * @param date 以哪一天作为「今日」；默认当前本地日期
 */
export function getDailyReview(date?: string): DailyReview {
  const today = date ?? todayISO()
  const yesterday = shiftISODate(today, -1)
  const tomorrow = shiftISODate(today, 1)

  const yRange = dayRangeUTC(yesterday)
  const tRange = dayRangeUTC(today)

  const createdYesterdayRows = createdIn(yRange.start, yRange.end)
  const doneYesterdayRows = doneIn(yRange.start, yRange.end)
  const createdTodayRows = createdIn(tRange.start, tRange.end)
  const doneTodayRows = doneIn(tRange.start, tRange.end)

  const throwbackRow = throwbackCard(today)

  return {
    yesterday,
    today,
    createdYesterday: toReviewCards(createdYesterdayRows),
    doneYesterday: toReviewCards(doneYesterdayRows),
    // 昨日活跃标签综合「新增 + 完成」的卡片
    activeTagsYesterday: activeTagsIn([...createdYesterdayRows, ...doneYesterdayRows]),
    throwback: throwbackRow ? toReviewCards([throwbackRow])[0]! : null,
    createdToday: toReviewCards(createdTodayRows),
    doneToday: toReviewCards(doneTodayRows),
    activeTagsToday: activeTagsIn([...createdTodayRows, ...doneTodayRows]),
    dueTomorrow: toReviewCards(dueOn(tomorrow)),
  }
}
