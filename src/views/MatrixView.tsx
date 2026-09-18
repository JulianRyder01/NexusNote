/**
 * 艾森豪威尔矩阵视图 + 智能推荐。
 *
 * 上半部分：2×2 四象限（重要 × 紧急），每格列出落在此象限的卡片。
 * 下半部分：智能推荐——按 scoreCard 的得分取前 N 项，并展示每项的打分理由，
 *            说明「为什么建议先做它」。
 */
import { useEffect, useMemo, useState } from 'react'
import { relativeDayLabel } from '@shared/date'
import {
  IMPORTANCE_LABELS,
  QUADRANT_COLORS,
  QUADRANT_HINTS,
  QUADRANT_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  URGENCY_LABELS,
} from '@shared/types'
import type { Quadrant, ScheduleItem } from '@shared/types'
import { SCORE_WEIGHTS, isActionable } from '@shared/schedule'
import { useStore } from '../store'
import { Card, cx, EmptyState, SectionTitle, Spinner } from '../components/ui'

const QUADRANTS: Quadrant[] = [
  'urgent-important',
  'urgent-unimportant',
  'not-urgent-important',
  'not-urgent-unimportant',
]

/** 得分 → 强度分档，用于推荐的条形展示 */
function scoreTier(score: number): { label: string; color: string } {
  if (score >= 60) return { label: '优先处理', color: '#a5614a' }
  if (score >= 35) return { label: '尽快安排', color: '#a5754a' }
  if (score >= 18) return { label: '可安排', color: '#4a6fa5' }
  return { label: '可暂缓', color: '#8c98a6' }
}

