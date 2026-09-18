/**
 * 卡片服务：CRUD 与关系维护
 *
 * 保存卡片时同步维护：
 *   card_tags  —— 由 #标签 解析而来
 *   card_links —— 由 [[链接]] 解析而来（按标题或 ID 匹配卡片）
 *   tag_edges  —— 标签共现权重（物化，便于图谱与标签页直接查询）
 */
import { getDb, transaction } from './db'
import { makeId, nowISO } from './seed'
import { colorFromString } from '@shared/types'
import type { Card, CardStatus, CardType, CardWithRelations, Tag } from '@shared/types'
import { extractLinks, extractTags } from '@shared/parser'

export interface CreateCardInput {
  content: string
  type?: CardType
  priority?: string | null
  status?: CardStatus
  due_date?: string | null
}

export interface UpdateCardInput {
  content?: string
  type?: CardType
  priority?: string | null
  status?: CardStatus
  due_date?: string | null
  archived?: 0 | 1
}

export interface ListCardsQuery {
  tag?: string
  type?: CardType
  priority?: string | null
  status?: CardStatus
  q?: string
  dueBefore?: string
  dueAfter?: string
  archived?: 0 | 1
  limit?: number
  offset?: number
}

/** 查询或创建标签，返回其 id */
function upsertTag(name: string): string {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as
    | { id: string }
    | undefined
  if (existing) return existing.id

  const id = `tag_${makeId(10)}`
  db.prepare('INSERT INTO tags (id, name, color, description, created_at) VALUES (?, ?, ?, NULL, ?)').run(
    id,
    name,
    colorFromString(name),
    nowISO(),
  )
  return id
}

/**
 * 重建某卡片的标签关联，并同步 tag_edges。
 * 共现边按「同一卡片内两两标签」计权重；重建前先扣除该卡片此前的贡献。
 */
function rebuildCardTags(cardId: string, tagNames: string[]): void {
  const db = getDb()

  // 1) 扣除旧贡献
  const oldTagIds = (
    db.prepare('SELECT tag_id FROM card_tags WHERE card_id = ?').all(cardId) as { tag_id: string }[]
  ).map((r) => r.tag_id)

  if (oldTagIds.length >= 2) {
    const pairs = pairCombinations(oldTagIds)
    const dec = db.prepare('UPDATE tag_edges SET weight = weight - 1 WHERE tag_a = ? AND tag_b = ?')
    const del = db.prepare('DELETE FROM tag_edges WHERE tag_a = ? AND tag_b = ? AND weight <= 0')
    for (const [a, b] of pairs) {
      dec.run(a, b)
      del.run(a, b)
    }
  }

  db.prepare('DELETE FROM card_tags WHERE card_id = ?').run(cardId)

  // 2) 写入新关联
  const tagIds = tagNames.map(upsertTag)
  const insRel = db.prepare('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)')
  for (const tagId of tagIds) insRel.run(cardId, tagId)

  // 3) 增加新的共现贡献
  if (tagIds.length >= 2) {
    const pairs = pairCombinations(tagIds)
    const upsert = db.prepare(
      `INSERT INTO tag_edges (tag_a, tag_b, weight) VALUES (?, ?, 1)
       ON CONFLICT(tag_a, tag_b) DO UPDATE SET weight = weight + 1`,
    )
    for (const [a, b] of pairs) upsert.run(a, b)
  }

  // 4) 清理已无关联的标签
  db.prepare('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM card_tags) AND id NOT IN (SELECT tag_a FROM tag_edges UNION SELECT tag_b FROM tag_edges)').run()
}

