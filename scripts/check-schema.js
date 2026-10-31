const { Client } = require("pg");
const {
  loadLocalEnvironment,
  databaseConfig,
} = require("../src/server/config");
const {
  schemaName,
  REQUIRED_MIGRATIONS,
} = require("../src/server/database/schema");
async function checkSchema({
  ClientType = Client,
  config = {},
  schema = "tomatoes",
} = {}) {
  const client = new ClientType({
    ...databaseConfig(),
    ...config,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    options: "-c default_transaction_read_only=on",
  });
  try {
    await client.connect();
    let applied = [];
    try {
      applied = (
        await client.query(
          `SELECT version FROM ${schemaName(schema)}.schema_migrations ORDER BY version`,
        )
      ).rows.map((row) => row.version);
    } catch (error) {
      if (!["42P01", "3F000"].includes(error.code)) throw error;
    }
    const missing = REQUIRED_MIGRATIONS.filter(
      (version) => !applied.includes(version),
    );
    return { applied, missing, ready: !missing.length };
  } finally {
    await client.end().catch(() => {});
  }
}
if (require.main === module) {
  loadLocalEnvironment();
  checkSchema()
    .then(({ missing, ready }) => {
      if (!ready) {
        console.error(
          `Database is missing migrations: ${missing.join(", ")}. Apply database migrations before deploying this build.`,
        );
        process.exitCode = 1;
      } else
        console.log(
          "Database schema is ready for this build. Read-only check; no data was changed.",
        );
    })
    .catch(() => {
      console.error(
        "Schema check failed. Verify database connectivity, TLS and permissions.",
      );
      process.exitCode = 1;
    });
}
module.exports = { checkSchema };
