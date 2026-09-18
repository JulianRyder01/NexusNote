/**
 * 视图与 URL hash 双向同步（#/kanban、#/graph …）。
 * 好处：刷新保持当前视图、可收藏/分享直达链接，也便于自动化截图验证。
 */
import { useEffect } from 'react'
import { useStore, type ViewKey } from '../store'

const VIEW_KEYS: ViewKey[] = [
  'kanban',
  'list',
  'gantt',
  'matrix',
  'graph',
  'tags',
  'review',
  'walk',
  'settings',
]

function readHash(): ViewKey | null {
  const h = window.location.hash.replace(/^#\/?/, '')
  return (VIEW_KEYS as string[]).includes(h) ? (h as ViewKey) : null
}

export function useViewHash(): void {
  const setView = useStore((s) => s.setView)

  // hash -> store（首次进入与浏览器前进/后退）
  useEffect(() => {
    function sync() {
      const v = readHash()
      if (v) useStore.getState().setView(v)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [setView])

  // store -> hash（点击导航或快捷键时更新地址，但不制造历史记录）
  useEffect(() => {
    return useStore.subscribe((state, prev) => {
      if (state.view === prev.view) return
      const target = `#/${state.view}`
      if (window.location.hash !== target) {
        window.history.replaceState(null, '', target)
      }
    })
  }, [])
}
