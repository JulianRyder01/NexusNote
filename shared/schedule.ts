/**
 * 排期与推荐算法（前后端共用唯一真源）。
 *
 * 概念：
 *   紧急度 urgency  —— 由 due_date 相对「今天」自动推导，不由人工填写
 *   象限 quadrant    —— 艾森豪威尔矩阵：紧急度 × 重要性
 *   推荐得分 score   —— 六个因素加权求和，用于「建议最先处理」
 */
import { shiftISODate, todayISO } from './date'
import { parseISODateLocal } from './date'
import type { Quadrant, ScoreBreakdown, Urgency } from './types'

/** 判定紧急度：逾期 / 今天 / 3 天内 / 更远 / 无期限 */
export function deriveUrgency(dueDate: string | null, today: string = todayISO()): Urgency {
  if (!dueDate) return 'none'
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  if (dueDate <= shiftISODate(today, 3)) return 'soon'
  return 'later'
}

/** 紧急度是否算「紧急」：逾期 / 今天 / 3 天内 */
export function isUrgent(u: Urgency): boolean {
  return u === 'overdue' || u === 'today' || u === 'soon'
}

/**
 * 推导象限。
 * 重要性优先取显式 importance（>=2 视为重要）；未设置时回退到优先级 P0/P1。
 */
export function deriveQuadrant(
  input: { due_date: string | null; importance: number | null; priorityName?: string | null },
  today: string = todayISO(),
): Quadrant {
  const urgent = isUrgent(deriveUrgency(input.due_date, today))
  const important = input.importance !== null
    ? input.importance >= 2
    : input.priorityName
      ? /^P0$/i.test(input.priorityName) || /^P1$/i.test(input.priorityName)
      : false

  if (urgent && important) return 'urgent-important'
  if (urgent) return 'urgent-unimportant'
  if (important) return 'not-urgent-important'
  return 'not-urgent-unimportant'
}

/** 推荐打分所需的输入（结构化，便于前端复用与解释） */
export interface ScoreInput {
  due_date: string | null
  importance: number | null
  /** 优先级序号：0=P0 最高；null 表示未进看板 */
  priorityRank: number | null
  status: string
  updated_at: string
  /** 被 [[引用]] 的次数 */
  inDegree: number
}

/** 单个因素的得分明细，用于在 UI 上解释「为什么推荐」 */
export interface ScoreResult {
  score: number
  breakdown: ScoreBreakdown[]
}

/** 各因素权重（分值和越大越该先做） */
export const SCORE_WEIGHTS = {
  due: 40,
  priority: 20,
  importance: 15,
  status: 12,
  staleness: 8,
  inDegree: 5,
} as const

function daysBetween(fromISO: string, toISO: string): number {
  const a = parseISODateLocal(fromISO).getTime()
  const b = parseISODateLocal(toISO).getTime()
  return Math.round((b - a) / 86_400_000)
}

/**
 * 计算推荐得分（0~100 区间附近）。
 * 每个因素都产出可读的理由，供「智能推荐」面板解释排序依据。
 */
export function scoreCard(input: ScoreInput, today: string = todayISO()): ScoreResult {
  const breakdown: ScoreBreakdown[] = []

  // 1) due 临近与逾期（权重最高，最硬的信号）
  {
    let s = 0
    let reason = '无截止日期'
    if (input.due_date) {
      const diff = daysBetween(today, input.due_date) // 正数=未来
      if (diff < 0) {
        s = SCORE_WEIGHTS.due
        reason = `已逾期 ${-diff} 天`
      } else if (diff === 0) {
        s = SCORE_WEIGHTS.due * 0.9
        reason = '今天到期'
      } else if (diff <= 3) {
        s = SCORE_WEIGHTS.due * 0.7
        reason = `${diff} 天后到期`
      } else if (diff <= 7) {
        s = SCORE_WEIGHTS.due * 0.4
        reason = `${diff} 天后到期`
      } else {
        s = SCORE_WEIGHTS.due * 0.1
        reason = `${diff} 天后到期`
      }
    }
    breakdown.push({ label: '截止日期', score: s, reason })
  }

  // 2) 优先级（看板列，越靠前越高）
  {
    let s = 0
    let reason = '未进看板'
    if (input.priorityRank !== null) {
      const rank = Math.max(0, Math.min(input.priorityRank, 3))
      s = SCORE_WEIGHTS.priority * (1 - rank / 4)
      reason = `优先级第 ${rank + 1} 列`
    }
    breakdown.push({ label: '优先级', score: s, reason })
  }

  // 3) 重要性
  {
    const imp = input.importance ?? 0
    const s = SCORE_WEIGHTS.importance * (imp / 3)
    breakdown.push({
      label: '重要性',
      score: s,
      reason: imp > 0 ? `重要度 ${imp}/3` : '未设置重要性',
    })
  }

  // 4) 状态：进行中优先（已在手上），其次待办；已完成/搁置不推进
  {
    let s = 0
    let reason = '待办'
    if (input.status === 'in_progress') {
      s = SCORE_WEIGHTS.status
      reason = '进行中，宜收尾'
    } else if (input.status === 'todo') {
      s = SCORE_WEIGHTS.status * 0.6
      reason = '待办'
    } else if (input.status === 'done') {
      s = 0
      reason = '已完成'
    } else if (input.status === 'someday') {
      s = 0
      reason = '已搁置'
    }
    breakdown.push({ label: '状态', score: s, reason })
  }

  // 5) 陈旧度：越久没动越该被看见（对已完成/搁置不加分）
  {
    let s = 0
    let reason = '最近有更新'
    if (input.status !== 'done' && input.status !== 'someday') {
      const staleDays = -daysBetween(input.updated_at.slice(0, 10), today)
      if (staleDays >= 14) {
        s = SCORE_WEIGHTS.staleness
        reason = `已 ${staleDays} 天未更新`
      } else if (staleDays >= 7) {
        s = SCORE_WEIGHTS.staleness * 0.6
        reason = `已 ${staleDays} 天未更新`
      } else if (staleDays >= 3) {
        s = SCORE_WEIGHTS.staleness * 0.3
        reason = `${staleDays} 天未更新`
      }
    }
    breakdown.push({ label: '陈旧度', score: s, reason })
  }

  // 6) 被引用次数：说明它是其他事项的前置
  {
    const n = Math.max(0, input.inDegree)
    const s = SCORE_WEIGHTS.inDegree * Math.min(1, n / 3)
    breakdown.push({
      label: '被引用',
      score: s,
      reason: n > 0 ? `被引用 ${n} 次` : '未被引用',
    })
  }

  const score = breakdown.reduce((sum, b) => sum + b.score, 0)
  return { score, breakdown }
}

/** 已完成的卡片不参与推荐 */
export function isActionable(status: string): boolean {
  return status !== 'done'
}
