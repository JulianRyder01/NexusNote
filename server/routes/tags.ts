/** 标签与优先级路由 */
import type { FastifyInstance } from 'fastify'
import {
  createPriority,
  deletePriority,
  deleteTag,
  listOrphanTags,
  listPriorities,
  listTags,
  mergeTags,
  reorderPriorities,
  updatePriority,
  updateTag,
} from '../tags'

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/tags', async (req) => {
    const q = req.query as Record<string, string | undefined>
    return listTags(q.sort === 'name' ? 'name' : 'count')
  })

  app.get('/api/tags/orphans', async () => listOrphanTags())

  /** 标签概览：总数、孤儿数、颜色分布（供标签管理页头部展示） */
  app.get('/api/tags/summary', async () => {
    const all = listTags('count')
    const orphans = all.filter((t) => (t.count ?? 0) <= 1)
    const top = all.slice(0, 5).map((t) => ({ name: t.name, count: t.count ?? 0 }))
    return {
      total: all.length,
      orphans: orphans.length,
      unused: all.filter((t) => (t.count ?? 0) === 0).length,
      top,
    }
  })

  app.patch('/api/tags/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>
    const tag = updateTag(id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      color:
        body.color === undefined ? undefined : body.color === null ? null : String(body.color),
      description:
        body.description === undefined
          ? undefined
          : body.description === null
            ? null
            : String(body.description),
    })
    if (!tag) return reply.code(404).send({ error: '标签不存在' })
    return tag
  })

  app.post('/api/tags/merge', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const from = typeof body.from === 'string' ? body.from : ''
    const to = typeof body.to === 'string' ? body.to : ''
    if (!from || !to) return reply.code(400).send({ error: '需要 from 与 to' })
    mergeTags(from, to)
    return { ok: true }
  })

  app.delete('/api/tags/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ok = deleteTag(id)
    if (!ok) return reply.code(404).send({ error: '标签不存在' })
    return { ok: true }
  })

  // ---------- 优先级 ----------

  app.get('/api/priorities', async () => listPriorities())

  app.post('/api/priorities', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return reply.code(400).send({ error: '名称不能为空' })
    return reply.code(201).send(createPriority({ name, color: typeof body.color === 'string' ? body.color : null }))
  })

  app.patch('/api/priorities/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Record<string, unknown>
    const p = updatePriority(id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      color: body.color === undefined ? undefined : body.color === null ? null : String(body.color),
      sort: typeof body.sort === 'number' ? body.sort : undefined,
    })
    if (!p) return reply.code(404).send({ error: '优先级不存在' })
    return p
  })

  app.put('/api/priorities/order', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : []
    if (ids.length === 0) return reply.code(400).send({ error: '需要 ids 数组' })
    return reorderPriorities(ids)
  })

  app.delete('/api/priorities/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const ok = deletePriority(id)
    if (!ok) return reply.code(404).send({ error: '优先级不存在' })
    return { ok: true }
  })
}
