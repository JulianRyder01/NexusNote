/**
 * 图谱视图：标签-卡片力导向网络
 *
 * 布局由 d3-force 计算，视图用 SVG 自绘（缩放 / 平移 / 拖拽 / 聚焦）。
 * 节点：标签（大圆，取标签色，权重=使用次数）、卡片（小圆，按类型着色）
 * 边：tag-tag（共现，越粗越密）、card-tag（归属）、card-card（显式链接）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import type { CardType, CardWithRelations } from '@shared/types'
import { TYPE_LABELS } from '@shared/types'
import { api } from '../api/client'
import type { GraphEdge, GraphPayload } from '../api/client'
import { useStore } from '../store'
import { Button, cx, EmptyState, Spinner } from '../components/ui'
import { CardItem } from '../components/CardItem'

interface GNode extends SimulationNodeDatum {
  id: string
  kind: 'tag' | 'card'
  label: string
  color: string | null
  type?: CardType
  weight: number
}

interface GLink extends SimulationLinkDatum<GNode> {
  id: string
  kind: GraphEdge['kind']
  weight: number
}

const EDGE_STYLE: Record<GraphEdge['kind'], { stroke: string; opacity: number; dash?: string }> = {
  'tag-tag': { stroke: '#7ba0cf', opacity: 0.5 },
  'card-tag': { stroke: '#9fb2c6', opacity: 0.14 },
  'card-card': { stroke: '#c08fb4', opacity: 0.75, dash: '4 3' },
}

const CARD_TYPE_COLORS: Record<CardType, string> = {
  todo: '#4a6fa5',
  idea: '#a5754a',
  note: '#5b8c85',
  link: '#8c5b7d',
}

const DAY_OPTIONS = [
  { value: 0, label: '全部时间' },
  { value: 7, label: '最近 7 天' },
  { value: 30, label: '最近 30 天' },
  { value: 90, label: '最近 90 天' },
]

function nodeRadius(n: GNode): number {
  return n.kind === 'tag' ? 7 + Math.min(10, Math.sqrt(n.weight) * 3.2) : 3.4
}

function endId(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'object') {
    const id = (v as { id?: unknown }).id
    return typeof id === 'string' ? id : ''
  }
  return String(v)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function GraphView() {
  const openCardById = useStore((s) => s.openCardById)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const simRef = useRef<Simulation<GNode, GLink> | null>(null)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [graph, setGraph] = useState<{ nodes: GNode[]; links: GLink[] } | null>(null)
  const [, setTick] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<CardType | ''>('')
  const [filterDays, setFilterDays] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [sideTag, setSideTag] = useState<string | null>(null)
  const [sideCards, setSideCards] = useState<CardWithRelations[]>([])
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 })

  // 视图变换放进 ref，供 pointer 事件闭包读取最新值
  const viewRef = useRef(view)
  viewRef.current = view

  // 容器尺寸
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 拉取图谱数据
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api
      .graph({ type: filterType || undefined, days: filterDays || undefined })
      .then((data: GraphPayload) => {
        if (!alive) return
        const nodes: GNode[] = data.nodes.map((n) => ({
          id: n.id,
          kind: n.kind,
          label: n.label,
          color: n.color,
          type: n.type,
          weight: n.weight,
        }))
        const links: GLink[] = data.edges.map((e, i) => ({
          id: `e${i}`,
          source: e.source,
          target: e.target,
          kind: e.kind,
          weight: e.weight,
        }))
        setGraph({ nodes, links })
        setTruncated(data.truncated)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : '加载图谱失败')
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [filterType, filterDays])

  // 力导向布局
  useEffect(() => {
    if (!graph || size.w === 0 || size.h === 0) return
    const { nodes, links } = graph

    // 初始位置：以中心为原点做圆环散布，避免全部叠在一点
    const cx = size.w / 2
    const cy = size.h / 2
    nodes.forEach((n, i) => {
      if (n.x === undefined) {
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2
        const radius = 40 + (i % 7) * 26
        n.x = cx + Math.cos(angle) * radius
        n.y = cy + Math.sin(angle) * radius
      }
    })

    const sim = forceSimulation<GNode>(nodes)
      .force(
        'link',
        forceLink<GNode, GLink>(links)
          .id((d) => d.id)
          .distance((l) => (l.kind === 'tag-tag' ? 72 : 42))
          .strength((l) => (l.kind === 'card-tag' ? 0.35 : 0.85)),
      )
      .force(
        'charge',
        forceManyBody<GNode>().strength((d) => (d.kind === 'tag' ? -220 : -55)),
      )
      .force('center', forceCenter(cx, cy))
      .force('collide', forceCollide<GNode>().radius((d) => nodeRadius(d) + 3))

    let frame: number | null = null
    sim.on('tick', () => {
      // 每帧最多触发一次重渲染；注意只自增计数器，不能改 graph 引用，
      // 否则本 effect 会因 graph 变化而重建 simulation，形成死循环。
      if (frame !== null) return
      frame = requestAnimationFrame(() => {
        frame = null
        setTick((t) => (t + 1) % 1_000_000)
      })
    })

    simRef.current = sim
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      sim.stop()
      simRef.current = null
    }
  }, [graph, size.w, size.h])

  // 滚轮缩放（以指针为锚点）；用原生监听以便 preventDefault
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const rect = svg!.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const v = viewRef.current
      const k2 = clamp(v.k * Math.exp(-e.deltaY * 0.0015), 0.2, 3)
      setView({
        k: k2,
        tx: mx - (mx - v.tx) * (k2 / v.k),
        ty: my - (my - v.ty) * (k2 / v.k),
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  // 选中标签 → 拉取该标签下的卡片列表
  useEffect(() => {
    if (!sideTag) {
      setSideCards([])
      return
    }
    let alive = true
    api
      .listCards({ tag: sideTag, limit: 100 })
      .then((r) => {
        if (alive) setSideCards(r.cards)
      })
      .catch(() => {
        /* 侧栏加载失败不阻断图谱 */
      })
    return () => {
      alive = false
    }
  }, [sideTag])

  // 选中标签的邻接高亮集合
  const highlight = useMemo(() => {
    if (!selected || !graph) return null
    const set = new Set<string>([selected])
    for (const e of graph.links) {
      if (e.kind !== 'card-tag') continue
      const a = endId(e.source)
      const b = endId(e.target)
      if (a === selected) set.add(b)
      if (b === selected) set.add(a)
    }
    return set
  }, [selected, graph])

  const tagCount = graph?.nodes.filter((n) => n.kind === 'tag').length ?? 0
  const cardCount = graph?.nodes.filter((n) => n.kind === 'card').length ?? 0

  function onNodeClick(n: GNode) {
    if (n.kind === 'tag') {
      setSelected(n.id)
      setSideTag(n.label)
    } else {
      setSelected(null)
      setSideTag(null)
      void openCardById(n.id)
    }
  }

  function onNodeDoubleClick(n: GNode) {
    const sim = simRef.current
    if (!sim) return
    // 聚焦：把该节点钉到视图中心并重新布局，短暂后释放
    n.fx = size.w / 2
    n.fy = size.h / 2
    sim.alpha(0.9).restart()
    window.setTimeout(() => {
      n.fx = null
      n.fy = null
    }, 900)
    setView({ k: 1, tx: 0, ty: 0 })
  }

  function startDrag(e: ReactPointerEvent<SVGGElement>, n: GNode) {
    e.stopPropagation()
    const sim = simRef.current
    if (!sim) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    sim.alphaTarget(0.25).restart()
    n.fx = n.x
    n.fy = n.y

    const move = (ev: PointerEvent) => {
      const v = viewRef.current
      n.fx = (ev.clientX - rect.left - v.tx) / v.k
      n.fy = (ev.clientY - rect.top - v.ty) / v.k
    }
    const up = () => {
      sim.alphaTarget(0)
      n.fx = null
      n.fy = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startPan(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return
    const start = {
      x: e.clientX,
      y: e.clientY,
      tx: viewRef.current.tx,
      ty: viewRef.current.ty,
    }
    let moved = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true
      setView((v) => ({ ...v, tx: start.tx + dx, ty: start.ty + dy }))
    }
    const up = () => {
      // 未发生位移视为点击空白 → 清除选中
      if (!moved) {
        setSelected(null)
        setSideTag(null)
      }
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="flex h-full flex-col">
      {/* 过滤栏 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as CardType | '')}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
        >
          <option value="">全部类型</option>
          <option value="todo">只看 todo</option>
          <option value="idea">只看 idea</option>
          <option value="note">只看 note</option>
          <option value="link">只看 link</option>
        </select>
        <select
          value={filterDays}
          onChange={(e) => setFilterDays(Number(e.target.value))}
          className="focus-ring h-8 rounded-[6px] border border-line bg-white px-2 text-xs"
        >
          {DAY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            simRef.current?.alpha(0.9).restart()
          }}
        >
          重排布局
        </Button>
        {selected && (
          <Button size="sm" variant="ghost" onClick={() => { setSelected(null); setSideTag(null) }}>
            取消聚焦
          </Button>
        )}
        <span className="ml-auto text-xs text-slate-400">
          标签 {tagCount} · 卡片 {cardCount}
          {truncated && ' （已按上限截断）'}
        </span>
      </div>

      {/* 画布 */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-[8px] border border-[#22303f] bg-[#16202c]"
      >
        {loading && (
          <div className="absolute left-3 top-3 z-10">
            <Spinner label="加载图谱…" />
          </div>
        )}
        {error && (
          <div className="absolute left-3 top-3 z-10 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
            {error}
          </div>
        )}
        {!loading && !error && graph && graph.nodes.length === 0 && (
          <EmptyState title="还没有可连接的节点" hint="写几张带 #标签 的卡片，网络就会生长。" />
        )}

        {graph && graph.nodes.length > 0 && (
          <svg
            ref={svgRef}
            width={size.w}
            height={size.h}
            className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
            onPointerDown={startPan}
          >
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
              {/* 边 */}
              <g>
                {graph.links.map((l) => {
                  const s = l.source as GNode
                  const t = l.target as GNode
                  if (typeof s !== 'object' || typeof t !== 'object') return null
                  const style = EDGE_STYLE[l.kind]
                  const dim = highlight ? !(highlight.has(s.id) && highlight.has(t.id)) : false
                  const width =
                    l.kind === 'tag-tag'
                      ? Math.max(0.8, Math.log(l.weight + 1) * 1.3)
                      : l.kind === 'card-card'
                        ? 1.4
                        : 0.7
                  return (
                    <line
                      key={l.id}
                      x1={s.x ?? 0}
                      y1={s.y ?? 0}
                      x2={t.x ?? 0}
                      y2={t.y ?? 0}
                      stroke={style.stroke}
                      strokeWidth={width}
                      strokeDasharray={style.dash}
                      opacity={dim ? style.opacity * 0.18 : style.opacity}
                    />
                  )
                })}
              </g>

              {/* 节点 */}
              <g>
                {graph.nodes.map((n) => {
                  const r = nodeRadius(n)
                  const x = n.x ?? 0
                  const y = n.y ?? 0
                  const dim = highlight ? !highlight.has(n.id) : false
                  const isTag = n.kind === 'tag'
                  const color = isTag
                    ? (n.color ?? '#6b8cbd')
                    : CARD_TYPE_COLORS[n.type ?? 'note']
                  const active = selected === n.id
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${x} ${y})`}
                      className="cursor-pointer"
                      opacity={dim ? 0.2 : 1}
                      onPointerDown={(e) => startDrag(e, n)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onNodeClick(n)
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        onNodeDoubleClick(n)
                      }}
                    >
                      <title>{isTag ? `#${n.label}（${n.weight} 张卡片）` : n.label}</title>
                      {isTag && <circle r={r + 5} fill={color} opacity={0.14} />}
                      {isTag && <circle r={r + 2} fill={color} opacity={0.22} />}
                      <circle
                        r={r}
                        fill={color}
                        stroke={active ? '#ffffff' : 'rgba(255,255,255,0.35)'}
                        strokeWidth={active ? 2 : 1}
                      />
                      {isTag && (
                        <text
                          y={r + 12}
                          textAnchor="middle"
                          fontSize={11}
                          fill="#dbe3ec"
                          className="select-none"
                          style={{ pointerEvents: 'none' }}
                        >
                          {n.label}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            </g>

            {/* 图例 */}
            <g transform={`translate(12 ${Math.max(12, size.h - 96)})`}>
              {(['todo', 'idea', 'note', 'link'] as CardType[]).map((t, i) => (
                <g key={t} transform={`translate(0 ${i * 16})`}>
                  <circle r={4} cx={4} cy={0} fill={CARD_TYPE_COLORS[t]} />
                  <text x={14} y={4} fontSize={10} fill="#9fb2c6">
                    {TYPE_LABELS[t]}
                  </text>
                </g>
              ))}
              <g transform="translate(0 68)">
                <circle r={6} cx={4} cy={0} fill="#7ba0cf" opacity={0.5} />
                <text x={16} y={4} fontSize={10} fill="#9fb2c6">
                  标签（越大越常用）
                </text>
              </g>
            </g>
          </svg>
        )}

        {/* 选中标签的卡片列表 */}
        {sideTag && (
          <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-xs flex-col border-l border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-accent">#{sideTag}</div>
                <div className="text-[11px] text-slate-400">{sideCards.length} 张卡片</div>
              </div>
              <button
                onClick={() => {
                  setSelected(null)
                  setSideTag(null)
                }}
                className="focus-ring rounded px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-ink"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <div className={cx('min-h-0 flex-1 space-y-2 overflow-y-auto p-2')}>
              {sideCards.map((c) => (
                <CardItem
                  key={c.id}
                  card={c}
                  compact
                  onOpen={() => void openCardById(c.id)}
                />
              ))}
              {sideCards.length === 0 && (
                <div className="py-6 text-center text-xs text-slate-400">该标签下暂无卡片</div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
