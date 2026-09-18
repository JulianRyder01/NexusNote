/** 卡片详情弹窗：编辑内容/类型/优先级/状态/标签/due，Markdown 预览 */
import { useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { extractTags } from '@shared/parser'
import { CARD_STATUSES, CARD_TYPES, STATUS_LABELS, TYPE_LABELS } from '@shared/types'
import type { CardStatus, CardType } from '@shared/types'
import { useStore } from '../store'
import { Button, Input, Modal, Select, Textarea } from './ui'
import { HighlightedContent } from './CardItem'

export function CardDetailModal() {
  const selectedId = useStore((s) => s.selectedCardId)
  const selectCard = useStore((s) => s.selectCard)
  const cards = useStore((s) => s.cards)
  const priorities = useStore((s) => s.priorities)
  const updateCard = useStore((s) => s.updateCard)
  const deleteCard = useStore((s) => s.deleteCard)
  const tags = useStore((s) => s.tags)

  const card = useMemo(() => cards.find((c) => c.id === selectedId) ?? null, [cards, selectedId])

  const [content, setContent] = useState('')
  const [preview, setPreview] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setContent(card?.content ?? '')
    setPreview(false)
    setNewTag('')
    setConfirmDelete(false)
  }, [card?.id, card?.content])

  if (!card) return null

  const dirty = content !== card.content

  async function save() {
    if (!card || !dirty) return
    await updateCard(card.id, { content })
  }

  async function addTag() {
    if (!card || !newTag.trim()) return
    const name = newTag.trim().replace(/^#/, '')
    if (card.tags.some((t) => t.name === name)) {
      setNewTag('')
      return
    }
    const next = `${card.content} #${name}`
    setContent(next)
    await updateCard(card.id, { content: next })
    setNewTag('')
  }

  async function removeTag(name: string) {
    if (!card) return
    const next = card.content.replace(new RegExp(`#${escapeRe(name)}\\b`, 'g'), '').replace(/\s{2,}/g, ' ').trim()
    setContent(next)
    await updateCard(card.id, { content: next })
  }

  const contentTags = extractTags(content)
  const suggestions = tags.filter((t) => t.name.includes(newTag.replace(/^#/, '')) && newTag.trim()).slice(0, 6)

  return (
    <Modal
      open={!!card}
      onClose={() => selectCard(null)}
      wide
      title={
        <div className="flex items-center gap-2">
          <span>卡片详情</span>
          <span className="text-xs font-normal text-slate-400">{card.id}</span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 内容 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-ink-soft">内容</label>
            <button
              onClick={() => setPreview((p) => !p)}
              className="focus-ring rounded px-1.5 py-0.5 text-xs text-accent hover:bg-[#eef1f5]"
            >
              {preview ? '编辑' : '预览 Markdown'}
            </button>
          </div>
          {preview ? (
            <div className="md-body min-h-20 rounded-[6px] border border-line bg-[#fafbfc] px-3 py-2">
              {content.trim() ? (
                <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
              ) : (
                <span className="text-sm text-slate-400">（空）</span>
              )}
            </div>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void save()
              }}
            />
          )}
          {!preview && (
            <div className="mt-1 text-xs text-slate-500">
              <HighlightedContent content={content} />
              {dirty && (
                <Button size="sm" variant="primary" className="ml-2" onClick={() => void save()}>
                  保存 (⌘⏎)
                </Button>
              )}
            </div>
          )}
        </div>

        {/* 属性行 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">类型</label>
            <Select
              value={card.type}
              onChange={(e) => void updateCard(card.id, { type: e.target.value as CardType })}
              className="w-full"
            >
              {CARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">优先级</label>
            <Select
              value={card.priority ?? ''}
              onChange={(e) => void updateCard(card.id, { priority: e.target.value || null })}
              className="w-full"
            >
              <option value="">不进看板</option>
              {priorities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">状态</label>
            <Select
              value={card.status}
              onChange={(e) => void updateCard(card.id, { status: e.target.value as CardStatus })}
              className="w-full"
            >
              {CARD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">截止日期</label>
          <Input
            type="date"
            value={card.due_date ?? ''}
            onChange={(e) => void updateCard(card.id, { due_date: e.target.value || null })}
            className="max-w-48"
          />
        </div>

        {/* 标签 */}
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">标签</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {contentTags.map((name) => {
              const meta = tags.find((t) => t.name === name)
              return (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                  style={{
                    backgroundColor: `${meta?.color ?? '#4a6fa5'}22`,
                    color: meta?.color ?? '#4a6fa5',
                  }}
                >
                  #{name}
                  <button
                    onClick={() => void removeTag(name)}
                    className="text-current opacity-60 hover:opacity-100"
                    aria-label={`移除标签 ${name}`}
                  >
                    ✕
                  </button>
                </span>
              )
            })}
            {contentTags.length === 0 && <span className="text-xs text-slate-400">暂无标签</span>}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addTag()
              }}
              placeholder="添加标签…"
              className="max-w-48"
            />
            <Button size="sm" onClick={() => void addTag()} disabled={!newTag.trim()}>
              添加
            </Button>
          </div>
          {suggestions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setNewTag(t.name)}
                  className="focus-ring rounded-full px-2 py-0.5 text-[11px]"
                  style={{ backgroundColor: `${t.color ?? '#4a6fa5'}22`, color: t.color ?? '#4a6fa5' }}
                >
                  #{t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 显式链接 */}
        {card.links.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">显式链接</label>
            <div className="flex flex-wrap gap-1.5">
              {card.links.map((l) => (
                <button
                  key={l.id}
                  onClick={() => selectCard(l.id)}
                  className="focus-ring rounded-[6px] border border-line px-2 py-1 text-left text-xs hover:border-accent-soft"
                >
                  {l.content.slice(0, 40)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 元信息与操作 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs text-slate-400">
          <div className="space-x-3">
            <span>创建 {fmt(card.created_at)}</span>
            <span>更新 {fmt(card.updated_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void updateCard(card.id, { archived: card.archived ? 0 : 1 })}
            >
              {card.archived ? '取消归档' : '归档'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void navigator.clipboard?.writeText(card.id)}
              title={card.id}
            >
              复制 ID
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="danger" onClick={() => void deleteCard(card.id)}>
                  确认删除
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  取消
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                删除
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function fmt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

