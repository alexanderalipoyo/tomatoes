(function (root) {
  const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
  const fields = ["project", "environment", "branch"];
  function filterEntries(entries, filters = {}) {
    return entries.filter(
      (entry) =>
        !entry.deletedAt &&
        !entry.archivedAt &&
        fields.every(
          (key) =>
            !filters[key] ||
            (filters[key] === "__unlabelled__"
              ? !entry.metadata?.[key]
              : entry.metadata?.[key] === filters[key]),
        ),
    );
  }
  function comparableEntries(entries, metadata = {}) {
    return entries.filter(
      (entry) =>
        !entry.deletedAt &&
        !entry.archivedAt &&
        fields.every(
          (key) => (entry.metadata?.[key] || "") === (metadata[key] || ""),
        ),
    );
  }
  function runFingerprint(report) {
    const tests = report.tests
      .map((test) =>
        JSON.stringify([
          test.file,
          test.fullTitle,
          test.status,
          test.duration,
          test.error,
          test.stack,
          test.attempts,
        ]),
      )
      .sort();
    return JSON.stringify([
      report.start,
      report.end,
      report.duration,
      report.specs.map((spec) => spec.file).sort(),
      tests,
    ]);
  }
  function failureTrends(runs, investigations) {
    const patterns = new Map(),
      seen = new Set();
    for (const run of runs) {
      if (seen.has(run.fingerprint || run.id)) continue;
      seen.add(run.fingerprint || run.id);
      const timestamp = Number.isFinite(Date.parse(run.start))
        ? Date.parse(run.start)
        : run.importedAt;
      for (const group of investigations.failureGroups(run.report)) {
        let item = patterns.get(group.fingerprint);
        if (!item) {
          item = {
            pattern: group.fingerprint,
            runs: 0,
            tests: 0,
            first: timestamp,
            last: timestamp,
          };
          patterns.set(group.fingerprint, item);
        }
        item.runs++;
        item.tests += group.tests.length;
        item.first = Math.min(item.first, timestamp);
        item.last = Math.max(item.last, timestamp);
      }
    }
    return {
      runs: seen.size,
      patterns: [...patterns.values()].sort(
        (a, b) =>
          b.runs - a.runs ||
          b.tests - a.tests ||
          a.pattern.localeCompare(b.pattern),
      ),
    };
  }
  async function validateBackup(
    value,
    { reportData, validateEvidence, decode } = {},
  ) {
    if (
      !value ||
      value.format !== "tomatoes-backup" ||
      value.version !== 1 ||
      !Array.isArray(value.entries) ||
      !Array.isArray(value.reports) ||
      !Array.isArray(value.evidence)
    )
      throw new Error("Choose a Tomatoes backup file (version 1).");
    if (
      value.entries.length > 1000 ||
      value.reports.length !== value.entries.length ||
      value.evidence.length > 5000
    )
      throw new Error("Backup record limits exceeded or reports are missing.");
    const ids = new Set(),
      raw = new Map();
    for (const source of value.reports) {
      if (
        !source ||
        !/^[a-f0-9]{64}$/.test(source.id) ||
        typeof source.text !== "string" ||
        raw.has(source.id)
      )
        throw new Error("Backup has invalid or duplicate report identifiers.");
      if (
        new TextEncoder().encode(source.text).byteLength >
        reportData.MAX_REPORT_BYTES
      )
        throw new Error("A report exceeds the 50 MB limit.");
      raw.set(source.id, source.text);
    }
    const entries = [];
    for (const entry of value.entries) {
      if (
        !entry ||
        !/^[a-f0-9]{64}$/.test(entry.id) ||
        ids.has(entry.id) ||
        !raw.has(entry.id)
      )
        throw new Error("Backup contains duplicate or missing reports.");
      if (
        typeof entry.name !== "string" ||
        !entry.name.trim() ||
        entry.name.length > 255 ||
        typeof (entry.label || "") !== "string" ||
        (entry.label || "").length > 180 ||
        typeof (entry.notes || "") !== "string" ||
        (entry.notes || "").length > 2000
      )
        throw new Error("Backup report names or notes are invalid.");
      if (
        ![entry.importedAt, entry.lastImportedAt].every(
          (n) => Number.isFinite(n) && n > 0 && n <= 8640000000000000,
        ) ||
        (entry.archivedAt != null &&
          (!Number.isFinite(entry.archivedAt) ||
            entry.archivedAt <= 0 ||
            entry.archivedAt > 8640000000000000)) ||
        (entry.deletedAt != null &&
          (!Number.isFinite(entry.deletedAt) ||
            entry.deletedAt <= 0 ||
            entry.deletedAt > 8640000000000000))
      )
        throw new Error("Backup import dates are invalid.");
      const report = reportData.parseReportText(raw.get(entry.id));
      const metadata = reportData.normalizeMetadata(
        entry.metadata || report.metadata || {},
      );
      entries.push({
        id: entry.id,
        name: entry.name,
        label: entry.label || "",
        notes: entry.notes || "",
        source: entry.source === "bundled" ? "bundled" : "imported",
        importedAt: entry.importedAt,
        lastImportedAt: entry.lastImportedAt,
        deletedAt: entry.deletedAt || null,
        archivedAt: entry.archivedAt || null,
        metadata,
        start: report.start,
        end: report.end,
        duration: report.duration,
        status: report.status,
        counts: report.counts,
        specs: report.specs.length,
        passRate: report.passRate,
      });
      ids.add(entry.id);
    }
    const evidence = [],
      evidenceIds = new Set();
    for (const item of value.evidence) {
      if (
        !item ||
        !ids.has(item.runId) ||
        typeof item.id !== "string" ||
        !item.id.startsWith(item.runId + ":") ||
        item.id.length > 20000 ||
        evidenceIds.has(item.id) ||
        typeof item.testKey !== "string" ||
        item.testKey.length > 16000 ||
        typeof item.name !== "string" ||
        item.name.length > 180 ||
        typeof item.data !== "string" ||
        item.data.length > 36 * 1024 * 1024 ||
        item.data.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data) ||
        !Number.isFinite(item.savedAt)
      )
        throw new Error(
          "Backup evidence is invalid or belongs to a missing report.",
        );
      const bytes = decode(item.data),
        blob = new Blob([bytes], { type: item.type });
      await validateEvidence(blob);
      evidence.push({
        id: item.id,
        runId: item.runId,
        testKey: item.testKey,
        name: item.name,
        type: item.type,
        savedAt: item.savedAt,
        blob,
      });
      evidenceIds.add(item.id);
    }
    return {
      entries,
      reports: [...raw].map(([id, text]) => ({ id, text })),
      evidence,
    };
  }
  const api = {
    MAX_BACKUP_BYTES,
    filterEntries,
    comparableEntries,
    failureTrends,
    runFingerprint,
    validateBackup,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WorkspaceTools = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
