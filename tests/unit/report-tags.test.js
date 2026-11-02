const test = require("node:test");
const assert = require("node:assert/strict");
const Data = require("../../src/shared/report-data");
test("report tags normalize safely without making legacy reports invalid", () => {
  assert.deepEqual(Data.normalizeTags([" Smoke ", "smoke", "Nightly"]), [
    "Smoke",
    "Nightly",
  ]);
  assert.deepEqual(Data.normalizeMetadata({ tags: [" Smoke "] }).tags, [
    "Smoke",
  ]);
  assert.equal(Data.normalizeMetadata({}).tags, undefined);
  for (const tags of [
    null,
    "smoke",
    [""],
    ["x\n"],
    ["a".repeat(51)],
    Array.from({ length: 11 }, (_, i) => String(i)),
  ])
    assert.throws(() => Data.normalizeTags(tags));
  assert.throws(() => Data.normalizeTags([], true), /at least one tag/);
});

test("browser report tags survive reload and duplicate import without changing identity or source", async () => {
  const { createHistory } = require("../../src/client/import-history");
  const { IDBFactory } = require("fake-indexeddb");
  const { webcrypto } = require("node:crypto");
  const indexedDB = new IDBFactory();
  const history = createHistory({
    indexedDB,
    crypto: webcrypto,
    name: "report-tags-history",
  });
  const text = JSON.stringify({
    stats: {},
    results: [
      {
        file: "spec.cy.js",
        tests: [{ state: "passed", title: "test" }],
        suites: [],
      },
    ],
  });
  const report = Data.normalizeReport(JSON.parse(text));
  report.metadata = Data.normalizeMetadata({
    project: "web",
    branch: "main",
    tags: ["Smoke"],
  });
  const first = await history.save({ text, name: "report.json", report });
  await history.updateMetadata(first.id, {
    ...report.metadata,
    tags: ["Regression"],
  });
  const reopened = createHistory({
    indexedDB,
    crypto: webcrypto,
    name: "report-tags-history",
  });
  assert.deepEqual((await reopened.get(first.id)).entry.metadata.tags, [
    "Regression",
  ]);
  report.metadata = { ...report.metadata, tags: ["Nightly"] };
  const duplicate = await reopened.save({ text, name: "report.json", report });
  assert.equal(duplicate.id, first.id);
  assert.deepEqual(duplicate.metadata.tags, ["Nightly"]);
  assert.equal((await reopened.get(first.id)).text, text);
  assert.equal((await reopened.list()).length, 1);
});

test("saving tags updates storage, the active summary, and history before confirming", async () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const path = require("node:path");
  const events = [];
  const entry = {
    id: "browser-id",
    serverId: "server-id",
    metadata: { project: "web" },
  };
  const context = {
    ReportData: Data,
    activeHistoryId: entry.id,
    report: { metadata: entry.metadata },
    knownReportServerId: () => null,
    teamRequest: async (url, options) => {
      events.push("server");
      assert.deepEqual(JSON.parse(options.body), { tags: ["Smoke"] });
    },
    ImportHistory: {
      updateMetadata: async (id, metadata) => {
        events.push("browser");
        assert.equal(id, entry.id);
        assert.deepEqual(metadata.tags, ["Smoke"]);
      },
    },
    renderSummary: () => events.push("summary"),
    invalidateSavedAnalysis: (id) => {
      assert.equal(id, entry.id);
      events.push("invalidate");
    },
    refreshHistory: async () => events.push("history"),
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/client/report-tags.js"),
      "utf8",
    ),
    context,
  );
  assert.deepEqual(await context.ReportTags.save(entry, ["Smoke"]), ["Smoke"]);
  assert.deepEqual(events, [
    "server",
    "browser",
    "summary",
    "invalidate",
    "history",
  ]);
  assert.deepEqual(context.report.metadata.tags, ["Smoke"]);
});
