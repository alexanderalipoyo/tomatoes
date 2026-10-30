#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const ReportData = require("../src/shared/report-data");
const { packUpload } = require("../src/shared/report-transfer-client");
async function publishReport({
  file,
  metadata = {},
  url = process.env.TOMATOES_SERVER_URL || "http://127.0.0.1:3000",
  token = process.env.TOMATOES_CI_TOKEN,
  dryRun = false,
}) {
  const report = JSON.parse(
    (await fs.readFile(file, "utf8")).replace(/^\uFEFF/, ""),
  );
  ReportData.parseReportText(JSON.stringify(report));
  const normalized = ReportData.normalizeMetadata(metadata);
  if (dryRun) return { valid: true, project: normalized.project || "tomatoes" };
  if (!token)
    throw new Error("Set TOMATOES_CI_TOKEN to a project-scoped token.");
  const target = new URL("/api/runs", url);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password
  )
    throw new Error("Use an HTTP or HTTPS server URL without credentials.");
  let body = JSON.stringify({
    reportText: JSON.stringify(report),
    metadata: Object.fromEntries(
      Object.entries(normalized).filter(([, value]) => value !== ""),
    ),
    name: path.basename(file),
  });
  if (Buffer.byteLength(body) > 4 * 1024 * 1024)
    body = await packUpload(body, 4 * 1024 * 1024);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body,
    signal: AbortSignal.timeout(120000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `Upload failed (${response.status}).`);
  return result;
}
async function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf("--" + name);
    return index < 0 ? undefined : args[index + 1];
  };
  const file = option("file");
  if (!file)
    throw new Error(
      "Usage: node scripts/publish-report.js --file REPORT.json --project PROJECT [--environment staging] [--branch main] [--commit SHA] [--build-url URL] [--dry-run]",
    );
  const result = await publishReport({
    file,
    metadata: {
      project: option("project"),
      environment: option("environment"),
      branch: option("branch"),
      commit: option("commit"),
      buildUrl: option("build-url"),
    },
    dryRun: args.includes("--dry-run"),
  });
  console.log(
    result.valid
      ? "Report validated; ready to upload."
      : `Uploaded run ${result.run.id} to project ${result.run.metadata.project}.`,
  );
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { publishReport };
