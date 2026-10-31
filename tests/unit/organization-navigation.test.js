const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
test("switching organization from the Projects route clears stale report identifiers and forces a document reload", async () => {
  const calls = [];
  const source = fs.readFileSync(
    path.join(__dirname, "../../src/client/workspace-menu.js"),
    "utf8",
  );
  const context = {
    loading: false,
    hasUnsavedAppearance: () => false,
    hasUnsavedProfile: () => false,
    hasUnsavedWorkspace: () => false,
    hasUnsavedOrganization: () => false,
    teamState: null,
    appearanceDraft: {},
    userProfileDraft: {},
    workspaceDraft: {},
    organizationDraft: {},
    teamRequest: async (route) => {
      calls.push(route);
      return { csrf: "token" };
    },
    history: { replaceState: (state, title, url) => calls.push(url) },
    location: { pathname: "/", reload: () => calls.push("reload") },
    showToast: () => {},
  };
  vm.runInNewContext(source.slice(0, source.indexOf("(function ()")), context);
  await context.switchWorkspaceOrganization("second");
  assert.deepEqual(calls, [
    "/api/team/status",
    "/api/organizations/second/switch",
    "/#projects",
    "reload",
  ]);
  assert.equal(context.appearanceDraft, null);
  assert.equal(context.organizationDraft, null);
});
