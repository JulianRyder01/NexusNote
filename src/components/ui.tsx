/** 基础 UI 原子组件 */
import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
}

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-[#3f6091] disabled:bg-slate-300',
  ghost: 'bg-transparent text-ink-soft hover:bg-[#eef1f5]',
  subtle: 'bg-[#eef1f5] text-ink hover:bg-[#e4e9f0]',
  danger: 'bg-transparent text-red-600 hover:bg-red-50',
}

export function Button({ variant = 'subtle', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        'focus-ring inline-flex select-none items-center justify-center gap-1.5 rounded-[6px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        BUTTON_STYLES[variant],
        className,
      )}
    />
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        {...rest}
        ref={ref}
        className={cx(
          'focus-ring h-9 w-full rounded-[6px] border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400',
          className,
        )}
      />
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        {...rest}
        ref={ref}
        className={cx(
          'focus-ring w-full resize-none rounded-[6px] border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-400',
          className,
        )}
      />
    )
  },
)

export function Select({
  className,
  children,
  ...rest
}: InputHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...(rest as object)}
      className={cx(
        'focus-ring h-9 rounded-[6px] border border-line bg-white px-2 text-sm text-ink',
        className,
      )}
    >
      {children}
    </select>
  )
}

export function Chip({
  children,
  color,
  onClick,
  active,
  title,
}: {
  children: ReactNode
  color?: string | null
  onClick?: () => void
  active?: boolean
  title?: string
}) {
  return (
    <span
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-5',
        onClick && 'cursor-pointer hover:opacity-80',
        active ? 'ring-1 ring-accent' : '',
      )}
      style={{
        backgroundColor: color ? `${color}22` : '#eef1f5',
        color: color ?? '#46586e',
      }}
    >
      {children}
    </span>
  )
}

export function Modal({
  open,
  onClose,
  children,
  title,
  wide,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1e2b3a]/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cx(
          'card-shadow relative w-full rounded-[8px] bg-white',
          wide ? 'max-w-3xl' : 'max-w-xl',
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="text-sm font-semibold">{title}</div>
            <button
              onClick={onClose}
              className="focus-ring rounded px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-ink"
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-accent" />
      {label}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-16 text-center">
      <div className="text-sm text-slate-500">{title}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  )
}
