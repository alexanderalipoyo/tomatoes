const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateGroups,
  normalizePath,
  matchesPath,
  groupStats,
  pathOptions,
} = require("../../src/shared/dashboard-groups");
const { normalizeReport } = require("../../src/shared/report-data");
function group(paths = ["cypress/e2e/admin"]) {
  return {
    id: "admin",
    name: "Admin",
    paths,
    metrics: ["outcomes", "passRate", "duration"],
  };
}
function sample() {
  return normalizeReport({
    stats: {},
    results: [
      {
        file: "cypress/e2e/admin/users.cy.js",
        tests: [
          { state: "passed", duration: 100 },
          { state: "failed", duration: 200 },
        ],
        suites: [],
      },
      {
        file: "cypress/e2e/admin/settings/profile.cy.js",
        tests: [
          { state: "pending", duration: 0 },
          { state: "skipped", duration: 0 },
          { state: "unknown", duration: 0 },
        ],
        suites: [],
      },
      {
        file: "cypress/e2e/admin-extra/users.cy.js",
        tests: [{ state: "passed", duration: 900 }],
        suites: [],
      },
    ],
  });
}
test("path groups match folders at segment boundaries and normalize Windows separators", () => {
  assert.equal(normalizePath(" ./cypress\\e2e\\admin/ "), "cypress/e2e/admin");
  assert.equal(
    matchesPath(
      "cypress/e2e/admin/settings/profile.cy.js",
      "cypress/e2e/admin",
    ),
    true,
  );
  assert.equal(
    matchesPath("cypress/e2e/admin-extra/users.cy.js", "cypress/e2e/admin"),
    false,
  );
  assert.equal(
    matchesPath("cypress/e2e/Admin/users.cy.js", "cypress/e2e/admin"),
    false,
  );
  assert.equal(matchesPath("cypress/e2e/admin/users.cy.js", ""), false);
});
test("overlapping parent, child, and exact-file paths count a matching spec once", () => {
  const stats = groupStats(
    sample(),
    group([
      "cypress/e2e/admin",
      "cypress/e2e/admin/settings",
      "cypress/e2e/admin/users.cy.js",
    ]),
  );
  assert.equal(stats.specs.length, 2);
  assert.deepEqual(stats.counts, {
    total: 5,
    passed: 1,
    failed: 1,
    pending: 1,
    skipped: 1,
    unknown: 1,
  });
  assert.equal(stats.passRate, 20);
  assert.equal(stats.duration, 300);
  assert.deepEqual(stats.unmatchedPaths, []);
});
test("exact file groups and multiple independent roots exclude unrelated specs", () => {
  const stats = groupStats(
    sample(),
    group(["cypress/e2e/admin/users.cy.js", "cypress/e2e/admin-extra"]),
  );
  assert.equal(stats.specs.length, 2);
  assert.equal(stats.counts.total, 3);
  assert.equal(stats.duration, 1200);
});
test("unmatched and empty groups expose no-data rather than a passing rate", () => {
  const stats = groupStats(sample(), group(["missing/path"]));
  assert.equal(stats.specs.length, 0);
  assert.equal(stats.passRate, null);
  assert.equal(stats.counts.total, 0);
  assert.deepEqual(stats.unmatchedPaths, ["missing/path"]);
  assert.equal(groupStats({ specs: [] }, group()).passRate, null);
});
test("definitions survive serialization with canonical paths and metric choices", () => {
  const [saved] = validateGroups(
    JSON.parse(
      JSON.stringify([
        {
          ...group(["./cypress\\e2e\\admin/", "cypress/e2e/admin"]),
          name: "  Admin  ",
          metrics: ["outcomes", "outcomes"],
        },
      ]),
    ),
  );
  assert.equal(saved.name, "Admin");
  assert.deepEqual(saved.paths, ["cypress/e2e/admin"]);
  assert.deepEqual(saved.metrics, ["outcomes"]);
});
test("invalid, oversized, duplicate and empty widget definitions are rejected", () => {
  for (const value of [
    null,
    {},
    Array(21).fill(group()),
    [group(), group()],
    [{ ...group(), name: " " }],
    [{ ...group(), id: "<script>" }],
    [group([])],
    [group(["*"])],
    [{ ...group(), metrics: [] }],
    [{ ...group(), metrics: ["unsupported"] }],
    [group(["cypress/\nadmin"])],
    [group(Array(31).fill("cypress"))],
  ]) {
    assert.throws(() => validateGroups(value));
  }
  assert.deepEqual(validateGroups([]), []);
});
test("path suggestions come from real spec folders and filenames", () => {
  const options = pathOptions(sample());
  assert.equal(new Map(options.folders).get("cypress/e2e/admin"), 2);
  assert.equal(new Map(options.folders).get("cypress/e2e/admin-extra"), 1);
  assert.ok(options.files.includes("cypress/e2e/admin/users.cy.js"));
});
test("groups reconcile actual bundled report totals and update for a new report", () => {
  const report = normalizeReport(
    require("../../examples/reports/results.json"),
  );
  const all = groupStats(report, group(["cypress"]));
  assert.deepEqual(all.counts, report.counts);
  assert.equal(all.specs.length, report.specs.length);
  const config = group(["cypress/e2e/admin"]);
  assert.equal(groupStats(sample(), config).counts.total, 5);
  assert.equal(groupStats({ specs: [] }, config).counts.total, 0);
});
