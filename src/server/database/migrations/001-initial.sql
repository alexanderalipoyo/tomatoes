CREATE SCHEMA IF NOT EXISTS __SCHEMA__;

CREATE TABLE IF NOT EXISTS __SCHEMA__.schema_migrations (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.runs (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  project text NOT NULL,
  received_at bigint NOT NULL,
  record jsonb NOT NULL,
  report jsonb NOT NULL,
  original_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_project_received_idx
  ON __SCHEMA__.runs (project, received_at DESC);

CREATE TABLE IF NOT EXISTS __SCHEMA__.users (
  username text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  projects text[] NOT NULL,
  salt text NOT NULL,
  password_hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.ci_tokens (
  hash text PRIMARY KEY CHECK (hash ~ '^[a-f0-9]{64}$'),
  project text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.evidence (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  run_id text NOT NULL REFERENCES __SCHEMA__.runs (id),
  record jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS evidence_run_idx
  ON __SCHEMA__.evidence (run_id);

INSERT INTO __SCHEMA__.schema_migrations (version)
VALUES (1)
ON CONFLICT DO NOTHING;
