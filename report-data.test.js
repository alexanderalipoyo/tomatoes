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
const { validateReport, parseReportText } = require("./report-data");
const validImport = () => ({
  stats: { tests: 1, passes: 1, failures: 0, pending: 0 },
  results: [
    {
      file: "sample.cy.ts",
      tests: [{ title: "works", state: "passed", duration: 10 }],
      suites: [],
    },
  ],
});
test("import validation accepts the actual Mochawesome file and reports validation progress", () => {
  const progress = [];
  const imported = parseReportText(JSON.stringify(fixture), (percent, label) =>
    progress.push([percent, label]),
  );
  assert.equal(imported.counts.total, 1261);
  assert.ok(
    progress.some(([, label]) => label === "Validating specs: 107 of 107"),
  );
  assert.ok(
    progress.every(
      ([percent], index) => index === 0 || percent >= progress[index - 1][0],
    ),
  );
  assert.equal(
    parseReportText("\uFEFF" + JSON.stringify(validImport())).counts.passed,
    1,
  );
});
test("import rejects malformed JSON, empty files, and unrelated JSON", () => {
  assert.throws(() => parseReportText(""), /empty/);
  assert.throws(() => parseReportText('{"stats":'), /Invalid JSON syntax/);
  for (const text of ["null", "[]", "123", '{"name":"package"}'])
    assert.throws(() => parseReportText(text), /expected/);
});
test("import validates nested arrays, types, durations, states, errors, and dates", () => {
  const cases = [
    [(r) => (r.stats.tests = "1"), /stats.tests/],
    [(r) => (r.stats.failures = -1), /stats.failures/],
    [(r) => (r.stats.start = "not-a-date"), /stats.start/],
    [
      (r) => {
        r.stats.start = "2026-10-23T10:00:00Z";
        r.stats.end = "2026-10-22T10:00:00Z";
      },
      /stats.end/,
    ],
    [(r) => (r.results[0].suites = {}), /results\[0\].suites/],
    [(r) => (r.results[0].tests = null), /results\[0\].tests/],
    [(r) => delete r.results[0].file, /file/],
    [(r) => (r.results[0].tests[0].title = 12), /title/],
    [(r) => (r.results[0].tests[0].state = "success"), /state/],
    [(r) => (r.results[0].tests[0].fail = "false"), /fail/],
    [(r) => (r.results[0].tests[0].duration = -10), /duration/],
    [(r) => (r.results[0].tests[0].err = "error"), /err/],
    [(r) => (r.results[0].tests[0].err = { message: [] }), /message/],
    [(r) => (r.results[0].suites = [null]), /suites\[0\]/],
  ];
  for (const [mutate, pattern] of cases) {
    const report = validImport();
    mutate(report);
    assert.throws(() => validateReport(report), pattern);
  }
});
test("format validation accepts empty reports and the overlapping hook failure flags", () => {
  assert.doesNotThrow(() =>
    validateReport({
      stats: { tests: 0, passes: 0, failures: 0, pending: 0 },
      results: [],
    }),
  );
  const report = validImport();
  report.results[0].tests[0] = {
    title: "hook failure",
    state: "failed",
    fail: true,
    pending: true,
  };
  assert.equal(parseReportText(JSON.stringify(report)).counts.failed, 1);
});
test("excessive nesting is rejected before aggregation", () => {
  const report = validImport();
  let suite = report.results[0];
  for (let index = 0; index < 102; index++) {
    const child = { tests: [], suites: [] };
    suite.suites.push(child);
    suite = child;
  }
  assert.throws(() => validateReport(report), /nesting depth/);
});
test("imports with a skipped state are counted as skipped even without a boolean flag", () => {
  const report = validImport();
  report.results[0].tests[0].state = "skipped";
  const result = parseReportText(JSON.stringify(report));
  assert.equal(result.counts.skipped, 1);
  assert.equal(result.counts.unknown, 0);
});
test("background worker reports progress and completion or validation failure", () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const messages = [];
  const self = {
    ReportData: require("./report-data"),
    postMessage: (message) => messages.push(message),
  };
  vm.runInNewContext(fs.readFileSync("./report-worker.js", "utf8"), {
    importScripts() {},
    self,
  });
  self.onmessage({ data: JSON.stringify(validImport()) });
  assert.equal(messages[0].type, "progress");
  assert.equal(messages.at(-1).type, "complete");
  assert.equal(messages.at(-1).report.counts.passed, 1);
  messages.length = 0;
  self.onmessage({ data: '{"stats":' });
  assert.equal(messages.at(-1).type, "error");
  assert.match(messages.at(-1).message, /Invalid JSON syntax/);
});
const { IDBFactory } = require("fake-indexeddb");
const { createHistory } = require("./import-history");
const { webcrypto } = require("node:crypto");
test("import history persists full report contents, lists metadata, and restores the last selection", async () => {
  const indexedDB = new IDBFactory();
  const options = { indexedDB, crypto: webcrypto, name: "persistence-test" };
  let history = createHistory(options);
  const firstText = JSON.stringify(validImport());
  const first = await history.save({
    text: firstText,
    name: "first.json",
    report: parseReportText(firstText),
  });
  const secondRaw = validImport();
  secondRaw.results[0].tests[0].state = "failed";
  secondRaw.stats.passes = 0;
  secondRaw.stats.failures = 1;
  const secondText = JSON.stringify(secondRaw);
  const second = await history.save({
    text: secondText,
    name: "second.json",
    report: parseReportText(secondText),
  });
  assert.notEqual(first.id, second.id);
  assert.equal((await history.list()).length, 2);
  assert.equal(await history.lastActive(), second.id);
  await history.markActive(first.id);
  await history.close();
  history = createHistory(options);
  assert.equal(await history.lastActive(), first.id);
  const restored = await history.get(first.id);
  assert.equal(restored.entry.name, "first.json");
  assert.equal(restored.text, firstText);
  assert.equal(parseReportText(restored.text).counts.passed, 1);
  assert.equal((await history.get(second.id)).entry.counts.failed, 1);
  assert.equal(
    (await history.list()).some((entry) => "text" in entry),
    false,
  );
  await history.close();
});
test("identical files deduplicate while different contents with the same filename stay separate", async () => {
  const history = createHistory({
    indexedDB: new IDBFactory(),
    crypto: webcrypto,
  });
  const text = JSON.stringify(validImport());
  const report = parseReportText(text);
  const first = await history.save({
    text,
    name: "index.json",
    report,
    source: "bundled",
    touch: false,
  });
  const again = await history.save({ text, name: "index.json", report });
  assert.equal(first.id, again.id);
  assert.equal((await history.list()).length, 1);
  assert.equal(again.importedAt, first.importedAt);
  assert.equal(again.source, "imported");
  const reopened = await history.save({
    text,
    name: "different-name.json",
    report,
    touch: false,
  });
  assert.equal(reopened.name, "index.json");
  assert.equal(reopened.lastImportedAt, again.lastImportedAt);
  const raw = validImport();
  raw.results[0].tests[0].duration = 100;
  const updatedText = JSON.stringify(raw);
  await history.save({
    text: updatedText,
    name: "index.json",
    report: parseReportText(updatedText),
  });
  assert.equal((await history.list()).length, 2);
  await history.close();
});
test("invalid imports leave history and the active selection unchanged", async () => {
  const history = createHistory({
    indexedDB: new IDBFactory(),
    crypto: webcrypto,
  });
  const text = JSON.stringify(validImport());
  const entry = await history.save({
    text,
    name: "valid.json",
    report: parseReportText(text),
  });
  await assert.rejects(
    async () =>
      history.save({
        text: "{}",
        name: "invalid.json",
        report: parseReportText("{}"),
      }),
    /expected/,
  );
  assert.equal((await history.list()).length, 1);
  assert.equal(await history.lastActive(), entry.id);
  await assert.rejects(history.get("missing"), /no longer available/);
  await history.close();
});
test("unavailable browser storage fails clearly rather than claiming an import is saved", async () => {
  const history = createHistory({ indexedDB: null, crypto: webcrypto });
  await assert.rejects(history.list(), /unavailable/);
  const text = JSON.stringify(validImport());
  await assert.rejects(
    history.save({ text, name: "report.json", report: parseReportText(text) }),
    /unavailable/,
  );
});
const { insightStats, stabilityStats } = require("./report-data");
test("analytics reconcile failure groups, areas, and executed-duration bins", () => {
  const report = normalizeReport(fixture);
  const data = insightStats(report);
  assert.equal(data.executed, 1093);
  assert.equal(data.executedPassRate, (952 / 1093) * 100);
  assert.equal(
    data.categories.reduce((sum, group) => sum + group.tests.length, 0),
    141,
  );
  assert.equal(
    data.folders.reduce((sum, area) => sum + area.total, 0),
    1261,
  );
  assert.equal(
    data.folders.reduce((sum, area) => sum + area.failed, 0),
    141,
  );
  assert.equal(
    data.bins.reduce((sum, bin) => sum + bin.count, 0),
    1093,
  );
  assert.equal(
    data.failureTime,
    report.tests
      .filter((test) => test.status === "failed")
      .reduce((sum, test) => sum + test.duration, 0),
  );
  assert.ok(data.p95 > 0);
});
test("analytics handle empty reports and duration boundaries", () => {
  const empty = insightStats(normalizeReport({ stats: {}, results: [] }));
  assert.equal(empty.p95, null);
  assert.equal(empty.executedPassRate, 0);
  const report = {
    tests: [0, 10000, 30000, 60000, 300000].map((duration, id) => ({
      file: "a.cy.ts",
      status: "passed",
      duration,
      error: "",
      id,
    })),
    counts: { passed: 5 },
  };
  assert.deepEqual(
    insightStats(report).bins.map((bin) => bin.count),
    [1, 1, 1, 1, 1],
  );
});
test("stability compares unique executed identities and does not equate skipped tests with failures", () => {
  const one = {
    file: "a.cy.ts",
    fullTitle: "suite changes",
    title: "changes",
    status: "passed",
    id: 5,
  };
  const two = {
    ...one,
    fullTitle: "suite consistent",
    title: "consistent",
    id: 6,
  };
  const runs = [
    { id: "first", label: "first", tests: [one, two] },
    {
      id: "second",
      label: "second",
      tests: [{ ...one, status: "failed" }, two],
    },
    {
      id: "third",
      label: "third",
      tests: [{ ...one, status: "pending" }, two],
    },
  ];
  const result = stabilityStats(runs, { tests: [one, two] });
  assert.equal(result.runs, 3);
  assert.equal(result.comparable, 2);
  assert.equal(result.changed.length, 1);
  assert.equal(result.changed[0].currentId, 5);
  assert.equal(result.changed[0].observations.length, 2);
  assert.equal(result.alwaysPassed, 1);
  assert.equal(result.alwaysFailed, 0);
});
test("stability excludes ambiguous duplicate titles and duplicate run ids", () => {
  const test = {
    file: "a.cy.ts",
    fullTitle: "same",
    title: "same",
    status: "passed",
    id: 0,
  };
  const result = stabilityStats(
    [
      { id: "a", tests: [test, test] },
      { id: "b", tests: [{ ...test, status: "failed" }] },
      { id: "c", tests: [test] },
      { id: "c", tests: [{ ...test, status: "failed" }] },
    ],
    { tests: [test] },
  );
  assert.equal(result.runs, 3);
  assert.equal(result.ambiguous, 1);
  assert.equal(result.changed.length, 0);
  assert.equal(result.comparable, 0);
  assert.equal(stabilityStats([], { tests: [] }).comparable, 0);
});
