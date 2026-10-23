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
      `INSERT INTO ${ns}.runs(id,project,received_at,record,report,original_text) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6) ON CONFLICT(id) ${overwrite ? "DO UPDATE SET project=EXCLUDED.project,received_at=EXCLUDED.received_at,record=EXCLUDED.record,report=EXCLUDED.report,original_text=EXCLUDED.original_text" : "DO NOTHING"}`,
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
      `INSERT INTO ${ns}.users(username,role,projects,salt,password_hash) VALUES($1,$2,$3,$4,$5) ${skip ? "ON CONFLICT(username) DO NOTHING" : ""}`,
      [user.username, user.role, user.projects, user.salt, user.hash],
    );
  const insertToken = (client, token, skip = false) =>
    client.query(
      `INSERT INTO ${ns}.ci_tokens(hash,project,created_at) VALUES($1,$2,$3) ${skip ? "ON CONFLICT(hash) DO NOTHING" : ""}`,
      [token.hash, token.project, token.createdAt],
    );
  return {
    kind: "postgres",
    pool,
    schema,
    transaction,
    async ready() {
      try {
        const result = await pool.query(
          `SELECT version FROM ${ns}.schema_migrations WHERE version=2`,
        );
        if (!result.rows.length) throw new Error("missing");
      } catch (error) {
        if (
          error.code === "42P01" ||
          error.code === "3F000" ||
          error.message === "missing"
        )
          throw new Error(
            "PostgreSQL tables are not initialized. Run npm run db:migrate.",
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
          `SELECT username,role,projects,salt,password_hash AS hash FROM ${ns}.users`,
        )
      ).rows;
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
    async saveEvidence(record) {
      await pool.query(
        `INSERT INTO ${ns}.evidence(id,run_id,record) VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO UPDATE SET record=EXCLUDED.record`,
        [record.id, record.runId, JSON.stringify(record)],
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
