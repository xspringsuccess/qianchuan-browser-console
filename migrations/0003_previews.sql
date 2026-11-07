CREATE TABLE IF NOT EXISTS browser_previews (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  rule_updated_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending_review','cancelled')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS browser_previews_rule_idx ON browser_previews(rule_id,created_at);
