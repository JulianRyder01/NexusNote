/** 登录页：单密码进入 */
import { useEffect, useRef, useState } from 'react'
import { APP_NAME, APP_VERSION } from '@shared/meta'
import { useStore } from '../store'
import { Button, Input } from './ui'

export function LoginPage() {
  const login = useStore((s) => s.login)
  const authError = useStore((s) => s.authError)
  const loading = useStore((s) => s.loading)
  const [password, setPassword] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    await login(password)
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="card-shadow w-full max-w-sm rounded-[8px] border border-line bg-white p-7"
      >
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{APP_NAME}</h1>
          <p className="mt-1 text-xs text-slate-400">v{APP_VERSION} · 个人卡片网络</p>
        </div>

        <label className="mb-1.5 block text-xs font-medium text-ink-soft">访问密码</label>
        <Input
          ref={ref}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入密码"
          autoComplete="current-password"
        />

        {authError && <div className="mt-2 text-xs text-red-600">{authError}</div>}

        <Button
          type="submit"
          variant="primary"
          className="mt-5 w-full"
          disabled={!password || loading}
        >
          {loading ? '验证中…' : '进入'}
        </Button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
          会话默认保持 30 天，设备无需重复登录。
        </p>
      </form>
    </div>
  )
}
