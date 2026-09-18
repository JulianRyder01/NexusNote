/** AplusNexus 共享数据类型定义（前后端唯一真源） */

/** 卡片类型 */
export type CardType = 'todo' | 'idea' | 'note' | 'link'

/** todo 卡片状态 */
export type CardStatus = 'todo' | 'in_progress' | 'done' | 'someday'

export interface Card {
  id: string
  /** 原始内容，含 #标签 与 [[链接]] 语法 */
  content: string
  type: CardType
  /** 优先级 ID；null 表示不进看板 */
  priority: string | null
  status: CardStatus
  /** ISO 日期 YYYY-MM-DD，或 null */
  due_date: string | null
  created_at: string
  updated_at: string
  archived: 0 | 1
}

export interface Tag {
  id: string
  name: string
  color: string | null
  description: string | null
  created_at: string
  /** 使用次数（由 card_tags 聚合得出） */
  count?: number
}

export interface Priority {
  id: string
  name: string
  color: string | null
  sort: number
  is_default: 0 | 1
}

/** 卡片-标签关联 */
export interface CardTag {
  card_id: string
  tag_id: string
}

/** 卡片显式链接 */
export interface CardLink {
  from_id: string
  to_id: string
}

/** 标签共现边 */
export interface TagEdge {
  tag_a: string
  tag_b: string
  weight: number
}

/** 会话 */
export interface Session {
  token: string
  created_at: string
  expires_at: string
  user_agent: string | null
  ip: string | null
}

/** 快速输入的解析结果 */
export interface ParsedInput {
  /** 去掉起始语法标记后的正文 */
  content: string
  /** 原始内容（未剥离前缀） */
  raw: string
  type: CardType
  /** 识别到的优先级名，如 P0；未识别为 null */
  priorityName: string | null
  /** 标签名列表（不含 #） */
  tags: string[]
  /** 显式链接目标（[[...]] 内的文本） */
  links: string[]
  /** due date，ISO YYYY-MM-DD 或 null */
  dueDate: string | null
}

/** 组合返回：卡片附带标签与链接 */
export interface CardWithRelations extends Card {
  tags: Tag[]
  links: { id: string; content: string }[]
}

export const CARD_TYPES: CardType[] = ['todo', 'idea', 'note', 'link']
export const CARD_STATUSES: CardStatus[] = ['todo', 'in_progress', 'done', 'someday']

/** 状态中文标签 */
export const STATUS_LABELS: Record<CardStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  someday: '搁置',
}

/** 类型中文标签 */
export const TYPE_LABELS: Record<CardType, string> = {
  todo: '待办',
  idea: '想法',
  note: '笔记',
  link: '链接',
}

/** 12 色柔和调色板，用于自动分配标签/优先级颜色 */
export const SOFT_PALETTE = [
  '#4a6fa5',
  '#5b8c85',
  '#a5754a',
  '#8c5b7d',
  '#6b8cbd',
  '#7d8c5b',
  '#a5614a',
  '#5b6b8c',
  '#4a8ca5',
  '#8c7d5b',
  '#7d5b8c',
  '#5b8ca5',
] as const

/** 由字符串稳定地取一个调色板颜色 */
export function colorFromString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % SOFT_PALETTE.length
  return SOFT_PALETTE[idx] ?? SOFT_PALETTE[0]
}
