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
async function migrateInitialSchema(client, schema) {
  await client.query(initialSQL.replaceAll("__SCHEMA__", schemaName(schema)));
}
module.exports = { schemaName, migrateInitialSchema };
