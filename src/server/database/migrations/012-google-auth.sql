ALTER TABLE __SCHEMA__.users ADD COLUMN IF NOT EXISTS google_auth jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON __SCHEMA__.users((google_auth->>'sub')) WHERE google_auth->>'sub' IS NOT NULL;
CREATE TABLE IF NOT EXISTS __SCHEMA__.auth_challenges (key text PRIMARY KEY,record jsonb NOT NULL,expires bigint NOT NULL);
CREATE INDEX IF NOT EXISTS auth_challenges_expires_idx ON __SCHEMA__.auth_challenges(expires);
INSERT INTO __SCHEMA__.schema_migrations(version) VALUES(12) ON CONFLICT DO NOTHING;
