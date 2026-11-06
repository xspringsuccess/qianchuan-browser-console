PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO settings VALUES ('execution', '{"mode":"read_only","paused":false}');
CREATE TABLE IF NOT EXISTS browser_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  target_scope TEXT NOT NULL CHECK(target_scope IN ('account','plan')),
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('increase_budget','enable','disable')),
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS browser_actions (
  id TEXT PRIMARY KEY,
  rule_id TEXT,
  state TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
