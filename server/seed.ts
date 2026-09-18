/** 种子数据与工具常量 */
import { colorFromString } from '@shared/types'

/** 默认优先级颜色（按名称取，缺失时由调色板哈希决定） */
export const DEFAULT_PRIORITIES_COLORS: Record<string, string> = {
  P0: colorFromString('P0'),
  P1: colorFromString('P1'),
  P2: colorFromString('P2'),
  P3: colorFromString('P3'),
}

/** 生成短 ID（nanoid 风格，URL 安全） */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-'

export function makeId(size = 12): string {
  const bytes = new Uint8Array(size)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < size; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return out
}

/** 当前时间的 ISO 字符串（UTC，秒精度） */
export function nowISO(): string {
  return new Date().toISOString()
}
