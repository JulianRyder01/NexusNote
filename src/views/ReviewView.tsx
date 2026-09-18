/** 每日回顾：昨日回顾（含温故）+ 今日总结 */
import { useEffect } from 'react'
import { relativeDayLabel } from '@shared/date'
import type { ReviewCard } from '@shared/types'
import { TYPE_LABELS } from '@shared/types'
import { useStore } from '../store'
import { Card, cx, EmptyState, SectionTitle, Spinner, TagPill } from '../components/ui'

export function ReviewView() {
  const review = useStore((s) => s.review)
  const loading = useStore((s) => s.reviewLoading)
  const refreshReview = useStore((s) => s.refreshReview)
  const openCardById = useStore((s) => s.openCardById)

  useEffect(() => {
    void refreshReview()
  }, [refreshReview])

  const open = (id: string) => void openCardById(id)

  if (!review) {
    return (
      <div className="py-10">
        {loading ? <Spinner label="正在生成回顾…" /> : <EmptyState title="暂无回顾" />}
      </div>
    )
  }

  const hasYesterday =
    review.createdYesterday.length > 0 ||
    review.doneYesterday.length > 0 ||
    review.activeTagsYesterday.length > 0

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-ink">每日回顾</h1>
          <p className="text-xs text-slate-400">
            回顾 {relativeDayLabel(review.yesterday)} · 总结 {relativeDayLabel(review.today)}
          </p>
        </div>
        <button
          onClick={() => void refreshReview()}
          className="focus-ring rounded-[6px] border border-line bg-white px-2.5 py-1.5 text-xs text-ink-soft hover:bg-[#f2f4f7]"
        >
          重新生成
        </button>
      </div>

      {/* ---------- 昨日回顾 ---------- */}
      <section>
        <SectionTitle>昨日回顾 · {review.yesterday}</SectionTitle>
        {!hasYesterday && (
          <EmptyState title="昨天没有新增或完成的记录" hint="今天写点什么，明天这里就有内容了。" />
        )}

        {review.doneYesterday.length > 0 && (
          <Block title={`昨日完成 (${review.doneYesterday.length})`} accent="#5b8c85">
            {review.doneYesterday.map((c) => (
              <ReviewRow key={c.id} card={c} onOpen={() => open(c.id)} done />
            ))}
          </Block>
        )}

        {review.createdYesterday.length > 0 && (
          <Block title={`昨日新增 (${review.createdYesterday.length})`} accent="#4a6fa5">
            {review.createdYesterday.map((c) => (
              <ReviewRow key={c.id} card={c} onOpen={() => open(c.id)} />
            ))}
          </Block>
        )}

        {review.activeTagsYesterday.length > 0 && (
          <Block title="昨日活跃标签" accent="#a5754a">
            <div className="flex flex-wrap gap-1.5">
              {review.activeTagsYesterday.map((t) => (
                <TagPill key={t.name} name={t.name} color={t.color} count={t.count} />
              ))}
            </div>
          </Block>
        )}
      </section>

      {/* ---------- 温故 ---------- */}
      {review.throwback && (
        <section>
          <SectionTitle>温故</SectionTitle>
          <Card className="border-l-2 border-l-[#8c7d5b] bg-[#faf8f5]">
            <div className="mb-1 text-[11px] text-slate-400">
              一张 {fmtDate(review.throwback.updated_at)} 的旧卡片
            </div>
            <ReviewRow card={review.throwback} onOpen={() => open(review.throwback!.id)} />
          </Card>
        </section>
      )}

      {/* ---------- 今日总结 ---------- */}
      <section>
        <SectionTitle>今日总结 · {review.today}</SectionTitle>

        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="今日新增" value={review.createdToday.length} />
          <Stat label="今日完成" value={review.doneToday.length} color="#5b8c85" />
          <Stat label="活跃标签" value={review.activeTagsToday.length} color="#a5754a" />
          <Stat label="明天到期" value={review.dueTomorrow.length} color="#a5614a" />
        </div>

        {review.doneToday.length > 0 && (
          <Block title={`已完成 (${review.doneToday.length})`} accent="#5b8c85">
            {review.doneToday.map((c) => (
              <ReviewRow key={c.id} card={c} onOpen={() => open(c.id)} done />
            ))}
          </Block>
        )}

        {review.createdToday.length > 0 && (
          <Block title={`今日新增 (${review.createdToday.length})`} accent="#4a6fa5">
            {review.createdToday.map((c) => (
              <ReviewRow key={c.id} card={c} onOpen={() => open(c.id)} />
            ))}
          </Block>
        )}

        {review.activeTagsToday.length > 0 && (
          <Block title="今日最活跃标签" accent="#a5754a">
            <div className="flex flex-wrap gap-1.5">
              {review.activeTagsToday.map((t) => (
                <TagPill key={t.name} name={t.name} color={t.color} count={t.count} />
              ))}
            </div>
          </Block>
        )}

        <Block title={`明天 due (${review.dueTomorrow.length})`} accent="#a5614a">
          {review.dueTomorrow.length > 0 ? (
            review.dueTomorrow.map((c) => (
              <ReviewRow key={c.id} card={c} onOpen={() => open(c.id)} />
            ))
          ) : (
            <div className="py-1 text-xs text-slate-400">明天没有到期的卡片。</div>
          )}
        </Block>
      </section>
    </div>
  )
}

function Block({
  title,
  accent,
  children,
}: {
  title: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
        <span className="text-xs font-medium text-ink-soft">{title}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function ReviewRow({
  card,
  onOpen,
  done,
}: {
  card: ReviewCard
  onOpen: () => void
  done?: boolean
}) {
  return (
    <button
      onClick={onOpen}
      className="focus-ring block w-full rounded-[6px] border border-line bg-white px-2.5 py-2 text-left transition-colors hover:border-accent-soft"
    >
      <div className={cx('text-sm leading-snug', done ? 'text-slate-500' : 'text-ink')}>
        {card.content}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
        <span>{TYPE_LABELS[card.type]}</span>
        {card.tags.map((t) => (
          <span key={t} className="text-accent">
            #{t}
          </span>
        ))}
      </div>
    </button>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-[6px] border border-line bg-white px-3 py-2">
      <div className="text-lg font-semibold leading-tight" style={{ color: color ?? '#1e2b3a' }}>
        {value}
      </div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  )
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
