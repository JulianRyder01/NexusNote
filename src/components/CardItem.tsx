/** 卡片展示与语法高亮 */
import type { CardWithRelations } from '@shared/types'
import { STATUS_LABELS, TYPE_LABELS } from '@shared/types'
import { cx } from './ui'

export interface RenderToken {
  kind: 'text' | 'tag' | 'link' | 'priority' | 'date'
  text: string
}

/**
 * 把卡片正文切成可高亮的片段：
 * #标签 / [[链接]] / P0-P9 / @日期
 */
export function tokenize(
  content: string,
  priorityNames: string[] = [],
): RenderToken[] {
  const prioAlt = priorityNames.map(escapeRe).join('|')
  const pattern = new RegExp(
    [
      '(#(?:[^\\s#\\[\\]]+))', // 1 标签
      '(\\[\\[([^\\]]+)\\]\\])', // 2/3 链接
      prioAlt ? `((?:^|\\s)(?:${prioAlt})(?=\\s|$))` : '()', // 4 优先级（含自定义）
      '(@(?:[^\\s#\\[\\]@]+))', // 5 日期 token
    ].join('|'),
    'g',
  )

  const tokens: RenderToken[] = []
  let last = 0
  for (const m of content.matchAll(pattern)) {
    const idx = m.index ?? 0
    if (idx > last) tokens.push({ kind: 'text', text: content.slice(last, idx) })
    if (m[1]) tokens.push({ kind: 'tag', text: m[1] })
    else if (m[2]) tokens.push({ kind: 'link', text: m[3] ?? m[2] })
    else if (m[4]) tokens.push({ kind: 'priority', text: m[4].trim() })
    else if (m[5]) tokens.push({ kind: 'date', text: m[5] })
    last = idx + m[0].length
  }
  if (last < content.length) tokens.push({ kind: 'text', text: content.slice(last) })
  return tokens
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function HighlightedContent({
  content,
  priorityNames = [],
  className,
}: {
  content: string
  priorityNames?: string[]
  className?: string
}) {
  const tokens = tokenize(content, priorityNames)
  return (
    <span className={className}>
      {tokens.map((t, i) => {
        switch (t.kind) {
          case 'tag':
            return (
              <span key={i} className="text-accent">
                {t.text}
              </span>
            )
          case 'link':
            return (
              <span key={i} className="text-[#7d5b8c] underline decoration-dotted">
                {t.text}
              </span>
            )
          case 'priority':
            return (
              <span key={i} className="rounded bg-[#eef1f5] px-1 text-[11px] text-ink-soft">
                {t.text}
              </span>
            )
          case 'date':
            return (
              <span key={i} className="text-[#5b8c85]">
                {t.text}
              </span>
            )
          default:
            return <span key={i}>{t.text}</span>
        }
      })}
    </span>
  )
}

const STATUS_DOT: Record<string, string> = {
  todo: '#c8cfd8',
  in_progress: '#4a6fa5',
  done: '#5b8c85',
  someday: '#a5754a',
}

export function StatusDot({ status, title }: { status: string; title?: string }) {
  return (
    <span
      title={title ?? STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: STATUS_DOT[status] ?? '#c8cfd8' }}
    />
  )
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="rounded bg-[#eef1f5] px-1.5 py-0.5 text-[10px] leading-4 text-ink-soft">
      {TYPE_LABELS[type as keyof typeof TYPE_LABELS] ?? type}
    </span>
  )
}

/** 判断 due 是否已逾期 / 是今天 */
export function dueState(due: string | null): 'none' | 'overdue' | 'today' | 'future' {
  if (!due) return 'none'
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (due < today) return 'overdue'
  if (due === today) return 'today'
  return 'future'
}

export function DueBadge({ due }: { due: string | null }) {
  const state = dueState(due)
  if (state === 'none') return null
  const styles =
    state === 'overdue'
      ? 'bg-red-50 text-red-600'
      : state === 'today'
        ? 'bg-[#4a6fa5]/10 text-accent'
        : 'bg-[#eef1f5] text-ink-soft'
  const label = state === 'overdue' ? `逾期 ${due}` : state === 'today' ? '今天' : due
  return <span className={cx('rounded px-1.5 py-0.5 text-[10px] leading-4', styles)}>{label}</span>
}

export function CardItem({
  card,
  onOpen,
  onToggleDone,
  draggable,
  compact,
  selected,
  onSelect,
  showCheckbox,
}: {
  card: CardWithRelations
  onOpen?: () => void
  onToggleDone?: () => void
  draggable?: boolean
  compact?: boolean
  selected?: boolean
  onSelect?: () => void
  showCheckbox?: boolean
}) {
  return (
    <div
      onClick={onOpen}
      className={cx(
        'card-shadow group rounded-[var(--radius-card)] border border-line bg-white p-2.5 transition-colors',
        onOpen && 'cursor-pointer hover:border-accent-soft',
        selected && 'border-accent ring-1 ring-accent',
        draggable && 'active:cursor-grabbing',
      )}
    >
      <div className="flex items-start gap-2">
        {(showCheckbox || card.type === 'todo') && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleDone?.()
            }}
            className={cx(
              'focus-ring mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border text-[10px] transition-colors',
              card.status === 'done'
                ? 'border-[#5b8c85] bg-[#5b8c85] text-white'
                : 'border-slate-300 text-transparent hover:border-accent',
            )}
            aria-label={card.status === 'done' ? '标记未完成' : '标记完成'}
          >
            ✓
          </button>
        )}
        {showCheckbox && onSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onSelect}
            onClick={(e) => e.stopPropagation()}
            className="focus-ring mt-0.5 h-4 w-4 shrink-0 accent-[#4a6fa5]"
          />
        )}
        <div className="min-w-0 flex-1">
          <div
            className={cx(
              'text-sm leading-snug',
              card.status === 'done' ? 'text-slate-400 line-through' : 'text-ink',
            )}
          >
            <HighlightedContent content={card.content} />
          </div>

          {!compact && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusDot status={card.status} />
              <TypeBadge type={card.type} />
              <DueBadge due={card.due_date} />
              {card.tags.map((t) => (
                <span
                  key={t.id}
                  className="rounded-full px-1.5 py-0.5 text-[10px] leading-4"
                  style={{ backgroundColor: `${t.color ?? '#4a6fa5'}22`, color: t.color ?? '#4a6fa5' }}
                >
                  #{t.name}
                </span>
              ))}
              {card.links.length > 0 && (
                <span className="text-[10px] text-slate-400">↗ {card.links.length}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
