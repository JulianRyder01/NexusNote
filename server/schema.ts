/** AplusNexus 数据库 Schema（SQLite） */

export const SCHEMA_VERSION = 1

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

-- 卡片
CREATE TABLE IF NOT EXISTS cards (
  id          TEXT PRIMARY KEY,
  content     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'note',
  priority    TEXT,
  status      TEXT DEFAULT 'todo',
  due_date    DATE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  archived    INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cards_type       ON cards(type);
CREATE INDEX IF NOT EXISTS idx_cards_priority   ON cards(priority);
CREATE INDEX IF NOT EXISTS idx_cards_status     ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_archived   ON cards(archived);
CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON cards(updated_at);
CREATE INDEX IF NOT EXISTS idx_cards_due_date   ON cards(due_date);

-- 标签
CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  color       TEXT,
  description TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- 卡片-标签 多对多
CREATE TABLE IF NOT EXISTS card_tags (
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (card_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_card_tags_tag ON card_tags(tag_id);

-- 显式链接 卡片-卡片
CREATE TABLE IF NOT EXISTS card_links (
  from_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  to_id   TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_card_links_to ON card_links(to_id);

-- 优先级列
CREATE TABLE IF NOT EXISTS priorities (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT,
  sort       INTEGER NOT NULL,
  is_default INTEGER DEFAULT 0
);

-- 标签共现边
CREATE TABLE IF NOT EXISTS tag_edges (
  tag_a  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  tag_b  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  weight INTEGER DEFAULT 1,
  PRIMARY KEY (tag_a, tag_b)
);

-- 会话
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`

/** 默认优先级列（首次启动种子数据） */
export const DEFAULT_PRIORITIES: { name: string; color: string; sort: number }[] = [
  { name: 'P0', color: '#a5614a', sort: 0 },
  { name: 'P1', color: '#a5754a', sort: 1 },
  { name: 'P2', color: '#6b8cbd', sort: 2 },
  { name: 'P3', color: '#5b8c85', sort: 3 },
]
