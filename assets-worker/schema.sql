CREATE TABLE IF NOT EXISTS status (
  file       TEXT PRIMARY KEY,
  status     INTEGER NOT NULL DEFAULT 0,   -- 0 not started, 1 working, 2 delivered
  updated_at INTEGER
);
