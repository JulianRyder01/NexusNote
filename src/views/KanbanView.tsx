/** 看板视图：列 = 优先级，拖拽跨列即改优先级 */
import { useMemo, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { CardWithRelations } from '@shared/types'
import { CARD_STATUSES, STATUS_LABELS } from '@shared/types'
import { useStore } from '../store'
import { Button, cx, EmptyState, Input } from '../components/ui'
import { CardItem } from '../components/CardItem'

export function KanbanView() {
  const priorities = useStore((s) => s.priorities)
  const cards = useStore((s) => s.cards)
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const moveCardToPriority = useStore((s) => s.moveCardToPriority)
  const createPriority = useStore((s) => s.createPriority)
  const updatePriority = useStore((s) => s.updatePriority)
  const deletePriority = useStore((s) => s.deletePriority)
  const reorderPriorities = useStore((s) => s.reorderPriorities)
  const createCard = useStore((s) => s.createCard)
  const selectCard = useStore((s) => s.selectCard)
  const toggleDone = useStore((s) => s.toggleDone)

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [newColumn, setNewColumn] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const grouped = useMemo(() => {
    const map = new Map<string | null, CardWithRelations[]>()
    map.set(null, [])
    for (const p of priorities) map.set(p.id, [])
    for (const c of cards) {
      const key = c.priority && map.has(c.priority) ? c.priority : null
      map.get(key)?.push(c)
    }
    return map
  }, [cards, priorities])

  function onDragEnd(e: DragEndEvent) {
    const cardId = String(e.active.id)
    const overId = e.over?.id ? String(e.over.id) : null
    if (!overId) return
    const target = overId.startsWith('col:') ? overId.slice(4) : overId
    void moveCardToPriority(cardId, target === 'none' ? null : target)
  }

  const toggleCollapse = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))

  return (
    <div className="flex h-full flex-col">
      {/* 筛选栏 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={filters.type}
          onChange={(e) => setFilters({ type: e.target.value as never })}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
        >
          <option value="">全部类型</option>
          <option value="todo">待办</option>
          <option value="idea">想法</option>
          <option value="note">笔记</option>
          <option value="link">链接</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value as never })}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
        >
          <option value="">全部状态</option>
          {CARD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => setFilters({ dueTodayOnly: !filters.dueTodayOnly })}
          className={cx(
            'focus-ring h-8 rounded-[6px] border px-2 text-xs transition-colors',
            filters.dueTodayOnly
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-line bg-white text-ink-soft hover:bg-[#f2f4f7]',
          )}
        >
          只看今天 due
        </button>
        {filters.tag && (
          <button
            onClick={() => setFilters({ tag: '' })}
            className="focus-ring h-8 rounded-[6px] border border-accent bg-accent/10 px-2 text-xs text-accent"
          >
            #{filters.tag} ✕
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={newColumn}
            onChange={(e) => setNewColumn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newColumn.trim()) {
                void createPriority(newColumn.trim())
                setNewColumn('')
              }
            }}
            placeholder="新增列名…"
            className="h-8 w-32 text-xs"
          />
          <Button
            size="sm"
            onClick={() => {
              if (newColumn.trim()) {
                void createPriority(newColumn.trim())
                setNewColumn('')
              }
            }}
            disabled={!newColumn.trim()}
          >
            + 列
          </Button>
        </div>
      </div>

      {cards.length === 0 && (
        <EmptyState title="看板还是空的" hint="用顶部输入框记录第一条，或按 [ ] 开头创建 todo。" />
      )}

      {/* 看板 */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {priorities.map((p, idx) => (
            <Column
              key={p.id}
              title={p.name}
              color={p.color}
              droppableId={p.id}
              cards={grouped.get(p.id) ?? []}
              collapsed={!!collapsed[p.id]}
              onToggleCollapse={() => toggleCollapse(p.id)}
              onAdd={(content) => void createCard({ content, type: 'todo', priority: p.id })}
              onOpenCard={selectCard}
              onToggleDone={(c) => void toggleDone(c)}
              onRename={(name) => void updatePriority(p.id, { name })}
              onDelete={() => void deletePriority(p.id)}
              canMoveLeft={idx > 0}
              canMoveRight={idx < priorities.length - 1}
              onMove={(dir) => {
                const ids = priorities.map((x) => x.id)
                const target = idx + dir
                if (target < 0 || target >= ids.length) return
                const a = ids[idx]!
                ids[idx] = ids[target]!
                ids[target] = a
                void reorderPriorities(ids)
              }}
            />
          ))}

          {/* 未进看板 */}
          <Column
            title="未进看板"
            color="#94a3b8"
            droppableId="none"
            cards={grouped.get(null) ?? []}
            collapsed={!!collapsed.none}
            onToggleCollapse={() => toggleCollapse('none')}
            onAdd={(content) => void createCard({ content, type: 'note', priority: null })}
            onOpenCard={selectCard}
            onToggleDone={(c) => void toggleDone(c)}
            isFixed
          />
        </div>
      </DndContext>
    </div>
  )
}

