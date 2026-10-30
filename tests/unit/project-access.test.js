const test = require("node:test");
const assert = require("node:assert/strict");
const { IDBFactory } = require("fake-indexeddb");
const { webcrypto } = require("node:crypto");
const { createHistory } = require("../../src/client/import-history");
const Access = require("../../src/shared/project-access");
const { normalizeReport } = require("../../src/shared/report-data");
const Users = require("../../src/server/user-management");
test("project access checks current membership, selected scopes, and unassigned reports", () => {
  const status = {
    enabled: true,
    authenticated: true,
    organization: { id: "default" },
    user: { organizationId: "default", projects: ["web", "mobile"] },
  };
  assert.equal(Access.allowed({ metadata: { project: "web" } }, status), true);
  assert.equal(
    Access.allowed({ metadata: { project: "private" } }, status),
    false,
  );
  assert.equal(Access.allowed({}, status), false);
  assert.equal(Access.allowed({}, null), false);
  assert.equal(Access.allowed({}, {}), false);
  assert.equal(
    Access.allowed(
      {},
      { ...status, user: { organizationId: "other", projects: ["*"] } },
    ),
    false,
  );
  assert.equal(Users.belongsToOrganization({ organizationId: "other" }), false);
  assert.equal(
    Users.isGlobalAdmin({
      role: "admin",
      projects: ["*"],
      organizationId: "other",
    }),
    false,
  );
});
test("browser lists, direct reads, attachments and backups respect changing project assignments", async () => {
  let status = { enabled: false };
  const history = createHistory({
    indexedDB: new IDBFactory(),
    crypto: webcrypto,
    name: "scoped-history",
    canAccess: (entry) => Access.allowed(entry, status),
  });
  const entries = {};
  const raw = {
    stats: { tests: 1 },
    results: [
      { file: "test.cy.js", tests: [{ title: "works", state: "passed" }] },
    ],
  };
  for (const project of ["web", "mobile", "secret"]) {
    const report = normalizeReport(raw);
    report.metadata = { project };
    entries[project] = await history.save({
      text: JSON.stringify(raw),
      name: "report.json",
      report,
    });
    await history.saveEvidence({
      id: project,
      runId: entries[project].id,
      testKey: "test",
      blob: new Blob([project]),
    });
  }
  const full = await history.snapshot();
  status = {
    enabled: true,
    authenticated: true,
    organization: { id: "default" },
    user: { organizationId: "default", projects: ["web", "mobile"] },
  };
  assert.equal((await history.list(true)).length, 2);
  await assert.rejects(
    () => history.get(entries.secret.id),
    /outside your assigned/,
  );
  await assert.rejects(
    () => history.listEvidence(entries.secret.id),
    /outside your assigned/,
  );
  await assert.rejects(
    () => history.updateDetails(entries.secret.id, { label: "Hidden" }),
    /outside your assigned/,
  );
  const backup = await history.snapshot();
  assert.equal(backup.entries.length, 2);
  assert.equal(backup.reports.length, 2);
  assert.equal(backup.evidence.length, 2);
  await assert.rejects(
    () => history.restoreSnapshot(full),
    /outside your assigned/,
  );
  status.user.projects = ["mobile"];
  assert.equal((await history.list()).length, 1);
  await assert.rejects(
    () => history.get(entries.web.id),
    /outside your assigned/,
  );
  status.authenticated = false;
  assert.equal((await history.snapshot()).entries.length, 0);
  await history.close();
});

test("browser all-project access is limited to the current organization's project directory", () => {
  const status = {
    enabled: true,
    authenticated: true,
    organization: { id: "other" },
    user: { organizationId: "other", projects: ["*"] },
    accessibleProjects: [{ id: "portal-b", organizationId: "other" }],
  };
  assert.equal(
    Access.allowed({ metadata: { project: "portal-b" } }, status),
    true,
  );
  assert.equal(
    Access.allowed({ metadata: { project: "portal-a" } }, status),
    false,
  );
  assert.equal(
    Access.allowed(
      { metadata: { project: "portal-b" } },
      { ...status, accessibleProjects: [] },
    ),
    false,
  );
});
