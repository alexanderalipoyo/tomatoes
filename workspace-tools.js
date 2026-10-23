(function (root) {
  const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
  const fields = ["project", "environment", "branch"];
  function filterEntries(entries, filters = {}) {
    return entries.filter(
      (entry) =>
        !entry.deletedAt &&
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

if (typeof document !== "undefined") {
  let trendFilters = null;
  let trashedActiveId = null;
  function invalidateSavedAnalysis(id) {
    investigationCache.delete(id);
    stability = null;
    comparison = null;
  }
  function appendHistoryTools() {
    let host = document.querySelector("#history-tools");
    if (!host) {
      host = document.createElement("div");
      host.id = "history-tools";
      document.querySelector("#history-list").before(host);
    }
    host.innerHTML = `<div class="history-utility"><div><strong>Keep your reports safe</strong><p id="storage-usage">Checking browser storage…</p></div><div class="history-actions"><button class="button" id="backup-history">Download backup</button><button class="button" id="restore-history">Restore backup</button><button class="button" id="show-trash">View trash</button></div><input hidden type="file" id="backup-file" accept="application/json,.json"/></div><p class="widget-footnote">Backups include reports, labels, notes, metadata, attachments, and trash. Restores merge missing records and preserve existing local edits. Maximum backup size: 100 MB.</p><div id="trash-list"></div>`;
    if (navigator.storage?.estimate)
      navigator.storage
        .estimate()
        .then(({ usage, quota }) => {
          if (!host.isConnected) return;
          const target = host.querySelector("#storage-usage");
          if (target)
            target.textContent = `${((usage || 0) / 1048576).toFixed(1)} MB used for this site${quota ? ` / ${(quota / 1048576).toFixed(0)} MB available quota` : ""}. Trash continues to use storage.`;
        })
        .catch(() => {
          if (host.querySelector("#storage-usage"))
            host.querySelector("#storage-usage").textContent =
              "Storage estimate unavailable.";
        });
    else
      host.querySelector("#storage-usage").textContent =
        "Storage estimate unavailable.";
    document.querySelector("#backup-history").onclick = backupHistory;
    document.querySelector("#restore-history").onclick = () =>
      document.querySelector("#backup-file").click();
    document.querySelector("#backup-file").onchange = (event) => {
      const file = event.target.files[0];
      if (file) restoreHistory(file);
      event.target.value = "";
    };
    document.querySelector("#show-trash").onclick = showHistoryTrash;
    document
      .querySelectorAll("[data-manage-history]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            editHistoryEntry(button.dataset.manageHistory)),
      );
    document
      .querySelectorAll("[data-trash-history]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            trashHistoryEntry(button.dataset.trashHistory)),
      );
  }
  async function backupHistory() {
    await investigationBusy(
      "Preparing browser backup",
      async () => {
        const snapshot = await ImportHistory.snapshot();
        let size = snapshot.reports.reduce(
          (sum, item) => sum + new TextEncoder().encode(item.text).byteLength,
          0,
        );
        size += snapshot.evidence.reduce(
          (sum, item) => sum + Math.ceil(item.blob.size / 3) * 4,
          0,
        );
        if (size > WorkspaceTools.MAX_BACKUP_BYTES)
          throw new Error(
            "The backup exceeds 100 MB. This browser archive is too large for a single backup.",
          );
        const evidence = [];
        for (let index = 0; index < snapshot.evidence.length; index++) {
          const { blob, ...record } = snapshot.evidence[index];
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 8192)
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 8192),
            );
          evidence.push({ ...record, data: btoa(binary) });
          paintProgress(
            10 + Math.floor(((index + 1) / snapshot.evidence.length) * 70),
            `Packing attachment ${index + 1} of ${snapshot.evidence.length}`,
          );
          await allowPaint();
        }
        const text = JSON.stringify({
          format: "tomatoes-backup",
          version: 1,
          createdAt: new Date().toISOString(),
          entries: snapshot.entries,
          reports: snapshot.reports,
          evidence,
        });
        if (new Blob([text]).size > WorkspaceTools.MAX_BACKUP_BYTES)
          throw new Error("The backup exceeds 100 MB.");
        downloadInvestigation(
          text,
          `tomatoes-backup-${new Date().toISOString().slice(0, 10)}.json`,
          "application/json",
        );
        historyNotice(
          "Backup download started. Keep this file to restore your reports and attachments.",
        );
      },
      (error) => historyNotice(`Backup failed: ${error.message}`),
    );
  }
  async function restoreHistory(file) {
    await investigationBusy(
      "Validating backup",
      async () => {
        if (!file.size || file.size > WorkspaceTools.MAX_BACKUP_BYTES)
          throw new Error("Choose a backup between 1 byte and 100 MB.");
        let value;
        try {
          value = JSON.parse(await file.text());
        } catch {
          throw new Error("The backup is not valid JSON.");
        }
        paintProgress(20, "Checking every report and attachment");
        await allowPaint();
        const data = await WorkspaceTools.validateBackup(value, {
          reportData: ReportData,
          validateEvidence: ReportFeatures.validateEvidence,
          decode: (value) =>
            Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
        });
        paintProgress(80, "Restoring browser history");
        await allowPaint();
        const result = await ImportHistory.restoreSnapshot(data);
        investigationCache.clear();
        stability = null;
        comparison = null;
        await refreshHistory();
        historyNotice(
          `Restored ${result.added} reports; ${result.skipped} existing reports kept. Missing attachments were merged. Your selected report is unchanged.`,
        );
      },
      (error) => historyNotice(`Restore failed: ${error.message}`),
    );
  }
  function editHistoryEntry(id) {
    const entry = historyEntries.find((item) => item.id === id);
    if (!entry) return;
    document.querySelector("#detail-content").innerHTML =
      `<div class="dialog-heading"><h2 id="detail-title">Edit saved report</h2><p>${esc(entry.name)}</p></div><form id="history-edit" class="preference-form"><label>Display name<input id="history-label" maxlength="180" value="${esc(entry.label || entry.name)}" required/></label><label>Notes<textarea id="history-notes" maxlength="2000" rows="5">${esc(entry.notes || "")}</textarea></label><p class="widget-footnote">The original JSON and import timestamp are preserved.</p><button class="button primary">Save changes</button><p id="history-edit-status" role="status"></p></form>`;
    document.querySelector("#history-edit").onsubmit = async (event) => {
      event.preventDefault();
      const label = document.querySelector("#history-label").value.trim(),
        notes = document.querySelector("#history-notes").value.trim();
      if (!label) return;
      try {
        await ImportHistory.updateDetails(id, { label, notes });
        if (id === activeHistoryId) {
          sourceName = label;
          renderSummary();
        }
        invalidateSavedAnalysis(id);
        await refreshHistory();
        document.querySelector("#detail").close();
        historyNotice("Report name and notes saved.");
      } catch (error) {
        document.querySelector("#history-edit-status").textContent =
          error.message;
      }
    };
    document.querySelector("#detail").showModal();
  }
  async function trashHistoryEntry(id) {
    await investigationBusy(
      "Moving report to trash",
      async () => {
        await ImportHistory.updateDetails(id, { deletedAt: Date.now() });
        invalidateSavedAnalysis(id);
        await refreshHistory();
        if (id === activeHistoryId) {
          trashedActiveId = id;
          await ImportHistory.markActive(historyEntries[0]?.id || null);
          activeHistoryId = null;
        }
        historyNotice(
          "Report moved to trash. It remains recoverable, including its attachments.",
        );
        const banner = document.querySelector("#history-notice"),
          undo = document.createElement("button");
        undo.className = "button";
        undo.textContent = "Undo";
        undo.onclick = () => restoreTrashedEntry(id);
        banner.append(" ", undo);
      },
      (error) => historyNotice(error.message),
    );
  }
  async function restoreTrashedEntry(id) {
    try {
      await ImportHistory.updateDetails(id, { deletedAt: null });
      if (id === trashedActiveId && !activeHistoryId) {
        activeHistoryId = id;
        await ImportHistory.markActive(id);
      }
      if (id === trashedActiveId) trashedActiveId = null;
      invalidateSavedAnalysis(id);
      await refreshHistory();
      historyNotice("Report restored from trash.");
    } catch (error) {
      historyNotice(error.message);
    }
  }
  async function showHistoryTrash() {
    try {
      const entries = (await ImportHistory.list(true)).filter(
        (entry) => entry.deletedAt,
      );
      const host = document.querySelector("#trash-list");
      host.innerHTML = `<article class="insight-card"><h3>Trash</h3><p>Reports stay recoverable here and continue to use browser storage.</p>${entries.map((entry) => `<div class="trash-row"><span>${esc(entry.label || entry.name)}<small>Removed ${esc(date(new Date(entry.deletedAt).toISOString()))}</small></span><button class="button" data-restore-trash="${entry.id}">Restore</button></div>`).join("") || "<p>Trash is empty.</p>"}</article>`;
      host
        .querySelectorAll("[data-restore-trash]")
        .forEach(
          (button) =>
            (button.onclick = () =>
              restoreTrashedEntry(button.dataset.restoreTrash)),
        );
    } catch (error) {
      historyNotice(error.message);
    }
  }
  function filteredTrendEntries() {
    if (!trendFilters)
      trendFilters = {
        project: report.metadata?.project || "",
        environment: report.metadata?.environment || "",
        branch: "",
      };
    return WorkspaceTools.filterEntries(historyEntries, trendFilters);
  }
  function appendTrendFilters(alt) {
    const trendCard =
      alt.querySelector("[data-trend]")?.closest("article") ||
      [...alt.querySelectorAll("article")].find(
        (card) => card.querySelector("h2")?.textContent === "Saved-run trends",
      );
    if (!trendCard) return;
    const options = (key) =>
      [
        ...new Set(
          historyEntries.map((entry) => entry.metadata?.[key]).filter(Boolean),
        ),
      ]
        .sort()
        .map(
          (value) =>
            `<option value="${esc(value)}" ${trendFilters[key] === value ? "selected" : ""}>${esc(value)}</option>`,
        )
        .join("");
    trendCard.insertAdjacentHTML(
      "afterbegin",
      `<div class="trend-filters">${["project", "environment", "branch"].map((key) => `<label>${key[0].toUpperCase() + key.slice(1)}<select data-trend-filter="${key}"><option value="">All</option><option value="__unlabelled__" ${trendFilters[key] === "__unlabelled__" ? "selected" : ""}>Unlabelled</option>${options(key)}</select></label>`).join("")}</div><p class="widget-footnote">Filters apply to saved-run trends. The other analytics describe the selected report. Showing up to eight matching runs; unlabelled reports are identified separately.</p>`,
    );
    trendCard.querySelectorAll("[data-trend-filter]").forEach(
      (select) =>
        (select.onchange = () => {
          trendFilters[select.dataset.trendFilter] = select.value;
          renderAnalytics(alt);
        }),
    );
  }
  function appendFailureTrends(host) {
    host.insertAdjacentHTML(
      "beforeend",
      `<article class="insight-card failure-trend-card"><h2>Failure history</h2><p>Find first seen, last seen, and recurrence across reports with the same project, environment, and branch as this run. Blank labels match blank labels.</p><button class="button" id="analyze-failure-history">Analyze comparable runs</button><div id="failure-history-results" aria-live="polite"></div></article>`,
    );
    document.querySelector("#analyze-failure-history").onclick = async () => {
      await investigationBusy(
        "Reading comparable failure history",
        async () => {
          let entries = WorkspaceTools.comparableEntries(
            historyEntries,
            report.metadata,
          )
            .sort(
              (a, b) =>
                (Date.parse(b.start) || b.lastImportedAt) -
                (Date.parse(a.start) || a.lastImportedAt),
            )
            .slice(0, 20);
          const selected = historyEntries.find(
            (entry) => entry.id === activeHistoryId,
          );
          if (selected && !entries.some((entry) => entry.id === selected.id))
            entries = [selected, ...entries.slice(0, 19)];
          const runs = [];
          for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            const data = await readInvestigationReport(entry.id);
            const hash = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(WorkspaceTools.runFingerprint(data)),
            );
            const fingerprint = Array.from(new Uint8Array(hash), (b) =>
              b.toString(16).padStart(2, "0"),
            ).join("");
            runs.push({
              id: entry.id,
              fingerprint,
              start: entry.start,
              importedAt: entry.lastImportedAt,
              report: data,
            });
            paintProgress(
              Math.round(((index + 1) / entries.length) * 90),
              `Reading run ${index + 1} of ${entries.length}`,
            );
            await allowPaint();
          }
          const trends = WorkspaceTools.failureTrends(runs, Investigations);
          document.querySelector("#failure-history-results").innerHTML =
            `<p class="widget-footnote">${trends.runs} distinct comparable reports analyzed (up to 20 saved reports). Matching run times and normalized test results count once. Frequency means reports containing this message pattern, not a test failure rate. Missing patterns do not establish a fix.</p>${
              trends.patterns
                .slice(0, 30)
                .map(
                  (item) =>
                    `<details class="failure-recurrence"><summary><strong>${esc(item.pattern.slice(0, 180))}${item.pattern.length > 180 ? "…" : ""}</strong><span>${item.runs} / ${trends.runs} reports</span></summary><p>${esc(item.pattern)}</p><dl><div><dt>First seen</dt><dd>${esc(date(new Date(item.first).toISOString()))}</dd></div><div><dt>Last seen</dt><dd>${esc(date(new Date(item.last).toISOString()))}</dd></div><div><dt>Frequency</dt><dd>${item.runs} / ${trends.runs} reports (${((item.runs / Math.max(1, trends.runs)) * 100).toFixed(0)}%)</dd></div></dl></details>`,
                )
                .join("") ||
              "<p>No recorded failures in the comparable reports.</p>"
            }${trends.patterns.length > 30 ? `<p>Showing the top 30 of ${trends.patterns.length} patterns by recurrence.</p>` : ""}`;
        },
        (error) =>
          historyNotice(`Failure history unavailable: ${error.message}`),
      );
    };
  }
  Object.assign(globalThis, {
    appendHistoryTools,
    filteredTrendEntries,
    appendTrendFilters,
    appendFailureTrends,
  });
}
