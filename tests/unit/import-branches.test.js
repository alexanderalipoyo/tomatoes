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
