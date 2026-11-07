CREATE TABLE IF NOT EXISTS browser_home_spend (
  account_id TEXT PRIMARY KEY REFERENCES browser_accounts(account_id) ON DELETE CASCADE,
  report_date TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  total_spend REAL,
  overall_spend REAL,
  standard_spend REAL,
  universal_spend REAL,
  brand_spend REAL
);

CREATE TABLE IF NOT EXISTS browser_board_reads (
  account_id TEXT NOT NULL REFERENCES browser_accounts(account_id) ON DELETE CASCADE,
  board TEXT NOT NULL CHECK(board IN ('overall','universal')),
  captured_at TEXT NOT NULL,
  plan_count INTEGER,
  PRIMARY KEY(account_id,board)
);

CREATE TABLE IF NOT EXISTS browser_plan_sources (
  plan_id TEXT PRIMARY KEY REFERENCES browser_plans(plan_id) ON DELETE CASCADE,
  board TEXT NOT NULL CHECK(board IN ('overall','universal')),
  product_mode TEXT,
  captured_at TEXT NOT NULL
);
