const path = require("node:path");
const { PROJECT_ROOT } = require("../config");
const { createFileStore } = require("./file-store");
const { createPostgresStore } = require("./postgres-store");
const { schemaName } = require("../database/schema");
function createConfiguredStore() {
  const mode = process.env.TOMATOES_STORAGE || "files";
  if (mode === "postgres") return createPostgresStore();
  if (mode !== "files")
    throw new Error("TOMATOES_STORAGE must be files or postgres.");
  return createFileStore(
    process.env.TOMATOES_DATA_DIR || path.join(PROJECT_ROOT, ".tomatoes-data"),
  );
}
module.exports = {
  createFileStore,
  createPostgresStore,
  createConfiguredStore,
  schemaName,
};
