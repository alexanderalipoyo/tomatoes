const test = require("node:test");
const assert = require("node:assert/strict");
const Projects = require("../../src/shared/project-management");
const { summarize } = require("../../src/shared/project-catalog");
test("project names validate independently of stable identifiers", () => {
  const first = Projects.change([], { name: " Customer Portal " }, null, 1);
  assert.equal(first.id, "customer-portal");
  assert.equal(first.name, "Customer Portal");
  const renamed = Projects.change(
    [first],
    { name: "Public Website" },
    first.id,
    2,
  );
  assert.equal(renamed.id, first.id);
  assert.equal(renamed.createdAt, 1);
  assert.equal(renamed.updatedAt, 2);
  for (const name of ["", " ", "a".repeat(81), "bad\nname", "ﬃ".repeat(40)])
    assert.throws(() => Projects.change([], { name }, null), { status: 400 });
  assert.throws(
    () => Projects.change([first], { name: "customer portal" }, null),
    { status: 409 },
  );
  assert.throws(
    () => Projects.change([], { name: "Valid", id: "../private" }, null),
    { status: 400 },
  );
  assert.throws(
    () => Projects.change([], { name: "Valid", role: "admin" }, null),
    { status: 400 },
  );
});
test("empty projects appear before their first run and legacy runs keep their project key", () => {
  const rows = [{ id: "portal", name: "Customer portal", registered: true }];
  const catalog = summarize([], [], rows);
  assert.equal(catalog[0].displayName, "Customer portal");
  assert.equal(catalog[0].latest, null);
  const discovered = Projects.merge(rows, [
    { metadata: { project: "legacy" } },
  ]);
  assert.equal(discovered.find((row) => row.id === "legacy").registered, false);
  assert.equal(
    summarize(
      [
        {
          id: "run",
          metadata: { project: "portal" },
          status: "passed",
          start: "2026-10-23",
        },
      ],
      [],
      rows,
    )[0].serverCount,
    1,
  );
  const second = Projects.change(
    [{ id: "foo-bar", name: "Foo & bar" }],
    { name: "Foo bar" },
    null,
  );
  assert.equal(second.id, "foo-bar-2");
});
