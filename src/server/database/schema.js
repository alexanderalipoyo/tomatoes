const fs = require("node:fs");
const path = require("node:path");
const initialSQL = fs.readFileSync(
  path.join(__dirname, "migrations", "001-initial.sql"),
  "utf8",
);
function schemaName(value) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value))
    throw new Error("Invalid database schema name.");
  return '"' + value + '"';
}
async function migrateSchema(client, schema) {
  const ns = schemaName(schema);
  await client.query(initialSQL.replaceAll("__SCHEMA__", ns));
  for (const [version, filename] of [
    [2, "002-user-preferences.sql"],
    [3, "003-user-management.sql"],
    [4, "004-password-recovery.sql"],
    [5, "005-hosted-runtime.sql"],
    [6, "006-projects.sql"],
  ]) {
    const applied = await client.query(
      `SELECT version FROM ${ns}.schema_migrations WHERE version=$1`,
      [version],
    );
    if (!applied.rows.length) {
      const sql = fs.readFileSync(
        path.join(__dirname, "migrations", filename),
        "utf8",
      );
      await client.query(sql.replaceAll("__SCHEMA__", ns));
    }
  }
}
module.exports = { schemaName, migrateSchema };
