import { APP_NAME, APP_VERSION } from '@shared/meta'
import { useEffect, useState } from 'react'

export default function App() {
  const [serverStatus, setServerStatus] = useState<'checking' | 'ok' | 'down'>('checking')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(() => setServerStatus('ok'))
      .catch(() => setServerStatus('down'))
  }, [])

  const statusLabel = {
    checking: '检测中…',
    ok: '后端已连接',
    down: '后端未连接',
  }[serverStatus]

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{APP_NAME}</h1>
      <p className="text-sm text-nexus-accent">v{APP_VERSION} · 工程骨架</p>
      <p className="text-sm">
        后端状态：<span className="font-medium">{statusLabel}</span>
      </p>
      <p className="text-xs text-slate-500">
        源码位于仓库（/sdcard），依赖与构建运行于 /home 运行镜像。
      </p>
    </main>
  )
}
