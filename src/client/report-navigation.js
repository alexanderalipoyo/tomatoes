/* Report identity lives in the query string; hash navigation selects the view. */
const reportServerLinks = new Map();
let pendingReportNavigation = false;
let loadedReportLinkKey = null;
let failedReportLinkKey = null;
function reportHref(id) {
  return ReportLinks.build(location.href, {
    importId: id,
    serverId: reportServerLinks.get(id),
    view: "runs",
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
} = {}) {
  if (!activeHistoryId || pendingReportNavigation) return;
  if (serverId) reportServerLinks.set(activeHistoryId, serverId);
  const url = ReportLinks.build(location.href, {
    importId: activeHistoryId,
    serverId: reportServerLinks.get(activeHistoryId),
    view: dashboard ? "runs" : undefined,
  });
  if (url !== location.href)
    history[replace ? "replaceState" : "pushState"](null, "", url);
  loadedReportLinkKey = ReportLinks.read(url).key;
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
    "integrations",
    "users",
    "profile",
    "workspace-settings",
    "team",
    "history",
  ].includes(location.hash.slice(1));
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
    if (
      typeof authStatus !== "undefined" &&
      authStatus?.enabled &&
      authStatus.authenticated &&
      !(await ImportHistory.list()).length
    ) {
      const url = new URL(location.href);
      url.hash = "projects";
      history.replaceState(null, "", url);
      navigate();
      return;
    }
    await loadReport(null, { restore: true });
  } else navigate();
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
    let serverId = reportServerLinks.get(id);
    if (!serverId) {
      try {
        const listing = await teamRequest("/api/runs", {
          signal: AbortSignal.timeout(15000),
        });
        const compact = JSON.stringify(
          JSON.parse(saved.text.replace(/^\uFEFF/, "")),
        );
        const projects = [
          ...new Set([
            saved.entry.metadata?.project || "tomatoes",
            ...listing.runs.map((run) => run.metadata.project),
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
          const candidate = candidates.find((id) =>
            listing.runs.some(
              (run) =>
                run.id === id &&
                (run.metadata.branch || "") ===
                  (saved.entry.metadata?.branch || ""),
            ),
          );
          if (!candidate) continue;
          if (!listing.runs.some((run) => run.id === candidate)) continue;
          const server = await teamRequest("/api/runs/" + candidate, {
            signal: AbortSignal.timeout(15000),
          });
          if (await serverMatchesImport(server, id)) {
            serverId = candidate;
            reportServerLinks.set(id, serverId);
            break;
          }
        }
      } catch {
        /* Browser-only imports still have stable links. */
      }
    }
    const url = ReportLinks.build(location.href, {
      importId: id,
      serverId,
      view: "runs",
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
      $("#detail-content").innerHTML =
        '<h2 id="detail-title">Report link</h2><p>Copy this link to reopen the specific report.</p><label for="copy-report-link">Report URL</label><input id="copy-report-link" readonly style="width:100%" />';
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
