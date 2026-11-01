/* Report identity lives in the query string; hash navigation selects the view. */
const reportServerLinks = new Map();
let pendingReportNavigation = false;
let loadedReportLinkKey = null;
let failedReportLinkKey = null;
let selectedDashboardView = "runs";
function dashboardProject() {
  return (
    new URL(location.href).searchParams.get("project") ||
    (typeof report !== "undefined" ? report?.metadata?.project : "") ||
    (typeof currentWorkspaceProject !== "undefined"
      ? currentWorkspaceProject
      : "") ||
    ""
  );
}
async function dashboardRuns(project) {
  const results = await Promise.allSettled([
    ImportHistory.list(),
    teamRequest(
      "/api/runs?limit=2" +
        (project ? "&project=" + encodeURIComponent(project) : ""),
      { cache: "no-store", signal: AbortSignal.timeout(15000) },
    ),
  ]);
  if (
    results[1].status === "rejected" &&
    typeof authStatus !== "undefined" &&
    authStatus?.enabled
  )
    throw results[1].reason;
  const browser = results[0].status === "fulfilled" ? results[0].value : [];
  if (results[0].status === "rejected" && typeof historyNotice === "function")
    historyNotice(
      "Browser history is unavailable. You can still open shared reports from Projects.",
      "warning",
    );
  const server = results[1].status === "fulfilled" ? results[1].value.runs : [];
  return ProjectCatalog.importedRuns(server, browser, project);
}
function matchesDashboardRun(run, historyId, serverId) {
  return Boolean(
    run &&
    (run.source === "server"
      ? run.id === serverId
      : run.id === historyId || (run.serverId && run.serverId === serverId)),
  );
}
async function classifyDashboard(options = {}) {
  if (options.recordImport) selectedDashboardView = "runs";
  else if (options.dashboardView) selectedDashboardView = options.dashboardView;
  else {
    const runs = await dashboardRuns(report.metadata.project || "");
    selectedDashboardView = matchesDashboardRun(
      runs[0],
      activeHistoryId,
      options.serverId || knownReportServerId(activeHistoryId),
    )
      ? "runs"
      : "previous-runs";
  }
  return selectedDashboardView;
}
function dashboardTabHref(target) {
  const url = new URL(ReportLinks.build(location.href, { view: target }));
  const project = dashboardProject();
  if (project) url.searchParams.set("project", project);
  return url.href;
}
async function openDashboardTab(target) {
  if (loading) return;
  history.pushState(null, "", dashboardTabHref(target));
  await navigateReportLocation();
}
function showEmptyDashboard(target, message) {
  selectedDashboardView = target;
  navigate();
  $("#report-content").hidden = true;
  $("#load-state").hidden = false;
  $("#load-state").textContent = message;
}
async function openDashboardSelection(target) {
  if (!canAccessView(target)) {
    navigate();
    return;
  }
  const requestedURL = location.href;
  try {
    const runs = await dashboardRuns(dashboardProject());
    if (location.href !== requestedURL || loading) return;
    const selected = runs[target === "runs" ? 0 : 1];
    if (!selected) {
      if (
        target === "runs" &&
        !(typeof authStatus !== "undefined" && authStatus?.enabled)
      ) {
        await loadReport(null, {
          restore: true,
          openDashboard: true,
          dashboardView: "runs",
        });
        return;
      }
      showEmptyDashboard(
        target,
        target === "runs"
          ? "No reports have been imported in this project yet."
          : "No previous runs yet. Older imports in this project will appear here.",
      );
      return;
    }
    const url = new URL(
      ReportLinks.build(location.href, {
        ...(selected.source === "server"
          ? { serverId: selected.id }
          : {
              importId: selected.id,
              serverId: knownReportServerId(selected.id, selected),
            }),
        view: target,
      }),
    );
    if (selected.metadata?.project)
      url.searchParams.set("project", selected.metadata.project);
    history.replaceState(null, "", url);
    failedReportLinkKey = null;
    const route = ReportLinks.read(url.href);
    let error;
    const success = await loadReport(null, {
      historyId: route.importId,
      serverId: route.serverId,
      fromURL: true,
      openDashboard: true,
      dashboardView: target,
      onError: (issue) => {
        error = issue;
      },
    });
    if (!success)
      showReportLinkError(
        error || new Error("This report could not be loaded."),
      );
  } catch (error) {
    showEmptyDashboard(
      target,
      `Could not load ${target === "runs" ? "the latest run" : "previous runs"}: ${error.message}`,
    );
  }
}
function knownReportServerId(id, entry = null) {
  const serverId =
    reportServerLinks.get(id) ||
    entry?.serverId ||
    (typeof historyEntries !== "undefined"
      ? historyEntries.find((item) => item.id === id)?.serverId
      : null);
  return ReportLinks.validId(serverId) ? serverId : null;
}
async function rememberReportServerLink(id, serverId, receivedAt) {
  if (!ReportLinks.validId(serverId)) return;
  reportServerLinks.set(id, serverId);
  try {
    await ImportHistory.updateDetails(id, {
      serverId,
      ...(receivedAt ? { serverReceivedAt: receivedAt } : {}),
    });
  } catch {
    // A shared report remains available even when browser storage is full.
  }
}
function reportHref(id) {
  return ReportLinks.build(location.href, {
    importId: id,
    serverId: knownReportServerId(id),
    view: "previous-runs",
  });
}
async function reportTextHash(text, project = "", branch = "") {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      ReportData.reportIdentityText(text, project, branch),
    ),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function serverMatchesImport(saved, id) {
  const text = saved.originalText || JSON.stringify(saved.report);
  const raw = saved.report || JSON.parse(text.replace(/^\uFEFF/, ""));
  const originalProject =
    ReportData.normalizeMetadata(
      raw.tomatoes || raw.metadata || raw.meta?.tomatoes || {},
    ).project || "";
  const hashes = await Promise.all(
    [...new Set(["", saved.run.metadata?.project || "", originalProject])].map(
      (project) =>
        Promise.all([
          reportTextHash(text, project),
          reportTextHash(text, project, saved.run.metadata?.branch || ""),
        ]),
    ),
  );
  return hashes.flat().includes(id);
}
function updateReportURL({
  replace = false,
  dashboard = false,
  serverId,
  dashboardView = selectedDashboardView,
} = {}) {
  if (pendingReportNavigation || (!activeHistoryId && !serverId && !dashboard))
    return;
  if (serverId && activeHistoryId)
    reportServerLinks.set(activeHistoryId, serverId);
  const url = new URL(
    ReportLinks.build(location.href, {
      importId: activeHistoryId,
      serverId: serverId || knownReportServerId(activeHistoryId),
      view: dashboard ? dashboardView : undefined,
    }),
  );
  if (typeof report !== "undefined" && report?.metadata?.project)
    url.searchParams.set("project", report.metadata.project);
  if (url.href !== location.href)
    history[replace ? "replaceState" : "pushState"](null, "", url);
  loadedReportLinkKey = ReportLinks.read(url.href).key;
  failedReportLinkKey = null;
}
function showReportLinkError(error) {
  failedReportLinkKey = location.search;
  $("#report-content").hidden = true;
  $("#load-state").hidden = false;
  $("#load-state").replaceChildren(
    document.createTextNode(`Unable to open this report: ${error.message} `),
  );
  const link = document.createElement("a");
  link.href = ReportLinks.build(location.href, { view: "history" });
  link.textContent = "Open import history";
  $("#load-state").append(link);
  $("#page-title").textContent = "Report unavailable";
  showToast(error.message, "error");
}
function isReportIndependentView() {
  return [
    "projects",
    "role-access",
    "integrations",
    "users",
    "profile",
    "workspace-settings",
    "team",
    "history",
  ].includes(ReportLinks.view(location.hash));
}
async function navigateReportLocation() {
  if (typeof authStatus !== "undefined" && authStatus?.enabled)
    await initializeAuth();
  if (authRequiresLogin() || isAuthRoute()) {
    renderAuthScreen();
    return;
  }
  if (loading) {
    pendingReportNavigation = true;
    return;
  }
  // Workspace and history remain usable even when report identifiers are invalid.
  if (isReportIndependentView()) {
    navigate();
    return;
  }
  let route;
  try {
    route = ReportLinks.read(location.href);
  } catch (error) {
    showReportLinkError(error);
    return;
  }
  const target = ReportLinks.view(location.hash);
  const dashboard = ["runs", "previous-runs"].includes(target);
  if (dashboard && !route.importId && !route.serverId) {
    await openDashboardSelection(target);
    return;
  }
  if (failedReportLinkKey === location.search) {
    navigate();
    $("#report-content").hidden = true;
    $("#load-state").hidden = false;
    $("#page-title").textContent = "Report unavailable";
    return;
  }
  if (
    (route.importId || route.serverId) &&
    !(route.importId && route.importId === activeHistoryId) &&
    route.key !== loadedReportLinkKey
  ) {
    let loadError;
    const success = await loadReport(null, {
      onError: (error) => {
        loadError = error;
      },
      historyId: route.importId,
      serverId: route.serverId,
      fromURL: true,
    });
    if (!success)
      showReportLinkError(
        loadError ||
          new Error(
            "The requested report could not be loaded. It may be missing, in trash, or outside your signed-in account's access.",
          ),
      );
  } else if (!report && !route.importId && !route.serverId) {
    let hasBrowserHistory = false;
    try {
      hasBrowserHistory = Boolean((await ImportHistory.list()).length);
    } catch {
      if (typeof historyNotice === "function")
        historyNotice(
          "Browser history is unavailable. You can still open shared reports from Projects.",
          "warning",
        );
    }
    if (
      typeof authStatus !== "undefined" &&
      authStatus?.enabled &&
      authStatus.authenticated &&
      !hasBrowserHistory
    ) {
      const url = new URL(location.href);
      if (!canAccessView("projects")) {
        const latest = await teamRequest("/api/runs?limit=1");
        if (latest.runs.length) {
          url.searchParams.set("server", latest.runs[0].id);
          url.hash = ReportLinks.tab("runs");
          history.replaceState(null, "", url);
          await navigateReportLocation();
          return;
        }
        url.hash = ReportLinks.tab("profile");
      } else url.hash = "projects";
      history.replaceState(null, "", url);
      navigate();
      return;
    }
    await loadReport(null, { restore: true });
  } else {
    if (dashboard && report) {
      try {
        await classifyDashboard({ serverId: route.serverId });
        updateReportURL({
          replace: true,
          dashboard: true,
          serverId: route.serverId,
        });
      } catch (error) {
        showEmptyDashboard(
          target,
          `Could not check the latest run: ${error.message}`,
        );
        return;
      }
    }
    navigate();
  }
}
function openHistoryReportLink(event) {
  if (
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  if (loading) return;
  failedReportLinkKey = null;
  history.pushState(null, "", event.currentTarget.href);
  void navigateReportLocation();
}
async function copyHistoryReportLink(id, button) {
  button.disabled = true;
  try {
    const saved = await ImportHistory.get(id);
    let serverId = knownReportServerId(id, saved.entry);
    if (!serverId) {
      try {
        const compact = JSON.stringify(
          JSON.parse(saved.text.replace(/^\uFEFF/, "")),
        );
        const projects = [
          ...new Set([
            saved.entry.metadata?.project || "tomatoes",
            ...workspaceProjects.map((project) => project.id),
          ]),
        ];
        for (const project of projects) {
          const candidates = await Promise.all([
            reportTextHash(
              compact,
              project,
              saved.entry.metadata?.branch || "",
            ),
            reportTextHash(compact, project),
          ]);
          for (const candidate of [...new Set(candidates)]) {
            try {
              const server = await teamRequest("/api/runs/" + candidate, {
                signal: AbortSignal.timeout(15000),
              });
              if (
                (server.run.metadata.branch || "") !==
                (saved.entry.metadata?.branch || "")
              )
                continue;
              if (await serverMatchesImport(server, id)) {
                serverId = candidate;
                await rememberReportServerLink(id, serverId);
                break;
              }
            } catch {
              /* A missing candidate does not prevent trying its legacy identity. */
            }
          }
          if (serverId) break;
        }
      } catch {
        /* Browser-only imports still have stable links. */
      }
    }
    const url = ReportLinks.build(location.href, {
      importId: id,
      serverId,
      view: "previous-runs",
    });
    try {
      await navigator.clipboard.writeText(url);
      showToast(
        serverId
          ? "Report link copied. Its server copy can be opened by users with access."
          : "Report link copied. This import is stored in this browser.",
        "success",
      );
    } catch {
      globalThis.TomatoesReact.renderCopyLink($("#detail-content"), { url });
      $("#copy-report-link").value = url;
      $("#detail").showModal();
      $("#copy-report-link").select();
    }
    if (id === activeHistoryId && serverId)
      updateReportURL({ replace: true, serverId });
  } catch (error) {
    showToast(`Could not create the report link: ${error.message}`, "error");
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

let appliedReportSpecLink = null;
function applyReportSpecLink() {
  if (!report || !["results", "failures"].includes(view)) return;
  const key = location.search + location.hash;
  if (appliedReportSpecLink === key) return;
  appliedReportSpecLink = key;
  const specId = new URL(location.href).searchParams.get("spec");
  if (specId === null) return;
  if (!report.specs.some((spec) => String(spec.id) === specId)) {
    showToast("The linked spec is not available in this report.", "warning");
    return;
  }
  $("#spec-filter").value = specId;
  grouping = "tests";
  page = 1;
}
function syncReportSpecURL() {
  const url = new URL(location.href);
  const specId = $("#spec-filter").value;
  if (specId === "all") url.searchParams.delete("spec");
  else url.searchParams.set("spec", specId);
  history.replaceState(null, "", url);
  appliedReportSpecLink = url.search + url.hash;
}
