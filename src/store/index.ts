/** 全局状态：认证、卡片、标签、优先级、统计与筛选 */
import { create } from 'zustand'
import {
  ApiError,
  UnauthorizedError,
  api,
  type CardsQuery,
  type StatsPayload,
} from '../api/client'
import type { Card, CardStatus, CardType, CardWithRelations, DailyReview, Priority, Tag } from '@shared/types'

export type ViewKey = 'kanban' | 'list' | 'graph' | 'tags' | 'review' | 'walk' | 'settings'

export interface Filters {
  q: string
  type: CardType | ''
  tag: string
  status: CardStatus | ''
  dueTodayOnly: boolean
}

const EMPTY_FILTERS: Filters = { q: '', type: '', tag: '', status: '', dueTodayOnly: false }

interface AppState {
  // 认证
  authed: boolean | null // null = 未知（尚未探测）
  authError: string | null

  // 数据
  cards: CardWithRelations[]
  total: number
  tags: Tag[]
  priorities: Priority[]
  stats: StatsPayload | null

  // UI
  view: ViewKey
  filters: Filters
  selectedCardId: string | null
  loading: boolean
  error: string | null

  // 动作
  checkAuth: () => Promise<void>
  login: (password: string) => Promise<boolean>
  logout: () => Promise<void>
  setView: (v: ViewKey) => void
  setFilters: (patch: Partial<Filters>) => void
  resetFilters: () => void
  selectCard: (id: string | null) => void
  /** 打开图谱节点的卡片详情：若该卡不在当前列表中，先取回再插入 */
  openCardById: (id: string) => Promise<void>

  refreshAll: () => Promise<void>
  refreshCards: () => Promise<void>
  refreshTags: () => Promise<void>
  refreshPriorities: () => Promise<void>
  refreshStats: () => Promise<void>

  createCard: (input: Parameters<typeof api.createCard>[0]) => Promise<Card | null>
  updateCard: (id: string, patch: Parameters<typeof api.updateCard>[1]) => Promise<void>
  deleteCard: (id: string) => Promise<void>
  moveCardToPriority: (id: string, priorityId: string | null) => Promise<void>
  toggleDone: (card: Card) => Promise<void>
  bulkUpdate: (ids: string[], patch: Parameters<typeof api.updateCard>[1]) => Promise<void>

  createPriority: (name: string, color?: string | null) => Promise<void>
  updatePriority: (id: string, patch: { name?: string; color?: string | null; sort?: number }) => Promise<void>
  deletePriority: (id: string) => Promise<void>
  reorderPriorities: (ids: string[]) => Promise<void>
  deleteCards: (ids: string[]) => Promise<void>

  updateTag: (id: string, patch: { name?: string; color?: string | null; description?: string | null }) => Promise<void>
  mergeTags: (from: string, to: string) => Promise<void>
  deleteTag: (id: string) => Promise<void>

  // ---- 回顾与漫游（各自独立取数，不进全局 cards，避免互相污染筛选）----
  review: DailyReview | null
  reviewLoading: boolean
  refreshReview: (date?: string) => Promise<void>
}

function filtersToQuery(f: Filters): CardsQuery {
  const q: CardsQuery = {}
  if (f.q.trim()) q.q = f.q.trim()
  if (f.type) q.type = f.type
  if (f.tag) q.tag = f.tag
  if (f.status) q.status = f.status
  if (f.dueTodayOnly) {
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    q.dueBefore = today
  }
  q.limit = 500
  return q
}

