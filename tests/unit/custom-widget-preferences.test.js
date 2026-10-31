const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const group = {
  id: "mine",
  name: "My tests",
  paths: ["cypress/e2e/mine"],
  metrics: ["passRate"],
};
test("custom dashboard reads only the current account's ready preference setup", () => {
  let state = {
    ready: true,
    profileId: "user:alex",
    preferences: { dashboardGroups: [group] },
    error: "",
  };
  let rendered;
  const context = {
    authStatus: {
      enabled: true,
      authenticated: true,
      user: { username: "alex" },
    },
    userPreferences: { getState: () => state },
    TomatoesReact: {
      renderGroups: (host, props) => {
        rendered = props;
      },
    },
    $: () => ({}),
    canAccessView: () => false,
    report: {},
    sourceName: "report.json",
    duration: String,
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/client/custom-widgets.js"),
      "utf8",
    ),
    context,
  );
  context.renderCustomizedDashboard();
  assert.equal(rendered.profileId, "user:alex");
  assert.equal(rendered.groups[0], group);
  context.authStatus.user.username = "justine";
  context.renderCustomizedDashboard();
  assert.equal(rendered.groups.length, 0);
  assert.equal(rendered.profileId, "unavailable");
  assert.match(rendered.error, /preferences/);
  state = {
    ...state,
    profileId: "user:justine",
    preferences: { dashboardGroups: [] },
  };
  context.renderCustomizedDashboard();
  assert.equal(rendered.groups.length, 0);
  assert.equal(rendered.error, "");
  assert.equal(rendered.profileId, "user:justine");
  state.ready = false;
  context.renderCustomizedDashboard();
  assert.equal(rendered.groups.length, 0);
  assert.equal(rendered.profileId, "unavailable");
});
