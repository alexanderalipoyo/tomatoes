const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getStaticFile } = require("../../src/server/static-assets");
const { PROJECT_ROOT } = require("../../src/server/config");

test("every local stylesheet, script, and icon in the page can be served", () => {
  const html = fs.readFileSync(getStaticFile("/"), "utf8");
  const references = [...html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(references.length > 15);
  for (const route of references) {
    const file = getStaticFile(route);
    assert.ok(file, `Missing public route: ${route}`);
    assert.ok(fs.statSync(file).isFile(), `Missing asset: ${route}`);
  }
});

test("worker imports and PDF runtime assets resolve from their public URLs", () => {
  const workerUrl = "/js/report-worker.js";
  const worker = fs.readFileSync(getStaticFile(workerUrl), "utf8");
  for (const match of worker.matchAll(/importScripts\("([^"]+)"\)/g)) {
    const route = new URL(match[1], `http://localhost${workerUrl}`).pathname;
    assert.ok(fs.statSync(getStaticFile(route)).isFile());
  }
  for (const route of [
    "/vendor/pdf.mjs",
    "/vendor/pdf.worker.mjs",
    "/vendor/jspdf.umd.min.js",
    "/assets/fonts/NotoSans-Regular.ttf",
    "/results.json",
  ]) {
    assert.ok(fs.statSync(getStaticFile(route)).isFile(), route);
  }
});

test("private source, configuration, data, and migrations cannot be served", () => {
  for (const route of [
    "/.env.local",
    "/.tomatoes-data/runs.json",
    "/src/server/config.js",
    "/src/server/index.js",
    "/scripts/database.js",
    "/src/server/database/migrations/001-initial.sql",
    "/../.env.local",
    "/assets/../../.env.local",
    "/__proto__",
  ]) {
    assert.equal(getStaticFile(route), null, route);
  }
});

test("configuration and sample paths remain anchored to the project root", () => {
  assert.equal(PROJECT_ROOT, path.resolve(__dirname, "../.."));
  assert.equal(
    getStaticFile("/results.json"),
    path.join(PROJECT_ROOT, "examples/reports/results.json"),
  );
});
