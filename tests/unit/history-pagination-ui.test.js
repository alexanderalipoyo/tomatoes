const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const record = (n) => ({
  id: n.toString(16).padStart(64, "0"),
  name: "report-" + n + ".json",
  status: "passed",
  receivedAt: 1000 - n,
  start: "2026-10-31T00:00:00Z",
  metadata: { project: "web", branch: "main" },
  counts: { total: 1, passed: 1, failed: 0, pending: 0, skipped: 0 },
});
function base(dom) {
  return {
    document: dom.window.document,
    window: dom.window,
    location: dom.window.location,
    AbortSignal,
    URL,
    esc: (value) => String(value ?? ""),
    icon: () => "",
    badge: (value) => String(value),
    number: (value) => String(value),
    date: (value) => String(value),
    workspaceBranding: (id) => ({ name: id }),
    workspaceLogoMarkup: () => "",
    report: null,
    historyEntries: [],
    showToast: () => {},
  };
}
test("Projects remains usable without browser storage and loads older shared runs on demand", async () => {
  const dom = new JSDOM(
    '<p id="page-description"></p><div id="report-content"><section id="alternate"></section></div>',
    { url: "http://localhost/#projects" },
  );
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const context = {
    ...base(dom),
    view: "projects",
    authStatus: { organization: { id: "default", name: "Organization" } },
    currentWorkspaceProject: "web",
    ProjectCatalog: require("../../src/shared/project-catalog"),
    ProjectManagement: require("../../src/shared/project-management"),
    ReportLinks: require("../../src/shared/report-links"),
    reportServerLinks: new Map(),
    renderWorkspaceIdentity: () => {},
    ImportHistory: {
      list: async () => {
        throw new Error("Storage blocked");
      },
    },
    openHistoryReportLink: () => {},
  };
  const requests = [];
  context.teamRequest = async (route) => {
    requests.push(route);
    if (route === "/api/projects")
      return {
        projects: [{ id: "web", name: "Web", registered: true }],
        canManage: false,
      };
    if (route.includes("cursor="))
      return {
        runs: [record(2), record(3)],
        nextCursor: null,
        canArchive: false,
      };
    return {
      runs: [record(1), record(2)],
      nextCursor: "page-2",
      canArchive: false,
    };
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/client/projects.js"),
      "utf8",
    ),
    context,
  );
  const host = dom.window.document.querySelector("#alternate");
  await context.renderProjects(host);
  assert.match(host.textContent, /Browser archives could not be loaded/);
  assert.match(
    host.querySelector("#projects-page-status").textContent,
    /2 shared reports loaded/,
  );
  assert.equal(host.querySelector("#projects-load-more").hidden, false);
  assert.equal(requests.filter((route) => route.includes("cursor=")).length, 0);
  host.querySelector("[data-project-runs]").click();
  const modal = dom.window.document.querySelector("#project-runs-dialog");
  assert.equal(modal.open, true);
  modal.querySelector("#project-runs-more").click();
  await new Promise(setImmediate);
  assert.match(
    host.querySelector("#projects-page-status").textContent,
    /3 shared reports loaded/,
  );
  assert.equal(host.querySelector("#projects-load-more").hidden, true);
  assert.equal(modal.querySelectorAll("[data-open-project-run]").length, 3);
  assert.equal(requests.filter((route) => route.includes("cursor=")).length, 1);
  dom.window.close();
});
test("Shared reports appends older pages without duplicates and stops at the final page", async () => {
  const dom = new JSDOM(
    '<div id="report-content"><section id="alternate"></section></div>',
    {
      url: "http://localhost/?settingsTab=sharing#workspace-settings",
    },
  );
  const requests = [];
  const context = {
    ...base(dom),
    isSharingSettingsView: () => true,
    $: (selector) => dom.window.document.querySelector(selector),
    fetch: async (route) => {
      requests.push(route);
      const payload =
        route === "/api/team/status"
          ? {
              enabled: false,
              storage: "postgres",
              accessibleProjects: [{ id: "web", name: "Web" }],
            }
          : route.includes("cursor=")
            ? { runs: [record(2), record(3)], nextCursor: null }
            : { runs: [record(1), record(2)], nextCursor: "page-2" };
      return { ok: true, status: 200, json: async () => payload };
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../../src/client/team.js"), "utf8"),
    context,
  );
  const host = dom.window.document.querySelector("#alternate");
  await context.renderTeam(host);
  assert.equal(host.querySelectorAll("[data-open-shared]").length, 2);
  const button = host.querySelector("#team-load-more");
  await button.onclick({ currentTarget: button });
  assert.equal(host.querySelectorAll("[data-open-shared]").length, 3);
  assert.equal(button.hidden, true);
  assert.equal(requests.filter((route) => route.includes("cursor=")).length, 1);
  dom.window.close();
});
