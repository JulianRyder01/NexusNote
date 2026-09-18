/**
 * 甘特图视图。
 *
 * 结构：左侧固定「任务名列」+ 右侧可横向滚动的时间轴。
 * 时间轴以「天」为单位绘制，通过视窗 [viewStart, viewEnd) 控制可见范围，
 * 用拖拽平移、滚轮缩放；顶部/底部固定日期刻度条不随纵向滚动。
 *
 * 时间条表达：
 *   有 start_date → 圆角横条（区间）
 *   只有 due_date  → 里程碑菱形（单日节点）
 * 现在时刻用一条脉动竖线标注。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent, ReactNode } from 'react'
import { parseISODateLocal, shiftISODate, todayISO } from '@shared/date'
import {
  CARD_TYPE_COLORS,
  IMPORTANCE_LABELS,
  QUADRANT_COLORS,
  QUADRANT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '@shared/types'
import type { CardStatus, CardType, Quadrant, ScheduleItem } from '@shared/types'
import { useStore } from '../store'
import { cx, EmptyState, Spinner } from '../components/ui'

/** 每行高度（px） */
const ROW_H = 30
/** 左侧任务名列宽（px） */
const NAME_W = 230
/** 每个像素代表多少天（缩放） */
const MIN_DAYPX = 3
const MAX_DAYPX = 48
const DEFAULT_DAYPX = 14

type GroupDim = 'none' | 'priority' | 'tag' | 'quadrant' | 'type' | 'status'

const GROUP_OPTIONS: { value: GroupDim; label: string }[] = [
  { value: 'none', label: '不分组' },
  { value: 'priority', label: '按优先级' },
  { value: 'quadrant', label: '按象限' },
  { value: 'tag', label: '按标签' },
  { value: 'type', label: '按类型' },
  { value: 'status', label: '按状态' },
]

/** 日期 → 今天起算的天数偏移（可为负） */
function dayIndex(dateISO: string, originISO: string): number {
  return Math.round(
    (parseISODateLocal(dateISO).getTime() - parseISODateLocal(originISO).getTime()) / 86_400_000,
  )
}

interface Row {
  kind: 'group' | 'item'
  key: string
  label?: string
  color?: string
  count?: number
  item?: ScheduleItem
}

