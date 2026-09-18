/** 卡片相关路由 */
import type { FastifyInstance } from 'fastify'
import type { CardStatus, CardType } from '@shared/types'
import {
  createCard,
  deleteCard,
  getCard,
  getStats,
  listCards,
  updateCard,
  type ListCardsQuery,
} from '../cards'

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
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return reply.code(400).send({ error: '内容不能为空' })

    const card = createCard({
      content,
      type: asType(body.type),
      priority:
        body.priority === undefined || body.priority === null
          ? null
          : typeof body.priority === 'string'
            ? body.priority
            : null,
      status: asStatus(body.status),
      due_date: typeof body.due_date === 'string' ? body.due_date : null,
    })
    return reply.code(201).send(card)
  })

  app.patch('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>

    const card = updateCard(id, {
      content: typeof body.content === 'string' ? body.content : undefined,
      type: asType(body.type),
      priority:
        body.priority === undefined
          ? undefined
          : body.priority === null || typeof body.priority === 'string'
            ? (body.priority as string | null)
            : undefined,
      status: asStatus(body.status),
      due_date:
        body.due_date === undefined
          ? undefined
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
