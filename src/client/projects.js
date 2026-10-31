let projectsRenderVersion = 0;
async function renderProjects(host) {
  const version = ++projectsRenderVersion;
  host.innerHTML =
    '<article class="insight-card"><p role="status">Loading projects…</p></article>';
  let serverRuns = [],
    browserRuns = [],
    serverError = "",
    canArchive = false,
    directory = [],
    canManage = false,
    nextCursor = null,
    loadingMore = false;
  const results = await Promise.allSettled([
    teamRequest("/api/runs?includeArchived=1", {
      signal: AbortSignal.timeout(15000),
    }),
    ImportHistory.list(false, true),
    teamRequest("/api/projects", { signal: AbortSignal.timeout(15000) }),
  ]);
  if (view !== "projects" || version !== projectsRenderVersion) return;
  if (results[0].status === "fulfilled") {
    serverRuns = results[0].value.runs;
    nextCursor = results[0].value.nextCursor || null;
    canArchive = results[0].value.canArchive;
  } else serverError = results[0].reason.message;
  if (results[1].status === "fulfilled") browserRuns = results[1].value;
  else {
    browserRuns = historyEntries;
    serverError +=
      (serverError ? " " : "") + "Browser archives could not be loaded.";
  }
  if (results[2].status === "fulfilled") {
    directory = results[2].value.projects;
    workspaceProjects = directory;
    renderWorkspaceIdentity();
    canManage = results[2].value.canManage;
  } else
    serverError +=
      (serverError ? " " : "") +
      "The project directory could not be loaded. " +
      results[2].reason.message;
  document.querySelector("#page-description").textContent =
    `Projects in ${authStatus?.organization?.name || "your organization"}. ${workspaceProjects.length} accessible ${workspaceProjects.length === 1 ? "project" : "projects"}.`;
  host.innerHTML = `<section class="projects-page" aria-label="Workspace projects"><div class="projects-toolbar"><div class="projects-search">${icon("search")}<input type="search" id="project-search" placeholder="Search projects" aria-label="Search projects"/><span id="project-count" role="status"></span></div>${canManage ? `<button type="button" class="button primary" id="create-project">${icon("plus")}New project</button>` : ""}</div>${serverError ? `<div class="notice data-warning" role="status">${esc(serverError)}<button class="button" id="projects-retry">Retry</button></div>` : ""}<div class="project-grid" id="project-grid"></div><div class="report-page-controls"><p id="projects-page-status" role="status"></p><button type="button" class="button" id="projects-load-more">Load older shared reports</button></div><p class="projects-source-note">Server runs and browser imports are separate copies. Archiving hides a copy from active lists and keeps its report available for recovery in this project.</p></section>`;
  const reportLink = (run) =>
    ReportLinks.build(location.href, {
      ...(run.source === "server"
        ? { serverId: run.id }
        : { importId: run.id, serverId: reportServerLinks.get(run.id) }),
      view: "runs",
    });
  const counts = (project) =>
    [
      project.serverCount
        ? `${number(project.serverCount)} ${nextCursor ? "loaded " : ""}server ${project.serverCount === 1 ? "run" : "runs"}`
        : "",
      project.browserCount
        ? `${number(project.browserCount)} browser ${project.browserCount === 1 ? "import" : "imports"}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ") || "No active runs";
  async function loadMoreRuns(afterLoad = null) {
    if (!nextCursor || loadingMore) return;
    loadingMore = true;
    drawPageControls();
    try {
      const payload = await teamRequest(
        "/api/runs?includeArchived=1&cursor=" + encodeURIComponent(nextCursor),
        { signal: AbortSignal.timeout(15000) },
      );
      if (view !== "projects" || version !== projectsRenderVersion) return;
      const seen = new Set(serverRuns.map((run) => run.id));
      serverRuns.push(...payload.runs.filter((run) => !seen.has(run.id)));
      nextCursor = payload.nextCursor || null;
      canArchive = payload.canArchive;
      draw();
      if (afterLoad) afterLoad();
    } catch (error) {
      showToast("Could not load older reports: " + error.message, "error");
    } finally {
      loadingMore = false;
      if (host.isConnected && version === projectsRenderVersion)
        drawPageControls();
    }
  }
  function drawPageControls() {
    const button = host.querySelector("#projects-load-more");
    if (!button) return;
    button.hidden = !nextCursor;
    button.disabled = loadingMore;
    button.textContent = loadingMore
      ? "Loading older reports..."
      : "Load older shared reports";
    host.querySelector("#projects-page-status").textContent =
      serverRuns.length +
      " shared reports loaded." +
      (nextCursor
        ? " Counts cover loaded reports; older reports are available."
        : "");
    const modalButton = document.querySelector("#project-runs-more");
    if (modalButton) {
      modalButton.disabled = loadingMore;
      modalButton.textContent = loadingMore
        ? "Loading older reports..."
        : "Load older shared reports";
    }
  }
  host.querySelector("#projects-load-more").onclick = () => void loadMoreRuns();
  const catalog = () =>
    ProjectCatalog.summarize(serverRuns, browserRuns, directory);
  const displayName = (id) =>
    directory.find((item) => item.id === id)?.name ||
    workspaceBranding(id).name;
  function editProject(project = null) {
    requireAccess(
      project ? "projects.rename-projects" : "projects.create-projects",
    );
    globalThis.TomatoesReact.openProjectEditor({
      project: project
        ? {
            id: project.name,
            name: project.displayName || workspaceBranding(project.name).name,
          }
        : null,
      onSave: async (name) => {
        teamState = await teamRequest("/api/team/status");
        const existing =
          project && directory.find((item) => item.id === project.name);
        const result = await teamRequest(
          existing
            ? "/api/projects/" + encodeURIComponent(project.name)
            : "/api/projects",
          {
            method: existing ? "PATCH" : "POST",
            body: JSON.stringify({
              name,
              ...(!existing && project ? { id: project.name } : {}),
            }),
          },
        );
        directory = [
          ...directory.filter((item) => item.id !== result.project.id),
          result.project,
        ];
        workspaceProjects = directory;
        renderWorkspaceIdentity();
        if (report) renderSummary();
        if (
          view === "projects" &&
          host.isConnected &&
          version === projectsRenderVersion
        )
          draw();
        return result.project;
      },
    });
  }
  function importToProject(id) {
    ImportProjects.preselect(id);
    document.getElementById("import-report").click();
  }
  function draw() {
    drawPageControls();
    const projects = catalog();
    const query = host
      .querySelector("#project-search")
      .value.trim()
      .toLowerCase();
    const filtered = projects.filter(
      (project) =>
        `${project.name} ${project.displayName || ""} ${workspaceBranding(project.name).name}`
          .toLowerCase()
          .includes(query) ||
        project.branches.some((branch) =>
          branch.name.toLowerCase().includes(query),
        ),
    );
    host.querySelector("#project-count").textContent =
      `${filtered.length}${query ? " of " + projects.length : ""} ${projects.length === 1 ? "project" : "projects"}`;
    host.querySelector("#project-grid").innerHTML =
      filtered
        .map((project, index) => {
          const archived =
            project.archivedServerCount + project.archivedBrowserCount;
          const brand = `${workspaceLogoMarkup(project.name)}${esc(project.displayName || workspaceBranding(project.name).name)}`;
          return `<article class="project-card${project.name === currentWorkspaceProject ? " is-current-workspace" : ""}" ${project.name === currentWorkspaceProject ? 'aria-current="true"' : ""}><header><div class="project-card-heading">${project.latest ? `<a class="project-card-title" href="${esc(reportLink(project.latest))}" data-project-report>${brand}</a>` : `<span class="project-card-title">${brand}</span>`}${project.name === currentWorkspaceProject ? '<span class="project-current-label"><span aria-hidden="true">✓</span> Current workspace</span>' : ""}${canManage && ProjectManagement.validId(project.name) ? `<button class="button project-rename-button" type="button" data-rename-project="${index}" aria-label="Rename ${esc(project.displayName || project.name)}">Rename</button>` : ""}</div><p>${counts(project)}</p><small>${project.latest ? `Latest run ${project.latest.start ? esc(date(project.latest.start)) : "date not provided"}` : archived ? (nextCursor ? "Loaded runs are archived. Older reports may be available below." : "All runs are archived. Restore a run to make it active again.") : nextCursor ? "Older reports may be available. Load older shared reports below." : "No reports yet. Import your first report to get started."}</small></header><div class="project-branch-list">${project.branches
            .slice(0, 5)
            .map(
              (branch) =>
                `<a class="project-branch" href="${esc(reportLink(branch.latest))}" data-project-report>${icon("branch")}<span><strong>${esc(branch.name || "Branch not provided")}</strong><small>${counts(branch)}</small></span>${badge(branch.latest.status || "unknown")}</a>`,
            )
            .join(
              "",
            )}</div><footer class="project-archive-footer">${ProjectManagement.validId(project.name) ? `<button class="button primary" type="button" data-import-project="${esc(project.name)}">Import report</button>` : ""}<button class="button" type="button" data-project-runs="${index}">Active runs</button><button class="button" type="button" data-project-archives="${index}">Archived runs <span class="project-archive-count">${archived}</span></button>${project.latest ? `<a class="project-open" href="${esc(reportLink(project.latest))}" data-project-report>Open latest run →</a>` : ""}</footer></article>`;
        })
        .join("") ||
      `<div class="history-empty"><h3>${projects.length ? "No matching projects" : "No projects yet"}</h3><p>${projects.length ? "Try another project or branch name." : canManage ? "Create your first project, then import a report to start exploring." : "Your administrator can create projects for your organization."}</p></div>`;
    host
      .querySelectorAll("[data-rename-project]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            editProject(filtered[Number(button.dataset.renameProject)])),
      );
    host
      .querySelectorAll("[data-import-project]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            importToProject(button.dataset.importProject)),
      );
    host
      .querySelectorAll("[data-project-report]")
      .forEach((link) => (link.onclick = openHistoryReportLink));
    for (const [attribute, archived] of [
      ["data-project-runs", false],
      ["data-project-archives", true],
    ])
      host
        .querySelectorAll(`[${attribute}]`)
        .forEach(
          (button) =>
            (button.onclick = () =>
              showRuns(
                filtered[Number(button.getAttribute(attribute))].name,
                archived,
              )),
        );
  }
  function showRuns(projectName, archived = false) {
    const dialog = projectRunDialog();
    const render = () => {
      const active = ProjectCatalog.runsForProject(
        serverRuns,
        browserRuns,
        projectName,
        false,
      );
      const archives = ProjectCatalog.runsForProject(
        serverRuns,
        browserRuns,
        projectName,
        true,
      );
      const runs = archived ? archives : active;
      dialog.querySelector("[data-project-dialog-body]").innerHTML =
        `<h2 id="project-runs-title">Runs in ${esc(displayName(projectName))}</h2><p class="projects-source-note">Server and browser copies are listed separately. Archived reports remain recoverable.</p>${nextCursor ? '<p class="notice">Counts cover loaded shared reports. Load older reports to see more runs.</p><button type="button" class="button" id="project-runs-more">Load older shared reports</button>' : ""}<div class="workspace-settings-tabs" role="tablist" aria-label="Project run status"><button role="tab" data-run-tab="active" aria-selected="${!archived}" tabindex="${!archived ? "0" : "-1"}" aria-controls="project-run-panel" id="project-active-tab">Active runs (${active.length})</button><button role="tab" data-run-tab="archived" aria-selected="${archived}" tabindex="${archived ? "0" : "-1"}" aria-controls="project-run-panel" id="project-archived-tab">Archived runs (${archives.length})</button></div><div id="project-run-panel" role="tabpanel" aria-labelledby="project-${archived ? "archived" : "active"}-tab"><div class="project-runs-list">${runs.map((run, index) => `<article class="shared-run"><div>${badge(run.status || "unknown")}<strong>${esc(run.label || run.name)}</strong><p><span class="project-run-source">${run.source === "server" ? "Server run" : "Browser import"}</span> · ${esc(run.metadata?.branch || "Branch not provided")}</p><small>${run.start ? esc(date(run.start)) : "Run date not provided"}${run.archivedAt ? `<br/>Archived ${esc(date(new Date(run.archivedAt).toISOString()))}` : ""}</small></div><div class="project-run-actions"><a class="button" data-open-project-run href="${esc(reportLink(run))}">Open results</a><button class="button ${archived ? "primary" : ""}" type="button" data-archive-run="${index}" ${run.source === "server" && !canArchive ? 'disabled title="Admin access is required to change shared runs."' : ""}>${archived ? "Restore run" : "Archive run"}</button></div></article>`).join("") || `<div class="project-runs-empty"><h3>${archived ? "No archived runs" : "No active runs"}</h3><p>${archived ? "Runs archived in this project will appear here for recovery." : "Check Archived runs to restore a previous report."}</p></div>`}</div></div>`;
      const more = dialog.querySelector("#project-runs-more");
      if (more) more.onclick = () => void loadMoreRuns(render);
      dialog.querySelectorAll("[data-run-tab]").forEach((button) => {
        const select = () => {
          archived = button.dataset.runTab === "archived";
          render();
          dialog
            .querySelector(`#project-${archived ? "archived" : "active"}-tab`)
            .focus();
        };
        button.onclick = select;
        button.onkeydown = (event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            archived =
              event.key === "Home"
                ? false
                : event.key === "End"
                  ? true
                  : !archived;
            render();
            dialog
              .querySelector(`#project-${archived ? "archived" : "active"}-tab`)
              .focus();
          }
        };
      });
      dialog.querySelectorAll("[data-open-project-run]").forEach(
        (link) =>
          (link.onclick = (event) => {
            if (
              event.button === 0 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              !event.altKey
            )
              dialog.close();
            openHistoryReportLink(event);
          }),
      );
      dialog.querySelectorAll("[data-archive-run]").forEach(
        (button) =>
          (button.onclick = () =>
            confirmProjectRunAction(
              runs[Number(button.dataset.archiveRun)],
              !archived,
              async () => {
                const run = runs[Number(button.dataset.archiveRun)];
                if (run.source === "server") {
                  const status = await teamRequest("/api/team/status");
                  teamState = status;
                  const result = await teamRequest(
                    `/api/runs/${run.id}/archive`,
                    {
                      method: "POST",
                      body: JSON.stringify({ archived: !archived }),
                      signal: AbortSignal.timeout(30000),
                    },
                  );
                  serverRuns = serverRuns.map((item) =>
                    item.id === run.id ? result.run : item,
                  );
                } else {
                  const updated = await ImportHistory.updateDetails(run.id, {
                    archivedAt: archived ? null : Date.now(),
                  });
                  if (!updated)
                    throw new Error(
                      "This browser import is no longer available. Reload Projects.",
                    );
                  browserRuns = browserRuns.map((item) =>
                    item.id === run.id ? updated : item,
                  );
                  if (
                    !archived &&
                    (await ImportHistory.lastActive()) === run.id
                  )
                    await ImportHistory.markActive(
                      browserRuns.find((item) => !item.archivedAt)?.id || null,
                    );
                  try {
                    await refreshHistory();
                  } catch (error) {
                    historyNotice(error.message, "error");
                  }
                }
                if (
                  view === "projects" &&
                  host.isConnected &&
                  version === projectsRenderVersion
                ) {
                  draw();
                  if (dialog.open) render();
                }
              },
            )),
      );
    };
    render();
    if (!dialog.open) dialog.showModal();
  }
  const create = host.querySelector("#create-project");
  if (create) create.onclick = () => editProject();
  host.querySelector("#project-search").oninput = draw;
  const retry = host.querySelector("#projects-retry");
  if (retry) retry.onclick = () => renderProjects(host);
  draw();
}
function projectRunDialog() {
  let dialog = document.querySelector("#project-runs-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "project-runs-dialog";
    dialog.setAttribute("aria-labelledby", "project-runs-title");
    dialog.innerHTML =
      '<button class="icon-button project-dialog-close" aria-label="Close project runs" type="button">' +
      icon("close") +
      "</button><div data-project-dialog-body></div>";
    document.body.append(dialog);
    dialog.querySelector("button").onclick = () => dialog.close();
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    });
  }
  return dialog;
}
function confirmProjectRunAction(run, archived, action) {
  requireAccess(
    archived
      ? "projects.restore-runs-with-confirmation"
      : "projects.archive-runs-with-confirmation",
  );
  let dialog = document.querySelector("#project-run-confirm");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "project-run-confirm";
    dialog.setAttribute("aria-labelledby", "project-run-confirm-title");
    document.body.append(dialog);
    dialog.addEventListener("cancel", (event) => {
      if (dialog.getAttribute("aria-busy") === "true") event.preventDefault();
    });
  }
  const label = archived ? "Archive" : "Restore";
  dialog.innerHTML = `<form><h2 id="project-run-confirm-title">${label} this run?</h2><p><strong>${esc(run.label || run.name)}</strong><br/>${esc(run.metadata?.project || "Unassigned project")} · ${esc(run.metadata?.branch || "Branch not provided")}</p><p>${run.source === "server" ? "This changes the shared server copy for everyone with project access." : "This changes only the import saved in this browser."}</p><p>${archived ? "The report will leave active lists. Its results, notes, and attachments are kept. You can recover it from this project’s Archived runs." : "The report will return to active lists in this project."}</p><p role="alert" class="project-action-error"></p><footer><button class="button" type="button" data-cancel-run-action>Cancel</button><button class="button primary" type="submit">${label} run</button></footer></form>`;
  dialog.setAttribute("aria-busy", "false");
  const form = dialog.querySelector("form");
  form.querySelector("[data-cancel-run-action]").onclick = () => dialog.close();
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (form.inert) return;
    form.inert = true;
    dialog.setAttribute("aria-busy", "true");
    const button = form.querySelector('[type="submit"]');
    button.textContent = archived ? "Archiving…" : "Restoring…";
    try {
      await action();
      dialog.close();
      showToast(
        archived
          ? "Run archived. Recover it from Archived runs in this project."
          : "Run restored to active runs.",
        "success",
      );
    } catch (error) {
      form.querySelector('[role="alert"]').textContent = error.message;
      showToast(error.message, "error");
    } finally {
      form.inert = false;
      dialog.setAttribute("aria-busy", "false");
      button.textContent = label + " run";
    }
  };
  dialog.onclose = () => {
    const tab = document.querySelector(
      '#project-runs-dialog [role="tab"][aria-selected="true"]',
    );
    if (tab?.isConnected) tab.focus();
  };
  dialog.showModal();
  form.querySelector("[data-cancel-run-action]").focus();
}
window.addEventListener("hashchange", () => {
  document.querySelector("#project-run-confirm")?.close();
  document.querySelector("#project-runs-dialog")?.close();
});