export function GanttView() {
  const schedule = useStore((s) => s.schedule)
  const loading = useStore((s) => s.scheduleLoading)
  const refreshSchedule = useStore((s) => s.refreshSchedule)
  const openCardById = useStore((s) => s.openCardById)

  // 筛选
  const [filterType, setFilterType] = useState<CardType | ''>('')
  const [filterStatus, setFilterStatus] = useState<CardStatus | ''>('')
  const [filterTag, setFilterTag] = useState('')
  const [filterQuadrant, setFilterQuadrant] = useState<Quadrant | ''>('')
  const [onlyScheduled, setOnlyScheduled] = useState(true)
  const [hideDone, setHideDone] = useState(true)
  const [groupDim, setGroupDim] = useState<GroupDim>('priority')

  // 时间轴视窗
  const [dayPx, setDayPx] = useState(DEFAULT_DAYPX)
  const [viewportW, setViewportW] = useState(0)
  /** 左侧名称列的纵向位移，跟随右侧时间轴的 scrollTop */
  const [nameScrollY, setNameScrollY] = useState(0)
  const [showToday, setShowToday] = useState(false)

  const timelineRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<{ x: number; sl: number } | null>(null)
  const dayPxRef = useRef(dayPx)
  dayPxRef.current = dayPx

  useEffect(() => {
    void refreshSchedule()
  }, [refreshSchedule])

  // 视窗宽度
  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const measure = () => setViewportW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading])

  const today = schedule?.today ?? todayISO()
  const origin = schedule?.range.start ?? today

  // 时间轴总天数（含余量）
  const totalDays = useMemo(() => {
    if (!schedule) return 60
    return Math.max(30, dayIndex(schedule.range.end, origin) + 1)
  }, [schedule, origin])

  const contentW = Math.max(totalDays * dayPx, viewportW)

  // 应用筛选
  const items = useMemo(() => {
    const all = schedule?.items ?? []
    return all.filter((it) => {
      if (filterType && it.type !== filterType) return false
      if (filterStatus && it.status !== filterStatus) return false
      if (filterQuadrant && it.quadrant !== filterQuadrant) return false
      if (filterTag && !it.tags.includes(filterTag)) return false
      if (hideDone && it.status === 'done') return false
      if (onlyScheduled && it.due_date === null && it.start_date === null) return false
      return true
    })
  }, [schedule, filterType, filterStatus, filterQuadrant, filterTag, hideDone, onlyScheduled])

  // 所有出现过的标签（供筛选下拉）
  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const it of schedule?.items ?? []) for (const t of it.tags) set.add(t)
    return [...set].sort()
  }, [schedule])

  // 分组 → 行列表
  const rows = useMemo<Row[]>(() => {
    if (groupDim === 'none') {
      return sortItems(items).map((it) => ({ kind: 'item', key: it.id, item: it }))
    }
    const groups = new Map<string, { label: string; color: string; items: ScheduleItem[] }>()
    const put = (key: string, label: string, color: string, it: ScheduleItem) => {
      const g = groups.get(key) ?? { label, color, items: [] }
      g.items.push(it)
      groups.set(key, g)
    }
    for (const it of items) {
      switch (groupDim) {
        case 'priority':
          put(
            it.priorityName ?? '__none__',
            it.priorityName ?? '未进看板',
            it.priorityName ? '#4a6fa5' : '#94a3b8',
            it,
          )
          break
        case 'quadrant':
          put(it.quadrant, QUADRANT_LABELS[it.quadrant], QUADRANT_COLORS[it.quadrant], it)
          break
        case 'type':
          put(it.type, TYPE_LABELS[it.type], CARD_TYPE_COLORS[it.type], it)
          break
        case 'status':
          put(it.status, STATUS_LABELS[it.status], STATUS_COLORS[it.status], it)
          break
        case 'tag': {
          if (it.tags.length === 0) put('__notag__', '（无标签）', '#94a3b8', it)
          else for (const t of it.tags) put(`tag:${t}`, `#${t}`, '#4a6fa5', it)
          break
        }
      }
    }
    // 优先级分组按 rank 排序；其余按条目数降序
    const entries = [...groups.entries()]
    if (groupDim === 'priority') {
      const order = ['P0', 'P1', 'P2', 'P3']
      entries.sort((a, b) => {
        const ai = order.indexOf(a[0])
        const bi = order.indexOf(b[0])
        if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        return b[1].items.length - a[1].items.length
      })
    } else {
      entries.sort((a, b) => b[1].items.length - a[1].items.length)
    }

    const out: Row[] = []
    for (const [key, g] of entries) {
      out.push({ kind: 'group', key: `g:${key}`, label: g.label, color: g.color, count: g.items.length })
      for (const it of sortItems(g.items)) out.push({ kind: 'item', key: it.id, item: it })
    }
    return out
  }, [items, groupDim])

  const bodyH = rows.length * ROW_H

  // 拖拽平移
  function onTimelineDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const el = timelineRef.current
    if (!el) return
    panRef.current = { x: e.clientX, sl: el.scrollLeft }
    const move = (ev: PointerEvent) => {
      const p = panRef.current
      if (!p || !el) return
      el.scrollLeft = p.sl - (ev.clientX - p.x)
    }
    const up = () => {
      panRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // 滚轮：默认横向滚动；Ctrl/Cmd 或纵向滚轮则缩放（以指针为锚点）
  function onTimelineWheel(e: ReactWheelEvent<HTMLDivElement>) {
    const el = timelineRef.current
    if (!el) return
    const zooming = e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)
    if (!zooming) {
      el.scrollLeft += e.deltaX
      return
    }
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    const mx = e.clientX - rect.left // 视窗内位置
    const dayAt = (el.scrollLeft + mx) / dayPxRef.current
    const next = Math.min(MAX_DAYPX, Math.max(MIN_DAYPX, dayPxRef.current * Math.exp(-e.deltaY * 0.0015)))
    setDayPx(next)
    // 保持指针下的日期不动
    requestAnimationFrame(() => {
      el.scrollLeft = dayAt * next - mx
    })
  }

  // 同步顶部日期条与主体横向滚动；并让名称列纵向跟随
  function onTimelineScroll() {
    const el = timelineRef.current
    if (!el) return
    if (headerRef.current) headerRef.current.scrollLeft = el.scrollLeft
    setNameScrollY(el.scrollTop)
  }

  // 定位到今天
  function scrollToToday() {
    const el = timelineRef.current
    if (!el) return
    const x = dayIndex(today, origin) * dayPx
    el.scrollLeft = Math.max(0, x - viewportW / 2)
    setShowToday(true)
    window.setTimeout(() => setShowToday(false), 1600)
  }

  // 首次加载后自动定位到今天
  useEffect(() => {
    if (schedule && viewportW > 0) scrollToToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule !== null, viewportW > 0])

  const todayX = dayIndex(today, origin) * dayPx
  const timelineW = contentW

  return (
    <div className="flex h-full flex-col">
      {/* 筛选栏 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          value={groupDim}
          onChange={(e) => setGroupDim(e.target.value as GroupDim)}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
          title="分组维度"
        >
          {GROUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as CardType | '')}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
        >
          <option value="">全部类型</option>
          {(['todo', 'idea', 'note', 'link'] as CardType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as CardStatus | '')}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
        >
          <option value="">全部状态</option>
          {(['todo', 'in_progress', 'done', 'someday'] as CardStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={filterQuadrant}
          onChange={(e) => setFilterQuadrant(e.target.value as Quadrant | '')}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
        >
          <option value="">全部象限</option>
          {(Object.keys(QUADRANT_LABELS) as Quadrant[]).map((q) => (
            <option key={q} value={q}>
              {QUADRANT_LABELS[q]}
            </option>
          ))}
        </select>
        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
        >
          <option value="">全部标签</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
        <Toggle on={onlyScheduled} onClick={() => setOnlyScheduled((v) => !v)} label="只看有日期" />
        <Toggle on={hideDone} onClick={() => setHideDone((v) => !v)} label="隐藏已完成" />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">{items.length} 项</span>
          <button
            onClick={scrollToToday}
            className="focus-ring h-8 rounded-[6px] border border-accent bg-accent/10 px-2.5 text-xs text-accent"
          >
            回到今天
          </button>
        </div>
      </div>

      {loading && !schedule && <Spinner label="加载排期…" />}

      {schedule && rows.length === 0 && (
        <EmptyState
          title="没有符合条件的任务"
          hint={
            onlyScheduled
              ? '当前只显示有日期的卡片。用 @9/20~@10/5 写时间区间，或 @明天 设定截止。'
              : '试试放宽筛选条件。'
          }
        />
      )}

      {schedule && rows.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-line bg-white">
          {/* 顶部日期刻度 */}
          <div className="flex border-b border-line bg-[#fafbfc]">
            <div
              className="shrink-0 border-r border-line px-3 py-1.5 text-[11px] font-medium text-ink-soft"
              style={{ width: NAME_W }}
            >
              任务
            </div>
            <div ref={headerRef} className="relative flex-1 overflow-hidden">
              <div style={{ width: timelineW, height: 34 }} className="relative">
                <DayTicks origin={origin} totalDays={totalDays} dayPx={dayPx} />
                {/* 今天标记 */}
                <div
                  className="absolute top-0 h-full border-l border-accent/60"
                  style={{ left: todayX }}
                >
                  <span className="absolute left-1 top-0.5 whitespace-nowrap rounded bg-accent px-1 text-[10px] text-white">
                    今天
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 主体：左侧名称列 + 右侧时间轴 */}
          <div className="flex min-h-0 flex-1">
            {/* 名称列（不横向滚动；纵向随右侧时间轴同步位移） */}
            <div className="shrink-0 overflow-hidden border-r border-line" style={{ width: NAME_W }}>
              <div style={{ height: bodyH, transform: `translateY(${-nameScrollY}px)` }}>
                {rows.map((r) =>
                  r.kind === 'group' ? (
                    <div
                      key={r.key}
                      className="flex items-center gap-1.5 bg-[#f7f8fa] px-3 text-[11px] font-medium text-ink-soft"
                      style={{ height: ROW_H }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                      <span className="truncate">{r.label}</span>
                      <span className="ml-auto text-slate-400">{r.count}</span>
                    </div>
                  ) : (
                    <NameCell
                      key={r.key}
                      item={r.item!}
                      onOpen={() => void openCardById(r.item!.id)}
                    />
                  ),
                )}
              </div>
            </div>

            {/* 时间轴（横向滚动 + 纵向滚动） */}
            <div
              ref={timelineRef}
              onScroll={onTimelineScroll}
              onWheel={onTimelineWheel}
              onPointerDown={onTimelineDown}
              className="relative min-w-0 flex-1 cursor-grab overflow-auto active:cursor-grabbing"
            >
              <div style={{ width: timelineW, height: bodyH }} className="relative">
                <DayTicks origin={origin} totalDays={totalDays} dayPx={dayPx} vertical />
                <GridLines origin={origin} totalDays={totalDays} dayPx={dayPx} height={bodyH} />

                {/* 今天竖线（贯穿主体） */}
                <div
                  className={cx(
                    'pointer-events-none absolute top-0 w-px bg-accent',
                    showToday && 'animate-pulse',
                  )}
                  style={{ left: todayX, height: Math.max(bodyH, 1) }}
                >
                  {showToday && (
                    <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-accent/25" />
                  )}
                </div>

                {/* 行内容 */}
                {rows.map((r, i) => (
                  <div
                    key={r.key}
                    className={cx('absolute left-0 right-0', r.kind === 'group' && 'bg-[#f7f8fa]')}
                    style={{ top: i * ROW_H, height: ROW_H }}
                  >
                    {r.kind === 'item' && (
                      <Bar
                        item={r.item!}
                        origin={origin}
                        dayPx={dayPx}
                        onOpen={() => void openCardById(r.item!.id)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 底部图例与缩放 */}
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-1.5 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-5 rounded-sm bg-[#4a6fa5]" />
              时间区间（有起止）
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rotate-45 bg-[#4a6fa5]"
                style={{ marginTop: 1 }}
              />
              里程碑（仅截止日）
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-px bg-accent" />
              现在时刻
            </span>
            <span className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setDayPx((v) => Math.max(MIN_DAYPX, v / 1.4))}
                className="focus-ring rounded border border-line px-1.5 py-0.5 hover:bg-slate-100"
                title="缩小（时间轴更密）"
              >
                −
              </button>
              <span>{dayPx.toFixed(0)} px/天</span>
              <button
                onClick={() => setDayPx((v) => Math.min(MAX_DAYPX, v * 1.4))}
                className="focus-ring rounded border border-line px-1.5 py-0.5 hover:bg-slate-100"
                title="放大（时间轴更疏）"
              >
                ＋
              </button>
              <span className="ml-2">拖动平移 · 滚轮缩放</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** 按「紧急度优先、再看得分」排序，让紧急的更靠上 */
function sortItems(items: ScheduleItem[]): ScheduleItem[] {
  const urgencyRank: Record<string, number> = { overdue: 0, today: 1, soon: 2, later: 3, none: 4 }
  return [...items].sort((a, b) => {
    const ua = urgencyRank[a.urgency] ?? 9
    const ub = urgencyRank[b.urgency] ?? 9
    if (ua !== ub) return ua - ub
    if (b.score !== a.score) return b.score - a.score
    return a.barStart < b.barStart ? -1 : 1
  })
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'focus-ring h-8 rounded-[6px] border px-2 text-xs transition-colors',
        on ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-white text-ink-soft hover:bg-[#f2f4f7]',
      )}
    >
      {label}
    </button>
  )
}

/** 顶部/背景的日刻度：周一起新的一周用较深色 */
function DayTicks({
  origin,
  totalDays,
  dayPx,
  vertical = false,
}: {
  origin: string
  totalDays: number
  dayPx: number
  vertical?: boolean
}) {
  // 天数过多时只画网格线，不画日期文字（避免性能与拥挤）
  const showLabels = dayPx >= 18
  const days: ReactNode[] = []
  for (let i = 0; i < totalDays; i++) {
    const date = shiftISODate(origin, i)
    const d = parseISODateLocal(date)
    const isWeekStart = d.getDay() === 1
    const isMonthStart = d.getDate() === 1
    if (vertical) {
      if (!isWeekStart && !isMonthStart && dayPx < 26) continue
      days.push(
        <div
          key={i}
          className={cx(
            'absolute top-0',
            isMonthStart ? 'bg-[#d9dee6]' : 'bg-[#eef1f5]',
          )}
          style={{ left: i * dayPx, width: 1, height: '100%' }}
        />,
      )
    } else {
      days.push(
        <div
          key={i}
          className="absolute top-0 flex h-full flex-col items-center justify-center"
          style={{ left: i * dayPx, width: dayPx }}
        >
          {showLabels && (
            <>
              <span className={cx('text-[10px] leading-none', d.getDay() === 0 || d.getDay() === 6 ? 'text-slate-400' : 'text-ink-soft')}>
                {d.getDate()}
              </span>
              {d.getDate() === 1 && (
                <span className="text-[9px] leading-none text-accent">{d.getMonth() + 1}月</span>
              )}
            </>
          )}
          {(isWeekStart || isMonthStart) && (
            <span
              className={cx('absolute left-0 top-0 h-full', isMonthStart ? 'bg-[#cfd6df]' : 'bg-[#e6eaef]')}
              style={{ width: 1 }}
            />
          )}
        </div>,
      )
    }
  }
  return <>{days}</>
}

/** 周末底纹，便于判断工作日 */
function GridLines({
  origin,
  totalDays,
  dayPx,
  height,
}: {
  origin: string
  totalDays: number
  dayPx: number
  height: number
}) {
  const bands: ReactNode[] = []
  for (let i = 0; i < totalDays; i++) {
    const d = parseISODateLocal(shiftISODate(origin, i))
    const wd = d.getDay()
    if (wd === 0 || wd === 6) {
      bands.push(
        <div
          key={i}
          className="absolute top-0 bg-[#f7f8fa]"
          style={{ left: i * dayPx, width: dayPx, height }}
        />,
      )
    }
  }
  return <>{bands}</>
}

/** 左侧任务名单元格 */
function NameCell({ item, onOpen }: { item: ScheduleItem; onOpen: () => void }) {
  const urgencyColor =
    item.urgency === 'overdue'
      ? '#a5614a'
      : item.urgency === 'today'
        ? '#c1703a'
        : item.urgency === 'soon'
          ? '#a5754a'
          : '#c8cfd8'
  return (
    <button
      onClick={onOpen}
      className="focus-ring flex w-full items-center gap-1.5 px-2.5 text-left text-xs text-ink hover:bg-[#f2f4f7]"
      style={{ height: ROW_H }}
      title={item.content}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: urgencyColor }} />
      <span className="min-w-0 flex-1 truncate">{stripInline(item.content)}</span>
      {item.importance !== null && (
        <span className="shrink-0 text-[9px] text-[#a5754a]" title={`重要度：${IMPORTANCE_LABELS[item.importance]}`}>
          {'★'.repeat(item.importance)}
        </span>
      )}
      <span className="shrink-0 text-[9px] text-slate-400">{TYPE_LABELS[item.type]}</span>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[item.status] }}
        title={STATUS_LABELS[item.status]}
      />
    </button>
  )
}

/** 去掉正文里的语法标记，用于紧凑显示 */
function stripInline(content: string): string {
  return content
    .replace(/@[^\s#\[\]@~～]+/g, '')
    .replace(/#[^\s#\[\]]+/g, '')
    .replace(/(?:^|\s)!{1,3}(?=\s|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** 时间条 / 里程碑 */
function Bar({
  item,
  origin,
  dayPx,
  onOpen,
}: {
  item: ScheduleItem
  origin: string
  dayPx: number
  onOpen: () => void
}) {
  const startIdx = dayIndex(item.barStart, origin)
  const endIdx = dayIndex(item.barEnd, origin)
  const color = CARD_TYPE_COLORS[item.type]
  const done = item.status === 'done'
  const H = 14
  const top = (ROW_H - H) / 2

  // 里程碑：仅一个菱形
  if (item.milestone) {
    const cx0 = (endIdx + 0.5) * dayPx
    const size = 9
    return (
      <button
        onClick={onOpen}
        onPointerDown={(e) => e.stopPropagation()}
        className="focus-ring group absolute"
        style={{ left: cx0 - size, top: top - 1, width: size * 2, height: H + 2 }}
        title={`${stripInline(item.content)}\n截止 ${item.due_date}`}
      >
        <span
          className="absolute block rotate-45 rounded-[2px]"
          style={{
            left: size - size / 1.6,
            top: 2,
            width: size,
            height: size,
            backgroundColor: done ? '#c8cfd8' : color,
            border: '1px solid rgba(255,255,255,0.7)',
          }}
        />
      </button>
    )
  }

  const left = startIdx * dayPx
  // 单日区间也给一点最小宽度，避免看不见
  const width = Math.max((endIdx - startIdx + 1) * dayPx, 6)
  const pct = done ? 1 : item.status === 'in_progress' ? 0.6 : 0

  return (
    <button
      onClick={onOpen}
      onPointerDown={(e) => e.stopPropagation()}
      className="focus-ring group absolute overflow-hidden rounded-[4px]"
      style={{
        left,
        top,
        width,
        height: H,
        backgroundColor: `${color}${done ? '33' : '2e'}`,
        border: `1px solid ${done ? '#c8cfd8' : color}`,
      }}
      title={`${stripInline(item.content)}\n${item.barStart} ~ ${item.barEnd}`}
    >
      {/* 进度填充 */}
      {pct > 0 && (
        <span
          className="absolute inset-y-0 left-0"
          style={{ width: `${pct * 100}%`, backgroundColor: done ? '#c8cfd8' : `${color}66` }}
        />
      )}
      {/* 重要性：左侧色条 */}
      {item.importance !== null && (
        <span
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ backgroundColor: '#a5754a' }}
        />
      )}
      {width > 44 && (
        <span className="relative z-10 block truncate px-1.5 text-left text-[10px] leading-[14px] text-white mix-blend-luminosity">
          {stripInline(item.content).slice(0, 24)}
        </span>
      )}
    </button>
  )
}