export function MatrixView() {
  const schedule = useStore((s) => s.schedule)
  const loading = useStore((s) => s.scheduleLoading)
  const refreshSchedule = useStore((s) => s.refreshSchedule)
  const openCardById = useStore((s) => s.openCardById)

  const [hideDone, setHideDone] = useState(true)
  const [topN, setTopN] = useState(5)
  const [expanded, setExpanded] = useState<string | null>(null)
  /** 推荐面板是否把已完成/搁置也纳入 */
  const [includeInactive, setIncludeInactive] = useState(false)

  useEffect(() => {
    void refreshSchedule()
  }, [refreshSchedule])

  const items = useMemo(() => {
    const all = schedule?.items ?? []
    return hideDone ? all.filter((it) => it.status !== 'done') : all
  }, [schedule, hideDone])

  const byQuadrant = useMemo(() => {
    const map = new Map<Quadrant, ScheduleItem[]>([])
    for (const q of QUADRANTS) map.set(q, [])
    for (const it of items) map.get(it.quadrant)?.push(it)
    for (const [q, arr] of map) {
      // 象限内按得分降序，最该做的排前
      map.set(
        q,
        arr.sort((a, b) =>
          a.status === b.status ? b.score - a.score : a.status === 'in_progress' ? -1 : b.score - a.score,
        ),
      )
    }
    return map
  }, [items])

  const recommendations = useMemo(() => {
    const pool = includeInactive ? items : items.filter((it) => isActionable(it.status))
    return [...pool].sort((a, b) => b.score - a.score).slice(0, topN)
  }, [items, topN, includeInactive])

  if (!schedule) {
    return <div className="py-10">{loading ? <Spinner label="加载排期…" /> : <EmptyState title="暂无数据" />}</div>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-ink">艾森豪威尔矩阵</h1>
          <p className="text-xs text-slate-400">
            纵轴＝重要性（可设），横轴＝紧急度（由截止日期自动推导）。共 {items.length} 项。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHideDone((v) => !v)}
            className={cx(
              'focus-ring h-8 rounded-[6px] border px-2 text-xs',
              hideDone ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-white text-ink-soft',
            )}
          >
            隐藏已完成
          </button>
        </div>
      </div>

      {/* ---------- 四象限 ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {QUADRANTS.map((q) => {
          const list = byQuadrant.get(q) ?? []
          const color = QUADRANT_COLORS[q]
          return (
            <Card key={q} className="flex min-h-[140px] flex-col border-t-2" >
              <div className="mb-2 flex items-baseline gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm font-semibold text-ink">{QUADRANT_LABELS[q]}</span>
                <span className="text-xs text-slate-400">{list.length}</span>
                <span className="ml-auto text-[11px]" style={{ color }}>
                  {QUADRANT_HINTS[q]}
                </span>
              </div>
              <div className="space-y-1.5">
                {list.map((it) => (
                  <QuadrantRow
                    key={it.id}
                    item={it}
                    accent={color}
                    onOpen={() => void openCardById(it.id)}
                  />
                ))}
                {list.length === 0 && (
                  <div className="py-2 text-xs text-slate-300">此象限为空</div>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* ---------- 智能推荐 ---------- */}
      <section>
        <SectionTitle color="#a5614a">智能推荐 · 建议先做这些</SectionTitle>
        <p className="mb-2 text-xs text-slate-400">
          按六个因素加权打分：截止日期 {SCORE_WEIGHTS.due}、优先级 {SCORE_WEIGHTS.priority}、
          重要性 {SCORE_WEIGHTS.importance}、状态 {SCORE_WEIGHTS.status}、
          陈旧度 {SCORE_WEIGHTS.staleness}、被引用 {SCORE_WEIGHTS.inDegree}。
          点开可看每项的得分明细。
        </p>

        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">显示前</span>
          {[3, 5, 8, 12].map((n) => (
            <button
              key={n}
              onClick={() => setTopN(n)}
              className={cx(
                'focus-ring h-7 w-8 rounded-[6px] border',
                topN === n ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-white text-ink-soft',
              )}
            >
              {n}
            </button>
          ))}
          <span className="text-slate-400">项</span>
          <button
            onClick={() => setIncludeInactive((v) => !v)}
            className={cx(
              'focus-ring ml-2 h-7 rounded-[6px] border px-2',
              includeInactive ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-white text-ink-soft',
            )}
          >
            含已完成/搁置
          </button>
        </div>

        {recommendations.length === 0 ? (
          <EmptyState title="没有可推荐的事项" hint="写几张带 @日期 的卡片试试。" />
        ) : (
          <ol className="space-y-2">
            {recommendations.map((it, i) => {
              const tier = scoreTier(it.score)
              const open = expanded === it.id
              return (
                <li key={it.id}>
                  <Card className="p-0">
                    <button
                      onClick={() => setExpanded(open ? null : it.id)}
                      className="focus-ring flex w-full items-start gap-3 p-3 text-left"
                    >
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: tier.color }}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug text-ink">{it.content}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                          <span style={{ color: tier.color }}>{tier.label}</span>
                          <span>·</span>
                          <span>{URGENCY_LABELS[it.urgency]}</span>
                          <span>·</span>
                          <span>{QUADRANT_LABELS[it.quadrant]}</span>
                          <span>·</span>
                          <span>{STATUS_LABELS[it.status]}</span>
                          {it.due_date && (
                            <>
                              <span>·</span>
                              <span>due {relativeDayLabel(it.due_date)}</span>
                            </>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold" style={{ color: tier.color }}>
                          {it.score.toFixed(0)}
                        </span>
                        <span className="text-[9px] text-slate-400">分</span>
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-line bg-[#fafbfc] px-3 py-2">
                        <div className="mb-1.5 text-[11px] font-medium text-ink-soft">得分明细</div>
                        <div className="space-y-1">
                          {it.breakdown.map((b) => (
                            <div key={b.label} className="flex items-center gap-2 text-[11px]">
                              <span className="w-16 shrink-0 text-slate-500">{b.label}</span>
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e6eaef]">
                                <span
                                  className="block h-full rounded-full"
                                  style={{
                                    width: `${Math.min(100, (b.score / maxWeight(b.label)) * 100)}%`,
                                    backgroundColor: b.score > 0 ? '#4a6fa5' : 'transparent',
                                  }}
                                />
                              </span>
                              <span className="w-10 shrink-0 text-right text-slate-400">
                                {b.score.toFixed(1)}
                              </span>
                              <span className="w-28 shrink-0 truncate text-slate-400" title={b.reason}>
                                {b.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">
                            已设重要度：{it.importance ? IMPORTANCE_LABELS[it.importance] : '未设置'}
                          </span>
                          <button
                            onClick={() => void openCardById(it.id)}
                            className="focus-ring rounded px-2 py-0.5 text-[11px] text-accent hover:bg-[#eef1f5]"
                          >
                            打开详情 →
                          </button>
                        </div>
                      </div>
                    )}
                  </Card>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}

/** 各因素的最大分值，用于明细条的比例 */
function maxWeight(label: string): number {
  switch (label) {
    case '截止日期':
      return SCORE_WEIGHTS.due
    case '优先级':
      return SCORE_WEIGHTS.priority
    case '重要性':
      return SCORE_WEIGHTS.importance
    case '状态':
      return SCORE_WEIGHTS.status
    case '陈旧度':
      return SCORE_WEIGHTS.staleness
    case '被引用':
      return SCORE_WEIGHTS.inDegree
    default:
      return 40
  }
}

function QuadrantRow({
  item,
  accent,
  onOpen,
}: {
  item: ScheduleItem
  accent: string
  onOpen: () => void
}) {
  return (
    <button
      onClick={onOpen}
      className="focus-ring flex w-full items-center gap-2 rounded-[6px] border border-line bg-white px-2 py-1.5 text-left transition-colors hover:border-accent-soft"
      title={item.content}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
      <span className="min-w-0 flex-1 truncate text-xs text-ink">{item.content}</span>
      {item.importance !== null && (
        <span className="shrink-0 text-[9px] text-[#a5754a]">{'★'.repeat(item.importance)}</span>
      )}
      <span className="shrink-0 text-[9px] text-slate-400">{TYPE_LABELS[item.type]}</span>
      {item.due_date && (
        <span className="shrink-0 text-[9px] text-slate-400">{relativeDayLabel(item.due_date)}</span>
      )}
    </button>
  )
}
