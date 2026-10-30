const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const ProjectManagement = require("../../src/shared/project-management");
test("project import choices use saved names but submit stable keys and refresh branch choices", async () => {
  const dom = new JSDOM(
    '<dialog id="import-dialog" open><select id="import-project"></select><p id="import-project-hint"></p><select id="import-branch"></select><button id="browse-report"></button></dialog>',
  );
  let branches = 0;
  const context = {
    document: dom.window.document,
    report: { metadata: { project: "original" } },
    historyEntries: [{ metadata: { project: "legacy" } }],
    ProjectManagement,
    AbortController,
    AbortSignal,
    ImportBranches: {
      prepare: async () => {
        branches++;
      },
    },
    teamRequest: async () => ({
      projects: [{ id: "portal", name: "Renamed Portal" }],
    }),
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/client/import-projects.js"),
      "utf8",
    ),
    context,
  );
  const api = context.ImportProjects;
  api.preselect("portal");
  await api.prepare();
  const select = context.document.querySelector("#import-project");
  assert.equal(select.selectedOptions[0].textContent, "Renamed Portal");
  assert.equal(api.options().project, "portal");
  assert.equal(api.current(), "portal");
  select.value = "legacy";
  await select.onchange();
  assert.equal(branches, 1);
  select.value = "";
  assert.throws(() => api.options(), /Select a project/);
  assert.equal(api.current(), "");
  select.value = "portal";
  context.document.querySelector("#import-branch").disabled = true;
  assert.throws(() => api.options(), /finish loading/);
});
