/** 列表视图：倒序列表、多条件筛选、批量操作、按标签分组折叠 */
import { useMemo, useState } from 'react'
import { CARD_STATUSES, CARD_TYPES, STATUS_LABELS, TYPE_LABELS } from '@shared/types'
import type { CardStatus, CardType } from '@shared/types'
import { useStore } from '../store'
import { Button, cx, EmptyState, Input } from '../components/ui'
import { CardItem } from '../components/CardItem'

export function ListView() {
  const cards = useStore((s) => s.cards)
  const total = useStore((s) => s.total)
  const priorities = useStore((s) => s.priorities)
  const tags = useStore((s) => s.tags)
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const resetFilters = useStore((s) => s.resetFilters)
  const selectCard = useStore((s) => s.selectCard)
  const toggleDone = useStore((s) => s.toggleDone)
  const bulkUpdate = useStore((s) => s.bulkUpdate)
  const deleteCards = useStore((s) => s.deleteCards)

  const [groupByTag, setGroupByTag] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedIds = useMemo(() => [...selected], [selected])

  const groups = useMemo(() => {
    if (!groupByTag) return null
    const map = new Map<string, typeof cards>()
    for (const c of cards) {
      if (c.tags.length === 0) {
        const arr = map.get('（无标签）') ?? []
        arr.push(c)
        map.set('（无标签）', arr)
        continue
      }
      for (const t of c.tags) {
        const arr = map.get(t.name) ?? []
        arr.push(c)
        map.set(t.name, arr)
      }
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [cards, groupByTag])

  const hasFilters =
    !!filters.q || !!filters.type || !!filters.tag || !!filters.status || filters.dueTodayOnly

  return (
    <div className="flex h-full flex-col">
      {/* 筛选栏 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })}
          placeholder="全文搜索…"
          className="h-8 w-48 text-xs"
        />
        <select
          value={filters.type}
          onChange={(e) => setFilters({ type: e.target.value as CardType | '' })}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
        >
          <option value="">全部类型</option>
          {CARD_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ status: e.target.value as CardStatus | '' })}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
        >
          <option value="">全部状态</option>
          {CARD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={filters.tag}
          onChange={(e) => setFilters({ tag: e.target.value })}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
        >
          <option value="">全部标签</option>
          {tags.map((t) => (
            <option key={t.id} value={t.name}>
              #{t.name} ({t.count ?? 0})
            </option>
          ))}
        </select>
        <button
          onClick={() => setGroupByTag((v) => !v)}
          className={cx(
            'focus-ring h-8 rounded-[6px] border px-2 text-xs transition-colors',
            groupByTag
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-line bg-white text-ink-soft hover:bg-[#f2f4f7]',
          )}
        >
          按标签分组
        </button>
        {hasFilters && (
          <Button size="sm" variant="ghost" onClick={resetFilters}>
            清除筛选
          </Button>
        )}
        <span className="ml-auto text-xs text-slate-400">共 {total} 张</span>
      </div>

      {/* 批量操作条 */}
      {selectedIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[6px] border border-accent/40 bg-accent/5 px-3 py-2">
          <span className="text-xs text-ink">已选 {selectedIds.length} 张</span>
          <select
            onChange={(e) => {
              const v = e.target.value
              if (!v) return
              void bulkUpdate(selectedIds, { priority: v === 'none' ? null : v })
              e.target.value = ''
            }}
            className="focus-ring h-7 rounded border border-line bg-white px-1.5 text-xs"
          >
            <option value="">改优先级…</option>
            <option value="none">不进看板</option>
            {priorities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            onChange={(e) => {
              const v = e.target.value
              if (!v) return
              void bulkUpdate(selectedIds, { status: v as CardStatus })
              e.target.value = ''
            }}
            className="focus-ring h-7 rounded border border-line bg-white px-1.5 text-xs"
          >
            <option value="">改状态…</option>
            {CARD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void bulkUpdate(selectedIds, { archived: 1 })
              setSelected(new Set())
            }}
          >
            归档
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              void deleteCards(selectedIds)
              setSelected(new Set())
            }}
          >
            删除
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            取消选择
          </Button>
        </div>
      )}

      {/* 列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {cards.length === 0 ? (
          <EmptyState title="没有匹配的卡片" hint={hasFilters ? '试试清除筛选条件。' : '用顶部输入框记录第一条。'} />
        ) : groupByTag && groups ? (
          <div className="space-y-3">
            {groups.map(([name, list]) => (
              <div key={name}>
                <button
                  onClick={() => setCollapsedGroups((c) => ({ ...c, [name]: !c[name] }))}
                  className="focus-ring mb-1.5 flex items-center gap-2 rounded px-1 text-xs font-medium text-ink-soft"
                >
                  <span className="text-slate-400">{collapsedGroups[name] ? '▸' : '▾'}</span>
                  <span className="text-accent">#{name}</span>
                  <span className="text-slate-400">{list.length}</span>
                </button>
                {!collapsedGroups[name] && (
                  <div className="space-y-2">
                    {list.map((c) => (
                      <div key={`${name}-${c.id}`} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="focus-ring mt-3 h-4 w-4 shrink-0 accent-[#4a6fa5]"
                        />
                        <div className="min-w-0 flex-1">
                          <CardItem
                            card={c}
                            onOpen={() => selectCard(c.id)}
                            onToggleDone={() => void toggleDone(c)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {cards.map((c) => (
              <div key={c.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  className="focus-ring mt-3 h-4 w-4 shrink-0 accent-[#4a6fa5]"
                />
                <div className="min-w-0 flex-1">
                  <CardItem
                    card={c}
                    onOpen={() => selectCard(c.id)}
                    onToggleDone={() => void toggleDone(c)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
