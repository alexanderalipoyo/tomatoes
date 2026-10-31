/* Investigation views share report data with app.js and persist no derived results. */
let comparison = null;
let expandedFailureGroups = false;
let comparisonSelection = { baseline: "", target: "" };
let comparisonFilter = "regressions";
let comparisonPage = 1;
let comparisonSearch = "";
const investigationCache = new Map();
const comparisonLabels = {
  regressions: "New regressions",
  fixed: "Fixed tests",
  stillFailing: "Still failing",
  added: "Added tests",
  missing: "Missing tests",
  stateChanges: "Other outcome changes",
  slower: "Slower tests",
};
function signedDuration(value) {
  return value == null
    ? "Unavailable"
    : value === 0
      ? "No change"
      : `${value > 0 ? "+" : "−"}${duration(Math.abs(value))}`;
}
function chronologicalEntries() {
  return [...historyEntries].sort(
    (a, b) =>
      (Date.parse(a.start) || a.lastImportedAt) -
      (Date.parse(b.start) || b.lastImportedAt),
  );
}
async function readInvestigationReport(id, onProgress = () => {}) {
  if (id === activeHistoryId && report) {
    onProgress(70, "Using selected report");
    return report;
  }
  if (investigationCache.has(id)) {
    onProgress(70, "Using saved analysis");
    return investigationCache.get(id);
  }
  const saved = await ImportHistory.get(id);
  const normalized = await processReport(saved.text, onProgress);
  if (saved.entry.metadata)
    normalized.metadata = ReportData.normalizeMetadata(saved.entry.metadata);
  investigationCache.set(id, normalized);
  if (investigationCache.size > 4)
    investigationCache.delete(investigationCache.keys().next().value);
  return normalized;
}
async function investigationBusy(label, action, onError) {
  if (loading) return;
  const focused = document.activeElement;
  if ($("#detail").open) $("#detail").close();
  loading = true;
  $("#refresh").disabled = true;
  $("#import-report").disabled = true;
  $("#report-content").setAttribute("aria-busy", "true");
  document.body.classList.add("is-rendering");
  paintProgress(0, label);
  $("#import-progress").showModal();
  $("#import-progress").focus();
  try {
    await allowPaint();
    await action();
    paintProgress(100, "Ready");
    await allowPaint();
  } catch (error) {
    onError(error);
  } finally {
    loading = false;
    $("#refresh").disabled = false;
    $("#import-report").disabled = false;
    $("#report-content").setAttribute("aria-busy", "false");
    document.body.classList.remove("is-rendering");
    $("#import-progress").close();
    if ($("#detail").open) $("#detail .dialog-close").focus();
    else {
      if (focused?.isConnected) focused.focus();
      else $("#import-report").focus();
    }
  }
}
function renderComparison(alt) {
  const entries = chronologicalEntries().reverse();
  if (!entries.some((entry) => entry.id === comparisonSelection.target))
    comparisonSelection.target = entries[0]?.id || "";
  if (
    !entries.some((entry) => entry.id === comparisonSelection.baseline) ||
    comparisonSelection.baseline === comparisonSelection.target
  )
    comparisonSelection.baseline =
      entries.find((entry) => entry.id !== comparisonSelection.target)?.id ||
      "";
  globalThis.TomatoesReact.renderComparisonForm(alt, {
    entries,
    selection: comparisonSelection,
    formatDate: date,
  });
  function updateSelection() {
    comparisonSelection = {
      baseline: $("#comparison-baseline").value,
      target: $("#comparison-target").value,
    };
    comparison = null;
    comparisonPage = 1;
    renderComparisonOutput();
  }
  $("#comparison-baseline").onchange = updateSelection;
  $("#comparison-target").onchange = updateSelection;
  $("#swap-comparison").onclick = () => {
    const value = $("#comparison-baseline").value;
    $("#comparison-baseline").value = $("#comparison-target").value;
    $("#comparison-target").value = value;
    updateSelection();
  };
  $("#comparison-form").onsubmit = (event) => {
    event.preventDefault();
    compareSelectedRuns();
  };
  renderComparisonOutput();
}
async function compareSelectedRuns() {
  const baselineId = $("#comparison-baseline").value,
    targetId = $("#comparison-target").value;
  if (!baselineId || !targetId || baselineId === targetId) {
    $("#comparison-error").textContent = "Select two different saved reports.";
    return;
  }
  $("#comparison-error").textContent = "";
  comparisonSelection = { baseline: baselineId, target: targetId };
  await investigationBusy(
    "Reading comparison reports",
    async () => {
      const baseline = await readInvestigationReport(
        baselineId,
        (percent, label) =>
          paintProgress(Math.round(percent * 0.42), `Baseline: ${label}`),
      );
      const target = await readInvestigationReport(targetId, (percent, label) =>
        paintProgress(42 + Math.round(percent * 0.42), `Target: ${label}`),
      );
      paintProgress(88, "Matching tests and calculating changes");
      await allowPaint();
      comparison = {
        baseline: historyEntries.find((entry) => entry.id === baselineId),
        target: historyEntries.find((entry) => entry.id === targetId),
        result: Investigations.compareRuns(baseline, target),
      };
      comparisonPage = 1;
      comparisonFilter = "regressions";
      comparisonSearch = "";
      paintProgress(96, "Rendering comparison");
      await allowPaint();
      renderComparisonOutput();
    },
    (error) => {
      $("#comparison-error").textContent =
        `Could not compare reports: ${error.message}`;
    },
  );
}
function renderComparisonOutput() {
  const output = $("#comparison-output");
  if (!output) return;
  if (!comparison) {
    globalThis.TomatoesReact.renderComparisonOutput(output, {
      comparison: null,
      historyCount: historyEntries.length,
    });
    return;
  }
  const result = comparison.result;
  const accessFor = {
    regressions: "compare-runs.identify-regressions",
    fixed: "compare-runs.identify-fixes",
    added: "compare-runs.identify-added-and-missing-tests",
    missing: "compare-runs.identify-added-and-missing-tests",
    stateChanges: "compare-runs.compare-outcome-changes",
    stillFailing: "compare-runs.compare-outcome-changes",
    slower: "compare-runs.compare-test-durations",
  };
  if (
    typeof hasAccess === "function" &&
    !hasAccess(accessFor[comparisonFilter])
  )
    comparisonFilter = Object.keys(comparisonLabels).find((key) =>
      hasAccess(accessFor[key]),
    );
  if (!comparisonFilter) {
    globalThis.TomatoesReact.renderMessage(output, {
      message: "Your role cannot view these comparison categories.",
    });
    return;
  }
  const rows = result[comparisonFilter].filter((row) =>
    `${(row.current || row.previous).fullTitle} ${(row.current || row.previous).file}`
      .toLowerCase()
      .includes(comparisonSearch.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  comparisonPage = Math.min(Math.max(1, comparisonPage), pages);
  globalThis.TomatoesReact.renderComparisonOutput(output, {
    comparison,
    historyCount: historyEntries.length,
    labels: comparisonLabels,
    filter: comparisonFilter,
    rows,
    page: comparisonPage,
    pages,
    search: comparisonSearch,
    duration: signedDuration,
  });
  output.querySelectorAll("[data-comparison-filter]").forEach(
    (button) =>
      (button.onclick = () => {
        comparisonFilter = button.dataset.comparisonFilter;
        comparisonPage = 1;
        renderComparisonOutput();
      }),
  );
  $("#comparison-search").oninput = (event) => {
    const cursor = event.target.selectionStart;
    comparisonSearch = event.target.value;
    comparisonPage = 1;
    renderComparisonOutput();
    $("#comparison-search").focus();
    try {
      $("#comparison-search").setSelectionRange(cursor, cursor);
    } catch {}
  };
  $("#comparison-prev").onclick = () => {
    comparisonPage--;
    renderComparisonOutput();
  };
  $("#comparison-next").onclick = () => {
    comparisonPage++;
    renderComparisonOutput();
  };
  output
    .querySelectorAll("[data-comparison-key]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          inspectSavedTest(
            comparison[button.dataset.comparisonSide].id,
            button.dataset.comparisonKey,
          )),
    );
  output.querySelectorAll("[data-comparison-history]").forEach(
    (button) =>
      (button.onclick = () => {
        const key = button.dataset.comparisonHistory;
        const row = [
          ...result.regressions,
          ...result.fixed,
          ...result.stillFailing,
          ...result.added,
          ...result.missing,
          ...result.stateChanges,
          ...result.slower,
        ].find((item) => item.identity === key);
        if (row) openTestHistory(row.current || row.previous);
      }),
  );
  $("#download-comparison").onclick = () =>
    downloadInvestigation(
      Investigations.comparisonMarkdown(
        result,
        comparison.baseline,
        comparison.target,
      ),
      "tomatoes-comparison.md",
      "text/markdown",
    );
}
function downloadInvestigation(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderFailureGroups() {
  const groups = Investigations.failureGroups(report);
  const host = $("#failure-groups");
  globalThis.TomatoesReact.renderFailureGroups(host, {
    report,
    groups,
    expanded: expandedFailureGroups,
    duration,
  });
  appendFailureTrends(host);
  const toggle = $("#toggle-failure-groups");
  if (toggle)
    toggle.onclick = () => {
      expandedFailureGroups = !expandedFailureGroups;
      renderFailureGroups();
    };
  host
    .querySelectorAll("[data-group-test]")
    .forEach(
      (button) =>
        (button.onclick = () => showTest(Number(button.dataset.groupTest))),
    );
  $("#download-failure-groups").onclick = () =>
    downloadInvestigation(
      "# Tomatoes grouped failures\n\n" +
        groups
          .map(
            (group, index) =>
              `## Group ${index + 1}: ${group.tests.length} tests across ${group.specs.length} specs\n\n\x60\x60\x60text\n${group.fingerprint.replace(/`/g, "'")}\n\x60\x60\x60\n`,
          )
          .join("\n"),
      "tomatoes-failure-groups.md",
      "text/markdown",
    );
}
async function inspectSavedTest(runId, key) {
  if (loading) return;
  if ($("#detail").open) $("#detail").close();
  if (runId !== activeHistoryId)
    await loadReport(null, { historyId: runId, openDashboard: true });
  if (runId !== activeHistoryId) return;
  const test = Investigations.indexTests(report).unique.get(key);
  if (test) showTest(test.id);
}
async function openTestHistory(test) {
  const key = Investigations.identity(test);
  await investigationBusy(
    "Reading test history",
    async () => {
      let entries = chronologicalEntries().slice(-20);
      const selected = historyEntries.find(
        (entry) => entry.id === activeHistoryId,
      );
      if (selected && !entries.some((entry) => entry.id === selected.id)) {
        entries = [selected, ...entries.slice(1)].sort(
          (a, b) =>
            (Date.parse(a.start) || a.lastImportedAt) -
            (Date.parse(b.start) || b.lastImportedAt),
        );
      }
      const runs = [];
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const data = await readInvestigationReport(entry.id, (percent, label) =>
          paintProgress(
            Math.round(
              ((index + percent / 100) / Math.max(1, entries.length)) * 90,
            ),
            `Run ${index + 1}/${entries.length}: ${label}`,
          ),
        );
        runs.push({
          id: entry.id,
          name: entry.name,
          start: entry.start,
          report: {
            tests: data.tests
              .filter((item) => Investigations.identity(item) === key)
              .slice(0, 2),
          },
        });
      }
      paintProgress(94, "Building test timeline");
      await allowPaint();
      const timeline = Investigations.testTimeline(runs, key);
      const maxTime = Math.max(
        1,
        ...timeline.rows.map((row) => row.test?.duration || 0),
      );
      globalThis.TomatoesReact.renderTestTimeline($("#detail-content"), {
        test,
        timeline,
        maxTime,
        formatDate: date,
        duration,
      });
      $("#detail-content")
        .querySelectorAll("[data-timeline-run]")
        .forEach(
          (button) =>
            (button.onclick = () =>
              inspectSavedTest(button.dataset.timelineRun, key)),
        );
      $("#detail").showModal();
    },
    (error) => {
      globalThis.TomatoesReact.renderMessage($("#detail-content"), {
        title: "Test history unavailable",
        message: error.message,
        error: true,
      });
      $("#detail").showModal();
    },
  );
}
