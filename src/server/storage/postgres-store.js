const UserManagement = require("../user-management");
const Projects = require("../../shared/project-management");
const { Pool } = require("pg");
const { databaseConfig } = require("../config");
const { schemaName, migrateSchema } = require("../database/schema");
function createPostgresStore({
  pool = new Pool(databaseConfig()),
  schema = "tomatoes",
} = {}) {
  const ns = schemaName(schema);
  // Idle connection errors are handled without exposing connection credentials.
  pool.on?.("error", () =>
    console.error("A PostgreSQL connection was interrupted."),
  );
  async function transaction(action) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  const insertRun = async (
    client,
    record,
    report,
    originalText,
    overwrite = true,
  ) =>
    client.query(
      `INSERT INTO ${ns}.runs(id,project,received_at,record,report,original_text) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6) ON CONFLICT(id) ${overwrite ? `DO UPDATE SET project=EXCLUDED.project,received_at=EXCLUDED.received_at,record=EXCLUDED.record || jsonb_build_object('archivedAt', ${ns}.runs.record->'archivedAt'),report=EXCLUDED.report,original_text=EXCLUDED.original_text` : "DO NOTHING"}`,
      [
        record.id,
        record.metadata.project,
        record.receivedAt,
        JSON.stringify(record),
        JSON.stringify(report),
        originalText,
      ],
    );
  const insertUser = (client, user, skip = false) =>
    client.query(
      `INSERT INTO ${ns}.users(username,role,projects,salt,password_hash,full_name,email,disabled,organization_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ${skip ? "ON CONFLICT(username) DO NOTHING" : ""}`,
      [
        user.username,
        user.role,
        user.projects,
        user.salt,
        user.hash,
        user.fullName || "",
        user.email || "",
        Boolean(user.disabled),
        user.organizationId || UserManagement.ORGANIZATION_ID,
      ],
    );
  const insertToken = (client, token, skip = false) =>
    client.query(
      `INSERT INTO ${ns}.ci_tokens(hash,project,created_at) VALUES($1,$2,$3) ${skip ? "ON CONFLICT(hash) DO NOTHING" : ""}`,
      [token.hash, token.project, token.createdAt],
    );
  async function projectRows(client) {
    const registered = await client.query(
      `SELECT id,name,organization_id AS "organizationId",created_at AS "createdAt",updated_at AS "updatedAt" FROM ${ns}.projects`,
    );
    const discovered = await client.query(
      `SELECT DISTINCT project FROM ${ns}.runs`,
    );
    const assigned = await client.query(
      `SELECT DISTINCT unnest(projects) AS project FROM ${ns}.users WHERE organization_id=$1`,
      [UserManagement.ORGANIZATION_ID],
    );
    return Projects.merge(
      registered.rows.map((row) => ({
        ...row,
        createdAt: Number(row.createdAt),
        updatedAt: Number(row.updatedAt),
      })),
      [...discovered.rows, ...assigned.rows].map((row) => ({
        metadata: { project: row.project },
      })),
    );
  }
  return {
    kind: "postgres",
    async getOrganization(id = "default") {
      return (
        (
          await pool.query(
            `SELECT id,name,created_at AS "createdAt" FROM ${ns}.organizations WHERE id=$1`,
            [id],
          )
        ).rows[0] || null
      );
    },
    async saveOrganization(id, name, creating = false) {
      const clock = Date.now();
      const sql = creating
        ? `INSERT INTO ${ns}.organizations(id,name,created_at,updated_at) VALUES($1,$2,$3,$3) RETURNING id,name`
        : `UPDATE ${ns}.organizations SET name=$2,updated_at=$3 WHERE id=$1 RETURNING id,name`;
      return (await pool.query(sql, [id, name, clock])).rows[0] || null;
    },
    async getProject(id) {
      return (
        (await projectRows(pool)).find((project) => project.id === id) || null
      );
    },
    async listProjects(scopes = ["*"], organizationId = "default") {
      return (await projectRows(pool))
        .filter(
          (project) =>
            (project.organizationId || "default") === organizationId &&
            (scopes.includes("*") || scopes.includes(project.id)),
        )
        .map((project) => ({
          ...project,
          organizationId: project.organizationId || "default",
        }));
    },
    async manageProject(
      body,
      id,
      clock = Date.now(),
      organizationId = "default",
    ) {
      return transaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          "tomatoes-projects:" + schema,
        ]);
        const next = Projects.changeInOrganization(
          await projectRows(client),
          body,
          id,
          clock,
          organizationId,
        );
        await client.query(
          `INSERT INTO ${ns}.projects(id,name,created_at,updated_at,organization_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,updated_at=EXCLUDED.updated_at`,
          [
            next.id,
            next.name,
            next.createdAt,
            next.updatedAt,
            next.organizationId,
          ],
        );
        return next;
      });
    },
    pool,
    schema,
    transaction,
    async ready() {
      try {
        const result = await pool.query(
          `SELECT version FROM ${ns}.schema_migrations WHERE version=8`,
        );
        if (!result.rows.length) throw new Error("missing");
      } catch (error) {
        if (
          error.code === "42P01" ||
          error.code === "3F000" ||
          error.message === "missing"
        )
          throw Object.assign(
            new Error(
              "PostgreSQL tables are not initialized. Run npm run db:migrate.",
            ),
            { code: "TOMATOES_SCHEMA" },
          );
        throw error;
      }
    },
    async migrate() {
      await transaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          "tomatoes-schema:" + schema,
        ]);
        await migrateSchema(client, schema);
      });
    },
    async getPreferences(owner) {
      const result = await pool.query(
        `SELECT preferences FROM ${ns}.user_preferences WHERE owner=$1`,
        [owner],
      );
      return result.rows[0]?.preferences || null;
    },
    async savePreferences(owner, patch, initializeOnly = false) {
      const result = await pool.query(
        `INSERT INTO ${ns}.user_preferences(owner,preferences) VALUES($1,$2::jsonb) ON CONFLICT(owner) DO UPDATE SET preferences=${ns}.user_preferences.preferences || EXCLUDED.preferences, updated_at=now() WHERE NOT $3::boolean RETURNING preferences`,
        [owner, JSON.stringify(patch), initializeOnly],
      );
      return result.rows[0]?.preferences || (await this.getPreferences(owner));
    },
    async getUsers() {
      return (
        await pool.query(
          `SELECT username,role,projects,salt,password_hash AS hash,full_name AS "fullName",email,disabled,organization_id AS "organizationId",reset_hash AS "resetHash",reset_expires AS "resetExpires" FROM ${ns}.users`,
        )
      ).rows;
    },
    async manageUser(username, mutate) {
      return transaction(async (client) => {
        await client.query(
          `LOCK TABLE ${ns}.users IN SHARE ROW EXCLUSIVE MODE`,
        );
        const users = (
          await client.query(
            `SELECT username,role,projects,salt,password_hash AS hash,full_name AS "fullName",email,disabled,organization_id AS "organizationId",reset_hash AS "resetHash",reset_expires AS "resetExpires" FROM ${ns}.users`,
          )
        ).rows;
        const next = mutate(users);
        await client.query(
          `INSERT INTO ${ns}.users(username,role,projects,salt,password_hash,full_name,email,disabled,reset_hash,reset_expires,organization_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(username) DO UPDATE SET role=EXCLUDED.role,projects=EXCLUDED.projects,full_name=EXCLUDED.full_name,email=EXCLUDED.email,disabled=EXCLUDED.disabled,salt=EXCLUDED.salt,password_hash=EXCLUDED.password_hash,reset_hash=EXCLUDED.reset_hash,reset_expires=EXCLUDED.reset_expires,organization_id=EXCLUDED.organization_id`,
          [
            username,
            next.role,
            next.projects,
            next.salt,
            next.hash,
            next.fullName || "",
            next.email || "",
            Boolean(next.disabled),
            next.resetHash || null,
            next.resetExpires || null,
            next.organizationId || UserManagement.ORGANIZATION_ID,
          ],
        );
        return next;
      });
    },
    async getTokens() {
      return (
        await pool.query(
          `SELECT hash,project,created_at AS "createdAt" FROM ${ns}.ci_tokens`,
        )
      ).rows;
    },
    async addUser(user) {
      try {
        await insertUser(pool, user);
      } catch (error) {
        if (error.code === "23505")
          throw new Error("This username already exists.");
        throw error;
      }
    },
    async addToken(token) {
      await insertToken(pool, token);
    },
    async setRunArchived(id, projects, archivedAt) {
      const result = await pool.query(
        `UPDATE ${ns}.runs SET record=jsonb_set(record,'{archivedAt}',$3::jsonb) WHERE id=$1 AND ($2::text[] IS NULL OR project=ANY($2::text[])) RETURNING record`,
        [
          id,
          !projects || projects.includes("*") ? null : projects,
          JSON.stringify(archivedAt),
        ],
      );
      return result.rows[0]?.record || null;
    },
    async listRuns(projects, project) {
      return (
        await pool.query(
          `SELECT record FROM ${ns}.runs WHERE ($1::text[] IS NULL OR project=ANY($1::text[])) AND ($2::text IS NULL OR project=$2) ORDER BY received_at DESC`,
          [
            !projects || projects.includes("*") ? null : projects,
            project || null,
          ],
        )
      ).rows.map((row) => row.record);
    },
    async getRunSource(id, projects) {
      const result = await pool.query(
        `SELECT record, original_text FROM ${ns}.runs WHERE id=$1 AND ($2::text[] IS NULL OR project=ANY($2::text[]))`,
        [id, !projects || projects.includes("*") ? null : projects],
      );
      const row = result.rows[0];
      return row
        ? { record: row.record, originalText: row.original_text }
        : null;
    },
    async getRunSourceChunk(id, projects, offset, length) {
      const result = await pool.query(
        `SELECT octet_length(original_text) AS total, substring(convert_to(original_text, 'UTF8') FROM $3::int FOR $4::int) AS bytes FROM ${ns}.runs WHERE id=$1 AND ($2::text[] IS NULL OR project=ANY($2::text[]))`,
        [
          id,
          !projects || projects.includes("*") ? null : projects,
          offset + 1,
          length,
        ],
      );
      const row = result.rows[0];
      return row ? { totalBytes: row.total, bytes: row.bytes } : null;
    },
    async getRun(id, projects) {
      const result = await pool.query(
        `SELECT record,report,original_text FROM ${ns}.runs WHERE id=$1 AND ($2::text[] IS NULL OR project=ANY($2::text[]))`,
        [id, !projects || projects.includes("*") ? null : projects],
      );
      const row = result.rows[0];
      return row
        ? {
            record: row.record,
            report: row.report,
            originalText: row.original_text,
          }
        : null;
    },
    async saveRun(record, report, originalText = JSON.stringify(report)) {
      await insertRun(pool, record, report, originalText);
    },
    async listEvidence(runId) {
      return (
        await pool.query(`SELECT record FROM ${ns}.evidence WHERE run_id=$1`, [
          runId,
        ])
      ).rows.map((row) => row.record);
    },
    async getSession(key) {
      return (
        (
          await pool.query(
            `SELECT record FROM ${ns}.auth_sessions WHERE key=$1`,
            [key],
          )
        ).rows[0]?.record || null
      );
    },
    async setSession(key, record, clock) {
      await pool.query(`DELETE FROM ${ns}.auth_sessions WHERE expires <= $1`, [
        clock,
      ]);
      await pool.query(
        `INSERT INTO ${ns}.auth_sessions(key,username,record,expires) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(key) DO UPDATE SET record=EXCLUDED.record,expires=EXCLUDED.expires`,
        [key, record.username, JSON.stringify(record), record.expires],
      );
    },
    async deleteSession(key) {
      await pool.query(`DELETE FROM ${ns}.auth_sessions WHERE key=$1`, [key]);
    },
    async revokeSessions(username) {
      await pool.query(`DELETE FROM ${ns}.auth_sessions WHERE username=$1`, [
        username,
      ]);
    },
    async clearAuthAttempt(key) {
      await pool.query(`DELETE FROM ${ns}.auth_attempts WHERE key=$1`, [key]);
    },
    async consumeAuthAttempt(key, limit, duration, clock) {
      await pool.query(`DELETE FROM ${ns}.auth_attempts WHERE expires <= $1`, [
        clock,
      ]);
      const row = (
        await pool.query(
          `INSERT INTO ${ns}.auth_attempts(key,count,expires) VALUES($1,1,$3) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ${ns}.auth_attempts.expires <= $2 THEN 1 ELSE LEAST(${ns}.auth_attempts.count+1,$4+1) END,expires=CASE WHEN ${ns}.auth_attempts.expires <= $2 THEN $3 ELSE ${ns}.auth_attempts.expires END RETURNING count`,
          [key, clock, clock + duration, limit],
        )
      ).rows[0];
      return row.count <= limit;
    },
    async getEvidenceContent(id) {
      return (
        (
          await pool.query(`SELECT content FROM ${ns}.evidence WHERE id=$1`, [
            id,
          ])
        ).rows[0]?.content || null
      );
    },
    async saveEvidence(record, bytes = null) {
      await pool.query(
        `INSERT INTO ${ns}.evidence(id,run_id,record,content) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(id) DO UPDATE SET record=EXCLUDED.record,content=COALESCE(EXCLUDED.content,${ns}.evidence.content)`,
        [record.id, record.runId, JSON.stringify(record), bytes],
      );
    },
    async importSnapshot({
      runs = [],
      users = [],
      tokens = [],
      evidence = [],
    }) {
      return transaction(async (client) => {
        let imported = 0;
        for (const item of runs)
          imported += (
            await insertRun(
              client,
              item.record,
              item.report,
              item.originalText,
              false,
            )
          ).rowCount;
        for (const user of users) await insertUser(client, user, true);
        for (const token of tokens) await insertToken(client, token, true);
        for (const record of evidence)
          await client.query(
            `INSERT INTO ${ns}.evidence(id,run_id,record) VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO NOTHING`,
            [record.id, record.runId, JSON.stringify(record)],
          );
        return {
          imported,
          skipped: runs.length - imported,
          users: users.length,
          tokens: tokens.length,
          attachments: evidence.length,
        };
      });
    },
    close: () => pool.end(),
  };
}

module.exports = { createPostgresStore };
