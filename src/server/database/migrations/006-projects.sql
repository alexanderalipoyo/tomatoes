CREATE TABLE IF NOT EXISTS __SCHEMA__.projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
INSERT INTO __SCHEMA__.schema_migrations(version) VALUES(6) ON CONFLICT DO NOTHING;
