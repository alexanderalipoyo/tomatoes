const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PROJECT_ROOT, listFiles } = require("./lib/project-files");
const postgres = process.argv.includes("--postgres");
const files = postgres
  ? [path.join(PROJECT_ROOT, "tests/integration/postgres.test.js")]
  : [
      ...listFiles("tests/unit", ".test.js"),
      path.join(PROJECT_ROOT, "tests/integration/local-workflows.test.js"),
    ];
const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: PROJECT_ROOT,
  stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
