const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const ReportLinks = require("../../src/shared/report-links");
function fixture(hash, search = "?import=invalid") {
  const calls = [];
  const elements = {};
  const context = {
    location: { hash, search, href: "http://localhost/" + search + hash },
    authRequiresLogin: () => false,
    isAuthRoute: () => false,
    renderAuthScreen: () => calls.push("auth"),
    loading: false,
    report: null,
    activeHistoryId: null,
    ReportLinks,
    navigate: () => calls.push("navigate"),
    loadReport: async (file, options) => {
      calls.push(options);
      return true;
    },
    $: (selector) => (elements[selector] ||= {}),
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/client/report-navigation.js"),
      "utf8",
    ),
    context,
  );
  return { context, calls, elements };
}
test("workspace and history routes bypass report lookup even with malformed or previously failed report links", async () => {
  for (const hash of [
    "#projects",
    "#integrations",
    "#profile",
    "#workspace-settings",
    "#team",
    "#history",
  ]) {
    const f = fixture(hash);
    vm.runInNewContext("failedReportLinkKey = location.search", f.context);
    await f.context.navigateReportLocation();
    assert.deepEqual(f.calls, ["navigate"]);
  }
});
test("entering a report page after an independent page lazily restores the selected report", async () => {
  const f = fixture("#runs", "");
  await f.context.navigateReportLocation();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].restore, true);
  const pinned = fixture("#results", "?import=" + "a".repeat(64));
  await pinned.context.navigateReportLocation();
  assert.equal(pinned.calls[0].historyId, "a".repeat(64));
  assert.equal(pinned.calls[0].fromURL, true);
});
test("returning to an unavailable report restores its error view rather than leaving workspace content visible", async () => {
  const f = fixture("#results", "?import=" + "a".repeat(64));
  vm.runInNewContext("failedReportLinkKey = location.search", f.context);
  await f.context.navigateReportLocation();
  assert.deepEqual(f.calls, ["navigate"]);
  assert.equal(f.elements["#report-content"].hidden, true);
  assert.equal(f.elements["#load-state"].hidden, false);
});

test("report links resolve both legacy IDs and branch-aware IDs without matching a different branch", async () => {
  const { webcrypto, createHash } = require("node:crypto");
  const ReportData = require("../../src/shared/report-data");
  const f = fixture("#runs");
  Object.assign(f.context, { crypto: webcrypto, TextEncoder, ReportData });
  const raw = { tomatoes: { project: "web" } };
  const text = JSON.stringify(raw);
  const saved = {
    originalText: text,
    report: raw,
    run: { metadata: { project: "web", branch: "main" } },
  };
  const id = (branch) =>
    createHash("sha256")
      .update(ReportData.reportIdentityText(text, "web", branch))
      .digest("hex");
  assert.equal(await f.context.serverMatchesImport(saved, id("")), true);
  assert.equal(await f.context.serverMatchesImport(saved, id("main")), true);
  const compact = { run: saved.run, originalText: saved.originalText };
  assert.equal(await f.context.serverMatchesImport(compact, id("main")), true);
  assert.equal(
    await f.context.serverMatchesImport(compact, id("feature/a")),
    false,
  );
  assert.equal(
    await f.context.serverMatchesImport(saved, id("feature/a")),
    false,
  );
});

test("signed-out navigation stops before looking up or rendering private reports", async () => {
  const f = fixture("#results", "?server=" + "a".repeat(64));
  f.context.authRequiresLogin = () => true;
  await f.context.navigateReportLocation();
  assert.deepEqual(f.calls, ["auth"]);
});

test("failed shared report navigation preserves the server error", async () => {
  const f = fixture("#runs", "?server=" + "a".repeat(64));
  const error = new Error("This response exceeds the hosted 4 MB limit.");
  f.context.loadReport = async (file, options) => {
    options.onError(error);
    return false;
  };
  let displayed;
  f.context.showReportLinkError = (value) => {
    displayed = value;
  };
  await f.context.navigateReportLocation();
  assert.equal(displayed, error);
});
