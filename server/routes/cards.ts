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
      status: asStatus(body.status),
      due_date: typeof body.due_date === 'string' ? body.due_date : parsed.dueDate,
    })
    return reply.code(201).send(card)
  })

  app.patch('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>

    // 内容被改写时同样做语法兜底，保证与创建时一致
    const newContent = typeof body.content === 'string' ? body.content.trim() : undefined
    let fallback: { type?: CardType; due_date?: string | null } = {}
    if (newContent !== undefined) {
      const knownNames = listPriorities().map((p) => p.name)
      const parsed = parseInput(newContent, knownNames)
      fallback = { type: parsed.type, due_date: parsed.dueDate }
    }

    const card = updateCard(id, {
      content: newContent,
      type: asType(body.type) ?? fallback.type,
      priority:
        body.priority === undefined
          ? undefined
          : body.priority === null || typeof body.priority === 'string'
            ? (body.priority as string | null)
            : undefined,
      status: asStatus(body.status),
      due_date:
        body.due_date === undefined
          ? fallback.due_date
          : body.due_date === null || typeof body.due_date === 'string'
            ? (body.due_date as string | null)
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