function Column({
  title,
  color,
  droppableId,
  cards,
  collapsed,
  onToggleCollapse,
  onAdd,
  onOpenCard,
  onToggleDone,
  onRename,
  onDelete,
  canMoveLeft,
  canMoveRight,
  onMove,
  isFixed,
}: {
  title: string
  color?: string | null
  droppableId?: string
  cards: CardWithRelations[]
  collapsed: boolean
  onToggleCollapse: () => void
  onAdd: (content: string) => void
  onOpenCard: (id: string) => void
  onToggleDone: (c: CardWithRelations) => void
  onRename?: (name: string) => void
  onDelete?: () => void
  canMoveLeft?: boolean
  canMoveRight?: boolean
  onMove?: (dir: -1 | 1) => void
  isFixed?: boolean
}) {
  const id = droppableId ?? title
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}` })

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(title)

  function submitDraft() {
    const v = draft.trim()
    if (v) onAdd(v)
    setDraft('')
    // 保留输入面板，便于连续添加
  }

  return (
    <div
      ref={setNodeRef}
      className={cx(
        'flex max-h-full w-64 shrink-0 flex-col rounded-[8px] border bg-[#f2f4f7]/60 transition-colors',
        isOver ? 'border-accent bg-accent/5' : 'border-line',
      )}
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <button onClick={onToggleCollapse} className="focus-ring rounded px-0.5 text-xs text-slate-400">
          {collapsed ? '▸' : '▾'}
        </button>
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color ?? '#94a3b8' }}
        />
        {editing && !isFixed ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              const v = nameDraft.trim()
              if (v && v !== title) onRename?.(v)
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setNameDraft(title)
                setEditing(false)
              }
            }}
            className="min-w-0 flex-1 rounded border border-line px-1 text-xs"
          />
        ) : (
          <button
            onClick={() => {
              if (!isFixed) {
                setNameDraft(title)
                setEditing(true)
              }
            }}
            className="min-w-0 flex-1 truncate text-left text-xs font-medium text-ink"
            title={isFixed ? title : `${title}（点击重命名）`}
          >
            {title}
          </button>
        )}
        <span className="text-[10px] text-slate-400">{cards.length}</span>
        {!isFixed && onMove && (
          <span className="flex">
            <button
              disabled={!canMoveLeft}
              onClick={() => onMove(-1)}
              className="focus-ring px-0.5 text-[10px] text-slate-400 disabled:opacity-25"
              title="左移"
            >
              ◂
            </button>
            <button
              disabled={!canMoveRight}
              onClick={() => onMove(1)}
              className="focus-ring px-0.5 text-[10px] text-slate-400 disabled:opacity-25"
              title="右移"
            >
              ▸
            </button>
          </span>
        )}
        {!isFixed && (
          <button
            onClick={onDelete}
            className="focus-ring rounded px-0.5 text-[10px] text-slate-400 hover:text-red-500"
            title="删除该列"
          >
            ✕
          </button>
        )}
        <button
          onClick={() => setAdding((v) => !v)}
          className="focus-ring rounded px-0.5 text-xs text-slate-400 hover:text-accent"
          title="在此列添加"
        >
          +
        </button>
      </div>

      {!collapsed && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
          {adding && (
            <div className="rounded-[6px] border border-line bg-white p-1.5">
              <textarea
                autoFocus
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    submitDraft()
                  }
                  if (e.key === 'Escape') setAdding(false)
                }}
                placeholder="快速添加… ⌘⏎"
                className="focus-ring w-full resize-none rounded-[4px] px-1.5 py-1 text-xs"
              />
              <div className="mt-1 flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  收起
                </Button>
                <Button size="sm" variant="primary" onClick={submitDraft} disabled={!draft.trim()}>
                  添加
                </Button>
              </div>
            </div>
          )}
          {cards.map((c) => (
            <DraggableCard
              key={c.id}
              card={c}
              onOpen={() => onOpenCard(c.id)}
              onToggleDone={() => onToggleDone(c)}
            />
          ))}
          {cards.length === 0 && !adding && (
            <div className="py-6 text-center text-[11px] text-slate-400">拖拽卡片到此列</div>
          )}
        </div>
      )}
    </div>
  )
}

function DraggableCard({
  card,
  onOpen,
  onToggleDone,
}: {
  card: CardWithRelations
  onOpen: () => void
  onToggleDone: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cx(isDragging && 'opacity-50')}
    >
      <CardItem card={card} onOpen={onOpen} onToggleDone={onToggleDone} draggable />
    </div>
  )
}

