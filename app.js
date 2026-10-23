const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const icons = {
  runs: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m9 8 7 4-7 4Z"/>',
  failure: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
  chart: '<path d="M4 3v17h17M8 15v-4m5 4V6m5 9v-6"/>',
  flake: '<path d="m12 2-2 7H4l5 5-2 8 7-9h6l-5-4 2-7Z"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 4 2 3v4l4 3 3-1 3 1 4-3v-4l2-3-2-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
  folder: '<path d="M3 7V5h6l2 2h10v12H3Z"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.runs}</svg>`;
const number = (value) => value.toLocaleString("en-US");
function duration(ms) {
  if (ms == null) return "Unavailable";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  return [
    seconds >= 3600 ? `${Math.floor(seconds / 3600)}h` : "",
    seconds >= 60 ? `${Math.floor(seconds / 60) % 60}m` : "",
    `${seconds % 60}s`,
  ]
    .filter(Boolean)
    .join(" ");
}
function date(value) {
  return value
    ? new Intl.DateTimeFormat("en-SG", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: preferences.timeZone,
      }).format(new Date(value)) + ` (${preferences.timeZone})`
    : "Unavailable";
}
const badge = (status) =>
  `<span class="status-badge ${esc(status)}">${esc(status[0].toUpperCase() + status.slice(1))}</span>`;
