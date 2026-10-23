const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../../src/shared/investigation-model");
function item(title, status, duration = 10, file = "test.cy.ts") {
  return {
    id: title,
    title,
    fullTitle: `suite ${title}`,
    file,
    status,
    duration,
    error: "",
  };
}
function report(tests, duration = 100) {
  return {
    tests,
    duration,
    passRate: tests.length
      ? (tests.filter((test) => test.status === "passed").length /
          tests.length) *
        100
      : 0,
  };
}
test("comparison separates regressions, fixes, missing, added, pending, and slow tests", () => {
  const before = report([
    item("regression", "passed"),
    item("fix", "failed"),
    item("persistent", "failed"),
    item("missing", "passed"),
    item("pending", "failed"),
    item("slow", "passed", 20),
  ]);
  const after = report(
    [
      item("regression", "failed"),
      item("fix", "passed"),
      item("persistent", "failed"),
      item("added", "failed"),
      item("pending", "pending"),
      item("slow", "passed", 40),
    ],
    150,
  );
  const result = I.compareRuns(before, after);
  assert.equal(result.matched, 5);
  assert.deepEqual(
    result.regressions.map((row) => row.current.title),
    ["regression"],
  );
  assert.deepEqual(
    result.fixed.map((row) => row.current.title),
    ["fix"],
  );
  assert.equal(result.stillFailing.length, 1);
  assert.equal(result.added.length, 1);
  assert.equal(result.missing.length, 1);
  assert.equal(result.stateChanges[0].current.status, "pending");
  assert.equal(result.slower[0].durationDelta, 20);
  assert.equal(result.durationDelta, 50);
});
test("comparison excludes ambiguous tests and matches full titles within their own spec", () => {
  const before = report([
    item("same", "passed"),
    item("same", "failed"),
    item("same", "passed", 1, "other.cy.ts"),
  ]);
  const after = report([
    item("same", "failed"),
    item("same", "failed", 1, "other.cy.ts"),
  ]);
  const result = I.compareRuns(before, after);
  assert.equal(result.ambiguous, 1);
  assert.equal(result.matched, 1);
  assert.equal(result.regressions.length, 1);
  assert.equal(result.added.length, 0);
  assert.equal(result.missing.length, 0);
});
test("comparison keeps unavailable duration and zero baseline separate", () => {
  const result = I.compareRuns(
    report([item("a", "passed", 0)], null),
    report([item("a", "passed", 5)], 50),
  );
  assert.equal(result.durationDelta, null);
  assert.equal(result.slower[0].durationDelta, 5);
  const empty = I.compareRuns(report([]), report([]));
  assert.equal(empty.matched, 0);
  assert.equal(empty.passRateDelta, 0);
});
test("failure groups normalize volatile IDs and timeouts, preserve assertion values and selectors", () => {
  const first = {
    ...item("a", "failed"),
    error:
      "CypressError: user 11111111-1111-1111-1111-111111111111 disabled after 30000ms",
  };
  const second = {
    ...item("b", "failed", 20, "other.cy.ts"),
    error:
      "CypressError: user 22222222-2222-2222-2222-222222222222 disabled after 40000ms",
  };
  const groups = I.failureGroups(
    report([
      first,
      second,
      { ...item("c", "failed"), error: "expected #first to have 2 items" },
      { ...item("d", "failed"), error: "expected #first to have 3 items" },
      { ...item("e", "failed"), error: "expected #second to have 2 items" },
      item("pass", "passed"),
    ]),
  );
  assert.equal(groups.length, 4);
  assert.equal(groups[0].tests.length, 2);
  assert.equal(groups[0].specs.length, 2);
  assert.equal(groups[0].duration, 30);
  assert.equal(groups[0].message, first.error);
  assert.equal(
    groups.reduce((sum, group) => sum + group.tests.length, 0),
    5,
  );
});
test("test history distinguishes missing, duplicate, pending, and executed outcomes", () => {
  const sample = item("a", "passed");
  const key = I.identity(sample);
  const timeline = I.testTimeline(
    [
      { id: "1", report: report([sample]) },
      { id: "2", report: report([item("a", "failed")]) },
      { id: "3", report: report([]) },
      { id: "4", report: report([sample, sample]) },
      { id: "5", report: report([item("a", "pending")]) },
    ],
    key,
  );
  assert.deepEqual(
    timeline.rows.map((row) => row.status),
    ["passed", "failed", "missing", "ambiguous", "pending"],
  );
  assert.equal(timeline.executed, 2);
  assert.equal(timeline.counts.failed, 1);
  assert.equal(timeline.rows[3].test, null);
});
test("comparison exports all outcome categories and escapes report and test content", () => {
  const comparison = I.compareRuns(
    report([item("<script>", "passed")]),
    report([item("<script>", "failed")]),
  );
  const markdown = I.comparisonMarkdown(
    comparison,
    { name: "a[link].json", start: "2026-10-22" },
    { name: "b.json", start: "2026-10-23" },
  );
  assert.match(markdown, /New regressions \(1\)/);
  assert.ok(markdown.includes("a\\[link\\].json"));
  assert.ok(!markdown.includes("<script>"));
  assert.match(markdown, /Missing tests \(0\)/);
});
