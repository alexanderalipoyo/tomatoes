const { spawnSync } = require("node:child_process");
const { PROJECT_ROOT, listFiles } = require("./lib/project-files");
const files = [
  ...listFiles("src"),
  ...listFiles("api"),
  ...listFiles("scripts"),
  ...listFiles("tests"),
];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    console.error(
      result.stderr || result.error?.message || `Could not check ${file}`,
    );
    process.exit(result.status || 1);
  }
}
console.log(`Checked ${files.length} JavaScript files.`);
