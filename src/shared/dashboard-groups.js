(function (root) {
  const METRICS = ["outcomes", "passRate", "duration"];
  function normalizePath(value) {
    return String(value || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/^(\.\/)+/, "")
      .replace(/\/+$/, "");
  }
  function validateGroups(value) {
    if (!Array.isArray(value) || value.length > 20)
      throw new Error("You can save up to 20 group widgets.");
    const ids = new Set();
    return value.map((group) => {
      if (
        !group ||
        typeof group.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(group.id) ||
        ids.has(group.id)
      )
        throw new Error("Invalid or duplicate widget ID.");
      ids.add(group.id);
      const name = typeof group.name === "string" ? group.name.trim() : "";
      if (!name || name.length > 80)
        throw new Error("Enter a group name of up to 80 characters.");
      if (
        !Array.isArray(group.paths) ||
        !group.paths.length ||
        group.paths.length > 30 ||
        group.paths.some((path) => typeof path !== "string")
      )
        throw new Error("Choose between 1 and 30 spec paths.");
      const paths = [...new Set(group.paths.map(normalizePath))];
      if (
        paths.some(
          (path) =>
            !path || path.length > 1000 || /[\r\n*?\x00-\x1f]/.test(path),
        )
      )
        throw new Error(
          "Use a folder or full spec path, without wildcards (one path per line).",
        );
      if (
        !Array.isArray(group.metrics) ||
        !group.metrics.length ||
        group.metrics.some((metric) => !METRICS.includes(metric))
      )
        throw new Error("Select at least one widget metric.");
      return {
        id: group.id,
        name,
        paths,
        metrics: [...new Set(group.metrics)],
      };
    });
  }
  function matchesPath(file, prefix) {
    const path = normalizePath(file);
    const normalized = normalizePath(prefix);
    return (
      Boolean(normalized) &&
      (path === normalized || path.startsWith(normalized + "/"))
    );
  }
  function groupStats(report, group) {
    const specs = report.specs.filter((spec) =>
      group.paths.some((prefix) => matchesPath(spec.file, prefix)),
    );
    const tests = specs.flatMap((spec) => spec.tests);
    const counts = {
      total: tests.length,
      passed: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
      unknown: 0,
    };
    for (const test of tests)
      counts[
        Object.hasOwn(counts, test.status) && test.status !== "total"
          ? test.status
          : "unknown"
      ]++;
    return {
      specs,
      counts,
      passRate: tests.length ? (counts.passed / tests.length) * 100 : null,
      duration: tests.reduce(
        (sum, test) =>
          sum +
          (Number.isFinite(test.duration) ? Math.max(0, test.duration) : 0),
        0,
      ),
      unmatchedPaths: group.paths.filter(
        (prefix) => !specs.some((spec) => matchesPath(spec.file, prefix)),
      ),
    };
  }
  function pathOptions(report) {
    const folders = new Map();
    const files = new Set();
    for (const spec of report.specs) {
      const file = normalizePath(spec.file);
      files.add(file);
      const segments = file.split("/");
      for (let index = 1; index < segments.length; index++) {
        const path = segments.slice(0, index).join("/");
        if (path) folders.set(path, (folders.get(path) || 0) + 1);
      }
    }
    return {
      folders: [...folders].sort(([a], [b]) => a.localeCompare(b)),
      files: [...files].sort(),
    };
  }
  const api = {
    METRICS,
    normalizePath,
    validateGroups,
    matchesPath,
    groupStats,
    pathOptions,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DashboardGroups = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
