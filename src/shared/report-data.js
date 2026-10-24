(function (root) {
  const METADATA_FIELDS = [
    "project",
    "environment",
    "branch",
    "commit",
    "buildUrl",
  ];
  function reportIdentityText(text, project = "", branch = "") {
    return (
      (project ? project + "\0" : "") +
      (branch ? "branch:" + JSON.stringify(branch) + "\0" : "") +
      text
    );
  }
  function normalizeMetadata(value = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Run metadata must be an object.");
    const result = {};
    for (const key of METADATA_FIELDS) {
      if (value[key] == null || value[key] === "") {
        result[key] = "";
        continue;
      }
      if (
        typeof value[key] !== "string" ||
        value[key].length > (key === "buildUrl" ? 2048 : 160)
      )
        throw new Error(`Metadata ${key} must be a short string.`);
      if (key === "branch" && /[\x00-\x1f\x7f]/.test(value[key]))
        throw new Error("Branch names must not contain control characters.");
      result[key] = value[key].trim();
    }
    if (
      result.project &&
      !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(result.project)
    )
      throw new Error(
        "Project must use letters, numbers, dots, underscores, or hyphens (up to 80 characters).",
      );
    if (result.buildUrl) {
      let url;
      try {
        url = new URL(result.buildUrl);
      } catch {
        throw new Error("Build URL must be an absolute HTTP or HTTPS URL.");
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error(
          "Build URL must be an HTTP or HTTPS URL without embedded credentials.",
        );
    }
    return result;
  }
  function normalizeAttempts(test) {
    if (!("attempts" in test)) return [];
    if (!Array.isArray(test.attempts) || test.attempts.length > 100)
      throw new Error(
        "Test attempts must be an array with at most 100 records.",
      );
    return test.attempts.map((attempt, index) => {
      if (
        !attempt ||
        !["passed", "failed", "pending", "skipped"].includes(attempt.state)
      )
        throw new Error(`Attempt ${index + 1} must have a recognized state.`);
      const duration = attempt.duration ?? attempt.wallClockDuration ?? null;
      if (duration !== null && (!Number.isFinite(duration) || duration < 0))
        throw new Error(`Attempt ${index + 1} has an invalid duration.`);
      return {
        state: attempt.state,
        duration,
        error:
          typeof attempt.error === "string"
            ? attempt.error
            : typeof attempt.error?.message === "string"
              ? attempt.error.message
              : "",
      };
    });
  }
  function retryStats(report) {
    const withEvidence = report.tests.filter((test) => test.attempts?.length);
    const retried = withEvidence.filter((test) => test.attempts.length > 1);
    const confirmed = retried.filter(
      (test) =>
        test.status === "passed" &&
        test.attempts.at(-1).state === "passed" &&
        test.attempts
          .slice(0, -1)
          .some((attempt) => attempt.state === "failed"),
    );
    return {
      withEvidence: withEvidence.length,
      retried: retried.length,
      confirmed,
    };
  }
  function normalizeReport(report) {
    if (!report || !report.stats || !Array.isArray(report.results)) {
      throw new Error("Expected a Mochawesome report with stats and results.");
    }
    const tests = [];
    const specs = report.results.map((spec, index) => {
      const file = String(
        spec.file || spec.fullFile || `Spec ${index + 1}`,
      ).replace(/\\/g, "/");
      const specTests = [];
      function visit(suite, ancestors) {
        const titles = suite.title
          ? [...ancestors, String(suite.title)]
          : ancestors;
        for (const test of suite.tests || []) {
          if (test.isHook) continue;
          const status =
            test.skipped || test.state === "skipped"
              ? "skipped"
              : test.fail || test.state === "failed"
                ? "failed"
                : test.pending || test.state === "pending"
                  ? "pending"
                  : test.pass || test.state === "passed"
                    ? "passed"
                    : "unknown";
          const item = {
            attempts: normalizeAttempts(test),
            id: tests.length,
            specId: index,
            file,
            title: String(test.title || "Untitled test"),
            fullTitle: String(
              test.fullTitle || [...titles, test.title].join(" "),
            ),
            suite: titles.join(" / "),
            status,
            duration: Number.isFinite(test.duration)
              ? Math.max(0, test.duration)
              : 0,
            error: String(test.err?.message || ""),
            stack: String(test.err?.estack || test.err?.stack || ""),
            code: String(test.code || ""),
            context:
              typeof test.context === "string"
                ? test.context
                : test.context == null
                  ? ""
                  : JSON.stringify(test.context, null, 2),
          };
          tests.push(item);
          specTests.push(item);
        }
        for (const child of suite.suites || []) visit(child, titles);
      }
      visit(spec, []);
      const counts = count(specTests);
      return {
        id: index,
        file,
        name: file.split("/").pop(),
        tests: specTests,
        counts,
        duration: specTests.reduce((sum, test) => sum + test.duration, 0),
        status: counts.failed
          ? "failed"
          : counts.unknown
            ? "unknown"
            : counts.passed
              ? "passed"
              : counts.pending
                ? "pending"
                : counts.skipped
                  ? "skipped"
                  : "empty",
      };
    });
    const counts = count(tests);
    const warnings = [];
    for (const [source, target] of [
      ["tests", "total"],
      ["passes", "passed"],
      ["failures", "failed"],
      ["pending", "pending"],
      ["skipped", "skipped"],
    ]) {
      if (
        Number.isFinite(report.stats[source]) &&
        report.stats[source] !== counts[target]
      )
        warnings.push(
          `Reported ${source}: ${report.stats[source]}; test records: ${counts[target]}.`,
        );
    }
    const start = validDate(report.stats.start);
    const end = validDate(report.stats.end);
    const duration = Number.isFinite(report.stats.duration)
      ? Math.max(0, report.stats.duration)
      : start && end
        ? Math.max(0, new Date(end) - new Date(start))
        : null;
    return {
      specs,
      metadata: normalizeMetadata(
        report.tomatoes || report.metadata || report.meta?.tomatoes || {},
      ),
      tests,
      counts,
      warnings,
      start,
      end,
      duration,
      passRate: counts.total ? (counts.passed / counts.total) * 100 : 0,
      failedSpecs: specs.filter((spec) => spec.counts.failed).length,
      status: counts.failed
        ? "failed"
        : counts.unknown
          ? "unknown"
          : counts.passed
            ? "passed"
            : "incomplete",
    };
  }
  function count(tests) {
    const counts = {
      total: tests.length,
      passed: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
      unknown: 0,
    };
    for (const test of tests) counts[test.status]++;
    return counts;
  }
  function validDate(value) {
    return value && Number.isFinite(Date.parse(value))
      ? new Date(value).toISOString()
      : null;
  }
  function dashboardStats(report) {
    const executed = report.tests.filter(
      (test) => test.status === "passed" || test.status === "failed",
    );
    const durations = executed
      .map((test) => test.duration)
      .sort((a, b) => a - b);
    const middle = Math.floor(durations.length / 2);
    const medianDuration = durations.length
      ? durations.length % 2
        ? durations[middle]
        : (durations[middle - 1] + durations[middle]) / 2
      : null;
    const specGroups = {
      failed: 0,
      passed: 0,
      pending: 0,
      skipped: 0,
      unknown: 0,
      empty: 0,
    };
    report.specs.forEach((spec) => specGroups[spec.status]++);
    return {
      executed: executed.length,
      executionRate: report.counts.total
        ? (executed.length / report.counts.total) * 100
        : 0,
      totalTestTime: report.tests.reduce((sum, test) => sum + test.duration, 0),
      medianDuration,
      specGroups,
      failureSpecs: [...report.specs]
        .filter((spec) => spec.counts.failed)
        .sort(
          (a, b) =>
            b.counts.failed - a.counts.failed || a.file.localeCompare(b.file),
        )
        .slice(0, 5),
      slowestTests: [...report.tests]
        .filter((test) => test.duration > 0)
        .sort((a, b) => b.duration - a.duration || a.id - b.id)
        .slice(0, 5),
    };
  }
  const MAX_REPORT_BYTES = 50 * 1024 * 1024;
  function validateReport(report, progress = () => {}) {
    const isObject = (value) =>
      value !== null && typeof value === "object" && !Array.isArray(value);
    const fail = (path, expected) => {
      throw new Error(`${path}: expected ${expected}.`);
    };
    if (!isObject(report)) fail("Report", "a JSON object");
    if (!isObject(report.stats))
      fail("stats", "a Mochawesome statistics object");
    if (!Array.isArray(report.results))
      fail("results", "an array of spec results");
    for (const key of ["tests", "passes", "failures", "pending"]) {
      if (!Number.isInteger(report.stats[key]) || report.stats[key] < 0)
        fail(`stats.${key}`, "a non-negative integer");
    }
    for (const key of ["suites", "skipped", "testsRegistered", "other"]) {
      if (
        key in report.stats &&
        (!Number.isInteger(report.stats[key]) || report.stats[key] < 0)
      )
        fail(`stats.${key}`, "a non-negative integer");
    }
    if (
      "duration" in report.stats &&
      (!Number.isFinite(report.stats.duration) || report.stats.duration < 0)
    )
      fail("stats.duration", "a non-negative number in milliseconds");
    for (const key of ["passPercent", "pendingPercent"]) {
      if (
        key in report.stats &&
        (!Number.isFinite(report.stats[key]) ||
          report.stats[key] < 0 ||
          report.stats[key] > 100)
      )
        fail(`stats.${key}`, "a percentage from 0 to 100");
    }
    for (const key of ["start", "end"]) {
      if (
        key in report.stats &&
        (typeof report.stats[key] !== "string" ||
          !Number.isFinite(Date.parse(report.stats[key])))
      )
        fail(`stats.${key}`, "a valid date string");
    }
    if (
      report.stats.start &&
      report.stats.end &&
      Date.parse(report.stats.end) < Date.parse(report.stats.start)
    )
      fail("stats.end", "a date at or after stats.start");
    let records = 0;
    function stringField(object, key, path) {
      if (key in object && typeof object[key] !== "string")
        fail(`${path}.${key}`, "a string");
    }
    function suite(value, path, depth) {
      if (++records > 100000)
        throw new Error(
          "Report exceeds the limit of 100,000 suite and test records.",
        );
      if (depth > 100)
        throw new Error(
          "Report exceeds the maximum suite nesting depth of 100.",
        );
      if (!isObject(value)) fail(path, "a suite object");
      for (const key of ["title", "file", "fullFile", "uuid"])
        stringField(value, key, path);
      for (const key of ["tests", "suites"])
        if (!Array.isArray(value[key])) fail(`${path}.${key}`, "an array");
      value.tests.forEach((test, index) => {
        const testPath = `${path}.tests[${index}]`;
        if (++records > 100000)
          throw new Error(
            "Report exceeds the limit of 100,000 suite and test records.",
          );
        if (!isObject(test)) fail(testPath, "a test object");
        normalizeAttempts(test);
        if (typeof test.title !== "string")
          fail(`${testPath}.title`, "a string");
        for (const key of ["fullTitle", "code", "uuid"])
          stringField(test, key, testPath);
        for (const key of ["pass", "fail", "pending", "skipped", "isHook"])
          if (key in test && typeof test[key] !== "boolean")
            fail(`${testPath}.${key}`, "a boolean");
        if (
          "state" in test &&
          test.state !== null &&
          !["passed", "failed", "pending", "skipped"].includes(test.state)
        )
          fail(`${testPath}.state`, "passed, failed, pending, or skipped");
        if (
          !test.isHook &&
          !["passed", "failed", "pending", "skipped"].includes(test.state) &&
          !["pass", "fail", "pending", "skipped"].some(
            (key) => test[key] === true,
          )
        )
          fail(
            `${testPath}.state`,
            "a recognized outcome or a true outcome flag",
          );
        if (
          "duration" in test &&
          (!Number.isFinite(test.duration) || test.duration < 0)
        )
          fail(`${testPath}.duration`, "a non-negative number in milliseconds");
        if ("err" in test) {
          if (!isObject(test.err)) fail(`${testPath}.err`, "an error object");
          for (const key of ["message", "estack", "stack"])
            stringField(test.err, key, `${testPath}.err`);
        }
      });
      value.suites.forEach((child, index) =>
        suite(child, `${path}.suites[${index}]`, depth + 1),
      );
    }
    report.results.forEach((spec, index) => {
      suite(spec, `results[${index}]`, 0);
      if (!spec.file && !spec.fullFile)
        fail(`results[${index}].file`, "a non-empty spec file path");
      progress(index + 1, report.results.length);
    });
    return report;
  }
  function parseReportText(text, progress = () => {}) {
    if (typeof text !== "string" || !text.trim())
      throw new Error("The file is empty. Select a Mochawesome JSON report.");
    let raw;
    try {
      raw = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch (error) {
      throw new Error(`Invalid JSON syntax. ${error.message.slice(0, 220)}`);
    }
    progress(30, "Checking Mochawesome report format");
    validateReport(raw, (done, total) =>
      progress(
        30 + Math.floor((done / total) * 25),
        `Validating specs: ${done} of ${total}`,
      ),
    );
    progress(60, "Aggregating test results");
    const normalized = normalizeReport(raw);
    progress(
      70,
      `Validated ${normalized.tests.length.toLocaleString("en-US")} tests across ${normalized.specs.length} specs`,
    );
    return normalized;
  }
  function insightStats(report) {
    const executed = report.tests.filter((test) =>
      ["passed", "failed"].includes(test.status),
    );
    const ordered = executed.map((test) => test.duration).sort((a, b) => a - b);
    const categories = new Map();
    const folders = new Map();
    const bins = [
      { label: "Under 10s", max: 10000, count: 0 },
      { label: "10–30s", max: 30000, count: 0 },
      { label: "30–60s", max: 60000, count: 0 },
      { label: "1–5m", max: 300000, count: 0 },
      { label: "5m+", max: Infinity, count: 0 },
    ];
    for (const test of report.tests) {
      const folder =
        test.file.split("/").slice(0, -1).join("/") || "Root specs";
      if (!folders.has(folder))
        folders.set(folder, { folder, total: 0, failed: 0, duration: 0 });
      const group = folders.get(folder);
      group.total++;
      group.duration += test.duration;
      if (test.status === "failed") {
        group.failed++;
        const message = test.error;
        const category = /before (all|each)|after (all|each)|hook/i.test(
          message,
        )
          ? "Hook failures"
          : /cy\.wait\(\)|No request ever occurred|route:/i.test(message)
            ? "Network waits"
            : /cy\.(click|type|select|check)\(\)|disabled|detached/i.test(
                  message,
                )
              ? "Element interactions"
              : /TypeError|ReferenceError|SyntaxError/i.test(message)
                ? "Runtime errors"
                : /AssertionError|Timed out|expected/i.test(message)
                  ? "Assertions and timeouts"
                  : "Other errors";
        if (!categories.has(category))
          categories.set(category, { label: category, tests: [] });
        categories.get(category).tests.push(test);
      }
    }
    executed.forEach(
      (test) =>
        bins.find((bin) => test.duration < bin.max || bin.max === Infinity)
          .count++,
    );
    return {
      executed: executed.length,
      executedPassRate: executed.length
        ? (report.counts.passed / executed.length) * 100
        : 0,
      p95: ordered.length
        ? ordered[Math.ceil(ordered.length * 0.95) - 1]
        : null,
      failureTime: report.tests
        .filter((test) => test.status === "failed")
        .reduce((sum, test) => sum + test.duration, 0),
      categories: [...categories.values()].sort(
        (a, b) => b.tests.length - a.tests.length,
      ),
      folders: [...folders.values()].sort(
        (a, b) => b.failed - a.failed || b.total - a.total,
      ),
      bins,
    };
  }
  function stabilityStats(runs, currentReport) {
    const observations = new Map();
    const ambiguous = new Set();
    const key = (test) => JSON.stringify([test.file, test.fullTitle]);
    const seenRuns = new Set();
    for (const run of runs) {
      if (seenRuns.has(run.id)) continue;
      seenRuns.add(run.id);
      const grouped = new Map();
      for (const test of run.tests) {
        const identity = key(test);
        if (!grouped.has(identity)) grouped.set(identity, []);
        grouped.get(identity).push(test);
      }
      for (const [identity, tests] of grouped) {
        if (tests.length !== 1) {
          ambiguous.add(identity);
          continue;
        }
        const test = tests[0];
        if (!["passed", "failed"].includes(test.status)) continue;
        if (!observations.has(identity))
          observations.set(identity, {
            identity,
            title: test.title,
            file: test.file,
            observations: [],
          });
        observations.get(identity).observations.push({
          runId: run.id,
          label: run.label,
          status: test.status,
        });
      }
    }
    const current = new Map();
    for (const test of currentReport.tests) {
      const identity = key(test);
      current.set(identity, current.has(identity) ? null : test.id);
    }
    const comparable = [...observations.values()].filter(
      (item) => item.observations.length >= 2 && !ambiguous.has(item.identity),
    );
    const changed = comparable
      .filter(
        (item) =>
          new Set(item.observations.map((observation) => observation.status))
            .size > 1,
      )
      .map((item) => ({
        ...item,
        currentId: current.get(item.identity) ?? null,
        failures: item.observations.filter(
          (observation) => observation.status === "failed",
        ).length,
      }));
    changed.sort(
      (a, b) => b.failures - a.failures || a.title.localeCompare(b.title),
    );
    return {
      runs: seenRuns.size,
      comparable: comparable.length,
      changed,
      alwaysFailed: comparable.filter((item) =>
        item.observations.every(
          (observation) => observation.status === "failed",
        ),
      ).length,
      alwaysPassed: comparable.filter((item) =>
        item.observations.every(
          (observation) => observation.status === "passed",
        ),
      ).length,
      ambiguous: ambiguous.size,
    };
  }
  const api = {
    reportIdentityText,
    normalizeMetadata,
    normalizeAttempts,
    retryStats,
    insightStats,
    stabilityStats,
    normalizeReport,
    dashboardStats,
    validateReport,
    parseReportText,
    MAX_REPORT_BYTES,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ReportData = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
