ALTER TABLE __SCHEMA__.users ADD COLUMN IF NOT EXISTS memberships jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(memberships) = 'array');
INSERT INTO __SCHEMA__.schema_migrations(version) VALUES(11) ON CONFLICT DO NOTHING;
