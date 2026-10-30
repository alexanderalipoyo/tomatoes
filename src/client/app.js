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
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  integration:
    '<path d="m9 3 3 3-6 6-3-3m12 12-3-3 6-6 3 3M8 16l-4 4m12-12 4-4M8 12l4 4m0-8 4 4"/>',
  profile:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M6 19v-2a6 6 0 0 1 12 0v2"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
  branch:
    '<path d="M6 3v12a6 6 0 0 0 12 0V9M14 5l4 4 4-4"/><circle cx="6" cy="5" r="2"/>',
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
const preferenceDefaults = { ...UserPreferenceModel.DEFAULT_DISPLAY };
let preferences = { ...preferenceDefaults };
let appearanceDraft = null;
const userPreferences = PreferenceClient.create({
  request: async (route, options = {}) => {
    const response = await fetch(route, {
      ...options,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json();
    if (!response.ok)
      throw new Error(
        payload.error || "Preferences could not be saved to the server.",
      );
    return payload;
  },
  legacy: () => {
    let displayText, groupText;
    try {
      displayText = localStorage.getItem("tomatoes-display-settings");
      groupText = localStorage.getItem("tomatoes-dashboard-groups-v1");
    } catch {
      return {};
    }
    const display = JSON.parse(displayText || "null");
    const groups = JSON.parse(groupText || "null");
    return {
      ...(display ? { display: { ...preferenceDefaults, ...display } } : {}),
      ...(groups ? { dashboardGroups: groups } : {}),
    };
  },
});
let workspaceProjects = [];
async function reloadWorkspaceProjects() {
  try {
    const payload = await teamRequest("/api/projects", {
      signal: AbortSignal.timeout(15000),
    });
    workspaceProjects = payload.projects;
  } catch {
    workspaceProjects = [];
  }
}
async function reloadUserPreferences() {
  const [state] = await Promise.all([
    userPreferences.initialize(),
    reloadWorkspaceProjects(),
  ]);
  appearanceDraft = null;
  userProfileDraft = null;
  workspaceDraft = null;
  preferences = state.preferences.display;
  Appearance.apply(state.preferences.appearance.colorMode);
  renderWorkspaceIdentity();
  pageSize = preferences.rows;
  page = 1;
  stability = null;
  if (report) {
    renderSummary();
    renderHistory();
    renderResults();
  }
  // A user may open a workspace view while preferences are still loading.
  // Refresh that view when the request settles instead of leaving disabled controls.
  if (isReportIndependentView() && !authRequiresLogin() && !isAuthRoute())
    navigate();
  return state;
}
function invalidateOutOfScopeReports() {
  historyEntries = historyEntries.filter(canAccessBrowserImport);
  comparison = null;
  investigationCache.clear();
  stability = null;
  if (report && !canAccessBrowserImport({ metadata: report.metadata })) {
    report = null;
    currentFile = null;
    activeHistoryId = null;
    loadedReportLinkKey = null;
    $("#report-content").hidden = true;
    globalThis.TomatoesReact.clearReportContent();
    $("#detail-content").replaceChildren();
  }
}
function preferenceStatusMarkup() {
  const state = userPreferences.getState();
  return `<article class="settings-card preference-sync-status"><h2>User preferences</h2><p role="status">${state.ready ? `Saved to ${state.storage === "postgres" ? "PostgreSQL" : "the local server"} for ${esc(state.profile)}. ${state.profileId === "local" ? "Local mode uses one shared profile on this server." : "These settings belong to your signed-in account."}` : esc(state.error)}</p><p>Profile details, color mode, dashboard groups, time zone, and results per page load from the server. Report files and browser import history are managed separately.</p><button class="button" id="reload-user-preferences">Reload preferences</button>${!state.ready ? '<a class="button" href="#team">Settings: Sharing &amp; access</a>' : ""}</article>`;
}
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
function renderWorkspaceIdentity() {
  const importId = new URL(location.href).searchParams.get("import");
  const entry =
    historyEntries.find((item) => item.id === (importId || activeHistoryId)) ||
    (!importId && !new URL(location.href).searchParams.has("server")
      ? historyEntries[0]
      : null);
  const selectedProject =
    entry?.metadata?.project ||
    (!importId || importId === activeHistoryId
      ? report?.metadata?.project
      : "");
  const user = userPreferences.getState().user;
  const preferredProject = new URL(location.href).searchParams.get("project");
  currentWorkspaceProject =
    selectedProject ||
    (workspaceProjects.some((item) => item.id === preferredProject)
      ? preferredProject
      : workspaceProjects[0]?.id) ||
    (authStatus?.enabled ? "" : "tomatoes");
  const organizationName = authStatus?.organization?.name || "Organization";
  document.querySelectorAll('nav a[data-view="users"]').forEach((link) => {
    link.hidden = Boolean(
      authStatus?.enabled &&
      !(
        authStatus.user?.role === "admin" &&
        authStatus.user.projects.includes("*")
      ),
    );
  });
  document.querySelectorAll("[data-organization-name]").forEach((element) => {
    element.textContent = organizationName;
    element.title = organizationName;
  });
  const organizationInitials = organizationName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toUpperCase();
  document
    .querySelectorAll("[data-organization-initials]")
    .forEach((element) => {
      element.textContent = organizationInitials;
    });
  document.querySelectorAll("[data-project-picker]").forEach((select) => {
    select.innerHTML = workspaceProjects.length
      ? workspaceProjects
          .map(
            (project) =>
              `<option value="${esc(project.id)}">${esc(project.name)}</option>`,
          )
          .join("")
      : '<option value="">No assigned projects</option>';
    select.value = currentWorkspaceProject;
    select.disabled = !workspaceProjects.length;
    select.onchange = () => void openWorkspaceProject(select.value);
  });
  const branding = workspaceBranding(currentWorkspaceProject);
  const workspaceName =
    branding.name || selectedProject || "No assigned project";
  // Temporary display name until account profiles provide full names.
  const profile = userPreferences.getState().preferences.profile;
  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
    user?.fullName ||
    user?.displayName ||
    "Alex Ali";
  document.querySelectorAll("[data-workspace-name]").forEach((element) => {
    element.textContent = workspaceName;
    element.title = workspaceName;
  });
  const initials = workspaceName
    .replace(/workspace$/i, " Workspace")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toUpperCase();
  document.querySelectorAll("[data-workspace-initials]").forEach((element) => {
    element.innerHTML = branding.logo
      ? `<img class="workspace-logo" src="${esc(branding.logo)}" alt=""/>`
      : esc(initials);
  });
  document.querySelectorAll("[data-workspace-logo]").forEach((element) => {
    element.innerHTML = workspaceLogoMarkup(currentWorkspaceProject);
  });
  document.querySelectorAll("[data-workspace-user]").forEach((element) => {
    element.textContent = fullName;
    element.title = fullName;
  });
}
async function openWorkspaceProject(id) {
  if (loading || !workspaceProjects.some((project) => project.id === id))
    return;
  try {
    const payload = await teamRequest(
      "/api/runs?project=" + encodeURIComponent(id),
      { signal: AbortSignal.timeout(15000) },
    );
    const url = new URL(location.href);
    ["import", "server", "spec"].forEach((key) => url.searchParams.delete(key));
    url.searchParams.set("project", id);
    if (payload.runs.length) {
      url.searchParams.set("server", payload.runs[0].id);
      url.hash = "runs";
    } else {
      report = null;
      currentFile = null;
      activeHistoryId = null;
      url.hash = "projects";
    }
    failedReportLinkKey = null;
    history.pushState(null, "", url);
    await navigateReportLocation();
  } catch (error) {
    showToast(error.message, "error");
    renderWorkspaceIdentity();
  }
}
function renderSummary() {
  renderWorkspaceIdentity();
  globalThis.TomatoesReact.renderRunSummary({
    report,
    sourceName,
    previous: isPreviousImport(),
    brand: workspaceBranding(
      report.metadata?.project || currentWorkspaceProject,
    ),
    formatDate: date,
    duration,
  });
  renderDashboard();
  if (typeof reportIdentityMarkup === "function") reportIdentityMarkup();
  $("#failure-count").textContent = report.counts.failed;
  $("#report-footer").textContent =
    `${number(report.counts.total)} tests · ${sourceName}`;
  $("#source-label").textContent = report.metadata?.project
    ? `${workspaceBranding(report.metadata.project).name} / ${sourceName}`
    : sourceName;
}
function renderDashboard() {
  renderCustomizedDashboard();
  globalThis.TomatoesReact.renderDashboard({
    report,
    stats: ReportData.dashboardStats(report),
    openTests,
    showTest,
    duration,
  });
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
  globalThis.TomatoesReact.renderResults({
    items: items.slice((page - 1) * pageSize, page * pageSize),
    isTests,
    duration,
    showTest,
    openSpec: (id) => openTests(id, $("#status").value),
  });
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
  syncReportSpecURL();
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
  $("#detail-content").insertAdjacentHTML(
    "beforeend",
    `<div class="test-history-action"><button class="button primary" id="view-test-history">View test history</button><p class="widget-footnote">Follow this exact test across saved reports.</p></div>`,
  );
  $("#view-test-history").onclick = () => openTestHistory(test);
  appendTestEvidence(test);
  $("#detail").showModal();
}
function navigate(force = false) {
  if (authRequiresLogin() || isAuthRoute()) {
    renderAuthScreen();
    return;
  }
  hideAuthScreen();
  if (loading && force !== true) return;
  view = location.hash.slice(1) || "runs";
  if (
    view === "users" &&
    authStatus?.enabled &&
    !(
      authStatus.user?.role === "admin" &&
      authStatus.user.projects.includes("*")
    )
  ) {
    view = "projects";
    const url = new URL(location.href);
    url.hash = "projects";
    history.replaceState(null, "", url);
  }
  if (view === "team") {
    const url = new URL(location.href);
    url.hash = "workspace-settings";
    url.searchParams.set("settingsTab", "sharing");
    history.replaceState(null, "", url);
    view = "workspace-settings";
  }
  if (
    ![
      "runs",
      "results",
      "failures",
      "analytics",
      "compare",
      "flaky",
      "settings",
      "workspace-settings",
      "users",
      "profile",
      "projects",
      "integrations",
      "history",
      "team",
    ].includes(view)
  )
    view = "runs";
  const workspaceContext = [
    "integrations",
    "projects",
    "users",
    "profile",
    "workspace-settings",
    "settings",
    "team",
  ].includes(view);
  document.body.classList.toggle("workspace-context", workspaceContext);
  document
    .querySelectorAll(
      'nav[aria-label="Project navigation"], nav[aria-label="Mobile project navigation"]',
    )
    .forEach((nav) => {
      nav.hidden = workspaceContext;
    });
  document.querySelectorAll("[data-workspace-navigation]").forEach((nav) => {
    nav.hidden = !workspaceContext;
  });
  document.querySelectorAll("nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === view);
    if (link.dataset.view === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const labels = {
    integrations: [
      "Integrations",
      "Connect report collection and notifications to your workspace.",
    ],
    projects: [
      "Projects",
      "Browse the projects and saved runs in your workspace.",
    ],
    users: [
      "Users",
      "Manage workspace accounts, roles, and project permissions.",
    ],
    profile: [
      "My Profile",
      "Manage your personal details and workspace preferences.",
    ],
    runs: [
      "Latest run",
      "A snapshot of test health, failures, and execution from your latest run.",
    ],
    compare: [
      "Compare runs",
      "Identify regressions, fixes, and performance changes between saved reports.",
    ],
    team: ["Team", "Share reports locally and manage project access."],
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
    "workspace-settings": [
      "Settings",
      "Manage appearance, shared reports, and workspace access.",
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
  renderWorkspaceIdentity();
  $("#refresh").hidden = isReportIndependentView();
  if (isReportIndependentView()) {
    $("#load-state").hidden = true;
    if (!report) {
      $("#source-label").textContent = "Workspace";
      $("#report-footer").textContent = "Your local workspace";
    }
  }
  $("#overview").hidden = view !== "runs";
  $("#results-section").hidden = !["results", "failures"].includes(view);
  $("#alternate").hidden = ["runs", "results", "failures", "history"].includes(
    view,
  );
  $("#dashboard-widgets").hidden = view !== "runs";
  $("#custom-dashboard").hidden = view !== "runs";
  $(".dashboard-actions").hidden = view !== "runs";
  $("#history-section").hidden = view !== "history";
  if (view === "history") renderHistory();
  $("#failure-groups").hidden = view !== "failures";
  if (view === "integrations") {
    $("#report-content").hidden = false;
    renderIntegrations($("#alternate"));
    return;
  }
  if (view === "projects") {
    $("#report-content").hidden = false;
    renderProjects($("#alternate"));
    return;
  }
  if (view === "users") {
    $("#report-content").hidden = false;
    renderUsers($("#alternate"));
    return;
  }
  if (view === "profile") {
    $("#report-content").hidden = false;
    renderUserProfile($("#alternate"));
    return;
  }
  if (view === "workspace-settings") {
    $("#report-content").hidden = false;
    renderWorkspaceSettings($("#alternate"));
    return;
  }
  if (!report) return;
  const alt = $("#alternate");
  if (view === "compare") renderComparison(alt);
  if (view === "analytics") renderAnalytics(alt);
  if (view === "failures") renderFailureGroups();
  if (view === "flaky") renderFlaky(alt);
  if (view === "settings") renderSettings(alt);
  applyReportSpecLink();
  renderResults();
}
function isPreviousImport() {
  return Boolean(
    activeHistoryId &&
    historyEntries.length &&
    historyEntries[0].id !== activeHistoryId,
  );
}
function historyNotice(message, type = "info") {
  if (message) showToast(message, type);
  $("#history-notice").hidden = !message;
  $("#history-notice").textContent = message;
}
async function refreshHistory() {
  historyEntries = await ImportHistory.list();
  renderHistory();
}
function renderHistory() {
  renderWorkspaceIdentity();
  $("#history-count").textContent = historyEntries.length;
  $("#history-total").textContent =
    `${historyEntries.length} saved ${historyEntries.length === 1 ? "report" : "reports"}`;
  globalThis.TomatoesReact.renderHistory({
    entries: historyEntries,
    activeId: activeHistoryId,
    formatDate: date,
    duration,
    href: reportHref,
    edit: editHistoryEntry,
    trash: trashHistoryEntry,
    exportPDF: exportReportPDF,
    copyLink: copyHistoryReportLink,
    openLink: openHistoryReportLink,
  });
  appendHistoryTools();
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
    const worker = new Worker("/js/report-worker.js");
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
  let slackRunId = null;
  const importEventId =
    options.recordImport && !options.skipServerSave
      ? crypto.randomUUID()
      : null;
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
    let serverCopy = null;
    let historyId = options.historyId;
    if (options.fromURL) {
      const resolved = await ReportLinks.resolve(
        { importId: historyId, serverId: options.serverId },
        {
          getLocal: (id) => ImportHistory.get(id),
          getServer: (id) =>
            teamRequest("/api/runs/" + id, {
              onDownloadProgress: (loaded, total) =>
                paintProgress(
                  Math.round((4 * loaded) / total),
                  "Downloading saved report",
                ),
              signal: AbortSignal.timeout(120000),
            }),
          verifyServer: serverMatchesImport,
        },
      );
      saved = resolved.local || null;
      serverCopy = resolved.server || null;
      historyId = saved?.entry.id || null;
    }
    if (options.restore) {
      try {
        historyId = await ImportHistory.lastActive();
        const accessible = await ImportHistory.list();
        if (!accessible.some((entry) => entry.id === historyId))
          historyId = accessible[0]?.id || null;
      } catch {
        historyNotice(
          "History is unavailable in this browser. The report can still be used for this session.",
        );
      }
    }
    if (historyId) {
      paintProgress(3, "Opening saved report");
      try {
        saved = saved || (await ImportHistory.get(historyId));
        if (saved.entry.deletedAt)
          throw new Error(
            "This report is in trash. Restore it from Import history.",
          );
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
    if (serverCopy) {
      const name = serverCopy.run.name;
      file = new File(
        [serverCopy.originalText || JSON.stringify(serverCopy.report)],
        name.endsWith(".json") ? name : name + ".json",
        { type: "application/json" },
      );
      options.metadataOverride = serverCopy.run.metadata;
      options.skipServerSave = true;
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
    if (saved?.entry.metadata)
      next.metadata = ReportData.normalizeMetadata(saved.entry.metadata);
    if (options.metadataOverride)
      next.metadata = ReportData.normalizeMetadata(options.metadataOverride);
    if (options.project !== undefined)
      next.metadata = ReportData.normalizeMetadata({
        ...next.metadata,
        project: options.project,
      });
    if (options.branch !== undefined)
      next.metadata = ReportData.normalizeMetadata({
        ...next.metadata,
        branch: options.branch,
      });
    if (!canAccessBrowserImport({ metadata: next.metadata }))
      throw new Error(
        "Choose one of your assigned projects before importing this report.",
      );
    report = next;
    report.importedAt =
      saved?.entry.lastImportedAt ?? saved?.entry.importedAt ?? Date.now();
    stability = null;
    comparison = null;
    currentFile = file;
    activeHistoryId = saved?.entry.id || null;
    sourceName = saved?.entry.label || (file ? file.name : "index.json");
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

    navigate(true);
    paintProgress(
      97,
      saved ? "Restoring saved import" : "Saving import history",
    );
    await allowPaint();
    const previousHistoryIds = new Set(historyEntries.map((entry) => entry.id));
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
        report.importedAt = entry.lastImportedAt ?? entry.importedAt;
      }
      await refreshHistory();
      historyNotice("");
    } catch (error) {
      historyNotice(
        "This report is loaded, but history could not be saved. Browser storage may be unavailable or full.",
      );
    }
    if (!saved && file && options.recordImport && !options.skipServerSave) {
      paintProgress(98, "Checking database storage");
      await allowPaint();
      const result = await syncImportedReport(
        historyEntries.find((entry) => entry.id === activeHistoryId),
      );
      if (result.notice) historyNotice(result.notice);
      if (result.saved && result.run) slackRunId = result.run.id;
    }
    if (serverCopy && activeHistoryId) {
      try {
        if (!previousHistoryIds.has(activeHistoryId)) {
          await ImportHistory.updateDetails(activeHistoryId, {
            label: serverCopy.run.label || "",
            notes: serverCopy.run.notes || "",
          });
          sourceName = serverCopy.run.label || sourceName;
        }
        await restoreSharedEvidence(serverCopy, activeHistoryId);
        await refreshHistory();
        renderSummary();
      } catch (error) {
        historyNotice(
          `Report opened, but some server details could not be restored: ${error.message}`,
          "warning",
        );
      }
    }
    if (options.recordImport && !options.fromURL && !pendingReportNavigation) {
      const nextURL = new URL(location.href);
      nextURL.searchParams.delete("spec");
      history.replaceState(null, "", nextURL);
      appliedReportSpecLink = null;
    }
    updateReportURL({
      replace: Boolean(
        options.restore ||
        options.fromURL ||
        (!options.recordImport && !options.openDashboard),
      ),
      dashboard: options.openDashboard,
      serverId: options.serverId,
    });
    $("#run-summary .eyebrow").textContent = isPreviousImport()
      ? "PREVIOUS IMPORT"
      : "LATEST IMPORTED RUN";
    navigate(true);
    paintProgress(100, "Report ready");
    await allowPaint();
    if (options.recordImport)
      showToast("Report imported successfully.", "success");
  } catch (error) {
    failed = true;
    options.onError?.(error);
    showToast(`Report import failed: ${error.message}`, "error");
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
    if (pendingReportNavigation) {
      pendingReportNavigation = false;
      queueMicrotask(navigateReportLocation);
    }
  }
  if (!failed && slackRunId && importEventId)
    void notifyImportedRun(slackRunId, importEventId);
  return !failed;
}
["search", "spec-filter", "status"].forEach((id) =>
  $("#" + id).addEventListener(id === "search" ? "input" : "change", () => {
    if (id === "spec-filter") syncReportSpecURL();
    page = 1;
    renderResults();
  }),
);
$("#clear").onclick = () => {
  $("#search").value = "";
  $("#spec-filter").value = "all";
  $("#status").value = "all";
  syncReportSpecURL();
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
$("#refresh").onclick = () => {
  if (failedReportLinkKey !== null) {
    failedReportLinkKey = null;
    return navigateReportLocation();
  }
  return activeHistoryId
    ? loadReport(null, { historyId: activeHistoryId })
    : loadReport();
};
$("#load-bundled").onclick = () => loadReport(null, { openDashboard: true });
ReportImport.setup({
  document,
  isBusy: () => loading || document.body.classList.contains("is-rendering"),
  prepareImport: async () => {
    await ImportProjects.prepare();
    if ($("#import-dialog").open) await ImportBranches.prepare();
  },
  getImportOptions: () => ({
    ...ImportProjects.options(),
    ...ImportBranches.options(),
  }),
  importFile: async (file, options) => {
    const success = await loadReport(file, { recordImport: true, ...options });
    if (success) await ImportBranches.remember(report.metadata);
  },
});
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
window.addEventListener("hashchange", navigateReportLocation);
window.addEventListener("popstate", navigateReportLocation);
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
initializeAuth().then(async () => {
  if (authRequiresLogin() || isAuthRoute()) {
    renderAuthScreen();
    return;
  }
  await reloadUserPreferences();
  void refreshHistory()
    .catch((error) =>
      historyNotice(`Could not load import history: ${error.message}`, "error"),
    )
    .finally(() => navigateReportLocation());
});

window.addEventListener("beforeunload", (event) => {
  if (hasUnsavedAppearance() || hasUnsavedProfile() || hasUnsavedWorkspace()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
function hasUnsavedAppearance() {
  const state = userPreferences.getState();
  return Boolean(
    state.ready &&
    appearanceDraft &&
    appearanceDraft.profileId === state.profileId &&
    appearanceDraft.colorMode !== state.preferences.appearance.colorMode,
  );
}

function isSharingSettingsView() {
  return (
    view === "workspace-settings" &&
    new URL(location.href).searchParams.get("settingsTab") === "sharing"
  );
}
function renderWorkspaceSettings(alt) {
  const requested = new URL(location.href).searchParams.get("settingsTab");
  const section = ["general", "sharing"].includes(requested)
    ? requested
    : "appearance";
  alt.innerHTML = `<div class="workspace-settings-page"><div class="workspace-settings-tabs" role="tablist" aria-label="Settings sections">${[
    ["general", "General"],
    ["appearance", "Appearance"],
    ["sharing", "Sharing & access"],
  ]
    .map(
      ([id, label]) =>
        `<button type="button" role="tab" id="settings-tab-${id}" data-settings-section="${id}" aria-controls="workspace-settings-panel" aria-selected="${section === id}" tabindex="${section === id ? "0" : "-1"}">${label}</button>`,
    )
    .join(
      "",
    )}</div><div id="workspace-settings-panel" role="tabpanel" aria-labelledby="settings-tab-${section}"></div></div>`;
  function selectSection(next, focus = false) {
    if (next !== section) {
      const url = new URL(location.href);
      if (next !== "appearance") url.searchParams.set("settingsTab", next);
      else url.searchParams.delete("settingsTab");
      history.pushState(null, "", url);
      navigate();
    }
    if (focus) document.querySelector("#settings-tab-" + next).focus();
  }
  alt.querySelectorAll("[data-settings-section]").forEach((button) => {
    button.onclick = () => selectSection(button.dataset.settingsSection);
    button.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const tabs = ["general", "appearance", "sharing"];
      selectSection(
        event.key === "Home"
          ? tabs[0]
          : event.key === "End"
            ? tabs[2]
            : tabs[
                (tabs.indexOf(section) + (event.key === "ArrowRight" ? 1 : 2)) %
                  3
              ],
        true,
      );
    };
  });
  const panel = document.querySelector("#workspace-settings-panel");
  if (section === "general") renderWorkspaceGeneral(panel);
  else if (section === "sharing") renderTeam(panel);
  else renderAppearanceSettings(panel);
}

function renderAppearanceSettings(alt) {
  const state = userPreferences.getState();
  if (!appearanceDraft || appearanceDraft.profileId !== state.profileId)
    appearanceDraft = {
      profileId: state.profileId,
      colorMode: state.preferences.appearance.colorMode,
      saving: false,
    };
  const draft = appearanceDraft;
  const selected = draft.colorMode;
  alt.innerHTML = `<div class="workspace-settings">
    <article class="settings-card appearance-card">
      <span class="eyebrow">APPEARANCE</span>
      <h2>Color Mode</h2>
      <p id="color-mode-description">Choose whether the appearance is light, dark, or follows your computer's settings.</p>
      <form id="appearance-form" aria-describedby="color-mode-description">
        <fieldset class="color-mode-options" ${state.ready ? "" : "disabled"}>
          <legend class="visually-hidden">Color Mode</legend>
          ${[
            ["light", "Light", "A bright, clear workspace."],
            ["dark", "Dark", "A softer view for low light."],
            ["system", "System", "Follow your computer's settings."],
          ]
            .map(
              ([mode, label, description]) => `<label class="color-mode-option">
            <span class="mode-preview mode-preview-${mode}" aria-hidden="true"><i></i><b></b><em></em></span>
            <span class="mode-option-heading"><input type="radio" name="colorMode" value="${mode}" ${selected === mode ? "checked" : ""} /><strong>${label}</strong></span>
            <small>${description}</small>
          </label>`,
            )
            .join("")}
        </fieldset>
        <div class="settings-buttons"><button class="button primary" type="submit" ${state.ready ? "" : "disabled"}>Save appearance</button><button class="button" type="button" id="discard-appearance" hidden>Discard changes</button></div>
        <p id="appearance-feedback" class="appearance-feedback" role="status" aria-live="polite"></p>
        <p class="appearance-save-note">${state.ready ? "Your color mode is saved to your user preferences and applied throughout Tomatoes." : esc(state.error)}</p>
      </form>
    </article>
    ${preferenceStatusMarkup()}
  </div>`;
  $("#reload-user-preferences").onclick = async () => {
    const button = $("#reload-user-preferences");
    button.disabled = true;
    const loaded = await reloadUserPreferences();
    if (
      view === "workspace-settings" &&
      !isSharingSettingsView() &&
      alt.isConnected
    )
      renderAppearanceSettings(alt);
    showToast(
      loaded.ready ? "Preferences reloaded." : loaded.error,
      loaded.ready ? "success" : "error",
    );
  };
  const form = $("#appearance-form");
  const button = form.querySelector('button[type="submit"]');
  const discard = $("#discard-appearance");
  function updateFeedback() {
    const dirty = hasUnsavedAppearance();
    button.disabled = !state.ready || !dirty || draft.saving;
    $("#reload-user-preferences").disabled = draft.saving;
    button.textContent = draft.saving ? "Saving..." : "Save appearance";
    discard.hidden = !dirty;
    $("#appearance-feedback").textContent = dirty
      ? "Unsaved changes. Select Save appearance to apply your choice. Your selection is kept while you move between pages."
      : "";
    form.inert = draft.saving;
    form.setAttribute("aria-busy", String(draft.saving));
  }
  form.onchange = () => {
    draft.colorMode = new FormData(form).get("colorMode");
    updateFeedback();
  };
  discard.onclick = () => {
    appearanceDraft = null;
    renderAppearanceSettings(alt);
  };
  updateFeedback();
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!state.ready || draft.saving || !hasUnsavedAppearance()) return;
    const colorMode = draft.colorMode;
    draft.saving = true;
    updateFeedback();
    try {
      const saved = await userPreferences.save({ appearance: { colorMode } });
      Appearance.apply(saved.preferences.appearance.colorMode);
      showToast("Appearance saved to your user preferences.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      draft.saving = false;
      if (
        view === "workspace-settings" &&
        !isSharingSettingsView() &&
        alt.isConnected
      )
        renderAppearanceSettings(alt);
    }
  };
}

let currentWorkspaceProject = "tomatoes";
let workspaceDraft = null;
function workspaceBranding(project = currentWorkspaceProject) {
  return ProjectManagement.branding(
    project,
    workspaceProjects,
    userPreferences.getState().preferences.workspaces,
  );
}
function workspaceLogoMarkup(project) {
  const brand = workspaceBranding(project);
  return brand.logo
    ? `<img class="workspace-logo" src="${esc(brand.logo)}" alt=""/>`
    : `<img class="workspace-logo" src="/assets/tomatoes-logo.svg" alt=""/>`;
}
function hasUnsavedWorkspace() {
  return Boolean(
    workspaceDraft &&
    workspaceDraft.profileId === userPreferences.getState().profileId &&
    JSON.stringify(workspaceDraft.brand) !==
      JSON.stringify(workspaceBranding(workspaceDraft.brand.project)),
  );
}
function renderOrganizationSettings(host) {
  const organization = authStatus?.organization;
  if (!organization) return;
  const canManage =
    !authStatus.enabled ||
    (authStatus.user?.role === "admin" &&
      authStatus.user.projects.includes("*"));
  host.insertAdjacentHTML(
    "afterbegin",
    `<form id="organization-settings-form" class="profile-details organization-general"><h2>Organization</h2><div class="profile-detail-row"><div><label for="organization-name">Organization name</label><p>Your organization contains projects and user memberships.</p></div><input id="organization-name" name="name" maxlength="80" required ${canManage ? "" : "readonly"} value="${esc(organization.name)}"/></div><div class="profile-detail-row"><div>Organization ID<p>Projects and users belong to this organization.</p></div><code>${esc(organization.id)}</code></div>${canManage ? '<div class="profile-form-actions"><button class="button primary">Update organization</button></div>' : ""}</form>`,
  );
  const form = host.querySelector("#organization-settings-form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!canManage) return;
    form.inert = true;
    try {
      teamState = await teamRequest("/api/team/status");
      const saved = await teamRequest("/api/organization", {
        method: "PATCH",
        body: JSON.stringify({ name: form.elements.name.value }),
      });
      authStatus = { ...authStatus, organization: saved.organization };
      renderWorkspaceIdentity();
      showToast("Organization updated successfully.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      form.inert = false;
    }
  };
}
function renderWorkspaceGeneral(host) {
  const state = userPreferences.getState();
  if (
    !workspaceDraft ||
    workspaceDraft.profileId !== state.profileId ||
    workspaceDraft.brand.project !== currentWorkspaceProject
  )
    workspaceDraft = {
      profileId: state.profileId,
      brand: { ...workspaceBranding() },
      saving: false,
    };
  const draft = workspaceDraft;
  const brand = draft.brand;
  const registered = workspaceProjects.some(
    (item) => item.id === brand.project && item.registered,
  );
  host.innerHTML = `<form class="profile-details workspace-general" id="workspace-general-form"><h2>Project branding</h2><fieldset ${!state.ready || draft.saving ? "disabled" : ""}><legend class="visually-hidden">Workspace branding</legend>
    <div class="profile-detail-row"><div><label for="workspace-brand-name">Project name</label><p>${registered ? 'The shared project name. Rename it from <a href="#projects">Projects</a>.' : "The name displayed throughout Tomatoes. Report project identifiers stay the same."}</p></div><input id="workspace-brand-name" name="name" ${registered ? "readonly" : ""} maxlength="80" required value="${esc(brand.name)}"/></div>
    <div class="profile-detail-row"><div><label for="workspace-brand-website">Project website</label><p>An optional link for your company or team.</p></div><input id="workspace-brand-website" name="website" type="url" maxlength="500" placeholder="https://example.com" value="${esc(brand.website)}"/></div>
    <div class="profile-detail-row"><div><label for="workspace-brand-logo">Project logo</label><p>PNG, JPEG, or WebP, up to 2 MB. Displayed in workspace navigation, project cards, run summaries, and PDF reports.</p></div><div><div class="workspace-logo-preview" id="workspace-logo-preview">${brand.logo ? `<img src="${esc(brand.logo)}" alt="Workspace logo preview"/>` : "<span>No logo uploaded</span>"}</div><input id="workspace-brand-logo" type="file" accept="image/png,image/jpeg,image/webp"/><button type="button" class="button" id="workspace-remove-logo">Remove logo</button><p id="workspace-logo-status" role="status"></p></div></div>
    <div class="profile-detail-row"><div><span>Report project</span><p>Branding is saved for this project in your database preferences.</p></div><code>${esc(brand.project)}</code></div></fieldset>
    <div class="profile-form-actions"><span id="workspace-brand-status" role="status"></span><button type="button" class="button" id="workspace-brand-reset">Reset</button><button class="button primary" type="submit">Save changes</button></div></form>`;
  renderOrganizationSettings(host);
  const form = host.querySelector("#workspace-general-form");
  const save = form.querySelector('[type="submit"]');
  const reset = form.querySelector("#workspace-brand-reset");
  const file = form.querySelector('[type="file"]');
  let reading = false;
  const update = () => {
    save.disabled =
      !state.ready || draft.saving || reading || !hasUnsavedWorkspace();
    reset.disabled = draft.saving || reading || !hasUnsavedWorkspace();
    file.disabled = !state.ready || reading || draft.saving;
    form.querySelector("#workspace-remove-logo").disabled =
      !state.ready || reading || draft.saving || !brand.logo;
    form.querySelector("#workspace-brand-status").textContent = draft.saving
      ? "Saving…"
      : hasUnsavedWorkspace()
        ? "Unsaved changes"
        : "";
    form.setAttribute("aria-busy", String(reading || draft.saving));
  };
  form.oninput = () => {
    brand.name = form.elements.name.value;
    brand.website = form.elements.website.value;
    update();
  };
  reset.onclick = () => {
    workspaceDraft = null;
    renderWorkspaceGeneral(host);
  };
  form.querySelector("#workspace-remove-logo").onclick = () => {
    brand.logo = "";
    renderWorkspaceGeneral(host);
  };
  file.onchange = async () => {
    const imageFile = file.files[0];
    if (!imageFile) return;
    reading = true;
    update();
    const status = form.querySelector("#workspace-logo-status");
    status.textContent = "Preparing logo…";
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(imageFile.type) ||
        imageFile.size > 2 * 1024 * 1024
      )
        throw new Error("Choose a PNG, JPEG, or WebP image up to 2 MB.");
      const image = await createImageBitmap(imageFile);
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 128 / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas
          .getContext("2d")
          .drawImage(image, 0, 0, canvas.width, canvas.height);
        const logo = canvas.toDataURL("image/png");
        if (logo.length > 100000)
          throw new Error("This logo is too detailed. Choose a simpler image.");
        brand.logo = logo;
      } finally {
        image.close();
      }
      if (host.isConnected && workspaceDraft === draft)
        renderWorkspaceGeneral(host);
    } catch (error) {
      status.textContent = "Logo could not be loaded.";
      showToast(error.message || "Choose a valid image.", "error");
    } finally {
      reading = false;
      file.value = "";
      if (form.isConnected) update();
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    draft.saving = true;
    form.inert = true;
    update();
    try {
      const workspaces = [
        ...userPreferences
          .getState()
          .preferences.workspaces.filter(
            (item) => item.project !== brand.project,
          ),
        { ...brand, name: brand.name.trim(), website: brand.website.trim() },
      ];
      await userPreferences.save({ workspaces });
      if (workspaceDraft === draft) workspaceDraft = null;
      renderWorkspaceIdentity();
      if (report) renderSummary();
      showToast("Workspace branding saved.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      draft.saving = false;
      form.inert = false;
      if (
        host.isConnected &&
        view === "workspace-settings" &&
        new URL(location.href).searchParams.get("settingsTab") === "general"
      )
        renderWorkspaceGeneral(host);
    }
  };
  update();
}
