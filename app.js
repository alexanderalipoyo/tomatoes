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
        timeZone: "Asia/Singapore",
      }).format(new Date(value)) + " SGT"
    : "Unavailable";
}
const badge = (status) =>
  `<span class="status-badge ${esc(status)}">${esc(status[0].toUpperCase() + status.slice(1))}</span>`;
let report;
let sourceName = "index.json";
let currentFile = null;
let page = 1;
let grouping = "specs";
let view = "runs";
let loading = false;
const pageSize = 15;
const outcomes = ["passed", "failed", "pending", "skipped"];
function renderSummary() {
  const c = report.counts;
  $("#run-summary").innerHTML =
    `<div><span class="eyebrow">LATEST IMPORTED RUN</span><h2>${badge(report.status)} ${esc(sourceName)}</h2><p>Started ${esc(date(report.start))}<br />Finished ${esc(date(report.end))}</p></div><div class="run-summary-stats"><strong>${duration(report.duration)}</strong><span>Reported run duration</span><span>${report.specs.length} specs · ${report.failedSpecs} with failures</span></div>`;
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
          ? `<tr><td><button class="result-link" data-test="${item.id}">${esc(item.title)}</button><small>${esc(item.file)}</small>${item.error ? `<p class="error-preview">${esc(item.error.slice(0, 180))}</p>` : ""}</td><td>${badge(item.status)}</td><td class="duration-cell">${duration(item.duration)}</td><td><button class="button" data-test="${item.id}">Inspect</button></td></tr>`
          : `<tr><td><button class="result-link" data-spec="${item.id}">${esc(item.name)}</button><small>${esc(item.file)}</small><small>${number(item.counts.total)} tests</small></td><td><div class="spec-outcomes">${outcomes
              .filter((status) => item.counts[status])
              .map(
                (status) =>
                  `<span class="status-badge ${status}" title="${status}">${item.counts[status]} ${status}</span>`,
              )
              .join(
                "",
              )}${item.counts.unknown ? badge("unknown") : ""}${!item.counts.total ? badge("empty") : ""}</div></td><td class="duration-cell">${duration(item.duration)}</td><td><button class="button" data-spec="${item.id}">View tests</button></td></tr>`,
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
function navigate() {
  view = location.hash.slice(1) || "runs";
  if (
    !["runs", "results", "failures", "analytics", "flaky", "settings"].includes(
      view,
    )
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
      "Failure concentration and slowest tests from this report.",
    ],
    flaky: [
      "Flaky tests",
      "Retry history is required to identify flaky tests.",
    ],
    settings: [
      "Report settings",
      "Source details and available report metadata.",
    ],
  };
  $("#page-title").textContent = labels[view][0];
  $("#page-description").textContent = labels[view][1];
  $("#overview").hidden = !["runs", "analytics"].includes(view);
  $("#results-section").hidden = !["results", "failures"].includes(view);
  $("#alternate").hidden = ["runs", "results", "failures"].includes(view);
  $("#dashboard-widgets").hidden = view !== "runs";
  $(".dashboard-actions").hidden = view !== "runs";
  if (!report) return;
  const alt = $("#alternate");
  if (view === "analytics") {
    const ranked = report.specs
      .filter((spec) => spec.counts.failed)
      .sort((a, b) => b.counts.failed - a.counts.failed)
      .slice(0, 8);
    const slowest = [...report.tests]
      .filter((test) => test.duration)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 8);
    alt.innerHTML = `<div class="analytics-grid"><article class="insight-card"><h2>Specs with the most failures</h2><p class="notice">${report.failedSpecs} of ${report.specs.length} specs contain failures.</p>${ranked.map((spec) => `<button class="analysis-row" data-spec="${spec.id}"><span>${esc(spec.file)}<small>${spec.counts.total} tests</small></span><strong class="fail-text">${spec.counts.failed} failed</strong></button>`).join("") || "<p>No failures recorded.</p>"}</article><article class="insight-card"><h2>Slowest tests</h2><p class="notice">Individual test durations; spec times sum these durations.</p>${slowest.map((test) => `<button class="analysis-row" data-test="${test.id}"><span>${esc(test.title)}<small>${esc(test.file)}</small></span><strong>${duration(test.duration)}</strong></button>`).join("") || "<p>No test durations recorded.</p>"}</article></div>`;
    alt
      .querySelectorAll("[data-spec]")
      .forEach(
        (button) =>
          (button.onclick = () => openTests(button.dataset.spec, "failed")),
      );
    alt
      .querySelectorAll("[data-test]")
      .forEach(
        (button) =>
          (button.onclick = () => showTest(Number(button.dataset.test))),
      );
  }
  if (view === "flaky")
    alt.innerHTML =
      '<article class="insight-card"><h2>Flakiness unavailable</h2><p>This report records final test outcomes without retry attempts or run history. A passing test cannot be identified as flaky from this data alone.</p><p class="notice">Pending and skipped tests are shown separately in the latest run.</p><a class="button" href="#results">View results</a></article>';
  if (view === "settings")
    alt.innerHTML = `<article class="settings-card"><h2>Report source</h2><div class="detail-grid"><div><small>File</small>${esc(sourceName)}</div><div><small>Format</small>Mochawesome JSON</div><div><small>Start</small>${esc(date(report.start))}</div><div><small>End</small>${esc(date(report.end))}</div><div><small>Branch / commit / author</small>Unavailable in this report</div><div><small>Browser / operating system</small>Unavailable in this report</div></div><p>Import another JSON report using the Import report button. Imported files stay in this browser session; reloading the page restores the bundled latest run.</p><p class="notice">Replace results.json in the project to update the bundled report. Spec durations are summed test times, while run duration uses the report's stats.duration. Dates are displayed in Asia/Singapore.</p></article>`;
  renderResults();
}
async function loadReport(file = currentFile) {
  if (loading) return;
  loading = true;
  $("#refresh").disabled = true;
  $("#import-report").disabled = true;
  $("#load-state").hidden = false;
  $("#load-state").textContent = "Loading report…";
  try {
    let raw;
    if (file) raw = JSON.parse(await file.text());
    else {
      const response = await fetch("results.json", { cache: "no-store" });
      if (!response.ok)
        throw new Error(`Could not load results.json (${response.status}).`);
      raw = await response.json();
    }
    const next = ReportData.normalizeReport(raw);
    report = next;
    currentFile = file;
    sourceName = file ? file.name : "index.json";
    page = 1;
    $("#search").value = "";
    $("#status").value = "all";
    $("#spec-filter").innerHTML =
      '<option value="all">All specs</option>' +
      report.specs
        .map((spec) => `<option value="${spec.id}">${esc(spec.file)}</option>`)
        .join("");
    $("#report-content").hidden = false;
    $("#load-state").hidden = true;
    renderSummary();
    navigate();
  } catch (error) {
    $("#load-state").textContent =
      `Unable to load report: ${error.message}${report ? " The previous report is still displayed." : " Use Import report to select a Mochawesome JSON file."}`;
  } finally {
    loading = false;
    $("#refresh").disabled = false;
    $("#import-report").disabled = false;
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
$("#refresh").onclick = () => loadReport();
$("#import-report").onclick = () => $("#report-file").click();
$("#report-file").onchange = async () => {
  const file = $("#report-file").files[0];
  if (file) await loadReport(file);
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
document
  .querySelectorAll("[data-icon]")
  .forEach((element) => (element.innerHTML = icon(element.dataset.icon)));
navigate();
loadReport();