const preferenceDefaults = { timeZone: "Asia/Singapore", rows: 15 };
let preferences = { ...preferenceDefaults };
try {
  const saved = JSON.parse(
    localStorage.getItem("tomatoes-display-settings") || "{}",
  );
  if ([15, 30, 50, 100].includes(saved.rows)) preferences.rows = saved.rows;
  if (typeof saved.timeZone === "string") {
    new Intl.DateTimeFormat("en", { timeZone: saved.timeZone });
    preferences.timeZone = saved.timeZone;
  }
} catch {}
let stability = null;
let report;
let sourceName = "index.json";
let currentFile = null;
let activeHistoryId = null;
let historyEntries = [];
let page = 1;
let grouping = "specs";
let view = "runs";
let loading = false;
let pageSize = preferences.rows;
const outcomes = ["passed", "failed", "pending", "skipped"];
function renderSummary() {
  const c = report.counts;
  $("#run-summary").innerHTML =
    `<div><span class="eyebrow">${isPreviousImport() ? "PREVIOUS IMPORT" : "LATEST IMPORTED RUN"}</span><h2>${badge(report.status)} ${esc(sourceName)}</h2><p>Started ${esc(date(report.start))}<br />Finished ${esc(date(report.end))}</p></div><div class="run-summary-stats"><strong>${duration(report.duration)}</strong><span>Reported run duration</span><span>${report.specs.length} specs · ${report.failedSpecs} with failures</span></div>`;
  const metrics = [
    [
      "Registered tests",
      number(c.total),
      `${report.specs.length} spec files`,
      "runs",
    ],
    [
      "Pass rate",
      `${report.passRate.toFixed(1)}<small>%</small>`,
      `${number(c.passed)} passed / ${number(c.total)} registered`,
      "check",
    ],
    [
      "Failed tests",
      number(c.failed),
      `${report.failedSpecs} affected specs`,
      "failure",
    ],
    ["Passed tests", number(c.passed), "Completed successfully", "check"],
    [
      "Pending tests",
      number(c.pending),
      "Marked pending in the report",
      "clock",
    ],
    [
      "Skipped tests",
      number(c.skipped),
      "Marked skipped in the report",
      "flake",
    ],
  ];
  $("#metrics").innerHTML = metrics
    .map(
      ([label, value, note, glyph]) =>
        `<article class="metric"><div class="metric-label">${icon(glyph)}${label}</div><div class="metric-value">${value}</div><div class="metric-bottom">${note}</div></article>`,
    )
    .join("");
  $("#spec-summary").textContent = `${report.specs.length} specs · 1 run`;
  $("#outcome-chart").innerHTML =
    `<div class="outcome-track" role="img" aria-label="${esc([...outcomes, "unknown"].map((status) => `${c[status]} ${status}`).join(", "))}">${[
      ...outcomes,
      "unknown",
    ]
      .filter((status) => c[status])
      .map(
        (status) =>
          `<div class="${status}" style="width:${(c[status] / c.total) * 100}%" title="${number(c[status])} ${status}"></div>`,
      )
      .join("")}</div>`;
  $("#outcome-legend").innerHTML = [...outcomes, "unknown"]
    .filter((status) => status !== "unknown" || c.unknown)
    .map(
      (status) =>
        `<button class="outcome-button" data-outcome="${status}"><i class="${status}"></i>${status[0].toUpperCase() + status.slice(1)} <strong>${number(c[status])}</strong><span>${(c.total ? (c[status] / c.total) * 100 : 0).toFixed(1)}%</span></button>`,
    )
    .join("");
  $("#outcome-legend")
    .querySelectorAll("[data-outcome]")
    .forEach(
      (button) =>
        (button.onclick = () => openTests("all", button.dataset.outcome)),
    );
  renderDashboard();
  $("#data-warnings").innerHTML = report.warnings
    .map((warning) => `<p class="notice data-warning">${esc(warning)}</p>`)
    .join("");
  $("#failure-count").textContent = c.failed;
  $("#report-footer").textContent = `${number(c.total)} tests · ${sourceName}`;
  $("#source-label").textContent = sourceName;
}
function renderDashboard() {
  const stats = ReportData.dashboardStats(report);
  const c = report.counts;
  const colors = {
    passed: "#53af8d",
    failed: "#dc7884",
    pending: "#dfba6a",
    skipped: "#8e9eaf",
    unknown: "#a497bd",
  };
  let position = 0;
  const stops = [...outcomes, "unknown"]
    .filter((status) => c[status])
    .map((status) => {
      const start = position;
      position += (c[status] / c.total) * 100;
      return `${colors[status]} ${start}% ${position}%`;
    });
  $("#outcome-chart").innerHTML =
    `<div class="outcome-donut" role="img" aria-label="${esc([...outcomes, "unknown"].map((status) => `${c[status]} ${status}`).join(", "))}" style="background:${stops.length ? `conic-gradient(${stops.join(",")})` : "#edf0f4"}"><div><strong>${report.passRate.toFixed(1)}<small>%</small></strong><span>tests passed</span></div></div>`;
  const maxFailures = stats.failureSpecs[0]?.counts.failed || 1;
  const topFailures = stats.failureSpecs.reduce(
    (sum, spec) => sum + spec.counts.failed,
    0,
  );
  $("#failure-hotspots").innerHTML =
    stats.failureSpecs
      .map(
        (spec) =>
          `<button class="hotspot-row" data-dashboard-spec="${spec.id}" data-status="failed" title="${esc(spec.file)}"><span class="hotspot-label"><span><strong>${esc(spec.name)}</strong><small>${esc(spec.file.split("/").slice(-3, -1).join(" / "))}</small></span><b>${spec.counts.failed}<small>failed</small></b></span><span class="hotspot-track"><i style="width:${(spec.counts.failed / maxFailures) * 100}%"></i></span></button>`,
      )
      .join("") +
    (stats.failureSpecs.length
      ? `<p class="widget-footnote">Top ${stats.failureSpecs.length} specs account for ${topFailures} of ${c.failed} failures (${((topFailures / c.failed) * 100).toFixed(1)}%).</p>`
      : '<p class="widget-empty">No failed tests in this run.</p>');
  $("#spec-health-count").textContent = `${report.specs.length} specs`;
  $("#spec-health").innerHTML =
    report.specs
      .map(
        (spec) =>
          `<button class="spec-tile ${spec.status}" data-dashboard-spec="${spec.id}" data-status="all" aria-label="${esc(spec.file)}: ${spec.counts.failed} failed, ${spec.counts.passed} passed, ${spec.counts.pending} pending, ${spec.counts.skipped} skipped" title="${esc(spec.file)} — ${spec.counts.failed} failed / ${spec.counts.total} tests"></button>`,
      )
      .join("") || '<p class="widget-empty">No specs recorded.</p>';
  const specLabels = {
    failed: "With failures",
    passed: "No failures",
    pending: "Not executed",
    skipped: "Skipped only",
    unknown: "Unknown",
    empty: "Empty",
  };
  $("#spec-health-legend").innerHTML = Object.entries(stats.specGroups)
    .filter(([, count]) => count)
    .map(
      ([status, count]) =>
        `<span><i class="${status}"></i>${specLabels[status]} <strong>${count}</strong></span>`,
    )
    .join("");
  $("#slow-tests").innerHTML =
    stats.slowestTests
      .map(
        (test) =>
          `<button class="slow-test-row" data-dashboard-test="${test.id}" title="${esc(test.fullTitle)}"><span><strong>${esc(test.title)}</strong><small>${esc(test.file.split("/").slice(-2).join(" / "))}</small></span><b>${duration(test.duration)}</b></button>`,
      )
      .join("") || '<p class="widget-empty">No test durations recorded.</p>';
  $("#execution-coverage").innerHTML =
    `<div class="coverage-value"><strong>${stats.executionRate.toFixed(1)}<small>%</small></strong><span>${number(stats.executed)} of ${number(c.total)} tests executed</span></div><div class="coverage-track" role="img" aria-label="${stats.executionRate.toFixed(1)}% executed"><i style="width:${stats.executionRate}%"></i></div><div class="coverage-details"><button data-coverage-status="pending"><strong>${number(c.pending)}</strong><span>Pending</span></button><button data-coverage-status="skipped"><strong>${number(c.skipped)}</strong><span>Skipped</span></button>${c.unknown ? `<button data-coverage-status="unknown"><strong>${c.unknown}</strong><span>Unknown</span></button>` : ""}</div>`;
  $("#run-timing").innerHTML =
    `<dl class="timing-list"><div><dt>Reported run duration</dt><dd>${duration(report.duration)}</dd></div><div><dt>Cumulative test time</dt><dd>${duration(stats.totalTestTime)}</dd></div><div><dt>Median executed test</dt><dd>${duration(stats.medianDuration)}</dd></div></dl><p class="widget-footnote">Test time sums recorded durations and can differ from reported run duration.</p>`;
  $("#dashboard-widgets")
    .querySelectorAll("[data-dashboard-spec]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          openTests(button.dataset.dashboardSpec, button.dataset.status)),
    );
  $("#dashboard-widgets")
    .querySelectorAll("[data-dashboard-test]")
    .forEach(
      (button) =>
        (button.onclick = () => showTest(Number(button.dataset.dashboardTest))),
    );
  $("#execution-coverage")
    .querySelectorAll("[data-coverage-status]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          openTests("all", button.dataset.coverageStatus)),
    );
  $("#view-not-executed").onclick = () => openTests("all", "pending");
  $("#dashboard-widgets")
    .querySelectorAll("[data-icon]")
    .forEach((element) => (element.innerHTML = icon(element.dataset.icon)));
}
function renderResults() {
  if (!report) return;
  const search = $("#search").value.trim().toLowerCase();
  const status = view === "failures" ? "failed" : $("#status").value;
  const spec = $("#spec-filter").value;
  const isTests = grouping === "tests" || view === "failures";
  const items = (isTests ? report.tests : report.specs).filter((item) => {
    if (spec !== "all" && String(isTests ? item.specId : item.id) !== spec)
      return false;
    if (
      status !== "all" &&
      (isTests ? item.status !== status : !(item.counts[status] > 0))
    )
      return false;
    const text = isTests
      ? `${item.file} ${item.fullTitle} ${item.error}`
      : `${item.file} ${item.tests.map((test) => `${test.fullTitle} ${test.error}`).join(" ")}`;
    return text.toLowerCase().includes(search);
  });
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  page = Math.min(Math.max(1, page), pages);
  $("#list-title").textContent =
    view === "failures"
      ? "Failed tests"
      : isTests
        ? "Test results"
        : "Spec results";
  $("#specs-view").classList.toggle("selected", !isTests);
  $("#tests-view").classList.toggle("selected", isTests);
  $("#specs-view").setAttribute("aria-pressed", String(!isTests));
  $("#tests-view").setAttribute("aria-pressed", String(isTests));
  $("#specs-view").disabled = view === "failures";
  $("#status").disabled = view === "failures";
  $("#status").value = status;
  $("#results-head").innerHTML = isTests
    ? "<tr><th>Test / spec</th><th>Status</th><th>Duration</th><th>Details</th></tr>"
    : "<tr><th>Spec file</th><th>Outcomes</th><th>Test time</th><th>Details</th></tr>";
  $("#results-body").innerHTML =
    items
      .slice((page - 1) * pageSize, page * pageSize)
      .map((item) =>
        isTests
          ? `<tr><td data-label="Test"><button class="result-link" data-test="${item.id}">${esc(item.title)}</button><small>${esc(item.file)}</small>${item.error ? `<p class="error-preview">${esc(item.error.slice(0, 180))}</p>` : ""}</td><td data-label="Status">${badge(item.status)}</td><td class="duration-cell" data-label="Duration">${duration(item.duration)}</td><td data-label="Details"><button class="button" data-test="${item.id}">Inspect</button></td></tr>`
          : `<tr><td data-label="Spec"><button class="result-link" data-spec="${item.id}">${esc(item.name)}</button><small>${esc(item.file)}</small><small>${number(item.counts.total)} tests</small></td><td data-label="Outcomes"><div class="spec-outcomes">${outcomes
              .filter((status) => item.counts[status])
              .map(
                (status) =>
                  `<span class="status-badge ${status}" title="${status}">${item.counts[status]} ${status}</span>`,
              )
              .join(
                "",
              )}${item.counts.unknown ? badge("unknown") : ""}${!item.counts.total ? badge("empty") : ""}</div></td><td class="duration-cell" data-label="Duration">${duration(item.duration)}</td><td data-label="Details"><button class="button" data-spec="${item.id}">View tests</button></td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="4" class="empty">No results match these filters.</td></tr>';
  $("#results-body")
    .querySelectorAll("[data-test]")
    .forEach(
      (button) =>
        (button.onclick = () => showTest(Number(button.dataset.test))),
    );
  $("#results-body")
    .querySelectorAll("[data-spec]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          openTests(button.dataset.spec, $("#status").value)),
    );
  $("#showing").textContent = items.length
    ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, items.length)} of ${number(items.length)} ${isTests ? "tests" : "specs"}`
    : "Showing 0 results";
  $("#page-label").textContent = `Page ${page} of ${pages}`;
  $("#prev").disabled = page === 1;
  $("#next").disabled = page === pages;
}
function openTests(spec, status = "all") {
  $("#search").value = "";
  grouping = "tests";
  $("#spec-filter").value = String(spec);
  $("#status").value = status;
  page = 1;
  if (location.hash !== "#results") {
    location.hash = "results";
  }
  navigate();
  $("#results-section").scrollIntoView({ behavior: "smooth" });
}
function showTest(id) {
  const test = report.tests[id];
  $("#detail-content").innerHTML =
    `<div class="dialog-heading">${badge(test.status)}<h2 id="detail-title">${esc(test.title)}</h2><p>${esc(test.fullTitle)}</p></div><div class="detail-grid"><div><small>Spec</small>${esc(test.file)}</div><div><small>Duration</small>${duration(test.duration)}</div><div><small>Suite</small>${esc(test.suite || "Root suite")}</div><div><small>Status</small>${esc(test.status)}</div></div>${test.error ? `<h2>Failure message</h2><pre class="failure-message">${esc(test.error)}</pre>` : '<p class="notice">No failure message recorded for this test.</p>'}${test.stack ? `<details><summary>Stack trace</summary><pre>${esc(test.stack)}</pre></details>` : ""}${test.code ? `<details><summary>Test code</summary><pre>${esc(test.code)}</pre></details>` : ""}${test.context ? `<details><summary>Reported context</summary><pre>${esc(test.context)}</pre></details>` : ""}`;
  $("#detail").showModal();
}
function navigate(force = false) {
  if (loading && force !== true) return;
  view = location.hash.slice(1) || "runs";
  if (
    ![
      "runs",
      "results",
      "failures",
      "analytics",
      "flaky",
      "settings",
      "history",
    ].includes(view)
  )
    view = "runs";
  document
    .querySelectorAll("nav a")
    .forEach((link) =>
      link.classList.toggle("active", link.dataset.view === view),
    );
  const labels = {
    runs: [
      "Latest run",
      "A snapshot of test health, failures, and execution from your latest run.",
    ],
    history: ["Import history", "Revisit reports saved in this browser."],
    results: [
      "Test results",
      "Explore every spec and test in your latest imported report.",
    ],
    failures: [
      "Failed tests",
      "Inspect failure messages and stack traces from this run.",
    ],
    analytics: [
      "Run analytics",
      "Failure patterns, execution performance, and saved-run trends.",
    ],
    flaky: [
      "Flaky tests",
      "Investigate outcome changes across your saved reports.",
    ],
    settings: [
      "Report settings",
      "Manage display preferences, inspect your source, and export reports.",
    ],
  };
  $("#page-title").textContent =
    view === "runs" && isPreviousImport() ? "Previous import" : labels[view][0];
  $("#page-description").textContent =
    view === "runs" && isPreviousImport()
      ? "Dashboard and test results for the selected saved report."
      : labels[view][1];
  $("#overview").hidden = view !== "runs";
  $("#results-section").hidden = !["results", "failures"].includes(view);
  $("#alternate").hidden = ["runs", "results", "failures", "history"].includes(
    view,
  );
  $("#dashboard-widgets").hidden = view !== "runs";
  $(".dashboard-actions").hidden = view !== "runs";
  $("#history-section").hidden = view !== "history";
  if (view === "history") renderHistory();
  if (!report) return;
  const alt = $("#alternate");
  if (view === "analytics") renderAnalytics(alt);
  if (view === "flaky") renderFlaky(alt);
  if (view === "settings") renderSettings(alt);
  renderResults();
}
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
  alt.innerHTML = `<article class="stability-banner"><div class="stability-symbol">${icon("flake")}</div><div><h2>Investigate test stability</h2><p>Find matching tests that passed in one saved run and failed in another. Comparisons use the spec path and full test title.</p><p class="widget-footnote">The imported format has final outcomes without retry attempts. Changes across runs are investigation signals; code, data, and environment differences can also change results.</p></div></article><div class="stability-toolbar"><div><h2>Cross-run analysis</h2><p>Compare up to 10 saved reports, including the selected run.</p></div><button class="button primary" id="analyze-stability" ${historyEntries.length < 2 ? "disabled" : ""}>${stability ? "Refresh analysis" : "Analyze saved runs"}</button></div>${historyEntries.length < 2 ? '<article class="insight-card"><h2>One more report needed</h2><p>Import another run with the same test names and spec paths to compare outcomes.</p><a class="button" href="#history">View import history</a></article>' : ""}<div id="stability-results" aria-live="polite">${stability ? stabilityMarkup() : '<div class="history-empty"><h3>Ready to compare your reports</h3><p>Analyze saved runs to see outcome changes and repeatedly failing tests.</p></div>'}</div>`;
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
  alt.innerHTML = `<div class="settings-layout"><div><form class="settings-card preference-form" id="display-settings"><div class="widget-heading"><div><h2>Display preferences</h2><p>Saved for this browser across reports and reloads</p></div></div><label>Time zone<select id="setting-zone">${zones.map((zone) => `<option value="${esc(zone)}" ${zone === preferences.timeZone ? "selected" : ""}>${esc(zone)}</option>`).join("")}</select><small>Applies to run dates and import history.</small></label><label>Results per page<select id="setting-rows">${[15, 30, 50, 100].map((rows) => `<option value="${rows}" ${rows === pageSize ? "selected" : ""}>${rows} results</option>`).join("")}</select><small>Applies to spec and individual test lists.</small></label><div class="settings-buttons"><button class="button primary" type="submit">Save preferences</button><button class="button" type="button" id="reset-display">Use defaults</button></div><p id="settings-feedback" role="status"></p></form><article class="settings-card"><h2>Report actions</h2><p>Download the original report or run validation again.</p><div class="settings-buttons"><button class="button" id="export-report">Download JSON</button><button class="button" id="revalidate-report">Revalidate report</button><a class="button" href="#history">Import history →</a></div><p id="export-feedback" role="status"></p></article></div><div><article class="settings-card"><div class="widget-heading"><div><h2>Selected report</h2><p>${badge(report.status)} ${esc(sourceName)}</p></div></div><dl class="source-details"><div><dt>Format</dt><dd>Mochawesome JSON</dd></div><div><dt>Run started</dt><dd>${esc(date(report.start))}</dd></div><div><dt>Run finished</dt><dd>${esc(date(report.end))}</dd></div><div><dt>Report duration</dt><dd>${duration(report.duration)}</dd></div><div><dt>Coverage</dt><dd>${number(report.counts.total)} tests / ${report.specs.length} specs</dd></div><div><dt>History</dt><dd>${savedEntry ? "Saved in this browser" : "Current session only"}</dd></div></dl></article><article class="settings-card"><h2>Data quality</h2><p class="validation-summary">${report.warnings.length ? "Valid format · summary discrepancies detected" : "Valid format · test totals reconcile"}</p>${report.warnings.map((warning) => `<p class="notice data-warning">${esc(warning)}</p>`).join("")}<p class="widget-footnote">Branch, commit, browser, operating system, and retry history are unavailable in this report.</p><div class="storage-summary"><strong>${historyEntries.length}</strong><span>reports saved locally<br />Clearing this site's browser data removes history.</span></div></article></div></div>`;
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
function isPreviousImport() {
  return Boolean(
    activeHistoryId &&
    historyEntries.length &&
    historyEntries[0].id !== activeHistoryId,
  );
}
function historyNotice(message) {
  $("#history-notice").hidden = !message;
  $("#history-notice").textContent = message;
}
async function refreshHistory() {
  historyEntries = await ImportHistory.list();
  renderHistory();
}
function renderHistory() {
  $("#history-count").textContent = historyEntries.length;
  $("#history-total").textContent =
    `${historyEntries.length} saved ${historyEntries.length === 1 ? "report" : "reports"}`;
  $("#history-list").innerHTML =
    historyEntries
      .map(
        (entry, index) =>
          `<article class="history-card ${entry.id === activeHistoryId ? "is-current" : ""}"><div class="history-card-title"><div>${badge(entry.status)}${index === 0 ? '<span class="history-tag">Latest import</span>' : ""}${entry.id === activeHistoryId ? '<span class="history-tag current-tag">Viewing</span>' : ""}<h3>${esc(entry.name)}</h3><p>${entry.source === "bundled" ? "Bundled report saved" : "Imported"} ${esc(date(new Date(entry.lastImportedAt).toISOString()))}</p><p>Run started ${esc(date(entry.start))}</p></div><button class="button ${entry.id === activeHistoryId ? "" : "primary"}" data-open-history="${esc(entry.id)}">Open dashboard</button></div><dl class="history-stats"><div><dt>Tests</dt><dd>${number(entry.counts.total)}</dd></div><div><dt>Passed</dt><dd>${number(entry.counts.passed)}</dd></div><div><dt>Failed</dt><dd class="fail-text">${number(entry.counts.failed)}</dd></div><div><dt>Pending / skipped</dt><dd>${number(entry.counts.pending)} / ${number(entry.counts.skipped)}</dd></div><div><dt>Pass rate</dt><dd>${entry.passRate.toFixed(1)}%</dd></div><div><dt>Duration</dt><dd>${duration(entry.duration)}</dd></div></dl></article>`,
      )
      .join("") ||
    '<div class="history-empty"><h3>No saved imports yet</h3><p>Import a valid Mochawesome JSON report to start your history.</p></div>';
  $("#history-list")
    .querySelectorAll("[data-open-history]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          loadReport(null, {
            historyId: button.dataset.openHistory,
            openDashboard: true,
          })),
    );
}
function paintProgress(percent, label) {
  $("#render-progress").value = percent;
  $("#progress-percent").textContent = `${percent}%`;
  $("#progress-stage").textContent = label;
}
function allowPaint() {
  return new Promise((resolve) => {
    if (document.hidden) setTimeout(resolve, 0);
    else requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}
function processReport(text, onProgress = paintProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker("report-worker.js");
    const timeout = setTimeout(
      () => finish(new Error("Processing timed out. Try a smaller report.")),
      120000,
    );
    function finish(error, result) {
      clearTimeout(timeout);
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    }
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress(data.percent, data.label);
      else if (data.type === "complete") finish(null, data.report);
      else if (data.type === "error") finish(new Error(data.message));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(
        new Error(
          "Could not process the report. Reload the page and try again.",
        ),
      );
    };
    worker.onmessageerror = () =>
      finish(
        new Error(
          "Could not read the processed report. Try another JSON file.",
        ),
      );
    worker.postMessage(text);
  });
}
function populateSpecFilter() {
  $("#spec-filter").innerHTML =
    '<option value="all">All specs</option>' +
    report.specs
      .map((spec) => `<option value="${spec.id}">${esc(spec.file)}</option>`)
      .join("");
}
async function loadReport(file = currentFile, options = {}) {
  if (loading) return;
  const previous = {
    report,
    currentFile,
    activeHistoryId,
    sourceName,
    page,
    grouping,
    search: $("#search").value,
    status: $("#status").value,
    spec: $("#spec-filter").value,
  };
  const focused = document.activeElement;
  let failed = false;
  loading = true;
  $("#refresh").disabled = true;
  $("#import-report").disabled = true;
  $("#load-state").hidden = true;
  $("#report-content").setAttribute("aria-busy", "true");
  document.body.classList.add("is-rendering");
  paintProgress(0, "Preparing to read report");
  $("#import-progress").showModal();
  $("#import-progress").focus();
  try {
    await allowPaint();
    let saved = null;
    let historyId = options.historyId;
    if (options.restore) {
      try {
        historyId = await ImportHistory.lastActive();
      } catch {
        historyNotice(
          "History is unavailable in this browser. The report can still be used for this session.",
        );
      }
    }
    if (historyId) {
      paintProgress(3, "Opening saved report");
      try {
        saved = await ImportHistory.get(historyId);
        file = new File([saved.text], saved.entry.name, {
          type: "application/json",
        });
      } catch (error) {
        if (!options.restore) throw error;
        historyNotice(
          "The previously viewed import could not be restored. Loading the bundled report.",
        );
      }
    }
    try {
      await refreshHistory();
    } catch {
      historyNotice(
        "History is unavailable in this browser. The report can still be used for this session.",
      );
    }
    paintProgress(5, "Checking file");
    if (file && !/\.json$/i.test(file.name))
      throw new Error(
        "Unsupported file type. Select a .json Mochawesome report.",
      );
    if (file && file.size > ReportData.MAX_REPORT_BYTES)
      throw new Error(
        "The report is too large. The maximum file size is 50 MB.",
      );
    if (file && !file.size)
      throw new Error("The file is empty. Select a Mochawesome JSON report.");
    paintProgress(
      10,
      file ? `Reading ${file.name}` : "Reading bundled latest run",
    );
    await allowPaint();
    let text;
    if (file) text = await file.text();
    else {
      const response = await fetch("results.json", {
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok)
        throw new Error(`Could not load results.json (${response.status}).`);
      text = await response.text();
    }
    if (new TextEncoder().encode(text).byteLength > ReportData.MAX_REPORT_BYTES)
      throw new Error(
        "The report is too large. The maximum file size is 50 MB.",
      );
    const next = await processReport(text);
    paintProgress(75, "Preparing report filters");
    await allowPaint();
    report = next;
    stability = null;
    currentFile = file;
    activeHistoryId = saved?.entry.id || null;
    sourceName = file ? file.name : "index.json";
    page = 1;
    $("#search").value = "";
    $("#status").value = "all";
    populateSpecFilter();
    paintProgress(82, "Rendering dashboard widgets");
    await allowPaint();
    renderSummary();
    paintProgress(94, "Rendering test results");
    await allowPaint();
    $("#report-content").hidden = false;
    if (options.openDashboard) location.hash = "runs";
    navigate(true);
    paintProgress(
      97,
      saved ? "Restoring saved import" : "Saving import history",
    );
    await allowPaint();
    try {
      if (saved) await ImportHistory.markActive(saved.entry.id);
      else {
        const entry = await ImportHistory.save({
          text,
          name: sourceName,
          report,
          source: file ? "imported" : "bundled",
          touch: Boolean(options.recordImport),
        });
        activeHistoryId = entry.id;
      }
      await refreshHistory();
      historyNotice("");
    } catch (error) {
      historyNotice(
        "This report is loaded, but history could not be saved. Browser storage may be unavailable or full.",
      );
    }
    $("#run-summary .eyebrow").textContent = isPreviousImport()
      ? "PREVIOUS IMPORT"
      : "LATEST IMPORTED RUN";
    navigate(true);
    paintProgress(100, "Report ready");
    await allowPaint();
  } catch (error) {
    failed = true;
    if (report !== previous.report) {
      ({ report, currentFile, activeHistoryId, sourceName, page, grouping } =
        previous);
      $("#report-content").hidden = !report;
      if (report) {
        populateSpecFilter();
        $("#search").value = previous.search;
        $("#status").value = previous.status;
        $("#spec-filter").value = previous.spec;
        renderSummary();
        navigate(true);
      }
    }
    $("#load-state").hidden = false;
    $("#load-state").textContent =
      `Unable to load report: ${error.message}${report ? " The previous report is still displayed." : " Select a valid Mochawesome JSON report to continue."}`;
  } finally {
    loading = false;
    $("#refresh").disabled = false;
    $("#import-report").disabled = false;
    $("#report-content").setAttribute("aria-busy", "false");
    document.body.classList.remove("is-rendering");
    $("#import-progress").close();
    if (failed) {
      $("#load-state").tabIndex = -1;
      $("#load-state").focus();
    } else if (focused?.isConnected && focused !== document.body)
      focused.focus();
    else $("#import-report").focus();
  }
}
["search", "spec-filter", "status"].forEach((id) =>
  $("#" + id).addEventListener(id === "search" ? "input" : "change", () => {
    page = 1;
    renderResults();
  }),
);
$("#clear").onclick = () => {
  $("#search").value = "";
  $("#spec-filter").value = "all";
  $("#status").value = "all";
  page = 1;
  renderResults();
};
$("#prev").onclick = () => {
  page--;
  renderResults();
};
$("#next").onclick = () => {
  page++;
  renderResults();
};
$("#specs-view").onclick = () => {
  grouping = "specs";
  page = 1;
  renderResults();
};
$("#tests-view").onclick = () => {
  grouping = "tests";
  page = 1;
  renderResults();
};
$("#refresh").onclick = () =>
  activeHistoryId
    ? loadReport(null, { historyId: activeHistoryId })
    : loadReport();
$("#load-bundled").onclick = () => loadReport(null, { openDashboard: true });
$("#import-report").onclick = () => $("#report-file").click();
$("#report-file").onchange = async () => {
  const file = $("#report-file").files[0];
  if (file) await loadReport(file, { recordImport: true });
  $("#report-file").value = "";
};
$(".dialog-close").onclick = () => $("#detail").close();
$("#detail").onclick = (event) => {
  if (event.target !== $("#detail")) return;
  const rect = $("#detail").getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    $("#detail").close();
};
document.addEventListener("keydown", (event) => {
  if (loading || $("#mobile-navigation").open) return;
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) &&
    !$("#detail").open &&
    ["results", "failures"].includes(view)
  ) {
    event.preventDefault();
    $("#search").focus();
  }
});
window.addEventListener("hashchange", navigate);
$("#import-progress").addEventListener("cancel", (event) =>
  event.preventDefault(),
);
document
  .querySelectorAll("[data-icon]")
  .forEach((element) => (element.innerHTML = icon(element.dataset.icon)));
document.querySelectorAll('nav a[data-view="runs"]').forEach((link) =>
  link.addEventListener("click", (event) => {
    if (isPreviousImport() && !loading) {
      event.preventDefault();
      loadReport(null, {
        historyId: historyEntries[0].id,
        openDashboard: true,
      });
    }
  }),
);
$("#open-navigation").onclick = () => {
  if (!loading) $("#mobile-navigation").showModal();
};
$("#close-navigation").onclick = () => $("#mobile-navigation").close();
$("#mobile-navigation")
  .querySelectorAll("a")
  .forEach((link) =>
    link.addEventListener("click", () => $("#mobile-navigation").close()),
  );
$("#mobile-navigation").addEventListener("click", (event) => {
  if (event.target !== $("#mobile-navigation")) return;
  const rect = event.currentTarget.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    event.currentTarget.close();
});
matchMedia("(max-width: 1024px)").addEventListener("change", (event) => {
  if (!event.matches) $("#mobile-navigation").close();
});
window.addEventListener("hashchange", () => $("#mobile-navigation").close());
renderHistory();
navigate();
loadReport(null, { restore: true });
