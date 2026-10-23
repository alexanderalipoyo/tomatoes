const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const Features = require("../report-features");
const Investigations = require("../investigation-model");
const { loadLocalEnvironment } = require("../config");
const { createPostgresStore, createFileStore } = require("../team-store");
const ReportData = require("../report-data");
async function importFiles(store, dataDir) {
  const source = createFileStore(dataDir),
    records = await source.listRuns();
  const runs = [],
    evidence = [];
  for (const record of records) {
    if (!/^[a-f0-9]{64}$/.test(record.id))
      throw new Error("Invalid stored report identifier. Migration stopped.");
    const saved = await source.getRun(record.id);
    const report = ReportData.parseReportText(saved.originalText);
    for (const item of await source.listEvidence(record.id)) {
      if (
        !/^[a-f0-9]{64}$/.test(item.id) ||
        item.runId !== record.id ||
        typeof item.name !== "string" ||
        item.name.length > 180 ||
        !report.tests.some(
          (test) => Investigations.identity(test) === item.testKey,
        )
      )
        throw new Error("Invalid local attachment record. Migration stopped.");
      const bytes = await fs.readFile(
        path.join(dataDir, "attachments", item.id + ".bin"),
      );
      await Features.validateEvidence(new Blob([bytes], { type: item.type }));
      evidence.push({
        ...item,
        size: bytes.length,
        contentHash: crypto.createHash("sha256").update(bytes).digest("hex"),
      });
    }
    const metadata = ReportData.normalizeMetadata(record.metadata);
    if (!metadata.project)
      throw new Error("A stored report has no project. Migration stopped.");
    runs.push({
      record: {
        ...record,
        metadata,
        counts: report.counts,
        status: report.status,
        duration: report.duration,
        passRate: report.passRate,
        start: report.start,
        end: report.end,
      },
      report: saved.report,
      originalText: saved.originalText,
    });
  }
  const users = await source.getUsers(),
    tokens = await source.getTokens();
  for (const user of users)
    if (
      !/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(user.username) ||
      !["admin", "editor", "viewer"].includes(user.role) ||
      !Array.isArray(user.projects) ||
      !user.projects.length ||
      user.projects.some(
        (project) =>
          project !== "*" && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(project),
      ) ||
      !/^[a-f0-9]{32}$/.test(user.salt) ||
      !/^[a-f0-9]{128}$/.test(user.hash)
    )
      throw new Error("Invalid local account record. Migration stopped.");
  for (const token of tokens)
    if (
      !/^[a-f0-9]{64}$/.test(token.hash) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(token.project) ||
      !Number.isFinite(Date.parse(token.createdAt))
    )
      throw new Error("Invalid local CI token record. Migration stopped.");
  return store.importSnapshot({ runs, users, tokens, evidence });
}
async function main() {
  loadLocalEnvironment();
  const command = process.argv[2];
  if (!["migrate", "import-files"].includes(command))
    throw new Error("Usage: node tools/database.js migrate|import-files");
  const store = createPostgresStore();
  try {
    if (command === "migrate") {
      await store.migrate();
      console.log(
        "Tomatoes PostgreSQL tables are ready. Existing tables and reports were preserved.",
      );
    } else {
      await store.ready();
      const result = await importFiles(
        store,
        process.env.TOMATOES_DATA_DIR ||
          path.join(__dirname, "..", ".tomatoes-data"),
      );
      console.log(
        `Migrated ${result.imported} reports; ${result.skipped} already existed. Source files were preserved.`,
      );
    }
  } finally {
    await store.close();
  }
}
if (require.main === module)
  main().catch(() => {
    console.error(
      "Database setup failed. Check the local connection, permissions, and source records. No source files were removed.",
    );
    process.exitCode = 1;
  });
module.exports = { importFiles };
