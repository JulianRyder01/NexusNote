/** SQLite 连接与初始化（使用 Node 内置 node:sqlite，规避原生编译） */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { DEFAULT_PRIORITIES, SCHEMA_SQL } from './schema'
import { DEFAULT_PRIORITIES_COLORS } from './seed'

let db: DatabaseSync | null = null

/** 解析数据库文件路径：相对路径以仓库根为基准 */
function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH ?? 'data/aplusnexus.db'
  if (isAbsolute(configured)) return configured
  const ws = process.env.APLUSNEXUS_WORKSPACE ?? process.cwd()
  return resolve(ws, configured)
}

export function getDb(): DatabaseSync {
  if (db) return db

  const path = resolveDbPath()
  mkdirSync(dirname(path), { recursive: true })

  db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA_SQL)

  migrate(db)
  seedPriorities(db)
  return db
}

/**
 * 轻量迁移：`CREATE TABLE IF NOT EXISTS` 不会给已存在的表补列，
 * 因此这里显式补齐后来新增的列（幂等，可重复执行）。
 */
function migrate(database: DatabaseSync): void {
  const cols = new Set(
    (database.prepare('PRAGMA table_info(cards)').all() as { name: string }[]).map((c) => c.name),
  )
  if (!cols.has('start_date')) database.exec('ALTER TABLE cards ADD COLUMN start_date DATE')
  if (!cols.has('importance')) database.exec('ALTER TABLE cards ADD COLUMN importance INTEGER')
  database.exec('CREATE INDEX IF NOT EXISTS idx_cards_start_date ON cards(start_date)')
}

/** 首次启动写入默认优先级列（已存在则不重复） */
function seedPriorities(database: DatabaseSync): void {
  const row = database.prepare('SELECT COUNT(*) AS c FROM priorities').get() as { c: number }
  if (row.c > 0) return

  const insert = database.prepare(
    'INSERT INTO priorities (id, name, color, sort, is_default) VALUES (?, ?, ?, ?, 1)',
  )
  for (const p of DEFAULT_PRIORITIES) {
    const id = `prio_${p.name.toLowerCase()}`
    insert.run(id, p.name, p.color ?? DEFAULT_PRIORITIES_COLORS[p.name] ?? null, p.sort)
  }
}

/** 事务包装 */
export function transaction<T>(fn: () => T): T {
  const database = getDb()
  database.exec('BEGIN')
  try {
    const result = fn()
    database.exec('COMMIT')
    return result
  } catch (err) {
    database.exec('ROLLBACK')
    throw err
  }
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
