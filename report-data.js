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
          const status = test.skipped
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
  const api = { normalizeReport, dashboardStats };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ReportData = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
