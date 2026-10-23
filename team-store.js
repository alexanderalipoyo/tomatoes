const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");
const { databaseConfig } = require("./config");
const { readJSON, writeJSON, writeText } = require("./json-store");
const allowed = (projects, project) =>
  !projects || projects.includes("*") || projects.includes(project);
function createFileStore(dataDir = path.join(__dirname, ".tomatoes-data")) {
  const file = (name) => path.join(dataDir, name + ".json");
  let queue = Promise.resolve();
  const serial = (action) => {
    const task = queue.catch(() => {}).then(action);
    queue = task;
    return task;
  };
  return {
    kind: "files",
    ready: async () => {},
    close: async () => {},
    getUsers: () => readJSON(file("users"), []),
    getTokens: () => readJSON(file("tokens"), []),
    async addUser(user) {
      return serial(async () => {
        const rows = await readJSON(file("users"), []);
        if (rows.some((row) => row.username === user.username))
          throw new Error("This username already exists.");
        await writeJSON(file("users"), [...rows, user]);
      });
    },
    async addToken(token) {
      return serial(async () => {
        const rows = await readJSON(file("tokens"), []);
        await writeJSON(file("tokens"), [...rows, token]);
      });
    },
    async listRuns(projects, project) {
      return (await readJSON(file("runs"), []))
        .filter(
          (row) =>
            allowed(projects, row.metadata.project) &&
            (!project || row.metadata.project === project),
        )
        .sort((a, b) => b.receivedAt - a.receivedAt);
    },
    async getRun(id, projects) {
      if (!/^[a-f0-9]{64}$/.test(id)) return null;
      const record = (await readJSON(file("runs"), [])).find(
        (row) => row.id === id && allowed(projects, row.metadata.project),
      );
      if (!record) return null;
      const originalText = await fs.readFile(
        path.join(dataDir, "reports", id + ".json"),
        "utf8",
      );
      return {
        record,
        report: JSON.parse(originalText.replace(/^\uFEFF/, "")),
        originalText,
      };
    },
    async saveRun(record, report, originalText = JSON.stringify(report)) {
      return serial(async () => {
        const rows = await readJSON(file("runs"), []);
        await writeText(
          path.join(dataDir, "reports", record.id + ".json"),
          originalText,
        );
        await writeJSON(file("runs"), [
          record,
          ...rows.filter((row) => row.id !== record.id),
        ]);
      });
    },
    async listEvidence(runId) {
      return (await readJSON(file("evidence"), [])).filter(
        (row) => row.runId === runId,
      );
    },
    async saveEvidence(record) {
      return serial(async () => {
        const rows = await readJSON(file("evidence"), []);
        await writeJSON(file("evidence"), [
          ...rows.filter((row) => row.id !== record.id),
          record,
        ]);
      });
    },
  };
}
function schemaName(value) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value))
    throw new Error("Invalid database schema name.");
  return '"' + value + '"';
}
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
          `SELECT version FROM ${ns}.schema_migrations WHERE version=1`,
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
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${ns}`);
        await client.query(
          `CREATE TABLE IF NOT EXISTS ${ns}.schema_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`,
        );
        await client.query(
          `CREATE TABLE IF NOT EXISTS ${ns}.runs(id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{64}$'),project text NOT NULL,received_at bigint NOT NULL,record jsonb NOT NULL,report jsonb NOT NULL,original_text text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`,
        );
        await client.query(
          `CREATE INDEX IF NOT EXISTS runs_project_received_idx ON ${ns}.runs(project,received_at DESC)`,
        );
        await client.query(
          `CREATE TABLE IF NOT EXISTS ${ns}.users(username text PRIMARY KEY,role text NOT NULL CHECK(role IN ('admin','editor','viewer')),projects text[] NOT NULL,salt text NOT NULL,password_hash text NOT NULL)`,
        );
        await client.query(
          `CREATE TABLE IF NOT EXISTS ${ns}.ci_tokens(hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),project text NOT NULL,created_at timestamptz NOT NULL)`,
        );
        await client.query(
          `CREATE TABLE IF NOT EXISTS ${ns}.evidence(id text PRIMARY KEY CHECK(id ~ '^[a-f0-9]{64}$'),run_id text NOT NULL REFERENCES ${ns}.runs(id),record jsonb NOT NULL)`,
        );
        await client.query(
          `CREATE INDEX IF NOT EXISTS evidence_run_idx ON ${ns}.evidence(run_id)`,
        );
        await client.query(
          `INSERT INTO ${ns}.schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING`,
        );
      });
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
function createConfiguredStore() {
  const mode = process.env.TOMATOES_STORAGE || "files";
  if (mode === "postgres") return createPostgresStore();
  if (mode !== "files")
    throw new Error("TOMATOES_STORAGE must be files or postgres.");
  return createFileStore(
    process.env.TOMATOES_DATA_DIR || path.join(__dirname, ".tomatoes-data"),
  );
}
module.exports = {
  createFileStore,
  createPostgresStore,
  createConfiguredStore,
  schemaName,
};
