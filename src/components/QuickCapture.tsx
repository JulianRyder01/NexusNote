/** 快速捕获：永远在顶部的输入框，提交后不清空 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseInput, stripSyntaxGlue } from '@shared/parser'
import { TYPE_LABELS } from '@shared/types'
import { useStore } from '../store'
import { Button, cx } from './ui'

export function QuickCapture({ autoFocusKey }: { autoFocusKey?: number }) {
  const priorities = useStore((s) => s.priorities)
  const createCard = useStore((s) => s.createCard)

  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  // N 键聚焦
  useEffect(() => {
    if (autoFocusKey !== undefined && autoFocusKey > 0) ref.current?.focus()
  }, [autoFocusKey])

  const priorityNames = useMemo(() => priorities.map((p) => p.name), [priorities])

  const parsed = useMemo(
    () => (value.trim() ? parseInput(value, priorityNames) : null),
    [value, priorityNames],
  )

  const matchedPriority = useMemo(() => {
    if (!parsed?.priorityName) return null
    return priorities.find((p) => p.name === parsed.priorityName) ?? null
  }, [parsed, priorities])

  async function submit() {
    if (!value.trim() || busy) return
    const p = parseInput(value, priorityNames)
    setBusy(true)
    const created = await createCard({
      content: p.content.trim(),
      type: p.type,
      priority: matchedPriority?.id ?? null,
      status: p.done ? 'done' : undefined,
      due_date: p.dueDate,
    })
    setBusy(false)
    if (created) {
      // 刻意不清空输入框，方便连续记录
      setFlash(
        `已添加 · ${TYPE_LABELS[p.type]}${matchedPriority ? ` · ${matchedPriority.name}` : ''}`,
      )
      window.setTimeout(() => setFlash(null), 2200)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
    if (e.key === 'Escape') {
      setValue('')
      ref.current?.blur()
    }
  }

  const hintPriority = parsed?.priorityName
  const preview = parsed ? stripSyntaxGlue(parsed.content, priorityNames) : ''

  return (
    <div className="relative">
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="写点什么…  [ ] todo  ? 问题  ! 灵感  http 链接   #标签  [[链接]]  P0  @明天"
          className="focus-ring max-h-40 min-h-9 flex-1 resize-none rounded-[6px] border border-line bg-white px-3 py-2 text-sm leading-snug text-ink placeholder:text-slate-400"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`
          }}
        />
        <Button variant="primary" onClick={() => void submit()} disabled={!value.trim() || busy}>
          {busy ? '…' : '记录'}
        </Button>
      </div>

      {/* 解析预览 */}
      {parsed && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span className="rounded bg-[#eef1f5] px-1.5 py-0.5">{TYPE_LABELS[parsed.type]}</span>
          {hintPriority && (
            <span
              className="rounded px-1.5 py-0.5"
              style={{
                backgroundColor: `${matchedPriority?.color ?? '#4a6fa5'}22`,
                color: matchedPriority?.color ?? '#4a6fa5',
              }}
            >
              {hintPriority}
            </span>
          )}
          {parsed.dueDate && (
            <span className="rounded bg-[#5b8c85]/10 px-1.5 py-0.5 text-[#5b8c85]">
              @{parsed.dueDate}
            </span>
          )}
          {parsed.tags.map((t) => (
            <span key={t} className="text-accent">
              #{t}
            </span>
          ))}
          {parsed.links.map((l) => (
            <span key={l} className="text-[#7d5b8c]">
              [[{l}]]
            </span>
          ))}
          {preview && preview !== parsed.content.trim() && (
            <span className="text-slate-400">· 将保存为「{preview}」</span>
          )}
          <span className="ml-auto hidden text-slate-400 sm:inline">Ctrl/⌘ + Enter 提交</span>
        </div>
      )}

      {flash && (
        <div
          className={cx(
            'absolute -bottom-1 right-0 translate-y-full rounded bg-[#5b8c85] px-2 py-1 text-[11px] text-white shadow',
          )}
        >
          {flash}
        </div>
      )}
    </div>
  )
}
