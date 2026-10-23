function insightMetric(label, value, note) {
  return `<article class="insight-metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}
function renderAnalytics(alt) {
  const data = ReportData.insightStats(report);
  const trends = [...historyEntries]
    .sort(
      (a, b) =>
        (Date.parse(a.start) || a.lastImportedAt) -
        (Date.parse(b.start) || b.lastImportedAt),
    )
    .slice(-8);
  alt.innerHTML = `<div class="insight-source"><span>${badge(report.status)} ${esc(sourceName)}</span><span>${esc(date(report.start))} · ${report.specs.length} specs</span></div><div class="insight-metrics">${insightMetric("Executed pass rate", `${data.executedPassRate.toFixed(1)}%`, `${number(report.counts.passed)} passed / ${number(data.executed)} executed`)}${insightMetric("95th percentile test", duration(data.p95), "95% of executed tests finished within this time")}${insightMetric("Time in failed tests", duration(data.failureTime), "Sum of recorded failed-test durations")}${insightMetric("Specs with failures", `${report.failedSpecs} / ${report.specs.length}`, "Specs containing at least one failure")}</div><div class="analytics-grid"><article class="insight-card"><div class="widget-heading"><div><h2>Failure patterns</h2><p>Grouped by the recorded error message</p></div><span class="widget-count">${report.counts.failed} failures</span></div>${data.categories.map((category, index) => `<button class="pattern-row" data-pattern="${index}"><span><strong>${esc(category.label)}</strong><i class="pattern-track"><i style="width:${(category.tests.length / Math.max(1, report.counts.failed)) * 100}%"></i></i></span><b>${category.tests.length}</b></button>`).join("") || '<p class="widget-empty">No failures in this report.</p>'}<p class="widget-footnote">Review the failure details to confirm the cause.</p></article><article class="insight-card"><div class="widget-heading"><div><h2>Test duration distribution</h2><p>Executed tests grouped by recorded duration</p></div></div><div class="duration-distribution">${data.bins.map((bin) => `<div><span>${esc(bin.label)}</span><i><i style="width:${(bin.count / Math.max(1, ...data.bins.map((item) => item.count))) * 100}%"></i></i><strong>${number(bin.count)}</strong></div>`).join("")}</div><p class="widget-footnote">Pending and skipped tests are excluded.</p></article><article class="insight-card"><div class="widget-heading"><div><h2>Areas to review</h2><p>Spec directories ranked by failures</p></div></div>${
    data.folders
      .slice(0, 6)
      .map(
        (area, index) =>
          `<button class="analysis-row" data-area="${index}"><span>${esc(area.folder)}<small>${area.total} tests · ${duration(area.duration)} cumulative time</small></span><strong class="${area.failed ? "fail-text" : ""}">${area.failed} failed</strong></button>`,
      )
      .join("") || "<p>No spec data available.</p>"
  }</article><article class="insight-card"><div class="widget-heading"><div><h2>Saved-run trends</h2><p>Registered-test pass rate, ordered by run start</p></div><a class="widget-link" href="#history">History →</a></div>${trends.map((entry) => `<button class="trend-row ${entry.id === activeHistoryId ? "selected-trend" : ""}" data-trend="${entry.id}"><span>${esc(entry.name)}<small>${esc(date(entry.start))}</small></span><span class="trend-track"><i style="width:${entry.passRate}%"></i></span><strong>${entry.passRate.toFixed(1)}%<small>${entry.counts.failed} failed</small></strong></button>`).join("") || '<p class="widget-empty">Import reports to build a trend.</p>'}<p class="widget-footnote">Saved reports can contain different test sets and environments.</p></article></div>`;
  alt.querySelectorAll("[data-pattern]").forEach(
    (button) =>
      (button.onclick = () => {
        const category = data.categories[Number(button.dataset.pattern)];
        $("#detail-content").innerHTML =
          `<div class="dialog-heading"><h2 id="detail-title">${esc(category.label)}</h2><p>${category.tests.length} failures with this message pattern</p></div>${category.tests.map((test) => `<button class="analysis-row" data-pattern-test="${test.id}"><span>${esc(test.title)}<small>${esc(test.file)}</small></span><strong>Inspect →</strong></button>`).join("")}`;
        $("#detail-content")
          .querySelectorAll("[data-pattern-test]")
          .forEach(
            (item) =>
              (item.onclick = () => showTest(Number(item.dataset.patternTest))),
          );
        $("#detail").showModal();
      }),
  );
  alt.querySelectorAll("[data-area]").forEach(
    (button) =>
      (button.onclick = () => {
        const area = data.folders[Number(button.dataset.area)];
        openTests("all", "all");
        $("#search").value = area.folder;
        renderResults();
      }),
  );
  alt.querySelectorAll("[data-trend]").forEach(
    (button) =>
      (button.onclick = () =>
        loadReport(null, {
          historyId: button.dataset.trend,
          openDashboard: true,
        })),
  );
}
function renderFlaky(alt) {
  alt.innerHTML = `<article class="stability-banner"><div class="stability-symbol">${icon("flake")}</div><div><h2>Investigate test stability</h2><p>Find matching tests that passed in one saved run and failed in another. Comparisons use the spec path and full test title.</p><p class="widget-footnote">Cross-run comparisons use final outcomes; explicit retry evidence is summarized above when available. Changes across runs are investigation signals; code, data, and environment differences can also change results.</p></div></article><div class="stability-toolbar"><div><h2>Cross-run analysis</h2><p>Compare up to 10 saved reports, including the selected run.</p></div><button class="button primary" id="analyze-stability" ${historyEntries.length < 2 ? "disabled" : ""}>${stability ? "Refresh analysis" : "Analyze saved runs"}</button></div>${historyEntries.length < 2 ? '<article class="insight-card"><h2>One more report needed</h2><p>Import another run with the same test names and spec paths to compare outcomes.</p><a class="button" href="#history">View import history</a></article>' : ""}<div id="stability-results" aria-live="polite">${stability ? stabilityMarkup() : '<div class="history-empty"><h3>Ready to compare your reports</h3><p>Analyze saved runs to see outcome changes and repeatedly failing tests.</p></div>'}</div>`;
  alt.insertAdjacentHTML("afterbegin", retryEvidenceMarkup());
  alt
    .querySelectorAll("[data-retry-test]")
    .forEach(
      (button) =>
        (button.onclick = () => showTest(Number(button.dataset.retryTest))),
    );
  $("#analyze-stability").onclick = analyzeStability;
  bindStabilityDetails();
}
function stabilityMarkup() {
  return `<div class="insight-metrics">${insightMetric("Runs compared", stability.runs, "Distinct saved reports")}${insightMetric("Comparable tests", number(stability.comparable), "Executed in at least two reports")}${insightMetric("Changed outcomes", number(stability.changed.length), "Passed and failed across compared runs")}${insightMetric("Always failed", number(stability.alwaysFailed), "Failed in every observed execution")}</div><article class="insight-card"><div class="widget-heading"><div><h2>Tests with changing outcomes</h2><p>Oldest → newest observed execution · ${stability.alwaysPassed} tests always passed</p></div><span class="widget-count">${stability.changed.length} signals</span></div>${
    stability.changed
      .slice(0, 100)
      .map(
        (test, index) =>
          `<div class="stability-test"><div><strong>${esc(test.title)}</strong><small>${esc(test.file)}</small></div><div class="observation-strip">${test.observations.map((observation) => `<span class="observation ${observation.status}" title="${esc(observation.label)}: ${observation.status}" aria-label="${esc(observation.label)}: ${observation.status}">${observation.status === "passed" ? "P" : "F"}</span>`).join("")}</div><span>${test.failures}/${test.observations.length} failed</span>${test.currentId !== null ? `<button class="button" data-stability-test="${index}">Inspect selected run</button>` : "<small>Absent from selected run</small>"}</div>`,
      )
      .join("") ||
    '<div class="widget-empty">No pass/fail changes were found among comparable tests.</div>'
  }<p class="widget-footnote">P = passed, F = failed. Only executed outcomes are compared. ${stability.ambiguous} duplicate test identities were excluded. ${stability.changed.length > 100 ? "Showing the first 100 signals." : ""}</p></article>`;
}
function bindStabilityDetails() {
  $("#alternate")
    .querySelectorAll("[data-stability-test]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          showTest(
            stability.changed[Number(button.dataset.stabilityTest)].currentId,
          )),
    );
}
async function analyzeStability() {
  if (loading) return;
  const focused = document.activeElement;
  loading = true;
  document.body.classList.add("is-rendering");
  $("#report-content").setAttribute("aria-busy", "true");
  paintProgress(0, "Reading saved runs");
  $("#import-progress").showModal();
  $("#import-progress").focus();
  try {
    const selected = historyEntries.find(
      (entry) => entry.id === activeHistoryId,
    );
    const entries = historyEntries.slice(0, 10);
    if (selected && !entries.some((entry) => entry.id === selected.id))
      entries[entries.length - 1] = selected;
    entries.sort(
      (a, b) =>
        (Date.parse(a.start) || a.lastImportedAt) -
        (Date.parse(b.start) || b.lastImportedAt),
    );
    const runs = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const saved = await ImportHistory.get(entry.id);
      const run = await processReport(saved.text, (percent, label) =>
        paintProgress(
          Math.floor(((index + percent / 100) / entries.length) * 90),
          `Run ${index + 1}/${entries.length}: ${label}`,
        ),
      );
      runs.push({
        id: entry.id,
        label: date(entry.start),
        tests: run.tests.map((test) => ({
          file: test.file,
          fullTitle: test.fullTitle,
          title: test.title,
          status: test.status,
        })),
      });
    }
    paintProgress(94, "Comparing test outcomes");
    await allowPaint();
    stability = ReportData.stabilityStats(runs, report);
    paintProgress(98, "Rendering stability analysis");
    await allowPaint();
    renderFlaky($("#alternate"));
    paintProgress(100, "Analysis ready");
    await allowPaint();
  } catch (error) {
    $("#stability-results").innerHTML =
      `<p class="notice data-warning" role="alert">Analysis could not finish: ${esc(error.message)}</p>`;
  } finally {
    loading = false;
    document.body.classList.remove("is-rendering");
    $("#report-content").setAttribute("aria-busy", "false");
    $("#import-progress").close();
    if (focused?.isConnected) focused.focus();
    else $("#analyze-stability")?.focus();
  }
}
function renderSettings(alt) {
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = [
    ...new Set(["Asia/Singapore", "UTC", localZone, preferences.timeZone]),
  ];
  const savedEntry = historyEntries.find(
    (entry) => entry.id === activeHistoryId,
  );
  alt.innerHTML = `<div class="settings-layout"><div><form class="settings-card preference-form" id="display-settings"><div class="widget-heading"><div><h2>Display preferences</h2><p>Saved for this browser across reports and reloads</p></div></div><label>Time zone<select id="setting-zone">${zones.map((zone) => `<option value="${esc(zone)}" ${zone === preferences.timeZone ? "selected" : ""}>${esc(zone)}</option>`).join("")}</select><small>Applies to run dates and import history.</small></label><label>Results per page<select id="setting-rows">${[15, 30, 50, 100].map((rows) => `<option value="${rows}" ${rows === pageSize ? "selected" : ""}>${rows} results</option>`).join("")}</select><small>Applies to spec and individual test lists.</small></label><div class="settings-buttons"><button class="button primary" type="submit">Save preferences</button><button class="button" type="button" id="reset-display">Use defaults</button></div><p id="settings-feedback" role="status"></p></form><article class="settings-card"><h2>Report actions</h2><p>Download the original report or run validation again.</p><div class="settings-buttons"><button class="button" id="export-report">Download JSON</button><button class="button" id="revalidate-report">Revalidate report</button><a class="button" href="#history">Import history →</a></div><p id="export-feedback" role="status"></p></article></div><div><article class="settings-card"><div class="widget-heading"><div><h2>Selected report</h2><p>${badge(report.status)} ${esc(sourceName)}</p></div></div><dl class="source-details"><div><dt>Format</dt><dd>Mochawesome JSON</dd></div><div><dt>Run started</dt><dd>${esc(date(report.start))}</dd></div><div><dt>Run finished</dt><dd>${esc(date(report.end))}</dd></div><div><dt>Report duration</dt><dd>${duration(report.duration)}</dd></div><div><dt>Coverage</dt><dd>${number(report.counts.total)} tests / ${report.specs.length} specs</dd></div><div><dt>History</dt><dd>${savedEntry ? "Saved in this browser" : "Current session only"}</dd></div></dl></article><article class="settings-card"><h2>Data quality</h2><p class="validation-summary">${report.warnings.length ? "Valid format · summary discrepancies detected" : "Valid format · test totals reconcile"}</p>${report.warnings.map((warning) => `<p class="notice data-warning">${esc(warning)}</p>`).join("")}<p class="widget-footnote">Optional project, environment, branch, commit, and build labels can be supplied in Run identity. Browser and operating-system data are not provided by this report.</p><div class="storage-summary"><strong>${historyEntries.length}</strong><span>reports saved locally<br />Clearing this site's browser data removes history.</span></div></article></div></div>`;
  appendReportSettings(alt);
  function applySettings(next) {
    try {
      localStorage.setItem("tomatoes-display-settings", JSON.stringify(next));
    } catch {
      $("#settings-feedback").textContent =
        "Preferences could not be saved. Browser storage is unavailable.";
      return;
    }
    preferences = next;
    stability = null;
    pageSize = next.rows;
    page = 1;
    renderSummary();
    renderHistory();
    renderResults();
    renderSettings(alt);
    $("#settings-feedback").textContent = "Preferences saved.";
  }
  $("#display-settings").onsubmit = (event) => {
    event.preventDefault();
    applySettings({
      timeZone: $("#setting-zone").value,
      rows: Number($("#setting-rows").value),
    });
  };
  $("#reset-display").onclick = () => applySettings({ ...preferenceDefaults });
  $("#revalidate-report").onclick = () => $("#refresh").click();
  $("#export-report").onclick = async () => {
    const button = $("#export-report");
    button.disabled = true;
    try {
      let text;
      if (activeHistoryId)
        text = (await ImportHistory.get(activeHistoryId)).text;
      else if (currentFile) text = await currentFile.text();
      else {
        const response = await fetch("results.json");
        if (!response.ok) throw new Error("Report source unavailable.");
        text = await response.text();
      }
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = sourceName.replace(/[\\/:*?"<>|]/g, "_");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $("#export-feedback").textContent = "Original JSON download started.";
    } catch (error) {
      $("#export-feedback").textContent = `Download failed: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  };
}
