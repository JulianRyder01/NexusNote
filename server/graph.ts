/**
 * 图谱服务：把标签与卡片组织为节点/边，供力导向可视化使用。
 *
 * 节点：
 *   - tag   ：标签节点（较大，颜色取标签自身颜色）
 *   - card  ：卡片节点（较小，颜色按类型区分）
 * 边：
 *   - tag-tag   ：标签共现（权重取 tag_edges.weight）
 *   - card-tag  ：卡片与标签的归属关系
 *   - card-card ：显式链接 [[...]]
 */
import { getDb } from './db'
import type { CardType } from '@shared/types'

export interface GraphNode {
  id: string
  kind: 'tag' | 'card'
  label: string
  /** tag 用标签色；card 由前端按 type 取色 */
  color: string | null
  type?: CardType
  /** tag: 使用次数；card: 固定 1 */
  weight: number
  updated_at?: string
  due_date?: string | null
  status?: string
}

export interface GraphEdge {
  source: string
  target: string
  kind: 'tag-tag' | 'card-tag' | 'card-card'
  weight: number
}

export interface GraphQuery {
  /** 只看该标签的子图（连同直接相连的卡片与标签） */
  tag?: string
  /** 只看最近 N 天更新过的卡片 */
  days?: number
  type?: CardType
  /** 节点上限（超出时优先保留高频标签） */
  limit?: number
}

export interface GraphResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated: boolean
}

const CARD_PALETTE: Record<CardType, string> = {
  todo: '#4a6fa5',
  idea: '#a5754a',
  note: '#5b8c85',
  link: '#8c5b7d',
}

export function cardTypeColor(type: CardType): string {
  return CARD_PALETTE[type] ?? '#7d8d9e'
}

