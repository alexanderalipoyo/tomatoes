const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeReport } = require("./report-data");
const fixture = require("./results.json");
test("the imported run reconciles every test outcome and failed spec", () => {
  const report = normalizeReport(fixture);
  assert.deepEqual(report.counts, {
    total: 1261,
    passed: 952,
    failed: 141,
    pending: 126,
    skipped: 42,
    unknown: 0,
  });
  assert.equal(report.specs.length, 107);
  assert.equal(report.failedSpecs, 40);
  assert.equal(report.duration, 44939488);
  assert.equal(report.status, "failed");
  assert.equal(report.warnings.length, 0);
  assert.equal(
    report.tests.reduce((sum, test) => sum + test.duration, 0),
    41452894,
  );
  assert.equal(
    report.specs.reduce((sum, spec) => sum + spec.counts.total, 0),
    1261,
  );
  assert.ok(
    report.tests
      .filter((test) => test.status === "failed")
      .every((test) => test.error),
  );
  assert.ok(report.tests.every((test) => !test.file.includes("\\")));
});
test("nested suites, skipped precedence, hook exclusion, and unknown states", () => {
  const report = normalizeReport({
    stats: { tests: 4 },
    results: [
      {
        file: "a\\b.cy.ts",
        tests: [
          { title: "<script>", state: "passed" },
          { isHook: true, state: "failed" },
        ],
        suites: [
          {
            title: "Nested",
            tests: [
              { state: "pending", skipped: true },
              { pending: true },
              { state: "unrecognized", duration: -10 },
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(report.counts, {
    total: 4,
    passed: 1,
    failed: 0,
    pending: 1,
    skipped: 1,
    unknown: 1,
  });
  assert.equal(report.tests[1].suite, "Nested");
  assert.equal(report.tests[3].duration, 0);
  assert.equal(report.status, "unknown");
  assert.equal(report.tests[0].title, "<script>");
});
test("empty reports do not divide by zero or claim a passing run", () => {
  const report = normalizeReport({ stats: {}, results: [] });
  assert.equal(report.passRate, 0);
  assert.equal(report.status, "incomplete");
  assert.equal(report.duration, null);
});
test("invalid reports are rejected and inconsistent summary totals are surfaced", () => {
  assert.throws(() => normalizeReport({}), /Mochawesome/);
  const report = normalizeReport({
    stats: { tests: 3, passes: 3 },
    results: [{ tests: [{ state: "failed" }] }],
  });
  assert.equal(report.warnings.length, 2);
  assert.equal(report.counts.failed, 1);
});
test("a failed test with a pending flag remains failed, as in the imported hook failure", () => {
  const report = normalizeReport({
    stats: {},
    results: [
      {
        tests: [
          {
            state: "failed",
            fail: true,
            pending: true,
            err: { message: "before all hook failed" },
          },
        ],
      },
    ],
  });
  assert.equal(report.counts.failed, 1);
  assert.equal(report.counts.pending, 0);
});
const { dashboardStats } = require("./report-data");
test("dashboard widgets reconcile the latest run and rank failures and durations", () => {
  const report = normalizeReport(fixture);
  const stats = dashboardStats(report);
  assert.equal(stats.executed, 1093);
  assert.equal(stats.executionRate, (1093 / 1261) * 100);
  assert.deepEqual(stats.specGroups, {
    failed: 40,
    passed: 52,
    pending: 15,
    skipped: 0,
    unknown: 0,
    empty: 0,
  });
  assert.equal(
    Object.values(stats.specGroups).reduce((sum, value) => sum + value, 0),
    107,
  );
  assert.equal(
    stats.failureSpecs.reduce((sum, spec) => sum + spec.counts.failed, 0),
    67,
  );
  assert.deepEqual(
    stats.failureSpecs.map((spec) => spec.counts.failed),
    [19, 19, 14, 8, 7],
  );
  assert.equal(stats.slowestTests[0].duration, 6959354);
  assert.equal(stats.totalTestTime, 41452894);
  assert.equal(stats.medianDuration, 26139);
});
test("dashboard widgets handle empty and non-executed runs", () => {
  const empty = dashboardStats(normalizeReport({ stats: {}, results: [] }));
  assert.equal(empty.executionRate, 0);
  assert.equal(empty.medianDuration, null);
  assert.deepEqual(empty.failureSpecs, []);
  assert.deepEqual(empty.slowestTests, []);
  const pending = dashboardStats(
    normalizeReport({
      stats: {},
      results: [{ tests: [{ pending: true, duration: 0 }, { skipped: true }] }],
    }),
  );
  assert.equal(pending.executed, 0);
  assert.equal(pending.medianDuration, null);
  assert.equal(pending.specGroups.pending, 1);
});
