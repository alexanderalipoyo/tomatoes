CREATE TABLE IF NOT EXISTS __SCHEMA__.user_preferences (
  owner text PRIMARY KEY,
  preferences jsonb NOT NULL CHECK (jsonb_typeof(preferences) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO __SCHEMA__.schema_migrations (version) VALUES (2) ON CONFLICT DO NOTHING;
