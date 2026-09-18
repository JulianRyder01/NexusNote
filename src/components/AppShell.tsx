/** 应用外壳：顶栏（快速捕获+搜索）、左侧导航、主内容、底部状态栏 */
import { useMemo } from 'react'
import { APP_NAME, APP_VERSION } from '@shared/meta'
import { useStore, type ViewKey } from '../store'
import { cx, Spinner } from './ui'
import { QuickCapture } from './QuickCapture'
import { CardDetailModal } from './CardDetailModal'
import { KanbanView } from '../views/KanbanView'
import { ListView } from '../views/ListView'
import { GraphView } from '../views/GraphView'
import { PlaceholderView } from '../views/PlaceholderView'

const NAV: { key: ViewKey; label: string; icon: string; shortcut: string }[] = [
  { key: 'kanban', label: '看板', icon: '▦', shortcut: 'B' },
  { key: 'list', label: '列表', icon: '☰', shortcut: 'L' },
  { key: 'graph', label: '图谱', icon: '◉', shortcut: 'G' },
  { key: 'tags', label: '标签', icon: '#', shortcut: 'T' },
  { key: 'review', label: '回顾', icon: '☀', shortcut: 'R' },
  { key: 'walk', label: '漫游', icon: '⟳', shortcut: '' },
  { key: 'settings', label: '设置', icon: '⚙', shortcut: '' },
]

export function AppShell() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const stats = useStore((s) => s.stats)
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const logout = useStore((s) => s.logout)

  const main = useMemo(() => {
    switch (view) {
      case 'kanban':
        return <KanbanView />
      case 'list':
        return <ListView />
      case 'graph':
        return <GraphView />
      case 'tags':
        return <PlaceholderView title="标签管理" note="标签重命名/合并/颜色将在第二阶段实现。" />
      case 'review':
        return <PlaceholderView title="每日回顾" note="每日回顾将在第三阶段实现。" />
      case 'walk':
        return <PlaceholderView title="随机漫游" note="随机漫游将在第三阶段实现。" />
      case 'settings':
        return <PlaceholderView title="设置" note="设置页将在后续阶段实现。" />
      default:
        return null
    }
  }, [view])

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <header className="border-b border-line bg-white">
        <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
          <button
            onClick={() => setView('kanban')}
            className="focus-ring shrink-0 rounded px-1.5 py-1 text-sm font-semibold tracking-tight text-ink"
          >
            {APP_NAME}
          </button>
          <div className="min-w-0 flex-1">
            <QuickCapture />
          </div>
          <div className="relative hidden shrink-0 sm:block">
            <input
              value={filters.q}
              onChange={(e) => setFilters({ q: e.target.value })}
              placeholder="搜索…"
              className="focus-ring h-9 w-44 rounded-[6px] border border-line bg-white px-3 text-sm lg:w-56"
            />
          </div>
          <button
            onClick={() => void logout()}
            className="focus-ring hidden shrink-0 rounded-[6px] px-2 py-1 text-xs text-slate-400 hover:bg-[#f2f4f7] hover:text-ink sm:block"
            title="退出登录"
          >
            退出
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左侧导航 */}
        <nav className="hidden w-40 shrink-0 border-r border-line bg-white p-2 sm:block">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={cx(
                'focus-ring mb-0.5 flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-sm transition-colors',
                view === item.key
                  ? 'bg-[#eef1f5] font-medium text-ink'
                  : 'text-ink-soft hover:bg-[#f2f4f7]',
              )}
            >
              <span className="w-4 text-center text-xs opacity-70">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] text-slate-300">{item.shortcut}</span>
              )}
            </button>
          ))}
        </nav>

        {/* 主内容 */}
        <main className="min-w-0 flex-1 overflow-hidden">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
              {error}
            </div>
          )}
          <div className="h-full overflow-auto p-3 sm:p-4">
            {/* 加载态只在「尚无数据」时占据主区，避免每次刷新卸载视图（会导致搜索框失焦） */}
            {loading && <Spinner label="加载中…" />}
            {main}
          </div>
        </main>
      </div>

      {/* 移动端底部 Tab */}
      <nav className="flex shrink-0 border-t border-line bg-white sm:hidden">
        {NAV.slice(0, 5).map((item) => (
          <button
            key={item.key}
            onClick={() => setView(item.key)}
            className={cx(
              'focus-ring flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]',
              view === item.key ? 'text-accent' : 'text-slate-400',
            )}
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* 状态栏 */}
      <footer className="hidden items-center gap-4 border-t border-line bg-white px-4 py-1.5 text-[11px] text-slate-500 sm:flex">
        <span>卡片 {stats?.cards ?? '—'}</span>
        <span>标签 {stats?.tags ?? '—'}</span>
        <span>连接 {stats?.links ?? '—'}</span>
        <span>共现边 {stats?.edges ?? '—'}</span>
        <span>今日完成 {stats?.doneToday ?? '—'}</span>
        <span className="ml-auto text-slate-400">
          {APP_NAME} v{APP_VERSION}
        </span>
      </footer>

      <CardDetailModal />
    </div>
  )
}
