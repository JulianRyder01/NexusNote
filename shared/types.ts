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
  /** 开始日期 YYYY-MM-DD；null 表示无明确起点（甘特图退化为里程碑点） */
  start_date: string | null
  /** 截止日期 YYYY-MM-DD，或 null */
  due_date: string | null
  /** 重要性 1/2/3；null 表示未设置（矩阵纵轴） */
  importance: number | null
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
  /** 行首为 [x]/[X] 时为 true，表示已完成的 todo */
  done: boolean
  /** 识别到的优先级名，如 P0；未识别为 null */
  priorityName: string | null
  /** 标签名列表（不含 #） */
  tags: string[]
  /** 显式链接目标（[[...]] 内的文本） */
  links: string[]
  /** 开始日期，ISO YYYY-MM-DD 或 null（由 `@起~@止` 给出） */
  startDate: string | null
  /** due date，ISO YYYY-MM-DD 或 null */
  dueDate: string | null
  /** 重要性 1/2/3；由行内 `!`/`!!`/`!!!` 标记，未标记为 null */
  importance: number | null
}

/** 组合返回：卡片附带标签与链接 */
export interface CardWithRelations extends Card {
  tags: Tag[]
  links: { id: string; content: string }[]
}

/** 回顾区块中的卡片条目（精简，避免回顾页拉全量关系） */
export interface ReviewCard {
  id: string
  content: string
  type: CardType
  status: CardStatus
  due_date: string | null
  updated_at: string
  tags: string[]
}

/** 每日回顾：昨日回顾 + 今日总结 */
export interface DailyReview {
  /** 回顾所属日（昨日）与总结所属日（今日），均为本地 YYYY-MM-DD */
  yesterday: string
  today: string
  /** 昨日新增的卡片 */
  createdYesterday: ReviewCard[]
  /** 昨日完成的 todo（status=done 且 updated_at 落在昨日） */
  doneYesterday: ReviewCard[]
  /** 昨日活跃标签：{ name, color, count }，按出现次数降序 */
  activeTagsYesterday: { name: string; color: string | null; count: number }[]
  /** 温故：随机一张 7 天前或更早的旧卡片 */
  throwback: ReviewCard | null
  /** 今日新增 */
  createdToday: ReviewCard[]
  /** 今日完成 */
  doneToday: ReviewCard[]
  /** 今日最活跃标签 */
  activeTagsToday: { name: string; color: string | null; count: number }[]
  /** 明天 due 的卡片 */
  dueTomorrow: ReviewCard[]
}

/** 随机漫游返回：一张卡片 + 当前卡片上的标签（用于顺标签跳） */
export interface RandomWalkResult {
  card: ReviewCard | null
  /** 该卡片所属标签，可用于「顺着标签跳」的候选 */
  tags: Tag[]
}

/** 推荐打分的单个因素明细（用于解释排序依据） */
export interface ScoreBreakdown {
  label: string
  score: number
  reason: string
}

/** 排期条目：甘特图与矩阵视图的数据行（含服务端算好的衍生字段） */
export interface ScheduleItem {
  id: string
  content: string
  type: CardType
  status: CardStatus
  priority: string | null
  /** 优先级列名，如 P0；未进看板为 null */
  priorityName: string | null
  /** 看板列序号（0 起）；未进看板为 null */
  priorityRank: number | null
  start_date: string | null
  due_date: string | null
  importance: number | null
  tags: string[]
  updated_at: string
  created_at: string
  /** true 表示只有截止日、没有起始日（甘特图里画成里程碑菱形） */
  milestone: boolean
  /** 时间条绘制用的起止日（milestone 时等长） */
  barStart: string
  barEnd: string
  urgency: Urgency
  quadrant: Quadrant
  score: number
  breakdown: ScoreBreakdown[]
}

/** 排期接口整体返回 */
export interface SchedulePayload {
  today: string
  items: ScheduleItem[]
  /** 时间轴建议范围（已含余量） */
  range: { start: string; end: string }
}

export const CARD_TYPES: CardType[] = ['todo', 'idea', 'note', 'link']
export const CARD_STATUSES: CardStatus[] = ['todo', 'in_progress', 'done', 'someday']

/** 紧急度（由 due_date 相对今天自动推导） */
export type Urgency = 'overdue' | 'today' | 'soon' | 'later' | 'none'

/** 艾森豪威尔四象限 */
export type Quadrant = 'urgent-important' | 'urgent-unimportant' | 'not-urgent-important' | 'not-urgent-unimportant'

export const URGENCY_LABELS: Record<Urgency, string> = {
  overdue: '已逾期',
  today: '今天到期',
  soon: '3 天内',
  later: '更远',
  none: '无期限',
}

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  'urgent-important': '重要且紧急',
  'urgent-unimportant': '紧急不重要',
  'not-urgent-important': '重要不紧急',
  'not-urgent-unimportant': '不重要不紧急',
}

export const QUADRANT_HINTS: Record<Quadrant, string> = {
  'urgent-important': '立刻去做',
  'urgent-unimportant': '委托或尽快清掉',
  'not-urgent-important': '安排时间推进',
  'not-urgent-unimportant': '考虑删掉或归档',
}

export const QUADRANT_COLORS: Record<Quadrant, string> = {
  'urgent-important': '#a5614a',
  'urgent-unimportant': '#a5754a',
  'not-urgent-important': '#4a6fa5',
  'not-urgent-unimportant': '#8c98a6',
}

/** 重要性用词 */
export const IMPORTANCE_LABELS: Record<number, string> = {
  1: '低',
  2: '中',
  3: '高',
}

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
