/**
 * 随机漫游：随机抽一张卡片，可「顺着标签跳」到该标签下的另一张随机卡片。
 * 用于回顾旧想法、激发新连接。
 */
import { useEffect } from 'react'
import { relativeDayLabel } from '@shared/date'
import type { ReviewCard } from '@shared/types'
import { TYPE_LABELS, STATUS_LABELS } from '@shared/types'
import { useStore } from '../store'
import { Button, Card, cx, EmptyState, Spinner } from '../components/ui'

export function WalkView() {
  const walk = useStore((s) => s.walk)
  const loading = useStore((s) => s.walkLoading)
  const drawRandom = useStore((s) => s.drawRandom)
  const openCardById = useStore((s) => s.openCardById)
  const stats = useStore((s) => s.stats)

  // 首次进入自动抽一张
  useEffect(() => {
    if (!walk) void drawRandom()
  }, [walk, drawRandom])

  const card = walk?.card ?? null

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-ink">随机漫游</h1>
          <p className="text-xs text-slate-400">
            从 {stats?.cards ?? '—'} 张卡片里随机遇见一张；顺着标签可以一直走下去。
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={loading}
          onClick={() => void drawRandom()}
        >
          {loading ? '抽取中…' : '换一张'}
        </Button>
      </div>

      {loading && !card && <Spinner label="正在抽取…" />}

      {!loading && !card && (
        <EmptyState
          title="还没有可以漫游的卡片"
          hint="先去快速输入框写几张带 #标签 的卡片。"
        />
      )}

      {card && <WalkCard card={card} onOpen={() => void openCardById(card.id)} />}

      {card && walk && walk.tags.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-soft">
            顺着标签跳（点一个标签，去该标签下的另一张卡片）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {walk.tags.map((t) => (
              <button
                key={t.id}
                disabled={loading}
                onClick={() => void drawRandom({ tag: t.name, exclude: card.id })}
                className="focus-ring rounded-full px-2.5 py-1 text-xs transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{
                  backgroundColor: `${t.color ?? '#4a6fa5'}22`,
                  color: t.color ?? '#4a6fa5',
                }}
                title={`跳到 #${t.name} 下的另一张卡片`}
              >
                #{t.name} →
              </button>
            ))}
          </div>
        </div>
      )}

      {card && walk && walk.tags.length === 0 && (
        <div className="text-xs text-slate-400">
          这张卡片没有标签，无法顺着标签跳。给它加个 #标签 就能连进网络。
        </div>
      )}
    </div>
  )
}

function WalkCard({ card, onOpen }: { card: ReviewCard; onOpen: () => void }) {
  const statusColor =
    card.status === 'done'
      ? '#5b8c85'
      : card.status === 'in_progress'
        ? '#4a6fa5'
        : card.status === 'someday'
          ? '#a5754a'
          : '#c8cfd8'

  return (
    <Card className="p-4">
      <div
        onClick={onOpen}
        className="cursor-pointer text-base leading-relaxed text-ink hover:text-accent"
        title="点击查看详情"
      >
        {card.content}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[11px] text-slate-400">
        <span className="rounded bg-[#eef1f5] px-1.5 py-0.5 text-ink-soft">
          {TYPE_LABELS[card.type]}
        </span>
        {card.type === 'todo' && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
            {STATUS_LABELS[card.status]}
          </span>
        )}
        {card.due_date && <span>due {relativeDayLabel(card.due_date)}</span>}
        <span className={cx('ml-auto')}>更新于 {fmtDate(card.updated_at)}</span>
      </div>

      {card.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {card.tags.map((t) => (
            <span key={t} className="text-xs text-accent">
              #{t}
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
