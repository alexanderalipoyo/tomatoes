CREATE TABLE IF NOT EXISTS __SCHEMA__.organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
INSERT INTO __SCHEMA__.organizations(id,name,created_at,updated_at)
VALUES('default','Tomatoes organization',0,0) ON CONFLICT DO NOTHING;
INSERT INTO __SCHEMA__.organizations(id,name,created_at,updated_at)
SELECT DISTINCT organization_id,organization_id,0,0 FROM __SCHEMA__.users ON CONFLICT DO NOTHING;
ALTER TABLE __SCHEMA__.projects ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'default';
ALTER TABLE __SCHEMA__.projects ADD CONSTRAINT projects_organization_fk FOREIGN KEY(organization_id) REFERENCES __SCHEMA__.organizations(id);
ALTER TABLE __SCHEMA__.users ADD CONSTRAINT users_organization_fk FOREIGN KEY(organization_id) REFERENCES __SCHEMA__.organizations(id);
CREATE INDEX IF NOT EXISTS projects_organization_idx ON __SCHEMA__.projects(organization_id);
INSERT INTO __SCHEMA__.schema_migrations(version) VALUES(8) ON CONFLICT DO NOTHING;
