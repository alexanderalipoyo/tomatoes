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
    { pretendToBeVisual: true },
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

for (const role of ["viewer", "editor"]) {
  test(`${role} sees permitted organization and projects without admin access`, (t) => {
    const { dom, context } = fixture(t, role);
    const doc = dom.window.document;
    doc.querySelector("main").innerHTML =
      '<span data-organization-name>Current organization</span><select data-project-picker><option>Assigned project</option></select><a href="#projects" data-access-view="projects">Projects</a><button data-access-view="profile">Manage profile</button>';
    const grants = {
      "projects.view-projects-within-the-current-organization": true,
      "organization-project-navigation.display-dynamic-organization-identity": true,
      "organization-project-navigation.select-permitted-projects": true,
    };
    const policy = Policy.configured({}, role);
    for (const id of Object.keys(policy))
      if (id.startsWith("my-profile.")) policy[id] = false;
    context.authStatus.permissions = Policy.resolve(
      { [role]: { ...policy, ...grants } },
      role,
    );
    context.applyFeatureAccess();
    for (const selector of [
      "[data-organization-name]",
      "[data-project-picker]",
      '[data-access-view="projects"]',
    ])
      assert.equal(
        doc.querySelector(selector).classList.contains("access-restricted"),
        false,
      );
    assert.equal(context.canAccessView("role-access"), false);
    assert.equal(context.hasAccess("projects.create-projects"), false);
    assert.equal(context.hasAccess("projects.rename-projects"), false);
    context.authStatus.permissions = Policy.resolve(
      {
        [role]: {
          "projects.view-projects-within-the-current-organization": false,
        },
      },
      role,
    );
    context.applyFeatureAccess();
    assert.equal(
      doc
        .querySelector('[data-access-view="projects"]')
        .classList.contains("access-restricted"),
      true,
    );
  });
}

test("returning to a signed-in tab refreshes permissions and assigned projects without a new login", async (t) => {
  const { dom, context: originalContext } = fixture(t, "viewer");
  const context = { ...originalContext };
  let status = {
    ...context.authStatus,
    organization: { id: "org", name: "Organization A" },
    accessibleProjects: [{ id: "web", name: "Web" }],
  };
  let requests = 0,
    paints = 0;
  Object.assign(context, {
    window: dom.window,
    location: { hash: "#history" },
    AbortSignal,
    Date,
    teamRequest: async (route, options) => {
      requests++;
      assert.equal(route, "/api/team/status");
      assert.equal(options.cache, "no-store");
      return status;
    },
    renderWorkspaceIdentity: () => paints++,
    invalidateOutOfScopeReports: () => {},
  });
  vm.runInNewContext(source("auth") + "\n" + source("access-control"), context);
  await context.initializeAuth();
  status = {
    ...status,
    permissions: Policy.resolve(
      {
        viewer: {
          "organization-project-navigation.display-dynamic-organization-identity": true,
          "organization-project-navigation.select-permitted-projects": true,
        },
      },
      "viewer",
    ),
    accessibleProjects: [{ id: "portal", name: "Portal" }],
  };
  await context.refreshSessionAccess();
  assert.equal(
    context.hasAccess(
      "organization-project-navigation.display-dynamic-organization-identity",
    ),
    true,
  );
  assert.equal(
    vm.runInNewContext("authStatus.accessibleProjects[0].id", context),
    "portal",
  );
  assert.equal(paints, 2);
  await context.refreshSessionAccess();
  assert.equal(requests, 2, "focus and visibility events share a cooldown");
});

for (const role of ["viewer", "editor"]) {
  test(`${role} always sees own organization and full name even with legacy false permissions`, (t) => {
    const { dom, context } = fixture(t, role);
    const doc = dom.window.document;
    doc.querySelector("main").innerHTML =
      '<button data-workspace-trigger><span data-organization-initials>CO</span><span data-organization-name>Current organization</span><small data-workspace-user>Justine Lopez</small></button><div class="workspace-menu-organizations"><strong data-organization-name>Current organization</strong></div><div>Signed in as <span data-workspace-user>Justine Lopez</span></div>';
    // Reproduce a response from an older deployment or saved role policy.
    for (const id of Object.keys(context.authStatus.permissions))
      if (id.startsWith("organization-project-navigation."))
        context.authStatus.permissions[id] = false;
    context.applyFeatureAccess();
    for (const element of doc.querySelectorAll(
      "[data-organization-name], [data-organization-initials], [data-workspace-user], .workspace-menu-organizations",
    ))
      assert.equal(element.classList.contains("access-restricted"), false);
    assert.equal(
      doc.body.classList.contains("limited-workspace-identity"),
      false,
    );
    assert.equal(
      context.hasAccess(
        "organization-project-navigation.select-permitted-projects",
      ),
      false,
    );
    assert.equal(context.canAccessView("role-access"), false);
    assert.equal(context.hasAccess("users.edit-users"), false);
  });
}
