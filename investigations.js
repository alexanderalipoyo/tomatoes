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
  const options = (selected) =>
    entries
      .map(
        (entry) =>
          `<option value="${esc(entry.id)}" ${entry.id === selected ? "selected" : ""}>${esc(entry.metadata?.project || entry.name)}${entry.metadata?.environment ? " / " + esc(entry.metadata.environment) : ""} · ${esc(date(entry.start))} · ${entry.counts.total} tests</option>`,
      )
      .join("");
  alt.innerHTML = `<article class="insight-card"><form id="comparison-form"><div class="comparison-selectors"><label>Baseline report<select id="comparison-baseline" required ${entries.length < 2 ? "disabled" : ""}>${options(comparisonSelection.baseline)}</select><small>The reference run</small></label><button type="button" class="button swap-comparison" id="swap-comparison" aria-label="Swap baseline and target" ${entries.length < 2 ? "disabled" : ""}>↔</button><label>Target report<select id="comparison-target" required ${entries.length < 2 ? "disabled" : ""}>${options(comparisonSelection.target)}</select><small>The run to investigate</small></label><button class="button primary" type="submit" ${entries.length < 2 ? "disabled" : ""}>Compare reports</button></div><p id="comparison-error" class="fail-text" role="alert"></p></form><p class="widget-footnote">Tests match by exact spec path and full title. Duplicate identities are excluded. Code, data, and environment differences can affect results.</p></article>${entries.length < 2 ? '<div class="history-empty"><h3>Import another report to compare runs</h3><p>Two distinct saved reports are required.</p><a class="button" href="#history">Open history</a></div>' : ""}<div id="comparison-output"></div>`;
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
    output.innerHTML =
      historyEntries.length > 1
        ? '<div class="history-empty"><h3>Choose your baseline and target</h3><p>Compare to see regressions, fixes, missing tests, and duration changes.</p></div>'
        : "";
    return;
  }
  const result = comparison.result;
  const rows = result[comparisonFilter].filter((row) =>
    `${(row.current || row.previous).fullTitle} ${(row.current || row.previous).file}`
      .toLowerCase()
      .includes(comparisonSearch.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  comparisonPage = Math.min(Math.max(1, comparisonPage), pages);
  output.innerHTML = `<div class="insight-metrics">${insightMetric("New regressions", result.regressions.length, "Passed → failed")}${insightMetric("Fixed tests", result.fixed.length, "Failed → passed")}${insightMetric("Added tests", result.added.length, "Present only in the target")}${insightMetric("Missing tests", result.missing.length, "Present only in the baseline")}</div><article class="insight-card comparison-context"><div><strong>${result.matched} matched tests</strong><p>${result.ambiguous} ambiguous identities excluded</p></div><div><strong>${result.passRateDelta > 0 ? "+" : ""}${result.passRateDelta.toFixed(1)} pp</strong><p>Registered-test pass rate change</p></div><div><strong>${signedDuration(result.durationDelta)}</strong><p>Reported run duration change</p></div><button class="button" id="download-comparison">Download summary</button></article><div class="comparison-tabs" role="group" aria-label="Comparison category">${Object.entries(
    comparisonLabels,
  )
    .map(
      ([key, label]) =>
        `<button class="button ${key === comparisonFilter ? "selected-comparison" : ""}" data-comparison-filter="${key}" aria-pressed="${key === comparisonFilter}">${label} <span>${result[key].length}</span></button>`,
    )
    .join(
      "",
    )}</div><div class="comparison-search"><label for="comparison-search">Search comparison</label><input id="comparison-search" type="search" value="${esc(comparisonSearch)}" placeholder="Test title or spec path" /></div><div class="results-scroll"><table class="results-table comparison-table"><caption class="visually-hidden">${comparisonLabels[comparisonFilter]} between the baseline and target reports</caption><thead><tr><th>Test / spec</th><th>Baseline</th><th>Target</th><th>Test time change</th><th>Details</th></tr></thead><tbody>${
    rows
      .slice((comparisonPage - 1) * 25, comparisonPage * 25)
      .map((row) => {
        const test = row.current || row.previous;
        const side = row.current ? "target" : "baseline";
        return `<tr><td data-label="Test"><strong>${esc(test.title)}</strong><small>${esc(test.file)}</small></td><td data-label="Baseline">${row.previous ? badge(row.previous.status) : '<span class="muted">Absent</span>'}</td><td data-label="Target">${row.current ? badge(row.current.status) : '<span class="muted">Absent</span>'}</td><td data-label="Time change">${signedDuration(row.durationDelta)}</td><td data-label="Details"><button class="button" data-comparison-side="${side}" data-comparison-key="${esc(row.identity)}">Inspect ${side}</button><button class="button" data-comparison-history="${esc(row.identity)}">Test history</button></td></tr>`;
      })
      .join("") ||
    '<tr><td colspan="5" class="empty">No matching tests in this category.</td></tr>'
  }</tbody></table></div><div class="pagination"><span role="status">${rows.length ? `${(comparisonPage - 1) * 25 + 1}–${Math.min(comparisonPage * 25, rows.length)} of ${rows.length}` : "0"} ${comparisonLabels[comparisonFilter].toLowerCase()}</span><div><button class="button" id="comparison-prev" ${comparisonPage === 1 ? "disabled" : ""}>Previous</button><span>Page ${comparisonPage} of ${pages}</span><button class="button" id="comparison-next" ${comparisonPage === pages ? "disabled" : ""}>Next</button></div></div>`;
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
  host.innerHTML = `<div class="section-heading"><div><h2>Grouped failures</h2><p>${report.counts.failed} failed tests across ${groups.length} message groups</p></div><button class="button" id="download-failure-groups">Download groups</button></div><p class="widget-footnote">Groups use matching error messages with variable IDs, timestamps, and timeout values normalized. Review the evidence to confirm a shared cause.</p><div class="failure-group-list">${
    groups
      .slice(0, expandedFailureGroups ? groups.length : 8)
      .map(
        (group, index) =>
          `<details class="failure-group"><summary><span class="group-number">${group.tests.length}</span><span><strong>${esc(group.fingerprint)}</strong><small>${group.specs.length} ${group.specs.length === 1 ? "spec" : "specs"} · ${duration(group.duration)} recorded test time</small></span></summary><div class="failure-group-evidence"><h3>Representative error</h3><pre>${esc(group.message)}</pre><h3>Affected tests</h3>${group.tests.map((test) => `<button class="analysis-row" data-group-test="${test.id}"><span>${esc(test.title)}<small>${esc(test.file)}</small></span><strong>Inspect →</strong></button>`).join("")}</div></details>`,
      )
      .join("") || '<p class="widget-empty">No failures to group.</p>'
  }</div>`;
  if (groups.length > 8) {
    host.insertAdjacentHTML(
      "beforeend",
      '<button class="button" id="toggle-failure-groups">' +
        (expandedFailureGroups
          ? "Show top 8 groups"
          : "Show all " + groups.length + " groups") +
        "</button>",
    );
    $("#toggle-failure-groups").onclick = () => {
      expandedFailureGroups = !expandedFailureGroups;
      renderFailureGroups();
    };
  }
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
      $("#detail-content").innerHTML =
        `<div class="dialog-heading"><span class="eyebrow">INDIVIDUAL TEST HISTORY</span><h2 id="detail-title">${esc(test.title)}</h2><p>${esc(test.file)}</p><p>${esc(test.fullTitle)}</p></div><div class="test-history-metrics"><div><strong>${timeline.executed}</strong><span>Executed runs</span></div><div><strong>${timeline.counts.passed}</strong><span>Passed</span></div><div><strong>${timeline.counts.failed}</strong><span>Failed</span></div><div><strong>${timeline.counts.missing}</strong><span>Missing</span></div></div><p class="widget-footnote">Oldest → newest, up to 20 saved reports. Missing tests and ambiguous duplicate titles remain separate from test outcomes.</p><div class="test-timeline">${timeline.rows.map((row) => `<article class="test-timeline-row"><div><strong>${esc(row.name)}</strong><small>${esc(date(row.start))}</small></div>${["missing", "ambiguous"].includes(row.status) ? `<span class="status-badge unknown">${row.status === "missing" ? "Missing" : "Duplicate matches"}</span>` : badge(row.status)}<div class="test-time-evidence">${row.test ? `<strong>${duration(row.test.duration)}</strong><span class="timeline-duration"><i style="width:${(row.test.duration / maxTime) * 100}%"></i></span>` : "<span>Duration unavailable</span>"}</div>${row.test ? `<button class="button" data-timeline-run="${esc(row.runId)}">Inspect run</button>` : ""}</article>`).join("") || '<p class="widget-empty">No saved reports are available for this test.</p>'}</div>`;
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
      $("#detail-content").innerHTML =
        `<h2 id="detail-title">Test history unavailable</h2><p role="alert">${esc(error.message)}</p>`;
      $("#detail").showModal();
    },
  );
}
