(function (root) {
  const identity = (test) =>
    JSON.stringify([test.file.replace(/\\/g, "/"), test.fullTitle]);
  const executed = (test) => test && ["passed", "failed"].includes(test.status);
  function indexTests(report) {
    const unique = new Map(),
      ambiguous = new Set();
    for (const test of report.tests) {
      const key = identity(test);
      if (unique.has(key)) ambiguous.add(key);
      else unique.set(key, test);
    }
    for (const key of ambiguous) unique.delete(key);
    return { unique, ambiguous };
  }
  function compareRuns(before, after) {
    const left = indexTests(before),
      right = indexTests(after);
    const ambiguous = new Set([...left.ambiguous, ...right.ambiguous]);
    const result = {
      matched: 0,
      regressions: [],
      fixed: [],
      stillFailing: [],
      added: [],
      missing: [],
      stateChanges: [],
      slower: [],
      ambiguous: ambiguous.size,
      durationDelta:
        before.duration == null || after.duration == null
          ? null
          : after.duration - before.duration,
      passRateDelta: after.passRate - before.passRate,
    };
    for (const key of new Set([
      ...left.unique.keys(),
      ...right.unique.keys(),
    ])) {
      if (ambiguous.has(key)) continue;
      const previous = left.unique.get(key),
        current = right.unique.get(key);
      const row = {
        identity: key,
        previous,
        current,
        durationDelta:
          previous && current && executed(previous) && executed(current)
            ? current.duration - previous.duration
            : null,
      };
      if (!previous) result.added.push(row);
      else if (!current) result.missing.push(row);
      else {
        result.matched++;
        if (previous.status === "passed" && current.status === "failed")
          result.regressions.push(row);
        else if (previous.status === "failed" && current.status === "passed")
          result.fixed.push(row);
        else if (previous.status === "failed" && current.status === "failed")
          result.stillFailing.push(row);
        else if (previous.status !== current.status)
          result.stateChanges.push(row);
        if (row.durationDelta > 0) result.slower.push(row);
      }
    }
    result.slower.sort((a, b) => b.durationDelta - a.durationDelta);
    return result;
  }
  function normalizeError(message) {
    return (message || "No failure message recorded")
      .replace(/\x1b\[[0-9;]*m/g, "")
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        "<id>",
      )
      .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z\b/g, "<timestamp>")
      .replace(/\b\d+(?:\.\d+)?\s*ms\b/g, "<timeout>")
      .split(/\n\s*\n(?:Fix this|https?:|Because this)/)[0]
      .replace(/\s+/g, " ")
      .trim();
  }
  function failureGroups(report) {
    const groups = new Map();
    for (const test of report.tests) {
      if (test.status !== "failed") continue;
      const key = normalizeError(test.error);
      if (!groups.has(key))
        groups.set(key, {
          fingerprint: key,
          message: test.error || "No failure message recorded",
          tests: [],
          specs: new Set(),
          duration: 0,
        });
      const group = groups.get(key);
      group.tests.push(test);
      group.specs.add(test.file);
      group.duration += test.duration;
    }
    return [...groups.values()]
      .map((group) => ({ ...group, specs: [...group.specs] }))
      .sort(
        (a, b) =>
          b.tests.length - a.tests.length ||
          a.fingerprint.localeCompare(b.fingerprint),
      );
  }
  function testTimeline(runs, key) {
    const counts = {
      passed: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
      unknown: 0,
      missing: 0,
      ambiguous: 0,
    };
    const rows = runs.map((run) => {
      const indexed = indexTests(run.report);
      const test = indexed.unique.get(key);
      const status = indexed.ambiguous.has(key)
        ? "ambiguous"
        : test?.status || "missing";
      counts[status]++;
      return {
        runId: run.id,
        name: run.name,
        start: run.start,
        status,
        test: status === "ambiguous" ? null : test || null,
      };
    });
    return { rows, counts, executed: counts.passed + counts.failed };
  }
  function comparisonMarkdown(comparison, baseline, target) {
    const safe = (value) =>
      String(value || "Unavailable")
        .replace(/[\r\n]/g, " ")
        .replace(/[\\`*_{}\[\]<>|]/g, (char) => "\\" + char);
    const sections = [
      ["New regressions", "regressions"],
      ["Fixed tests", "fixed"],
      ["Still failing", "stillFailing"],
      ["Added tests", "added"],
      ["Missing tests", "missing"],
      ["Other outcome changes", "stateChanges"],
    ];
    return (
      "# Tomatoes run comparison\n\n" +
      `Baseline: ${safe(baseline.name)} (${safe(baseline.start)})\n\nTarget: ${safe(target.name)} (${safe(target.start)})\n\n` +
      sections
        .map(
          ([title, key]) =>
            `## ${title} (${comparison[key].length})\n\n` +
            (comparison[key]
              .map((row) => {
                const test = row.current || row.previous;
                return `- ${safe(test.fullTitle)} — ${safe(test.file)} (${row.previous?.status || "absent"} → ${row.current?.status || "absent"})`;
              })
              .join("\n") || "None.") +
            "\n",
        )
        .join("\n") +
      `\nMatched tests: ${comparison.matched}. Ambiguous identities excluded: ${comparison.ambiguous}.\n\nTest identity uses the spec path and full test title. Runs can differ in code, environment, and test data.\n`
    );
  }
  const api = {
    identity,
    indexTests,
    compareRuns,
    normalizeError,
    failureGroups,
    testTimeline,
    comparisonMarkdown,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Investigations = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
