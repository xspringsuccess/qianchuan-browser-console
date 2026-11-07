CREATE TABLE IF NOT EXISTS browser_verified_account_metrics (
  account_id TEXT PRIMARY KEY REFERENCES browser_accounts(account_id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS browser_accounts_with_scope AS
SELECT a.*,
  CASE WHEN v.account_id IS NOT NULL THEN 'whole_account' ELSE 'unverified' END AS metrics_scope
FROM browser_accounts a
LEFT JOIN browser_verified_account_metrics v
  ON v.account_id = a.account_id AND v.captured_at = a.captured_at;
