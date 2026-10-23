(function (root) {
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
  const api = {
    normalizeReport,
    dashboardStats,
    validateReport,
    parseReportText,
    MAX_REPORT_BYTES,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ReportData = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
