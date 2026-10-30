ALTER TABLE __SCHEMA__.organizations ADD COLUMN IF NOT EXISTS logo text NOT NULL DEFAULT '' CHECK (length(logo) <= 100000);
INSERT INTO __SCHEMA__.schema_migrations(version) VALUES(9) ON CONFLICT DO NOTHING;
