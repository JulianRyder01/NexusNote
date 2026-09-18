/** 尚未实现的视图占位 */
export function PlaceholderView({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <div className="text-base font-medium text-ink">{title}</div>
      {note && <div className="max-w-sm text-xs leading-relaxed text-slate-400">{note}</div>}
    </div>
  )
}
