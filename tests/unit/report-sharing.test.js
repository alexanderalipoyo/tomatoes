const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const { IDBFactory } = require("fake-indexeddb");
const { createHistory } = require("../../src/client/import-history");
const ReportData = require("../../src/shared/report-data");
const ReportLinks = require("../../src/shared/report-links");
const raw = require("../../examples/reports/results.json");
const serverId = "b".repeat(64);

function browser(history, entries) {
  const context = {
    ImportHistory: history,
    historyEntries: entries,
    location: { href: "https://example.com/#history" },
    ReportLinks,
    ReportData,
    crypto: webcrypto,
    TextEncoder,
    report: { metadata: {} },
    sourceName: "report.json",
    allowPaint: async () => {},
  };
  for (const file of ["report-navigation.js", "team.js", "projects.js"])
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, "../../src/client", file), "utf8"),
      context,
    );
  return context;
}

test("published browser imports keep shared report links after reload and reimport", async () => {
  const history = createHistory({
    indexedDB: new IDBFactory(),
    crypto: webcrypto,
  });
  const report = ReportData.normalizeReport(raw);
  report.metadata = { project: "web", branch: "main" };
  const input = {
    text: JSON.stringify(raw, null, 2),
    name: "report.json",
    report,
  };
  const entry = await history.save(input);
  const context = browser(history, [entry]);
  context.teamRequest = async (route) => {
    assert.equal(route, "/api/imports");
    return { run: { id: serverId } };
  };
  await context.uploadBrowserReport(entry, null, true);
  const saved = await history.get(entry.id);
  assert.equal(saved.entry.serverId, serverId);
  const reimported = await history.save(input);
  assert.equal(reimported.serverId, serverId);
  const reloaded = browser(history, await history.list());
  assert.equal(
    ReportLinks.read(reloaded.reportHref(entry.id)).serverId,
    serverId,
  );
  assert.equal(
    ReportLinks.read(
      reloaded.projectReportLink({ ...reimported, source: "browser" }),
    ).serverId,
    serverId,
  );
  const shared = await ReportLinks.resolve(
    ReportLinks.read(reloaded.reportHref(entry.id)),
    {
      getLocal: async () => {
        throw new Error("Viewer has no browser copy");
      },
      getServer: async (id) => {
        assert.equal(id, serverId);
        return {
          run: { id, metadata: report.metadata },
          originalText: input.text,
        };
      },
      verifyServer: reloaded.serverMatchesImport,
    },
  );
  assert.equal(shared.server.run.id, serverId);
});

test("browser-only imports retain local links without inventing a server copy", () => {
  const id = "a".repeat(64);
  const context = browser({}, [{ id }]);
  assert.equal(ReportLinks.read(context.reportHref(id)).serverId, null);
  assert.equal(ReportLinks.read(context.reportHref(id)).importId, id);
});
