const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Model = require("../../src/shared/user-preferences");

test("report settings opens after import and saves the shared results page size", async () => {
  const elements = {};
  let rendered;
  let saved;
  const context = {
    preferences: { timeZone: "UTC", rows: 25 },
    resultsPageSize: 25,
    historyEntries: [],
    activeHistoryId: null,
    report: {},
    sourceName: "report.json",
    page: 3,
    view: "results",
    stability: null,
    $: (selector) => (elements[selector] ||= {}),
    TomatoesReact: {
      renderReportSettings: (host, props) => {
        rendered = props;
      },
    },
    userPreferences: {
      getState: () => ({ ready: true }),
      save: async (patch) => {
        saved = Model.validatePatch(patch);
      },
    },
    date: String,
    duration: String,
    appendReportSettings() {},
    renderCustomWidgetSettings() {},
    renderSummary() {},
    renderHistory() {},
    renderResults() {},
    showToast() {},
  };
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../src/client/insights.js"),
    "utf8",
  );
  vm.createContext(context);
  vm.runInContext(
    source.slice(source.indexOf("function renderSettings(alt) {")),
    context,
  );
  assert.doesNotThrow(() => context.renderSettings({}));
  assert.equal(rendered.pageSize, 25);
  elements["#setting-zone"] = { value: "UTC" };
  elements["#setting-rows"] = { value: "200" };
  elements["#display-settings"].onsubmit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(saved.display.rows, 200);
  assert.equal(context.resultsPageSize, 200);
  assert.equal(context.page, 1);
  context.renderSettings({});
  assert.equal(rendered.pageSize, 200);
});

test("page-size preferences accept all Results options and preserve legacy saved sizes", () => {
  for (const rows of [15, 25, 30, 50, 100, 200]) {
    assert.equal(
      Model.validatePatch({ display: { timeZone: "UTC", rows } }).display.rows,
      rows,
    );
  }
  assert.equal(Model.DEFAULT_DISPLAY.rows, 25);
});
