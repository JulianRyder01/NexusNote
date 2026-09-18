/** 卡片相关路由 */
import type { FastifyInstance } from 'fastify'
import type { CardStatus, CardType } from '@shared/types'
import { parseInput } from '@shared/parser'
import {
  createCard,
  deleteCard,
  getCard,
  getStats,
  listCards,
  updateCard,
  type ListCardsQuery,
} from '../cards'
import { listPriorities } from '../tags'

const CARD_TYPES = new Set(['todo', 'idea', 'note', 'link'])
const CARD_STATUSES = new Set(['todo', 'in_progress', 'done', 'someday'])

function asType(v: unknown): CardType | undefined {
  return typeof v === 'string' && CARD_TYPES.has(v) ? (v as CardType) : undefined
}
function asStatus(v: unknown): CardStatus | undefined {
  return typeof v === 'string' && CARD_STATUSES.has(v) ? (v as CardStatus) : undefined
}
/** 校验 YYYY-MM-DD；非法或非字符串返回 undefined（调用方据此决定是否覆盖） */
function asDate(v: unknown): string | undefined {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined
}
/** 校验重要性 1..3 */
function asImportance(v: unknown): number | undefined {
  if (v === null) return undefined
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : undefined
}

export async function cardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/cards', async (req) => {
    const q = req.query as Record<string, string | undefined>
    const query: ListCardsQuery = {
      tag: q.tag,
      type: asType(q.type),
      priority: q.priority === undefined ? undefined : q.priority === 'none' ? null : q.priority,
      status: asStatus(q.status),
      q: q.q,
      dueBefore: q.dueBefore,
      dueAfter: q.dueAfter,
      archived: q.archived === undefined ? undefined : (Number(q.archived) ? 1 : 0),
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    }
    return listCards(query)
  })

  app.get('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const card = getCard(id)
    if (!card) return reply.code(404).send({ error: '卡片不存在' })
    return card
  })

  app.post('/api/cards', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const raw = typeof body.content === 'string' ? body.content.trim() : ''
    if (!raw) return reply.code(400).send({ error: '内容不能为空' })

    // 语法兜底：未显式提供时，由共享解析器从正文识别类型/优先级/due
    // （前端 QuickCapture 通常会先行解析并显式传入，两者共用同一套语法）
    const knownNames = listPriorities().map((p) => p.name)
    const parsed = parseInput(raw, knownNames)

    let priority: string | null = null
    if (typeof body.priority === 'string') {
      priority = body.priority
    } else if (body.priority === null) {
      priority = null
    } else if (parsed.priorityName) {
      priority = listPriorities().find((p) => p.name === parsed.priorityName)?.id ?? null
    }

    const card = createCard({
      content: parsed.content.trim() || raw,
      type: asType(body.type) ?? parsed.type,
      priority,
      status: asStatus(body.status) ?? (parsed.done ? 'done' : undefined),
      start_date: asDate(body.start_date) ?? parsed.startDate,
      due_date: asDate(body.due_date) ?? parsed.dueDate,
      importance: asImportance(body.importance) ?? parsed.importance,
    })
    return reply.code(201).send(card)
  })

  app.patch('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>

    // 内容被改写时同样做语法兜底，保证与创建时一致。
    // 注意：仅当新内容确实含 due token 时才回填 due_date，避免编辑正文把已有日期清空。
    const newContent = typeof body.content === 'string' ? body.content.trim() : undefined
    let fallbackType: CardType | undefined
    let fallbackStart: string | null | undefined
    let fallbackDue: string | null | undefined
    let fallbackImportance: number | null | undefined
    if (newContent !== undefined) {
      const knownNames = listPriorities().map((p) => p.name)
      const parsed = parseInput(newContent, knownNames)
      fallbackType = parsed.type
      fallbackStart = parsed.startDate
      fallbackDue = parsed.dueDate
      fallbackImportance = parsed.importance
    }

    const card = updateCard(id, {
      content: newContent,
      type: asType(body.type) ?? fallbackType,
      priority:
        body.priority === undefined
          ? undefined
          : body.priority === null || typeof body.priority === 'string'
            ? (body.priority as string | null)
            : undefined,
      status: asStatus(body.status),
      // 显式传入优先；否则仅当新内容解析出日期时才回填，无日期则不动
      due_date:
        body.due_date !== undefined
          ? body.due_date === null || typeof body.due_date === 'string'
            ? (body.due_date as string | null)
            : undefined
          : fallbackDue !== undefined && fallbackDue !== null
            ? fallbackDue
            : undefined,
      // 同理：仅当新内容解析出开始日期/重要性时才回填，否则不动
      start_date:
        body.start_date !== undefined
          ? body.start_date === null || typeof body.start_date === 'string'
            ? (body.start_date as string | null)
            : undefined
          : fallbackStart !== undefined && fallbackStart !== null
            ? fallbackStart
            : undefined,
      importance:
        body.importance !== undefined
          ? body.importance === null
            ? null
            : asImportance(body.importance)
          : fallbackImportance !== undefined
            ? fallbackImportance
            : undefined,
      archived: body.archived === undefined ? undefined : Number(body.archived) ? 1 : 0,
    })
    if (!card) return reply.code(404).send({ error: '卡片不存在' })
    return card
  })

  app.delete('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ok = deleteCard(id)
    if (!ok) return reply.code(404).send({ error: '卡片不存在' })
    return { ok: true }
  })

  app.get('/api/stats', async () => getStats())
}
