/**
 * 统一的 API 客户端。
 * - 401 时抛出 UnauthorizedError，由上层引导回登录页
 * - 统一 JSON 解析与错误信息提取
 */
import type {
  Card,
  CardStatus,
  CardType,
  CardWithRelations,
  Priority,
  Tag,
} from '@shared/types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = '未登录') {
    super(401, message)
    this.name = 'UnauthorizedError'
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })

  if (res.status === 401) throw new UnauthorizedError()

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `请求失败（${res.status}）`
    throw new ApiError(res.status, msg)
  }

  return data as T
}

function qs(params: object): string {
  const entries = Object.entries(params) as [string, string | number | undefined | null][]
  const sp = new URLSearchParams()
  for (const [k, v] of entries) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export interface CardsQuery {
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

export interface StatsPayload {
  cards: number
  archived: number
  tags: number
  links: number
  edges: number
  doneToday: number
}

/** 图谱返回结构（与服务端 server/graph.ts 对应） */
export interface GraphNode {
  id: string
  kind: 'tag' | 'card'
  label: string
  color: string | null
  type?: CardType
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

export interface GraphPayload {
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated: boolean
}

export const api = {
  // ---- 认证 ----
  login: (password: string) => request<{ ok: true; expires_at: string }>('POST', '/api/auth/login', { password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => request<{ authenticated: true }>('GET', '/api/auth/me'),
  health: () => request<{ ok: boolean; app: string; version: string }>('GET', '/api/health'),

  // ---- 卡片 ----
  listCards: (query: CardsQuery = {}) =>
    request<{ cards: CardWithRelations[]; total: number }>('GET', `/api/cards${qs(query)}`),
  getCard: (id: string) => request<CardWithRelations>('GET', `/api/cards/${id}`),
  createCard: (input: {
    content: string
    type?: CardType
    priority?: string | null
    status?: CardStatus
    due_date?: string | null
  }) => request<Card>('POST', '/api/cards', input),
  updateCard: (
    id: string,
    patch: Partial<{
      content: string
      type: CardType
      priority: string | null
      status: CardStatus
      due_date: string | null
      archived: 0 | 1
    }>,
  ) => request<Card>('PATCH', `/api/cards/${id}`, patch),
  deleteCard: (id: string) => request<{ ok: true }>('DELETE', `/api/cards/${id}`),

  // ---- 标签 ----
  listTags: (sort: 'count' | 'name' = 'count') =>
    request<Tag[]>('GET', `/api/tags${qs({ sort })}`),
  tagSummary: () =>
    request<{
      total: number
      orphans: number
      unused: number
      top: { name: string; count: number }[]
    }>('GET', '/api/tags/summary'),
  listOrphanTags: () => request<Tag[]>('GET', '/api/tags/orphans'),
  updateTag: (id: string, patch: { name?: string; color?: string | null; description?: string | null }) =>
    request<Tag>('PATCH', `/api/tags/${id}`, patch),
  mergeTags: (from: string, to: string) => request<{ ok: true }>('POST', '/api/tags/merge', { from, to }),
  deleteTag: (id: string) => request<{ ok: true }>('DELETE', `/api/tags/${id}`),

  // ---- 图谱 ----
  graph: (query: { tag?: string; days?: number; type?: CardType; limit?: number } = {}) =>
    request<GraphPayload>('GET', `/api/graph${qs(query)}`),

  // ---- 优先级 ----
  listPriorities: () => request<Priority[]>('GET', '/api/priorities'),
  createPriority: (name: string, color?: string | null) =>
    request<Priority>('POST', '/api/priorities', { name, color }),
  updatePriority: (id: string, patch: { name?: string; color?: string | null; sort?: number }) =>
    request<Priority>('PATCH', `/api/priorities/${id}`, patch),
  reorderPriorities: (ids: string[]) => request<Priority[]>('PUT', '/api/priorities/order', { ids }),
  deletePriority: (id: string) => request<{ ok: true }>('DELETE', `/api/priorities/${id}`),

  // ---- 统计 ----
  stats: () => request<StatsPayload>('GET', '/api/stats'),
}