export const useStore = create<AppState>((set, get) => ({
  authed: null,
  authError: null,
  cards: [],
  total: 0,
  tags: [],
  priorities: [],
  stats: null,
  view: 'kanban',
  filters: { ...EMPTY_FILTERS },
  selectedCardId: null,
  loading: false,
  error: null,
  review: null,
  reviewLoading: false,

  async checkAuth() {
    try {
      await api.me()
      set({ authed: true })
      await get().refreshAll()
    } catch (err) {
      if (err instanceof UnauthorizedError) set({ authed: false })
      else set({ authed: false, error: err instanceof Error ? err.message : '未知错误' })
    }
  },

  async login(password) {
    set({ authError: null, loading: true })
    try {
      await api.login(password)
      set({ authed: true, loading: false })
      await get().refreshAll()
      return true
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 429
            ? '尝试过于频繁，请稍后再试'
            : err.message
          : '登录失败'
      set({ authError: msg, loading: false })
      return false
    }
  },

  async logout() {
    try {
      await api.logout()
    } finally {
      set({
        authed: false,
        cards: [],
        tags: [],
        priorities: [],
        stats: null,
        selectedCardId: null,
        filters: { ...EMPTY_FILTERS },
      })
    }
  },

  setView: (v) => set({ view: v }),
  setFilters: (patch) => {
    set({ filters: { ...get().filters, ...patch } })
    void get().refreshCards()
  },
  resetFilters: () => {
    set({ filters: { ...EMPTY_FILTERS } })
    void get().refreshCards()
  },
  selectCard: (id) => set({ selectedCardId: id }),

  async openCardById(id) {
    // 图谱中的卡片可能因筛选（limit/type/days）不在 cards 里，先补齐再打开详情
    if (!get().cards.some((c) => c.id === id)) {
      try {
        const card = await api.getCard(id)
        const rest = get().cards.filter((c) => c.id !== id)
        set({ cards: [card, ...rest] })
      } catch (err) {
        handleErr(err, set)
        return
      }
    }
    set({ selectedCardId: id })
  },

  async refreshAll() {
    await Promise.all([
      get().refreshCards(),
      get().refreshTags(),
      get().refreshPriorities(),
      get().refreshStats(),
    ])
  },

  async refreshCards() {
    set({ loading: true, error: null })
    try {
      const { cards, total } = await api.listCards(filtersToQuery(get().filters))
      set({ cards, total, loading: false })
    } catch (err) {
      handleErr(err, set)
    }
  },

  async refreshTags() {
    try {
      set({ tags: await api.listTags('count') })
    } catch (err) {
      handleErr(err, set)
    }
  },

  async refreshPriorities() {
    try {
      set({ priorities: await api.listPriorities() })
    } catch (err) {
      handleErr(err, set)
    }
  },

  async refreshStats() {
    try {
      set({ stats: await api.stats() })
    } catch (err) {
      handleErr(err, set)
    }
  },

  async createCard(input) {
    try {
      const card = await api.createCard(input)
      await Promise.all([get().refreshCards(), get().refreshTags(), get().refreshStats()])
      return card
    } catch (err) {
      handleErr(err, set)
      return null
    }
  },

  async updateCard(id, patch) {
    try {
      await api.updateCard(id, patch)
      await Promise.all([get().refreshCards(), get().refreshTags(), get().refreshStats()])
    } catch (err) {
      handleErr(err, set)
    }
  },

  async deleteCard(id) {
    try {
      await api.deleteCard(id)
      if (get().selectedCardId === id) set({ selectedCardId: null })
      await Promise.all([get().refreshCards(), get().refreshTags(), get().refreshStats()])
    } catch (err) {
      handleErr(err, set)
    }
  },

  async moveCardToPriority(id, priorityId) {
    // 乐观更新，失败时回滚
    const prev = get().cards
    set({
      cards: prev.map((c) => (c.id === id ? { ...c, priority: priorityId } : c)),
    })
    try {
      await api.updateCard(id, { priority: priorityId })
      await Promise.all([get().refreshCards(), get().refreshStats()])
    } catch (err) {
      set({ cards: prev })
      handleErr(err, set)
    }
  },

  async toggleDone(card) {
    const next: CardStatus = card.status === 'done' ? 'todo' : 'done'
    await get().updateCard(card.id, { status: next })
  },

  async bulkUpdate(ids, patch) {
    try {
      await Promise.all(ids.map((id) => api.updateCard(id, patch)))
      await Promise.all([get().refreshCards(), get().refreshTags(), get().refreshStats()])
    } catch (err) {
      handleErr(err, set)
    }
  },

  async createPriority(name, color) {
    try {
      await api.createPriority(name, color)
      await get().refreshPriorities()
    } catch (err) {
      handleErr(err, set)
    }
  },

  async updatePriority(id, patch) {
    try {
      await api.updatePriority(id, patch)
      await Promise.all([get().refreshPriorities(), get().refreshCards()])
    } catch (err) {
      handleErr(err, set)
    }
  },

  async deletePriority(id) {
    try {
      await api.deletePriority(id)
      await Promise.all([get().refreshPriorities(), get().refreshCards(), get().refreshStats()])
    } catch (err) {
      handleErr(err, set)
    }
  },

  async reorderPriorities(ids) {
    try {
      set({ priorities: await api.reorderPriorities(ids) })
      await get().refreshCards()
    } catch (err) {
      handleErr(err, set)
    }
  },

  async deleteCards(ids) {
    if (ids.length === 0) return
    try {
      await Promise.all(ids.map((id) => api.deleteCard(id)))
      if (get().selectedCardId && ids.includes(get().selectedCardId!)) {
        set({ selectedCardId: null })
      }
      // 批量操作只在最后刷新一次，避免 N 次重复请求
      await Promise.all([get().refreshCards(), get().refreshTags(), get().refreshStats()])
    } catch (err) {
      handleErr(err, set)
    }
  },

  async updateTag(id, patch) {
    try {
      await api.updateTag(id, patch)
      await Promise.all([get().refreshTags(), get().refreshCards()])
    } catch (err) {
      handleErr(err, set)
    }
  },

  async mergeTags(from, to) {
    try {
      await api.mergeTags(from, to)
      await Promise.all([get().refreshTags(), get().refreshCards(), get().refreshStats()])
    } catch (err) {
      handleErr(err, set)
    }
  },

  async deleteTag(id) {
    try {
      await api.deleteTag(id)
      await Promise.all([get().refreshTags(), get().refreshCards(), get().refreshStats()])
    } catch (err) {
      handleErr(err, set)
    }
  },

  async refreshReview(date) {
    set({ reviewLoading: true })
    try {
      set({ review: await api.dailyReview(date), reviewLoading: false })
    } catch (err) {
      set({ reviewLoading: false })
      handleErr(err, set)
    }
  },
}))

type Set = (partial: Partial<AppState>) => void

function handleErr(err: unknown, set: Set): void {
  if (err instanceof UnauthorizedError) {
    set({ authed: false, loading: false })
    return
  }
  set({ error: err instanceof Error ? err.message : '未知错误', loading: false })
}
