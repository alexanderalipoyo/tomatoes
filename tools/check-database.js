const { Client } = require("pg");
const { loadLocalEnvironment } = require("../config");

async function checkDatabase({ ClientType = Client, config = {} } = {}) {
  const client = new ClientType({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "tomatoes",
    user: process.env.PGUSER || "postgres",
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    application_name: "tomatoes-connection-check",
    ...config,
    options: "-c default_transaction_read_only=on",
  });
  try {
    await client.connect();
    const result = await client.query(
      "SELECT current_database() AS database, current_user AS username, current_setting('server_version') AS version",
    );
    return result.rows[0];
  } finally {
    await client.end().catch(() => {});
  }
}
function errorMessage(error) {
  if (error.code === "3D000")
    return "The configured database does not exist. Check PGDATABASE in .env.local.";
  if (
    error.code === "28P01" ||
    error.code === "28000" ||
    /password|SASL/i.test(error.message || "")
  )
    return "PostgreSQL requires valid credentials. Set PGUSER and PGPASSWORD in .env.local, then retry.";
  if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"].includes(error.code))
    return "Could not reach PostgreSQL. Check PGHOST, PGPORT, and the PostgreSQL service.";
  return "Database check failed. Verify the local connection settings and database access.";
}
async function main() {
  loadLocalEnvironment();
  const result = await checkDatabase();
  console.log(
    `Connected to database "${result.database}" as "${result.username}" (PostgreSQL ${result.version}).`,
  );
  console.log("Read-only check completed. No tables or data were changed.");
}
if (require.main === module)
  main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
module.exports = { checkDatabase, errorMessage };
