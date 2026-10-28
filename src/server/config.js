const fs = require("node:fs");
const path = require("node:path");
const PROJECT_ROOT = path.resolve(__dirname, "../..");
function loadLocalEnvironment({ root = PROJECT_ROOT } = {}) {
  if (process.env.VERCEL === "1") return;
  const names =
    process.env.NODE_ENV === "production"
      ? [".env.production"]
      : [".env.local", ".env"];
  for (const name of names) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) process.loadEnvFile(file);
  }
}
function databaseConfig({
  env = process.env,
  readFile = fs.readFileSync,
} = {}) {
  const configError = (message) => {
    throw Object.assign(new Error(message), { code: "TOMATOES_CONFIG" });
  };
  const production = env.NODE_ENV === "production";
  if (
    production &&
    ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"].some((key) => !env[key])
  )
    configError(
      "Set PGHOST, PGDATABASE, PGUSER, and PGPASSWORD in the production environment.",
    );
  const mode = env.PGSSLMODE || (production ? "verify-full" : "disable");
  if (!["disable", "verify-full"].includes(mode))
    configError("Use PGSSLMODE=verify-full or disable.");
  if (production && mode === "disable")
    configError(
      "Production database connections require PGSSLMODE=verify-full.",
    );
  let ssl = false;
  if (mode === "verify-full") {
    ssl = { rejectUnauthorized: true };
    if (env.PGSSLROOTCERT_PEM) {
      ssl.ca = env.PGSSLROOTCERT_PEM.replace(/\\n/g, "\n");
    } else if (env.PGSSLROOTCERT_BASE64) {
      ssl.ca = Buffer.from(env.PGSSLROOTCERT_BASE64, "base64").toString("utf8");
    } else if (env.PGSSLROOTCERT) {
      try {
        ssl.ca = readFile(
          path.resolve(PROJECT_ROOT, env.PGSSLROOTCERT),
          "utf8",
        );
      } catch {
        configError(
          "Could not read PGSSLROOTCERT. Download the database CA certificate and set its file path.",
        );
      }
    }
  }
  return {
    host: env.PGHOST || "127.0.0.1",
    port: Number(env.PGPORT || 5432),
    database: env.PGDATABASE || "tomatoes",
    user: env.PGUSER || "postgres",
    password: env.PGPASSWORD,
    ssl,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 20000,
    application_name: "tomatoes",
  };
}

module.exports = {
  PROJECT_ROOT,
  loadLocalEnvironment,
  databaseConfig,
};
