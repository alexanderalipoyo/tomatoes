const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
test("project routes pass report navigation and scoped services to React", () => {
  let mounted;
  const host = {};
  const context = {
    TomatoesReact: {
      renderProjects: (element, props) => (mounted = { element, props }),
    },
    teamRequest: async () => {},
    ImportHistory: {},
    historyEntries: [],
    hasAccess: () => true,
    workspaceBranding: () => ({ name: "Workspace" }),
    currentWorkspaceProject: "web",
    openHistoryReportLink: () => {},
    refreshHistory: async () => {},
    showToast: () => {},
    date: (value) => value,
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/client/projects.js"),
      "utf8",
    ),
    context,
  );
  context.renderProjects(host);
  assert.equal(mounted.element, host);
  assert.equal(mounted.props.historyStore, context.ImportHistory);
  assert.equal(mounted.props.openReport, context.openHistoryReportLink);
  assert.equal(mounted.props.currentProject, "web");
});
test("sharing route passes publishing and report services to React", () => {
  let mounted;
  const host = { isConnected: true };
  const context = {
    TomatoesReact: {
      renderSharing: (element, props) => (mounted = { element, props }),
    },
    isSharingSettingsView: () => true,
    date: (value) => value,
    workspaceBranding: () => ({ name: "Web" }),
    report: null,
    currentWorkspaceProject: "web",
    historyEntries: [],
    showToast: () => {},
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../../src/client/team.js"), "utf8"),
    context,
  );
  context.renderTeam(host);
  assert.equal(mounted.element, host);
  assert.equal(mounted.props.hasReport, false);
  assert.equal(mounted.props.selectedProject, "web");
  assert.equal(typeof mounted.props.onSaveHistory, "function");
});
