CREATE TABLE IF NOT EXISTS __SCHEMA__.auth_sessions (
  key text PRIMARY KEY,
  username text NOT NULL REFERENCES __SCHEMA__.users(username) ON DELETE CASCADE,
  record jsonb NOT NULL,
  expires bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_username_idx ON __SCHEMA__.auth_sessions(username);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON __SCHEMA__.auth_sessions(expires);
CREATE TABLE IF NOT EXISTS __SCHEMA__.auth_attempts (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_expires_idx ON __SCHEMA__.auth_attempts(expires);
ALTER TABLE __SCHEMA__.evidence ADD COLUMN IF NOT EXISTS content bytea;
INSERT INTO __SCHEMA__.schema_migrations (version) VALUES (5) ON CONFLICT DO NOTHING;
