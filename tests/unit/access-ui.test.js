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
test("role access route mounts its React page with authenticated services", (t) => {
  const { dom, context } = fixture(t, "admin");
  let mounted;
  context.teamRequest = async () => {};
  context.initializeAuth = async () => {};
  context.TomatoesReact = {
    renderRoleAccess: (host, props) => (mounted = { host, props }),
  };
  vm.runInNewContext(source("role-access"), context);
  const host = dom.window.document.querySelector("main");
  context.renderRoleAccess(host);
  assert.equal(mounted.host, host);
  assert.equal(mounted.props.request, context.teamRequest);
  assert.equal(mounted.props.onRefresh, context.initializeAuth);
  assert.equal(mounted.props.onToast, context.showToast);
});
