/**
 * 排期数据服务：为甘特图与矩阵视图提供带衍生字段的卡片列表。
 *
 * 衍生字段（urgency / quadrant / score）在服务端算一次，
 * 前端只负责展示与筛选，避免两端算法漂移（算法本体在 shared/schedule.ts）。
 */
import { getDb } from './db'
import { shiftISODate, todayISO } from '@shared/date'
import { deriveQuadrant, deriveUrgency, scoreCard } from '@shared/schedule'
import type { CardStatus, CardType, ScheduleItem, SchedulePayload } from '@shared/types'

/** 日期字符串比较用；把 ISO 时间戳截成日期 */
function toDay(iso: string): string {
  return iso.slice(0, 10)
}

export function getSchedule(): SchedulePayload {
  const db = getDb()
  const today = todayISO()

  // 优先级：id -> { name, rank }
  const prios = db
    .prepare('SELECT id, name, sort FROM priorities ORDER BY sort')
    .all() as unknown as { id: string; name: string; sort: number }[]
  const prioMap = new Map(prios.map((p, i) => [p.id, { name: p.name, rank: i }]))

  // 被引用次数（in-degree）
  const inDegrees = new Map<string, number>()
  for (const r of db
    .prepare('SELECT to_id, COUNT(*) AS c FROM card_links GROUP BY to_id')
    .all() as unknown as { to_id: string; c: number }[]) {
    inDegrees.set(r.to_id, r.c)
  }

  // 所有未归档卡片
  const rows = db
    .prepare(
      `SELECT id, content, type, status, priority, start_date, due_date, importance,
              created_at, updated_at
       FROM cards WHERE archived = 0`,
    )
    .all() as unknown as {
    id: string
    content: string
    type: CardType
    status: CardStatus
    priority: string | null
    start_date: string | null
    due_date: string | null
    importance: number | null
    created_at: string
    updated_at: string
  }[]

  // 标签（避免 N+1）
  const tagMap = new Map<string, string[]>()
  for (const r of db
    .prepare(
      `SELECT ct.card_id, t.name FROM card_tags ct JOIN tags t ON t.id = ct.tag_id ORDER BY t.name`,
    )
    .all() as unknown as { card_id: string; name: string }[]) {
    const arr = tagMap.get(r.card_id) ?? []
    arr.push(r.name)
    tagMap.set(r.card_id, arr)
  }

  const items: ScheduleItem[] = []
  for (const r of rows) {
    const prio = r.priority ? prioMap.get(r.priority) : undefined
    const priorityName = prio?.name ?? null
    const priorityRank = prio?.rank ?? null
    const inDegree = inDegrees.get(r.id) ?? 0

    // 时间条：有 start_date 才是真区间；否则用创建日 → due 日
    const createdDay = toDay(r.created_at)
    const milestone = r.start_date === null
    const barStart = r.start_date ?? createdDay
    const barEnd = r.due_date ?? r.start_date ?? createdDay

    const { score, breakdown } = scoreCard(
      {
        due_date: r.due_date,
        importance: r.importance,
        priorityRank,
        status: r.status,
        updated_at: r.updated_at,
        inDegree,
      },
      today,
    )

    items.push({
      id: r.id,
      content: r.content,
      type: r.type,
      status: r.status,
      priority: r.priority,
      priorityName,
      priorityRank,
      start_date: r.start_date,
      due_date: r.due_date,
      importance: r.importance,
      tags: tagMap.get(r.id) ?? [],
      updated_at: r.updated_at,
      created_at: r.created_at,
      milestone,
      barStart,
      barEnd,
      urgency: deriveUrgency(r.due_date, today),
      quadrant: deriveQuadrant(
        { due_date: r.due_date, importance: r.importance, priorityName },
        today,
      ),
      score,
      breakdown,
    })
  }

  // 时间轴范围：取所有条目的最早/最晚，前后各留 3 天
  let min = today
  let max = today
  for (const it of items) {
    if (it.barStart < min) min = it.barStart
    if (it.barEnd > max) max = it.barEnd
  }

  return {
    today,
    items,
    range: { start: shiftISODate(min, -3), end: shiftISODate(max, 3) },
  }
}
