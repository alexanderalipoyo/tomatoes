const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const Policy = require("../../src/shared/access-policy");
const source = (name) =>
  fs.readFileSync(
    path.join(__dirname, "../../src/client/" + name + ".js"),
    "utf8",
  );
function fixture(t, role) {
  const dom = new JSDOM(
    '<nav><a data-view="users"></a><a data-view="role-access"></a><a data-view="history"></a></nav><button id="backup-history">Backup</button><button id="attach-evidence">Attach</button><button id="users-add">Add</button><button data-export-pdf>PDF</button><input id="search"/><main></main>',
  );
  t.after(() => dom.window.close());
  const notices = [];
  const context = {
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    requestAnimationFrame: () => {},
    AccessPolicy: Policy,
    authStatus: {
      enabled: true,
      authenticated: true,
      user: { role },
      permissions: Policy.resolve({}, role),
      canManageRoleAccess: role === "admin",
    },
    authRequiresLogin: () => false,
    showToast: (message) => notices.push(message),
  };
  vm.runInNewContext(source("access-control"), context);
  context.applyFeatureAccess();
  return { dom, context, notices };
}
test("UI role restrictions hide actions and block captured clicks while preserving Viewer PDF access", (t) => {
  const { dom, context, notices } = fixture(t, "viewer"),
    doc = dom.window.document;
  for (const id of ["backup-history", "attach-evidence", "users-add"])
    assert.ok(doc.getElementById(id).classList.contains("access-restricted"));
  assert.ok(
    !doc
      .querySelector("[data-export-pdf]")
      .classList.contains("access-restricted"),
  );
  assert.equal(context.canAccessView("role-access"), false);
  assert.equal(context.canAccessView("users"), false);
  assert.equal(context.canAccessView("profile"), true);
  let clicked = false;
  doc.getElementById("backup-history").onclick = () => (clicked = true);
  doc.getElementById("backup-history").click();
  assert.equal(clicked, false);
  assert.equal(notices.length, 1);
  context.authStatus.permissions = Policy.resolve({}, "editor");
  context.applyFeatureAccess();
  assert.equal(context.canAccessView("users"), true);
  assert.ok(
    !doc
      .getElementById("attach-evidence")
      .classList.contains("access-restricted"),
  );
  assert.ok(
    doc.getElementById("users-add").classList.contains("access-restricted"),
  );
});
test("Admin role matrix preserves edits across search and saves with revision protection", async (t) => {
  const { dom, context, notices } = fixture(t, "admin"),
    calls = [];
  context.view = "role-access";
  context.structuredClone = structuredClone;
  context.confirm = () => true;
  context.esc = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  context.initializeAuth = async () => {};
  context.teamRequest = async (route, options) => {
    calls.push({ route, ...options });
    return options
      ? { revision: 5 }
      : {
          features: Policy.features,
          permissions: {
            editor: Policy.configured({}, "editor"),
            viewer: Policy.configured({}, "viewer"),
          },
          revision: 4,
          organization: { name: "Dynamic organization" },
        };
  };
  vm.runInNewContext(source("role-access"), context);
  const host = dom.window.document.querySelector("main");
  await context.renderRoleAccess(host);
  assert.equal(
    host.querySelectorAll('[data-role="admin"]:checked:disabled').length,
    136,
  );
  assert.ok(
    host.querySelector(
      '[data-role="editor"][data-permission="users.add-users"]',
    ).disabled,
  );
  const key = "settings-appearance.save-appearance-preferences",
    input = host.querySelector(
      `[data-role="editor"][data-permission="${key}"]`,
    );
  input.checked = false;
  input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  const search = host.querySelector("#role-access-search");
  search.value = "appearance";
  search.dispatchEvent(new dom.window.Event("input"));
  assert.equal(
    host.querySelector(`[data-role="editor"][data-permission="${key}"]`)
      .checked,
    false,
  );
  const page = host.querySelector("#role-access-page"),
    kind = host.querySelector("#role-access-kind");
  page.value = "Users";
  page.dispatchEvent(new dom.window.Event("change"));
  assert.match(
    host.querySelector("#role-access-rows").textContent,
    /No matching features/,
  );
  search.value = "";
  search.dispatchEvent(new dom.window.Event("input"));
  kind.value = "editable";
  kind.dispatchEvent(new dom.window.Event("change"));
  assert.equal(host.querySelectorAll('[data-role="editor"]').length, 3);
  assert.match(
    host.querySelector("#role-access-count").textContent,
    /3 of 136/,
  );
  kind.value = "protected";
  kind.dispatchEvent(new dom.window.Event("change"));
  assert.equal(
    host.querySelectorAll('[data-role="editor"]:disabled').length,
    7,
  );
  host.querySelector("#role-access-clear").click();
  assert.equal(host.querySelectorAll('[data-role="editor"]').length, 136);
  assert.equal(
    host.querySelector(`[data-role="editor"][data-permission="${key}"]`)
      .checked,
    false,
  );
  kind.value = "changed";
  kind.dispatchEvent(new dom.window.Event("change"));
  assert.equal(host.querySelectorAll('[data-role="editor"]').length, 1);
  assert.match(
    host.querySelector("#role-access-changes").textContent,
    /1 unsaved change/,
  );
  await host.querySelector("form").onsubmit({ preventDefault() {} });
  const body = JSON.parse(calls.at(-1).body);
  assert.equal(host.querySelector("#role-access-save").disabled, true);
  assert.match(
    host.querySelector("#role-access-count").textContent,
    /0 of 136/,
  );
  assert.equal(body.revision, 4);
  assert.equal(body.permissions.editor[key], false);
  assert.equal(notices.at(-1), "Role permissions saved successfully.");
});
