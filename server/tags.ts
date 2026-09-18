/** 标签与优先级服务 */
import { getDb, transaction } from './db'
import { colorFromString } from '@shared/types'
import type { Priority, Tag } from '@shared/types'
import { makeId, nowISO } from './seed'

/** 列出标签，按使用次数排序（默认）或按名称 */
export function listTags(sort: 'count' | 'name' = 'count'): Tag[] {
  const db = getDb()
  const order = sort === 'name' ? 't.name ASC' : 'usage_count DESC, t.name ASC'
  const rows = db
    .prepare(
      `SELECT t.id, t.name, t.color, t.description, t.created_at,
              (SELECT COUNT(*) FROM card_tags ct WHERE ct.tag_id = t.id) AS usage_count
       FROM tags t
       ORDER BY ${order}`,
    )
    .all() as unknown as (Omit<Tag, 'count'> & { usage_count: number })[]
  return rows.map(({ usage_count, ...t }) => ({ ...t, count: usage_count }))
}

export function updateTag(
  id: string,
  patch: { name?: string; color?: string | null; description?: string | null },
): Tag | null {
  return transaction(() => {
    const db = getDb()
    const current = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as unknown as Tag | undefined
    if (!current) return null

    const name = patch.name ?? current.name
    if (patch.name && patch.name !== current.name) {
      // 重命名冲突时合并到已有标签
      const clash = db.prepare('SELECT id FROM tags WHERE name = ? AND id != ?').get(name, id) as
        | { id: string }
        | undefined
      if (clash) {
        mergeTags(id, clash.id)
        return db.prepare('SELECT * FROM tags WHERE id = ?').get(clash.id) as unknown as Tag
      }
    }

    db.prepare('UPDATE tags SET name = ?, color = ?, description = ? WHERE id = ?').run(
      name,
      patch.color !== undefined ? patch.color : current.color,
      patch.description !== undefined ? patch.description : current.description,
      id,
    )
    return db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as unknown as Tag
  })
}

/** 合并标签：from 的全部关联与共现权重并入 to，然后删除 from */
export function mergeTags(fromId: string, toId: string): void {
  if (fromId === toId) return
  const db = getDb()

  // 1) card_tags：把 from 的关联改指到 to，忽略冲突
  db.prepare(
    `INSERT OR IGNORE INTO card_tags (card_id, tag_id)
     SELECT card_id, ? FROM card_tags WHERE tag_id = ?`,
  ).run(toId, fromId)
  db.prepare('DELETE FROM card_tags WHERE tag_id = ?').run(fromId)

  // 2) tag_edges：把涉及 from 的权重重定向并累加
  const edges = db
    .prepare('SELECT tag_a, tag_b, weight FROM tag_edges WHERE tag_a = ? OR tag_b = ?')
    .all(fromId, fromId) as { tag_a: string; tag_b: string; weight: number }[]

  const upsert = db.prepare(
    `INSERT INTO tag_edges (tag_a, tag_b, weight) VALUES (?, ?, ?)
     ON CONFLICT(tag_a, tag_b) DO UPDATE SET weight = weight + excluded.weight`,
  )
  db.prepare('DELETE FROM tag_edges WHERE tag_a = ? OR tag_b = ?').run(fromId, fromId)

  for (const e of edges) {
    const other = e.tag_a === fromId ? e.tag_b : e.tag_a
    if (other === toId || other === fromId) continue
    const [a, b] = [toId, other].sort() as [string, string]
    upsert.run(a, b, e.weight)
  }

  // 3) 清理与其他标签形成的自环
  db.prepare('DELETE FROM tag_edges WHERE tag_a = tag_b').run()
  db.prepare('DELETE FROM tags WHERE id = ?').run(fromId)
}

export function deleteTag(id: string): boolean {
  return transaction(() => {
    const db = getDb()
    db.prepare('DELETE FROM card_tags WHERE tag_id = ?').run(id)
    db.prepare('DELETE FROM tag_edges WHERE tag_a = ? OR tag_b = ?').run(id, id)
    const res = db.prepare('DELETE FROM tags WHERE id = ?').run(id)
    return res.changes > 0
  })
}

/** 孤儿标签：仅使用过零次或一次的标签 */
export function listOrphanTags(): Tag[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT t.id, t.name, t.color, t.description, t.created_at,
              (SELECT COUNT(*) FROM card_tags ct WHERE ct.tag_id = t.id) AS usage_count
       FROM tags t
       WHERE (SELECT COUNT(*) FROM card_tags ct WHERE ct.tag_id = t.id) <= 1
       ORDER BY usage_count ASC, t.name ASC`,
    )
    .all() as unknown as (Omit<Tag, 'count'> & { usage_count: number })[]
  return rows.map(({ usage_count, ...t }) => ({ ...t, count: usage_count }))
}

// ---------- 优先级 ----------

export function listPriorities(): Priority[] {
  const db = getDb()
  return db.prepare('SELECT * FROM priorities ORDER BY sort ASC').all() as unknown as Priority[]
}

export function createPriority(input: { name: string; color?: string | null }): Priority {
  const db = getDb()
  const maxRow = db.prepare('SELECT MAX(sort) AS m FROM priorities').get() as { m: number | null }
  const sort = (maxRow.m ?? -1) + 1
  const id = `prio_${makeId(10)}`
  db.prepare('INSERT INTO priorities (id, name, color, sort, is_default) VALUES (?, ?, ?, ?, 0)').run(
    id,
    input.name,
    input.color ?? colorFromString(input.name),
    sort,
  )
  return db.prepare('SELECT * FROM priorities WHERE id = ?').get(id) as unknown as Priority
}

export function updatePriority(
  id: string,
  patch: { name?: string; color?: string | null; sort?: number },
): Priority | null {
  const db = getDb()
  const current = db.prepare('SELECT * FROM priorities WHERE id = ?').get(id) as
    unknown as Priority | undefined
  if (!current) return null
  db.prepare('UPDATE priorities SET name = ?, color = ?, sort = ? WHERE id = ?').run(
    patch.name ?? current.name,
    patch.color !== undefined ? patch.color : current.color,
    patch.sort ?? current.sort,
    id,
  )
  return db.prepare('SELECT * FROM priorities WHERE id = ?').get(id) as unknown as Priority
}

/** 删除优先级列；其下卡片变为「不进看板」（priority = NULL） */
export function deletePriority(id: string): boolean {
  return transaction(() => {
    const db = getDb()
    db.prepare('UPDATE cards SET priority = NULL WHERE priority = ?').run(id)
    const res = db.prepare('DELETE FROM priorities WHERE id = ?').run(id)
    return res.changes > 0
  })
}

/** 重排优先级 */
export function reorderPriorities(orderedIds: string[]): Priority[] {
  return transaction(() => {
    const db = getDb()
    const upd = db.prepare('UPDATE priorities SET sort = ? WHERE id = ?')
    orderedIds.forEach((id, i) => upd.run(i, id))
    return listPriorities()
  })
}

export { nowISO }
