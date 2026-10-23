const fs = require("node:fs");
const path = require("node:path");
function loadLocalEnvironment() {
  const file = path.join(__dirname, ".env.local");
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
function databaseConfig() {
  return {
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "tomatoes",
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 20000,
    application_name: "tomatoes",
  };
}
module.exports = { loadLocalEnvironment, databaseConfig };
