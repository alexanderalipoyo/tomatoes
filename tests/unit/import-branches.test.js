const test = require("node:test");
const assert = require("node:assert/strict");
const { choices } = require("../../src/client/import-branches");
const Model = require("../../src/shared/user-preferences");
const row = (project, branch, deletedAt = null) => ({
  metadata: { project, branch },
  deletedAt,
});
test("branch choices use previous runs in the current project, omit trash, and deduplicate names", () => {
  assert.deepEqual(
    choices(
      [
        row("web", "main"),
        row("web", "main"),
        row("web", "feature/a"),
        row("other", "secret"),
        row("web", "deleted", 1),
      ],
      "web",
      "feature/a",
    ),
    { branches: ["feature/a", "main"], selected: "feature/a" },
  );
});
test("previous selected branches default only while still available, with active and report fallbacks", () => {
  const rows = [row("web", "main"), row("web", "__report__")];
  assert.equal(choices(rows, "web", "missing", "main").selected, "main");
  assert.equal(choices(rows, "web", "missing").selected, null);
  assert.equal(choices(rows, "web", "").selected, null);
  assert.equal(choices(rows, "web", "__report__").selected, "__report__");
});
test("branch default preferences validate project scope, unique keys, and branch lengths", () => {
  assert.deepEqual(
    Model.validatePatch({
      importBranches: [{ project: "web", branch: " feature/a " }],
    }),
    { importBranches: [{ project: "web", branch: "feature/a" }] },
  );
  for (const importBranches of [
    {},
    [{ project: "bad project", branch: "main" }],
    [{ project: "web", branch: "x".repeat(161) }],
    [{ project: "web", branch: "main\n" }],
    [
      { project: "web", branch: "main" },
      { project: "web", branch: "other" },
    ],
  ])
    assert.throws(() => Model.validatePatch({ importBranches }));
});

test("closing the import dialog aborts pending branch loading", async () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const path = require("node:path");
  const dialog = new EventTarget();
  dialog.open = true;
  const elements = {
    "#import-dialog": dialog,
    "#import-branch": {},
    "#import-branch-hint": {},
    "#import-new-branch-field": {},
  };
  let aborted = false;
  const context = {
    module: { exports: {} },
    report: { metadata: { project: "web" } },
    document: { querySelector: (selector) => elements[selector] },
    AbortController,
    AbortSignal,
    teamRequest: (url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("Aborted"));
        }),
      ),
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/client/import-branches.js"),
      "utf8",
    ),
    context,
  );
  const loading = context.module.exports.prepare();
  dialog.open = false;
  dialog.dispatchEvent(new Event("close"));
  await loading;
  assert.equal(aborted, true);
});

test("branch selection is mandatory, waits for project selection, and preserves valid remembered defaults", async () => {
  const { JSDOM } = require("jsdom");
  const vm = require("node:vm");
  const fs = require("node:fs");
  const path = require("node:path");
  const dom = new JSDOM(
    '<dialog id="import-dialog" open><select id="import-branch" required></select><p id="import-branch-hint"></p><div id="import-new-branch-field"><input id="import-new-branch"/></div></dialog>',
  );
  let project = "";
  let requests = 0;
  const context = {
    document: dom.window.document,
    AbortSignal,
    AbortController,
    ImportProjects: { current: () => project },
    report: null,
    historyEntries: [],
    userPreferences: {
      getState: () => ({
        preferences: {
          importBranches: [{ project: "portal", branch: "main" }],
        },
      }),
    },
    teamRequest: async () => {
      requests++;
      return { runs: [{ metadata: { project: "portal", branch: "main" } }] };
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/client/import-branches.js"),
      "utf8",
    ),
    context,
  );
  const api = context.ImportBranches;
  await api.prepare();
  const select = context.document.querySelector("#import-branch");
  assert.equal(select.disabled, true);
  assert.equal(requests, 0);
  project = "portal";
  await api.prepare();
  assert.equal(select.value, "branch:main");
  assert.equal(api.options().branch, "main");
  assert.equal(select.querySelector('option[value="__report__"]'), null);
  select.value = "";
  assert.throws(() => api.options(), /Select a branch/);
  select.value = "__new__";
  select.onchange();
  const input = context.document.querySelector("#import-new-branch");
  assert.equal(input.required, true);
  input.value = " ";
  assert.throws(() => api.options(), /Enter a branch name/);
  input.value = " feature/test ";
  assert.equal(api.options().branch, "feature/test");
  select.disabled = true;
  assert.throws(() => api.options(), /finish loading/);
  dom.window.close();
});
