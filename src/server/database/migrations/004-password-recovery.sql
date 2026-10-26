ALTER TABLE __SCHEMA__.users ADD COLUMN IF NOT EXISTS reset_hash text;
ALTER TABLE __SCHEMA__.users ADD COLUMN IF NOT EXISTS reset_expires bigint;
CREATE UNIQUE INDEX IF NOT EXISTS users_unique_email ON __SCHEMA__.users (lower(email)) WHERE email <> '';
INSERT INTO __SCHEMA__.schema_migrations (version) VALUES (4) ON CONFLICT DO NOTHING;