export function getGraph(query: GraphQuery = {}): GraphResult {
  const db = getDb()

  const whereCards: string[] = ['c.archived = 0']
  const params: (string | number)[] = []

  if (query.days && Number.isFinite(query.days) && query.days > 0) {
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000).toISOString()
    whereCards.push('c.updated_at >= ?')
    params.push(since)
  }
  if (query.type) {
    whereCards.push('c.type = ?')
    params.push(query.type)
  }

  const cardRows = db
    .prepare(`SELECT c.id, c.content, c.type, c.status, c.due_date, c.updated_at FROM cards c WHERE ${whereCards.join(' AND ')}`)
    .all(...params) as unknown as {
    id: string
    content: string
    type: CardType
    status: string
    due_date: string | null
    updated_at: string
  }[]

  const cardIds = new Set(cardRows.map((r) => r.id))

  // 卡片-标签关系（限定在筛选后的卡片集合内）
  const tagRows = db
    .prepare(
      `SELECT ct.card_id, t.id AS tag_id, t.name AS tag_name, t.color AS tag_color
       FROM card_tags ct JOIN tags t ON t.id = ct.tag_id`,
    )
    .all() as unknown as { card_id: string; tag_id: string; tag_name: string; tag_color: string | null }[]

  const visibleTagLinks = tagRows.filter((r) => cardIds.has(r.card_id))

  // 标签使用次数（仅统计可见卡片）
  const tagUsage = new Map<string, { name: string; color: string | null; count: number }>()
  for (const r of visibleTagLinks) {
    const cur = tagUsage.get(r.tag_id)
    if (cur) cur.count += 1
    else tagUsage.set(r.tag_id, { name: r.tag_name, color: r.tag_color, count: 1 })
  }

  // 边：card-tag
  const edges: GraphEdge[] = []
  for (const r of visibleTagLinks) {
    edges.push({ source: r.card_id, target: r.tag_id, kind: 'card-tag', weight: 1 })
  }

  // 边：tag-tag（基于可见卡片重算共现热度，避免使用可能过期的物化值）
  const cooc = new Map<string, number>()
  const byCard = new Map<string, string[]>()
  for (const r of visibleTagLinks) {
    const arr = byCard.get(r.card_id) ?? []
    arr.push(r.tag_id)
    byCard.set(r.card_id, arr)
  }
  for (const tagIds of byCard.values()) {
    const sorted = [...new Set(tagIds)].sort()
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}\u0000${sorted[j]}`
        cooc.set(key, (cooc.get(key) ?? 0) + 1)
      }
    }
  }
  for (const [key, weight] of cooc) {
    const [a, b] = key.split('\u0000') as [string, string]
    edges.push({ source: a, target: b, kind: 'tag-tag', weight })
  }

  // 边：card-card（显式链接，且两端都在可见集合内）
  const linkRows = db.prepare('SELECT from_id, to_id FROM card_links').all() as unknown as {
    from_id: string
    to_id: string
  }[]
  for (const l of linkRows) {
    if (cardIds.has(l.from_id) && cardIds.has(l.to_id)) {
      edges.push({ source: l.from_id, target: l.to_id, kind: 'card-card', weight: 1 })
    }
  }

  // 组装节点
  const nodes: GraphNode[] = []
  for (const [tagId, meta] of tagUsage) {
    nodes.push({
      id: tagId,
      kind: 'tag',
      label: meta.name,
      color: meta.color,
      weight: meta.count,
    })
  }
  for (const c of cardRows) {
    nodes.push({
      id: c.id,
      kind: 'card',
      label: c.content.slice(0, 60),
      color: cardTypeColor(c.type),
      type: c.type,
      status: c.status,
      due_date: c.due_date,
      updated_at: c.updated_at,
      weight: 1,
    })
  }

  // 「只看某标签的子图」：保留该标签 + 直接相连的卡片 + 这些卡片上的其他标签
  let filtered = { nodes, edges }
  if (query.tag) {
    const focus = nodes.find((n) => n.kind === 'tag' && n.label === query.tag)
    if (!focus) return { nodes: [], edges: [], truncated: false }

    const keep = new Set<string>([focus.id])
    for (const e of edges) {
      if (e.kind === 'card-tag' && (e.source === focus.id || e.target === focus.id)) {
        keep.add(e.source)
        keep.add(e.target)
      }
    }
    // 再纳入这些卡片上的其他标签以及它们之间的共现
    for (const e of edges) {
      if (e.kind === 'card-tag' && keep.has(e.source)) keep.add(e.target)
    }
    filtered = {
      nodes: nodes.filter((n) => keep.has(n.id)),
      edges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
    }
  }

  // 规模控制：节点超限时优先保留高频标签及其邻接卡片
  const maxNodes = Math.min(Math.max(query.limit ?? 1500, 50), 5000)
  let truncated = false
  let outNodes = filtered.nodes
  let outEdges = filtered.edges
  if (outNodes.length > maxNodes) {
    truncated = true
    const tagsSorted = outNodes
      .filter((n) => n.kind === 'tag')
      .sort((a, b) => b.weight - a.weight)
    const keepIds = new Set<string>()
    for (const t of tagsSorted) {
      if (keepIds.size >= maxNodes) break
      keepIds.add(t.id)
    }
    // 优先保留与已选标签相连的卡片
    const cardsSorted = outNodes.filter((n) => n.kind === 'card')
    for (const c of cardsSorted) {
      if (keepIds.size >= maxNodes) break
      const connected = outEdges.some(
        (e) => e.kind === 'card-tag' && (e.source === c.id || e.target === c.id) && keepIds.has(e.source === c.id ? e.target : e.source),
      )
      if (connected) keepIds.add(c.id)
    }
    for (const c of cardsSorted) {
      if (keepIds.size >= maxNodes) break
      keepIds.add(c.id)
    }
    outNodes = outNodes.filter((n) => keepIds.has(n.id))
    outEdges = outEdges.filter((e) => keepIds.has(e.source) && keepIds.has(e.target))
  }

  return { nodes: outNodes, edges: outEdges, truncated }
}
