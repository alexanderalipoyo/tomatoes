ALTER TABLE __SCHEMA__.users ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS users_organization_idx ON __SCHEMA__.users(organization_id);
INSERT INTO __SCHEMA__.schema_migrations(version) VALUES(7) ON CONFLICT DO NOTHING;