/** 重建显式链接：[[x]] 按「卡片 ID」或「内容完全匹配」定位目标卡片 */
function rebuildCardLinks(cardId: string, content: string): void {
  const db = getDb()
  db.prepare('DELETE FROM card_links WHERE from_id = ?').run(cardId)

  const targets = extractLinks(content)
  if (targets.length === 0) return

  const ins = db.prepare('INSERT OR IGNORE INTO card_links (from_id, to_id) VALUES (?, ?)')
  const byId = db.prepare('SELECT id FROM cards WHERE id = ?')
  const byContent = db.prepare('SELECT id FROM cards WHERE content = ? AND id != ? LIMIT 1')

  for (const t of targets) {
    if (t === cardId) continue
    const hit =
      (byId.get(t) as { id: string } | undefined) ??
      (byContent.get(t, cardId) as { id: string } | undefined)
    if (hit) ins.run(cardId, hit.id)
  }
}

function pairCombinations(ids: string[]): [string, string][] {
  const sorted = [...new Set(ids)].sort()
  const out: [string, string][] = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      out.push([sorted[i]!, sorted[j]!])
    }
  }
  return out
}

function rowToCard(row: Record<string, unknown>): Card {
  return {
    id: String(row.id),
    content: String(row.content),
    type: row.type as CardType,
    priority: (row.priority as string | null) ?? null,
    status: (row.status as CardStatus) ?? 'todo',
    due_date: (row.due_date as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    archived: (Number(row.archived) ? 1 : 0) as 0 | 1,
  }
}

export function createCard(input: CreateCardInput): Card {
  return transaction(() => {
    const db = getDb()
    const id = `card_${makeId(12)}`
    const ts = nowISO()
    db.prepare(
      `INSERT INTO cards (id, content, type, priority, status, due_date, created_at, updated_at, archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).run(
      id,
      input.content,
      input.type ?? 'note',
      input.priority ?? null,
      input.status ?? 'todo',
      input.due_date ?? null,
      ts,
      ts,
    )

    rebuildCardTags(id, extractTags(input.content))
    rebuildCardLinks(id, input.content)

    const row = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as Record<string, unknown>
    return rowToCard(row)
  })
}

export function updateCard(id: string, patch: UpdateCardInput): Card | null {
  return transaction(() => {
    const db = getDb()
    const current = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    if (!current) return null

    const next: Card = rowToCard(current)
    const merged: Card = {
      ...next,
      content: patch.content ?? next.content,
      type: patch.type ?? next.type,
      priority: patch.priority !== undefined ? patch.priority : next.priority,
      status: patch.status ?? next.status,
      due_date: patch.due_date !== undefined ? patch.due_date : next.due_date,
      archived: patch.archived !== undefined ? patch.archived : next.archived,
      updated_at: nowISO(),
    }

    db.prepare(
      `UPDATE cards SET content = ?, type = ?, priority = ?, status = ?, due_date = ?, updated_at = ?, archived = ?
       WHERE id = ?`,
    ).run(
      merged.content,
      merged.type,
      merged.priority,
      merged.status,
      merged.due_date,
      merged.updated_at,
      merged.archived,
      id,
    )

    // 内容变化时重建标签与链接
    if (patch.content !== undefined && patch.content !== next.content) {
      rebuildCardTags(id, extractTags(merged.content))
      rebuildCardLinks(id, merged.content)
    }

    return merged
  })
}

export function deleteCard(id: string): boolean {
  return transaction(() => {
    const db = getDb()
    // 先衰减该卡片贡献的共现权重
    const tagIds = (
      db.prepare('SELECT tag_id FROM card_tags WHERE card_id = ?').all(id) as { tag_id: string }[]
    ).map((r) => r.tag_id)
    if (tagIds.length >= 2) {
      const dec = db.prepare('UPDATE tag_edges SET weight = weight - 1 WHERE tag_a = ? AND tag_b = ?')
      const del = db.prepare('DELETE FROM tag_edges WHERE tag_a = ? AND tag_b = ? AND weight <= 0')
      for (const [a, b] of pairCombinations(tagIds)) {
        dec.run(a, b)
        del.run(a, b)
      }
    }
    const res = db.prepare('DELETE FROM cards WHERE id = ?').run(id)
    // 清理孤立标签
    db.prepare(
      'DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM card_tags) AND id NOT IN (SELECT tag_a FROM tag_edges UNION SELECT tag_b FROM tag_edges)',
    ).run()
    return res.changes > 0
  })
}

export function getCard(id: string): CardWithRelations | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  if (!row) return null
  const card = rowToCard(row)
  return { ...card, tags: getCardTags(id), links: getCardLinks(id) }
}

export function getCardTags(cardId: string): Tag[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT t.* FROM tags t JOIN card_tags ct ON ct.tag_id = t.id
       WHERE ct.card_id = ? ORDER BY t.name`,
    )
    .all(cardId) as unknown as Tag[]
}

export function getCardLinks(cardId: string): { id: string; content: string }[] {
  const db = getDb()
  return db
    .prepare(
      `SELECT c.id, c.content FROM cards c JOIN card_links l ON l.to_id = c.id
       WHERE l.from_id = ? ORDER BY c.updated_at DESC`,
    )
    .all(cardId) as unknown as { id: string; content: string }[]
}

export interface ListCardsResult {
  cards: CardWithRelations[]
  total: number
}

export function listCards(query: ListCardsQuery = {}): ListCardsResult {
  const db = getDb()
  const where: string[] = []
  const params: (string | number)[] = []

  if (query.archived === undefined) {
    where.push('c.archived = 0')
  } else {
    where.push('c.archived = ?')
    params.push(query.archived)
  }

  if (query.tag) {
    where.push(
      'c.id IN (SELECT ct.card_id FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE t.name = ?)',
    )
    params.push(query.tag)
  }
  if (query.type) {
    where.push('c.type = ?')
    params.push(query.type)
  }
  if (query.priority !== undefined) {
    if (query.priority === null) {
      where.push('c.priority IS NULL')
    } else {
      where.push('c.priority = ?')
      params.push(query.priority)
    }
  }
  if (query.status) {
    where.push('c.status = ?')
    params.push(query.status)
  }
  if (query.q) {
    where.push('c.content LIKE ?')
    params.push(`%${query.q}%`)
  }
  if (query.dueBefore) {
    where.push('c.due_date IS NOT NULL AND c.due_date <= ?')
    params.push(query.dueBefore)
  }
  if (query.dueAfter) {
    where.push('c.due_date IS NOT NULL AND c.due_date >= ?')
    params.push(query.dueAfter)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM cards c ${whereSql}`)
    .get(...params) as { c: number }

  const limit = Math.min(Math.max(query.limit ?? 200, 1), 1000)
  const offset = Math.max(query.offset ?? 0, 0)

  const rows = db
    .prepare(
      `SELECT c.* FROM cards c ${whereSql} ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as unknown as Record<string, unknown>[]

  const cards: CardWithRelations[] = rows.map((r) => {
    const card = rowToCard(r)
    return { ...card, tags: getCardTags(card.id), links: getCardLinks(card.id) }
  })

  return { cards, total: totalRow.c }
}

export function getStats(): {
  cards: number
  archived: number
  tags: number
  links: number
  edges: number
  doneToday: number
} {
  const db = getDb()
  const one = (sql: string, ...p: (string | number)[]) =>
    (db.prepare(sql).get(...p) as { c: number }).c

  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

  return {
    cards: one('SELECT COUNT(*) c FROM cards WHERE archived = 0'),
    archived: one('SELECT COUNT(*) c FROM cards WHERE archived = 1'),
    tags: one('SELECT COUNT(*) c FROM tags'),
    links: one('SELECT COUNT(*) c FROM card_links'),
    edges: one('SELECT COUNT(*) c FROM tag_edges'),
    doneToday: one(
      "SELECT COUNT(*) c FROM cards WHERE status = 'done' AND archived = 0 AND updated_at >= ?",
      startOfDay,
    ),
  }
}
