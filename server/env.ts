/**
 * .env 加载：必须在任何读取 process.env 的模块之前被 import。
 *
 * 使用 Node 内置的 process.loadEnvFile（Node 20.12+ / 21.7+），无需引入 dotenv。
 * 仓库位于 /sdcard，而进程的 cwd 可能是运行镜像（/home/...），因此这里以
 * APLUSNEXUS_WORKSPACE（仓库根）为准定位 .env，回退到 cwd。
 */
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

/** 依次尝试工作区与 cwd 下的 .env；已存在的真实环境变量优先，不被覆盖 */
export function loadDotenv(): string | null {
  const candidates: string[] = []

  const ws = process.env.APLUSNEXUS_WORKSPACE
  if (ws && ws.trim() !== '') candidates.push(resolve(ws, '.env'))

  if (process.env.DOTENV_PATH) {
    const p = process.env.DOTENV_PATH
    candidates.push(isAbsolute(p) ? p : resolve(process.cwd(), p))
  }

  candidates.push(resolve(process.cwd(), '.env'))

  for (const file of candidates) {
    if (!existsSync(file)) continue
    try {
      // loadEnvFile 不会覆盖已存在的环境变量，符合「显式 export 优先」的预期
      process.loadEnvFile(file)
      return file
    } catch (err) {
      console.warn(`[env] 解析 ${file} 失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return null
}

export const DOTENV_FILE = loadDotenv()
