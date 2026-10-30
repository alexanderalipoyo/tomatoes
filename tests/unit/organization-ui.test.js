const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const Projects = require("../../src/shared/project-management");
test("Justine sees organization identity independently of permitted project selection", () => {
  const dom = new JSDOM(
    `<span data-organization-name></span><span data-organization-initials></span><span data-workspace-name></span><span data-workspace-user></span><select data-project-picker></select><nav><a data-view="users"></a></nav>`,
  );
  const source = fs.readFileSync(
    path.join(__dirname, "../../src/client/app.js"),
    "utf8",
  );
  const start = source.indexOf("function renderWorkspaceIdentity()");
  const end = source.indexOf("async function openWorkspaceProject", start);
  const directory = [
    {
      id: "portal-a",
      name: "QA - Automation PII Portal",
      organizationId: "default",
      registered: true,
    },
  ];
  const context = {
    document: dom.window.document,
    URL,
    location: { href: "https://example.com/#projects" },
    historyEntries: [],
    activeHistoryId: null,
    report: null,
    workspaceProjects: directory,
    authStatus: {
      enabled: true,
      organization: { id: "default", name: "Breach Secure Now" },
      user: { role: "viewer", projects: ["portal-a"] },
    },
    userPreferences: {
      getState: () => ({
        user: { fullName: "Justine Lopez" },
        preferences: { profile: { firstName: "", lastName: "" } },
      }),
    },
    workspaceBranding: (id) => Projects.branding(id, directory),
    workspaceLogoMarkup: () => "",
    esc: (value) => String(value),
    openWorkspaceProject: () => {},
  };
  vm.runInNewContext(source.slice(start, end), context);
  context.renderWorkspaceIdentity();
  assert.equal(
    dom.window.document.querySelector("[data-organization-name]").textContent,
    "Breach Secure Now",
  );
  assert.equal(
    dom.window.document.querySelector("[data-workspace-name]").textContent,
    "QA - Automation PII Portal",
  );
  assert.equal(
    dom.window.document.querySelector("[data-workspace-user]").textContent,
    "Justine Lopez",
  );
  assert.equal(dom.window.document.querySelector("select").value, "portal-a");
  assert.equal(dom.window.document.querySelectorAll("option").length, 1);
  assert.equal(
    dom.window.document.querySelector('[data-view="users"]').hidden,
    true,
  );
  context.authStatus.organization.name = "Organization Two";
  directory[0].name = "Renamed Project";
  context.renderWorkspaceIdentity();
  assert.equal(
    dom.window.document.querySelector("[data-organization-name]").textContent,
    "Organization Two",
  );
  assert.equal(
    dom.window.document.querySelector("[data-workspace-name]").textContent,
    "Renamed Project",
  );
  assert.equal(
    dom.window.document.querySelector("select").selectedOptions[0].textContent,
    "Renamed Project",
  );
  assert.equal(context.authStatus.organization.id, "default");
  assert.equal(dom.window.document.querySelector("select").value, "portal-a");
  context.workspaceProjects = [];
  context.renderWorkspaceIdentity();
  assert.equal(dom.window.document.querySelector("select").disabled, true);
  assert.equal(
    dom.window.document.querySelector("[data-workspace-name]").textContent,
    "No assigned project",
  );
  dom.window.close();
});
