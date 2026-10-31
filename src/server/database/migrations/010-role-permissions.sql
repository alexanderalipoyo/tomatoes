ALTER TABLE __SCHEMA__.organizations ADD COLUMN IF NOT EXISTS role_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE __SCHEMA__.organizations ADD COLUMN IF NOT EXISTS permissions_revision integer NOT NULL DEFAULT 0;
INSERT INTO __SCHEMA__.schema_migrations(version) VALUES(10) ON CONFLICT DO NOTHING;
