const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Policy = require("../../src/shared/access-policy");
test("access catalog matches every supplied 0/1 matrix cell", () => {
  const lines = fs
    .readFileSync(path.join(__dirname, "../../docs/access-matrix.tsv"), "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1);
  assert.equal(Policy.features.length, 136);
  assert.equal(lines.length, 136);
  for (const [index, line] of lines.entries()) {
    const [tab, name, ...values] = line.split("\t").map((s) => s.trim());
    const feature = Policy.features[index];
    assert.equal(feature.tab, tab);
    assert.equal(feature.name, name);
    for (const [i, role] of ["admin", "editor", "viewer"].entries())
      assert.equal(
        feature.defaults[role],
        values[i] === "1",
        feature.id + " " + role,
      );
  }
});
test("sharing parent denial overrides filtering and paging without changing configured defaults", () => {
  const configured = Policy.configured({}, "editor"),
    effective = Policy.resolve({}, "editor");
  assert.equal(
    configured["settings-sharing-access.filter-reports-by-project"],
    true,
  );
  assert.equal(
    effective["settings-sharing-access.filter-reports-by-project"],
    false,
  );
  assert.equal(effective["settings-sharing-access.load-older-reports"], false);
  assert.equal(Policy.page(effective, "users"), true);
  assert.equal(Policy.page(Policy.resolve({}, "viewer"), "projects"), false);
  assert.equal(Policy.page(Policy.resolve({}, "viewer"), "profile"), true);
  assert.equal(Policy.page(effective, "workspace-settings"), true);
});
test("policy edits require a complete boolean matrix and protect account administration and security", () => {
  const matrix = () => ({
    editor: Policy.configured({}, "editor"),
    viewer: Policy.configured({}, "viewer"),
  });
  assert.deepEqual(Policy.validate(matrix()), matrix());
  for (const alter of [
    (p) => (p.admin = {}),
    (p) => delete p.viewer[Policy.features[0].id],
    (p) => (p.viewer.unknown = true),
    (p) => (p.editor[Policy.features[0].id] = 1),
    (p) => (p.viewer["login.establish-secure-cookie-sessions"] = false),
    (p) => (p.editor["users.add-users"] = true),
  ]) {
    const p = matrix();
    alter(p);
    assert.throws(() => Policy.validate(p));
  }
  assert.ok(
    Object.values(Policy.resolve({ admin: {} }, "admin")).every(Boolean),
  );
  const p = matrix();
  p.viewer["test-results.view-recorded-test-code"] = false;
  assert.equal(
    Policy.resolve(Policy.validate(p), "viewer")[
      "test-results.view-recorded-test-code"
    ],
    false,
  );
  assert.equal(Policy.can({}, "missing"), false);
});
