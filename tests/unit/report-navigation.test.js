const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const ReportLinks = require("../../src/shared/report-links");
const ProjectCatalog = require("../../src/shared/project-catalog");
function fixture(hash, search = "?import=invalid") {
  const calls = [];
  const elements = {};
  const context = {
    location: new URL("http://localhost/" + search + hash),
    URL,
    AbortSignal,
    ProjectCatalog,
    ImportHistory: { list: async () => [] },
    teamRequest: async () => ({ runs: [] }),
    canAccessView: () => true,
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
  context.history = {
    replaceState: (a, b, url) => {
      context.location.href = String(url);
    },
    pushState: (a, b, url) => {
      context.location.href = String(url);
    },
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
    "#my-profile",
    "#import-history",
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

const dashboardRecord = (id, receivedAt) => ({
  id: id.repeat(64),
  receivedAt,
  metadata: { project: "web" },
});
test("Latest run selects the newest project import even when the viewer last opened an older run", async () => {
  const f = fixture("#latest-run", "?project=web");
  f.context.teamRequest = async (route) => {
    assert.equal(route, "/api/runs?limit=2&project=web");
    return { runs: [dashboardRecord("b", 300), dashboardRecord("a", 200)] };
  };
  f.context.ImportHistory.list = async () => [
    {
      id: "c".repeat(64),
      serverId: "a".repeat(64),
      lastImportedAt: 9999,
      metadata: { project: "web" },
    },
  ];
  await f.context.navigateReportLocation();
  assert.equal(f.calls[0].serverId, "b".repeat(64));
  assert.equal(f.calls[0].dashboardView, "runs");
  assert.equal(f.context.location.hash, "#latest-run");
});

test("Previous runs selects the next older import and never falls back to the latest", async () => {
  const f = fixture("#previous-runs", "?project=web");
  f.context.teamRequest = async () => ({
    runs: [dashboardRecord("b", 300), dashboardRecord("a", 200)],
  });
  await f.context.navigateReportLocation();
  assert.equal(f.calls[0].serverId, "a".repeat(64));
  assert.equal(f.calls[0].dashboardView, "previous-runs");
  assert.equal(f.context.location.hash, "#previous-runs");
  const single = fixture("#previous-runs", "?project=web");
  single.context.teamRequest = async () => ({
    runs: [dashboardRecord("b", 300)],
  });
  await single.context.navigateReportLocation();
  assert.deepEqual(single.calls, ["navigate"]);
  assert.match(
    single.elements["#load-state"].textContent,
    /No previous runs yet/,
  );
});

test("older pinned dashboards use Previous runs while the actual latest uses Latest run", async () => {
  const f = fixture("#latest-run", "?server=" + "a".repeat(64));
  Object.assign(f.context, {
    report: { metadata: { project: "web" } },
    activeHistoryId: "c".repeat(64),
    teamRequest: async () => ({
      runs: [dashboardRecord("b", 300), dashboardRecord("a", 200)],
    }),
  });
  assert.equal(
    await f.context.classifyDashboard({ serverId: "a".repeat(64) }),
    "previous-runs",
  );
  f.context.updateReportURL({
    replace: true,
    dashboard: true,
    serverId: "a".repeat(64),
  });
  assert.equal(f.context.location.hash, "#previous-runs");
  assert.equal(
    await f.context.classifyDashboard({ serverId: "b".repeat(64) }),
    "runs",
  );
  f.context.updateReportURL({
    replace: true,
    dashboard: true,
    serverId: "b".repeat(64),
  });
  assert.equal(f.context.location.hash, "#latest-run");
});

test("dashboard tab links drop the previous report identity and retain its project", () => {
  const f = fixture("#previous-runs", "?project=web&server=" + "a".repeat(64));
  const latest = new URL(f.context.dashboardTabHref("runs"));
  assert.equal(latest.hash, "#latest-run");
  assert.equal(latest.searchParams.get("project"), "web");
  assert.equal(latest.searchParams.has("server"), false);
  assert.equal(latest.searchParams.has("import"), false);
});

test("shared-only older reports still route to Previous runs when browser storage is unavailable", async () => {
  const f = fixture("#latest-run", "?server=" + "a".repeat(64));
  Object.assign(f.context, {
    report: { metadata: { project: "web" } },
    ImportHistory: {
      list: async () => {
        throw new Error("Storage blocked");
      },
    },
    teamRequest: async () => ({
      runs: [dashboardRecord("b", 300), dashboardRecord("a", 200)],
    }),
  });
  assert.equal(
    await f.context.classifyDashboard({ serverId: "a".repeat(64) }),
    "previous-runs",
  );
  f.context.updateReportURL({
    replace: true,
    dashboard: true,
    serverId: "a".repeat(64),
  });
  assert.equal(f.context.location.hash, "#previous-runs");
  assert.equal(
    ReportLinks.read(f.context.location.href).serverId,
    "a".repeat(64),
  );
  assert.equal(ReportLinks.read(f.context.location.href).importId, null);
});

test("a failed shared listing cannot relabel an older browser report as Latest run", async () => {
  const f = fixture("#latest-run", "?project=web");
  f.context.authStatus = { enabled: true, authenticated: true };
  f.context.initializeAuth = async () => {};
  f.context.teamRequest = async () => {
    throw new Error("Connection unavailable");
  };
  f.context.ImportHistory.list = async () => [
    { id: "a".repeat(64), lastImportedAt: 99, metadata: { project: "web" } },
  ];
  await f.context.navigateReportLocation();
  assert.deepEqual(f.calls, ["navigate"]);
  assert.match(f.elements["#load-state"].textContent, /Connection unavailable/);
});

test("a slow latest-run lookup cannot overwrite a tab the user navigated to", async () => {
  const f = fixture("#latest-run", "?project=web");
  let finish;
  f.context.teamRequest = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const navigation = f.context.navigateReportLocation();
  f.context.location.hash = "projects";
  finish({ runs: [dashboardRecord("b", 300)] });
  await navigation;
  assert.equal(f.context.location.hash, "#projects");
  assert.deepEqual(f.calls, []);
});

test("readable report URLs restore the exact shared report", async () => {
  for (const hash of [
    "#latest-run",
    "#test-results",
    "#failed-tests",
    "#compare-runs",
    "#flaky-tests",
    "#report-settings",
  ]) {
    const f = fixture(hash, "?server=" + "b".repeat(64));
    await f.context.navigateReportLocation();
    assert.equal(f.calls[0].serverId, "b".repeat(64));
    assert.equal(f.calls[0].fromURL, true);
  }
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

test("Latest run stays empty for a signed-in project with no imports instead of showing a bundled sample", async () => {
  const f = fixture("#runs", "");
  f.context.authStatus = {
    enabled: true,
    authenticated: true,
    accessibleProjects: [{ id: "portal" }],
  };
  f.context.initializeAuth = async () => {};
  f.context.ImportHistory = { list: async () => [] };
  f.context.URL = URL;
  f.context.history = {
    replaceState: (a, b, url) => {
      f.context.location.hash = url.hash;
    },
  };
  await f.context.navigateReportLocation();
  assert.equal(f.context.location.hash, "#runs");
  assert.deepEqual(f.calls, ["navigate"]);
  assert.match(
    f.elements["#load-state"].textContent,
    /No reports have been imported/,
  );
});

test("unavailable browser storage leaves authenticated shared-report navigation usable", async () => {
  const f = fixture("#runs", "");
  Object.assign(f.context, {
    authStatus: { enabled: true, authenticated: true },
    initializeAuth: async () => {},
    ImportHistory: {
      list: async () => {
        throw new Error("Storage blocked");
      },
    },
    URL,
    history: {
      replaceState: (a, b, url) => {
        f.context.location.hash = url.hash;
      },
    },
  });
  let notice;
  f.context.historyNotice = (message) => {
    notice = message;
  };
  await f.context.navigateReportLocation();
  assert.equal(f.context.location.hash, "#runs");
  assert.deepEqual(f.calls, ["navigate"]);
  assert.match(notice, /still open shared reports/);
});

test("pinned server reports bypass local-history listing when browser storage is unavailable", async () => {
  const f = fixture("#runs", "?server=" + "b".repeat(64));
  f.context.ImportHistory = {
    list: async () => {
      throw new Error("Storage blocked");
    },
  };
  await f.context.navigateReportLocation();
  assert.equal(f.calls[0].serverId, "b".repeat(64));
  assert.equal(f.calls[0].fromURL, true);
});

test("copying an older report link resolves its server identity without listing all runs", async () => {
  const { webcrypto, createHash } = require("node:crypto");
  const ReportData = require("../../src/shared/report-data");
  const raw = { tomatoes: { project: "web", branch: "main" } };
  const text = JSON.stringify(raw);
  const id = createHash("sha256")
    .update(ReportData.reportIdentityText(text, "web", "main"))
    .digest("hex");
  const f = fixture("#history", "");
  let copied;
  const routes = [];
  Object.assign(f.context, {
    crypto: webcrypto,
    TextEncoder,
    AbortSignal,
    ReportData,
    workspaceProjects: [{ id: "web" }],
    ImportHistory: {
      get: async () => ({
        entry: { id, metadata: { project: "web", branch: "main" } },
        text,
      }),
    },
    navigator: {
      clipboard: {
        writeText: async (value) => {
          copied = value;
        },
      },
    },
    showToast: () => {},
    teamRequest: async (route) => {
      routes.push(route);
      assert.equal(route, "/api/runs/" + id);
      return {
        run: { id, metadata: { project: "web", branch: "main" } },
        originalText: text,
      };
    },
  });
  await f.context.copyHistoryReportLink(id, {
    disabled: false,
    isConnected: true,
  });
  assert.equal(new URL(copied).searchParams.get("server"), id);
  assert.equal(new URL(copied).searchParams.get("import"), id);
  assert.equal(routes.length, 1);
});
