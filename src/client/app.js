const $ = (selector) => document.querySelector(selector);
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
  organizationDraft = null;
  preferences = state.preferences.display;
  resultsPageSize = [25, 50, 100, 200].includes(preferences.rows)
    ? preferences.rows
    : 25;
  Appearance.apply(state.preferences.appearance.colorMode);
  renderTopbarTheme();
  renderWorkspaceIdentity();
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
let resultsPageSize = 25;
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
  globalThis.TomatoesReact.renderOrganizations?.(
    document.querySelector("#workspace-menu-other-organizations"),
    {
      organizations: authStatus?.organizations || [],
      currentId: authStatus?.organization?.id,
      onSwitch: switchWorkspaceOrganization,
    },
  );
  applyFeatureAccess();
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
      globalThis.TomatoesReact.renderAvatar(element, {
        logo: authStatus?.organization?.logo,
        initials: organizationInitials,
        name: organizationName,
      });
    });
  document.querySelectorAll("[data-project-picker]").forEach((select) => {
    globalThis.TomatoesReact.renderOptions(select, {
      options: workspaceProjects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
      empty: "No assigned projects",
    });
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
    authStatus?.user?.fullName ||
    user?.fullName ||
    user?.displayName ||
    authStatus?.user?.username ||
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
    globalThis.TomatoesReact.renderAvatar(element, {
      logo: branding.logo,
      initials,
    });
  });
  document.querySelectorAll("[data-workspace-logo]").forEach((element) => {
    globalThis.TomatoesReact.renderAvatar(element, {
      logo: branding.logo || "/assets/tomatoes-logo.svg",
    });
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
      url.hash = ReportLinks.tab("runs");
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
    onEditTags: hasAccess("import-history.edit-report-notes")
      ? () => ReportTags.edit()
      : null,
    brand: workspaceBranding(
      report.metadata?.project || currentWorkspaceProject,
    ),
    formatDate: date,
    duration,
  });
  renderDashboard();
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
  $("#results-page-size").value = String(resultsPageSize);
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
  const pages = Math.max(1, Math.ceil(items.length / resultsPageSize));
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
    items: items.slice((page - 1) * resultsPageSize, page * resultsPageSize),
    isTests,
    duration,
    showTest,
    openSpec: (id) => openTests(id, $("#status").value),
    finishedDate: date(report.end).replace(/ \([^)]*\)$/, ""),
    onCopy: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Result summary copied.", "success");
      } catch {
        showToast(
          "Could not copy the result summary. Please try again.",
          "error",
        );
      }
    },
  });
  $("#showing").textContent = items.length
    ? `Showing ${(page - 1) * resultsPageSize + 1}–${Math.min(page * resultsPageSize, items.length)} of ${number(items.length)} ${isTests ? "tests" : "specs"}`
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
  if (ReportLinks.view(location.hash) !== "results") {
    location.hash = ReportLinks.tab("results");
  }
  navigate();
  $("#results-section").scrollIntoView({ behavior: "smooth" });
}
function showTest(id) {
  if (!hasAccess("test-results.view-test-details")) return;
  const test = report.tests[id];
  const runId = activeHistoryId,
    key = Investigations.identity(test);
  globalThis.TomatoesReact.renderTestDetail($("#detail-content"), {
    test,
    duration,
    can: hasAccess,
    runId,
    listEvidence: () => ImportHistory.listEvidence(runId, key),
    onUpload: (file) => saveTestEvidence(test, file, runId),
    onHistory: () => openTestHistory(test),
  });
  $("#detail").showModal();
}
function navigate(force = false) {
  if (authRequiresLogin() || isAuthRoute()) {
    renderAuthScreen();
    return;
  }
  hideAuthScreen();
  if (loading && force !== true) return;
  view = ReportLinks.view(location.hash);
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
      "previous-runs",
      "results",
      "failures",
      "analytics",
      "compare",
      "flaky",
      "settings",
      "workspace-settings",
      "role-access",
      "users",
      "profile",
      "projects",
      "integrations",
      "history",
      "team",
    ].includes(view)
  )
    view = "runs";
  globalThis.TomatoesReact.clearPage();
  const workspaceContext = [
    "role-access",
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
    "role-access": [
      "Role access",
      "Manage role permissions for your organization.",
    ],
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
    "previous-runs": [
      "Previous runs",
      "Dashboard and test results for the selected earlier import in this project.",
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
  const canonicalTab = ReportLinks.tab(view);
  if (location.hash !== "#" + canonicalTab) {
    const url = new URL(location.href);
    url.hash = canonicalTab;
    history.replaceState(null, "", url);
  }
  document.title = `${labels[view][0]} | Tomatoes`;
  $("#page-title").textContent = labels[view][0];
  $("#page-description").textContent = labels[view][1];
  renderWorkspaceIdentity();
  document
    .querySelectorAll(
      'nav a[data-view="runs"], nav a[data-view="previous-runs"]',
    )
    .forEach((link) => {
      link.href = dashboardTabHref(link.dataset.view);
    });
  $("#refresh").hidden = isReportIndependentView();
  if (isReportIndependentView()) {
    $("#load-state").hidden = true;
    if (!report) {
      $("#source-label").textContent = "Workspace";
      $("#report-footer").textContent = "Your local workspace";
    }
  }
  const dashboard = ["runs", "previous-runs"].includes(view);
  $("#overview").hidden = !dashboard;
  $("#previous-run-notice").hidden = view !== "previous-runs";
  $("#results-section").hidden = !["results", "failures"].includes(view);
  $("#alternate").hidden = [
    "runs",
    "previous-runs",
    "results",
    "failures",
    "history",
  ].includes(view);
  $("#dashboard-widgets").hidden = !dashboard;
  $("#custom-dashboard").hidden = !dashboard;
  $(".dashboard-actions").hidden = !dashboard;
  $("#history-section").hidden = view !== "history";
  applyFeatureAccess();
  if (!canAccessView(view)) {
    [
      "#overview",
      "#results-section",
      "#dashboard-widgets",
      "#custom-dashboard",
      ".dashboard-actions",
      "#history-section",
      "#failure-groups",
    ].forEach((selector) => ($(selector).hidden = true));
    $("#report-content").hidden = false;
    $("#alternate").hidden = false;
    globalThis.TomatoesReact.renderAccessDenied($("#alternate"));
    return;
  }
  if (view === "role-access") {
    $("#report-content").hidden = false;
    renderRoleAccess($("#alternate"));
    return;
  }
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
  return selectedDashboardView === "previous-runs";
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
    tag: (id) => ReportTags.edit(id),
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
  globalThis.TomatoesReact.renderOptions($("#spec-filter"), {
    options: [
      { value: "all", label: "All specs" },
      ...report.specs.map((spec) => ({
        value: String(spec.id),
        label: spec.file,
      })),
    ],
  });
}
async function loadReport(file = currentFile, options = {}) {
  if (
    file &&
    !hasAccess("import-report-modal.browse-for-a-json-file") &&
    !hasAccess("import-report-modal.drag-and-drop-a-json-file")
  ) {
    showToast("Your role cannot import reports.", "warning");
    return false;
  }
  if (loading) return;
  const previous = {
    report,
    currentFile,
    activeHistoryId,
    sourceName,
    selectedDashboardView,
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
    if (file && options.recordImport)
      ReportData.normalizeTags(options.tags, true);
    if (options.tags !== undefined)
      next.metadata = ReportData.normalizeMetadata({
        ...next.metadata,
        tags: options.tags,
      });
    if (options.branch !== undefined)
      next.metadata = ReportData.normalizeMetadata({
        ...next.metadata,
        branch: options.branch,
      });
    const linkedTagServer =
      saved?.entry.serverId ||
      (saved ? knownReportServerId(saved.entry.id) : null);
    if (linkedTagServer && !options.recordImport) {
      try {
        const latest = await teamRequest(
          "/api/runs/" + linkedTagServer + "/tags",
        );
        next.metadata = ReportData.normalizeMetadata({
          ...next.metadata,
          tags: latest.tags,
        });
        await ImportHistory.updateMetadata(saved.entry.id, next.metadata);
      } catch {
        /* Keep the saved tags available when the server cannot be reached. */
      }
    }
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
      await rememberReportServerLink(
        activeHistoryId,
        serverCopy.run.id,
        serverCopy.run.receivedAt,
      );
      try {
        if (serverCopy.run.metadata?.tags)
          await ImportHistory.updateMetadata(activeHistoryId, report.metadata);
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
    const dashboard =
      options.openDashboard ||
      options.recordImport ||
      ["runs", "previous-runs"].includes(ReportLinks.view(location.hash));
    if (!pendingReportNavigation) {
      await classifyDashboard(options);
      renderSummary();
    }
    updateReportURL({
      replace: Boolean(
        options.restore ||
        options.fromURL ||
        (!options.recordImport && !options.openDashboard),
      ),
      dashboard,
      serverId: options.serverId || slackRunId,
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
      ({
        report,
        currentFile,
        activeHistoryId,
        sourceName,
        selectedDashboardView,
        page,
        grouping,
      } = previous);
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
$("#results-page-size").onchange = () => {
  const size = Number($("#results-page-size").value);
  if (![25, 50, 100, 200].includes(size)) return;
  resultsPageSize = size;
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
  canImport: () =>
    hasAccess("import-report-modal.browse-for-a-json-file") ||
    hasAccess("import-report-modal.drag-and-drop-a-json-file"),
  canBrowse: () => hasAccess("import-report-modal.browse-for-a-json-file"),
  canDrop: () => hasAccess("import-report-modal.drag-and-drop-a-json-file"),
  isBusy: () => loading || document.body.classList.contains("is-rendering"),
  prepareImport: async () => {
    await ImportProjects.prepare();
    if ($("#import-dialog").open) {
      await ImportBranches.prepare();
      await ReportTags.prepare();
    }
  },
  getImportOptions: () => ({
    ...ImportProjects.options(),
    ...ImportBranches.options(),
    ...ReportTags.options(),
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
  .forEach((element) =>
    globalThis.TomatoesReact.renderIcon(element, element.dataset.icon),
  );
document
  .querySelectorAll('a[href="#latest-run"], nav a[data-view="previous-runs"]')
  .forEach((link) =>
    link.addEventListener("click", (event) => {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      void openDashboardTab(
        link.dataset.view === "previous-runs" ? "previous-runs" : "runs",
      );
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
  if (
    hasUnsavedAppearance() ||
    hasUnsavedProfile() ||
    hasUnsavedWorkspace() ||
    hasUnsavedOrganization()
  ) {
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
  const sections = [
    ["general", "General"],
    ["appearance", "Appearance"],
    ["sharing", "Sharing & access"],
  ].filter(([id]) =>
    AccessPolicy.features.some(
      (f) =>
        f.id.startsWith(
          "settings-" + ({ sharing: "sharing-access" }[id] || id) + ".",
        ) && hasAccess(f.id),
    ),
  );
  const section = sections.some(([id]) => id === requested)
    ? requested
    : sections.some(([id]) => id === "appearance")
      ? "appearance"
      : sections[0]?.[0];
  globalThis.TomatoesReact.renderSettingsTabs(alt, {
    sections,
    section,
    onSelect: selectSection,
  });
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
  const panel = document.querySelector("#workspace-settings-panel");
  if (section === "general") renderWorkspaceGeneral(panel);
  else if (section === "sharing") renderTeam(panel);
  else renderAppearanceSettings(panel);
}

function renderTopbarTheme() {
  const state = userPreferences.getState();
  globalThis.TomatoesReact.renderTopbarTheme({
    profileId: state.profileId,
    mode: state.preferences.appearance.colorMode,
    ready: state.ready,
    notify: showToast,
    save: async (colorMode) => {
      const saved = await userPreferences.save({ appearance: { colorMode } });
      Appearance.apply(saved.preferences.appearance.colorMode);
      appearanceDraft = null;
      if (
        view === "workspace-settings" &&
        !isSharingSettingsView() &&
        document.querySelector("#appearance-form")
      )
        renderAppearanceSettings($("#workspace-settings-panel"));
      return saved.preferences.appearance.colorMode;
    },
  });
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
  globalThis.TomatoesReact.renderAppearance(alt, { state, selected });
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
      renderTopbarTheme();
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
let organizationDraft = null;
function workspaceBranding(
  project = currentWorkspaceProject,
  includeOrganization = true,
) {
  return ProjectManagement.branding(
    project,
    workspaceProjects,
    userPreferences.getState().preferences.workspaces,
    includeOrganization ? authStatus?.organization : {},
  );
}
function hasUnsavedWorkspace() {
  return Boolean(
    workspaceDraft &&
    workspaceDraft.profileId === userPreferences.getState().profileId &&
    JSON.stringify(workspaceDraft.brand) !==
      JSON.stringify(workspaceBranding(workspaceDraft.brand.project, false)),
  );
}
function hasUnsavedOrganization() {
  const current = authStatus?.organization;
  return Boolean(
    organizationDraft &&
    current &&
    organizationDraft.id === current.id &&
    (organizationDraft.name !== current.name ||
      organizationDraft.logo !== (current.logo || "")),
  );
}
async function prepareBrandLogo(imageFile) {
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
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const logo = canvas.toDataURL("image/png");
    if (logo.length > 100000)
      throw new Error("This logo is too detailed. Choose a simpler image.");
    return logo;
  } finally {
    image.close();
  }
}
function renderOrganizationSettings(host) {
  const organization = authStatus?.organization;
  if (!organization) return;
  const canManage =
    !authStatus.enabled ||
    (authStatus.user?.role === "admin" &&
      authStatus.user.projects.includes("*"));
  const profileId = userPreferences.getState().profileId;
  if (
    !organizationDraft ||
    organizationDraft.id !== organization.id ||
    organizationDraft.profileId !== profileId
  )
    organizationDraft = {
      id: organization.id,
      profileId,
      name: organization.name,
      logo: organization.logo || "",
      saving: false,
    };
  const draft = organizationDraft;
  globalThis.TomatoesReact.renderOrganization(
    host.querySelector("#organization-settings-root"),
    { organization, draft, canManage },
  );
  const form = host.querySelector("#organization-settings-form");
  const preview = form.querySelector("#organization-logo-preview");
  const paint = () => {
    globalThis.TomatoesReact.renderImage(preview, { logo: draft.logo });
  };
  paint();
  if (!canManage) return;
  const file = form.querySelector("#organization-logo");
  const remove = form.querySelector("#organization-remove-logo");
  const save = form.querySelector('[type="submit"]');
  let reading = false;
  const update = () => {
    save.disabled = reading || draft.saving || !hasUnsavedOrganization();
    file.disabled = reading || draft.saving;
    remove.disabled = reading || draft.saving || !draft.logo;
    form.setAttribute("aria-busy", String(reading || draft.saving));
  };
  form.oninput = () => {
    draft.name = form.elements.name.value;
    update();
  };
  remove.onclick = () => {
    draft.logo = "";
    paint();
    update();
  };
  file.onchange = async () => {
    const imageFile = file.files[0];
    if (!imageFile) return;
    reading = true;
    update();
    const status = form.querySelector("#organization-logo-status");
    status.textContent = "Preparing logo.";
    try {
      const logo = await prepareBrandLogo(imageFile);
      if (organizationDraft === draft) {
        draft.logo = logo;
        paint();
        status.textContent = "Logo ready. Update organization to save.";
      }
    } catch (error) {
      status.textContent = error.message;
      showToast(error.message, "error");
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
      teamState = await teamRequest("/api/team/status");
      if (teamState.organization?.id !== draft.id)
        throw new Error(
          "Your organization changed. Reload settings before saving.",
        );
      const saved = await teamRequest("/api/organization", {
        method: "PATCH",
        body: JSON.stringify({ name: draft.name, logo: draft.logo }),
      });
      authStatus = { ...authStatus, organization: saved.organization };
      organizationDraft = null;
      renderWorkspaceIdentity();
      if (report) renderSummary();
      showToast("Organization updated successfully.", "success");
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
function renderWorkspaceGeneral(host) {
  const state = userPreferences.getState();
  if (
    !workspaceDraft ||
    workspaceDraft.profileId !== state.profileId ||
    workspaceDraft.brand.project !== currentWorkspaceProject
  )
    workspaceDraft = {
      profileId: state.profileId,
      brand: { ...workspaceBranding(currentWorkspaceProject, false) },
      saving: false,
    };
  const draft = workspaceDraft;
  const brand = draft.brand;
  const registered = workspaceProjects.some(
    (item) => item.id === brand.project && item.registered,
  );
  globalThis.TomatoesReact.renderGeneral(host, {
    state,
    draft,
    brand,
    registered,
  });
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
      brand.logo = await prepareBrandLogo(imageFile);
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
