let projectsRenderVersion = 0;
async function renderProjects(host) {
  const version = ++projectsRenderVersion;
  host.innerHTML =
    '<article class="insight-card"><p role="status">Loading projects...</p></article>';
  let serverRuns = [],
    serverError = "";
  try {
    const payload = await teamRequest("/api/runs", {
      signal: AbortSignal.timeout(15000),
    });
    serverRuns = payload.runs;
  } catch (error) {
    serverError = error.message;
  }
  if (view !== "projects" || version !== projectsRenderVersion) return;
  const projects = ProjectCatalog.summarize(serverRuns, historyEntries);
  const workspace = currentWorkspaceProject;
  document.querySelector("#page-description").textContent =
    `Projects and saved runs available in ${workspace}.`;
  host.innerHTML = `<section class="projects-page" aria-label="Workspace projects">
    <div class="projects-toolbar"><div class="projects-search">${icon("search")}<input type="search" id="project-search" placeholder="Search projects" aria-label="Search projects"/><span id="project-count" role="status"></span></div></div>
    ${serverError ? `<div class="notice data-warning" role="status">Server projects are unavailable: ${esc(serverError)} Showing browser imports.<button class="button" id="projects-retry">Retry</button></div>` : ""}
    <div class="project-grid" id="project-grid"></div>
    <p class="projects-source-note">Server runs and browser imports are listed separately; an import may also have a server copy. Projects and branches come from the metadata in your saved reports.</p>
  </section>`;
  function reportLink(run) {
    return ReportLinks.build(location.href, {
      ...(run.source === "server"
        ? { serverId: run.id }
        : { importId: run.id, serverId: reportServerLinks.get(run.id) }),
      view: "runs",
    });
  }
  function counts(item) {
    return [
      item.serverCount
        ? `${number(item.serverCount)} server ${item.serverCount === 1 ? "run" : "runs"}`
        : "",
      item.browserCount
        ? `${number(item.browserCount)} browser ${item.browserCount === 1 ? "import" : "imports"}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function draw() {
    const query = document
      .querySelector("#project-search")
      .value.trim()
      .toLowerCase();
    const filtered = projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.branches.some((branch) =>
          branch.name.toLowerCase().includes(query),
        ),
    );
    document.querySelector("#project-count").textContent =
      `${filtered.length}${query ? " of " + projects.length : ""} ${projects.length === 1 ? "project" : "projects"}`;
    document.querySelector("#project-grid").innerHTML =
      filtered
        .map(
          (project, index) =>
            `<article class="project-card${project.name === workspace ? " is-current-workspace" : ""}" ${project.name === workspace ? 'aria-current="true"' : ""}><header><div class="project-card-heading"><a class="project-card-title" href="${esc(reportLink(project.latest))}" data-project-report>${workspaceLogoMarkup(project.name)}${esc(workspaceBranding(project.name).name)}</a>${project.name === workspace ? '<span class="project-current-label"><span aria-hidden="true">&#10003;</span> Current workspace</span>' : ""}</div><p>${counts(project)}</p><small>Latest run ${project.latest.start ? esc(date(project.latest.start)) : "date not provided"}</small></header><div class="project-branch-list">${project.branches
              .slice(0, 5)
              .map(
                (branch) =>
                  `<a class="project-branch" href="${esc(reportLink(branch.latest))}" data-project-report>${icon("branch")}<span><strong>${esc(branch.name || "Branch not provided")}</strong><small>${counts(branch)}</small></span>${badge(branch.latest.status || "unknown")}</a>`,
              )
              .join(
                "",
              )}</div><footer><button class="button" type="button" data-project-runs="${index}">View all runs${project.branches.length > 5 ? ` · ${project.branches.length} branches` : ""}</button><a class="project-open" href="${esc(reportLink(project.latest))}" data-project-report>Open latest run →</a></footer></article>`,
        )
        .join("") ||
      `<div class="history-empty"><h3>${projects.length ? "No matching projects" : "No projects yet"}</h3><p>${projects.length ? "Try another project or branch name." : "Import a report from Latest run to see its project and run results here."}</p></div>`;
    host
      .querySelectorAll("[data-project-report]")
      .forEach((link) => (link.onclick = openHistoryReportLink));
    host.querySelectorAll("[data-project-runs]").forEach(
      (button) =>
        (button.onclick = () => {
          const project = filtered[Number(button.dataset.projectRuns)];
          const runs = ProjectCatalog.runsForProject(
            serverRuns,
            historyEntries,
            project.name,
          );
          const dialog = document.querySelector("#detail");
          document.querySelector("#detail-content").innerHTML =
            `<h2 id="detail-title">Runs in ${esc(project.name)}</h2><p class="projects-source-note">${counts(project)}. Server and browser copies are listed separately.</p><div class="project-runs-list">${runs.map((run) => `<article class="shared-run"><div>${badge(run.status || "unknown")}<strong>${esc(run.label || run.name)}</strong><p>${run.source === "server" ? "Server run" : "Browser import"} · ${esc(run.metadata?.branch || "Branch not provided")}</p><small>${run.start ? esc(date(run.start)) : "Run date not provided"}</small></div><a class="button" data-open-project-run href="${esc(reportLink(run))}">Open results</a></article>`).join("")}</div>`;
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
          dialog.showModal();
        }),
    );
  }
  document.querySelector("#project-search").oninput = draw;
  if (document.querySelector("#projects-retry"))
    document.querySelector("#projects-retry").onclick = () =>
      renderProjects(host);
  draw();
}
