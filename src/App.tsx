import { useEffect } from 'react'
import { useStore, type ViewKey } from './store'
import { AppShell } from './components/AppShell'
import { LoginPage } from './components/LoginPage'
import { Spinner } from './components/ui'

const VIEW_SHORTCUTS: Record<string, ViewKey> = {
  b: 'kanban',
  l: 'list',
  g: 'graph',
  t: 'tags',
  r: 'review',
}

export default function App() {
  const authed = useStore((s) => s.authed)
  const checkAuth = useStore((s) => s.checkAuth)
  const setView = useStore((s) => s.setView)
  const selectedCardId = useStore((s) => s.selectedCardId)
  const selectCard = useStore((s) => s.selectCard)

  useEffect(() => {
    void checkAuth()
  }, [checkAuth])

  // 快捷键：N 聚焦快速输入，B/L/G/T/R 切换视图，/ 聚焦搜索，Esc 关闭弹窗
  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null
      return (
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      )
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedCardId) {
        selectCard(null)
        // 继续往下（Esc 不参与打字保护）
      }
      if (isTyping(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const key = e.key.toLowerCase()
      if (key === 'n') {
        e.preventDefault()
        document.querySelector<HTMLTextAreaElement>('header textarea')?.focus()
        return
      }
      if (key === '/') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('input[placeholder="搜索…"]')?.focus()
        return
      }
      const v = VIEW_SHORTCUTS[key]
      if (v) {
        e.preventDefault()
        setView(v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setView, selectedCardId, selectCard])

  if (authed === null) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner label="正在检查会话…" />
      </div>
    )
  }

  if (!authed) return <LoginPage />

  return <AppShell />
}
