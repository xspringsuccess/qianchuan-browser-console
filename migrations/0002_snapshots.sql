CREATE TABLE IF NOT EXISTS browser_accounts (
  account_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  budget REAL,
  spend REAL,
  net_roi REAL,
  progress REAL,
  delivery_status TEXT,
  captured_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS browser_plans (
  plan_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  budget REAL,
  spend REAL,
  net_roi REAL,
  progress REAL,
  status TEXT,
  budget_editable INTEGER NOT NULL DEFAULT 0,
  status_editable INTEGER NOT NULL DEFAULT 0,
  captured_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS browser_plans_account_idx ON browser_plans(account_id);
CREATE TABLE IF NOT EXISTS browser_rule_evaluations (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  target_scope TEXT NOT NULL,
  target_id TEXT NOT NULL,
  matched INTEGER NOT NULL,
  reason TEXT NOT NULL,
  proposed_action TEXT,
  created_at TEXT NOT NULL
);
