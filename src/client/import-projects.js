(function (root) {
  let nextProject = null,
    version = 0;
  const current = () => {
    const value = document.querySelector("#import-project")?.value;
    return ProjectManagement.validId(value) ? value : "";
  };
  async function prepare() {
    const generation = ++version,
      dialog = document.querySelector("#import-dialog"),
      select = document.querySelector("#import-project"),
      hint = document.querySelector("#import-project-hint");
    const preferred = nextProject;
    nextProject = null;
    select.disabled = true;
    hint.textContent = "Loading projects…";
    const controller = new AbortController();
    const abort = () => controller.abort();
    dialog.addEventListener("close", abort, { once: true });
    let entries = [],
      failed = false;
    try {
      entries = (
        await teamRequest("/api/projects", {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        })
      ).projects;
    } catch {
      failed = true;
    } finally {
      dialog.removeEventListener("close", abort);
    }
    if (generation !== version || !dialog.open) return;
    const projects = new Map(entries.map((item) => [item.id, item.name]));
    for (const row of historyEntries) {
      const id = row.metadata?.project;
      if (ProjectManagement.validId(id) && !projects.has(id))
        projects.set(id, id);
    }
    if (
      ProjectManagement.validId(report?.metadata?.project) &&
      !projects.has(report.metadata.project)
    )
      projects.set(report.metadata.project, report.metadata.project);
    select.replaceChildren();
    const option = (value, text) => {
      const node = document.createElement("option");
      node.value = value;
      node.textContent = text;
      return node;
    };
    select.append(option("", "Select a project"));
    for (const [id, name] of [...projects].sort((a, b) =>
      a[1].localeCompare(b[1]),
    ))
      select.append(option(id, name));
    select.value = preferred && projects.has(preferred) ? preferred : "";
    select.disabled = false;
    hint.textContent = failed
      ? "Project directory is unavailable. Showing projects from browser imports."
      : "Choose where to save this report. Project names can change without breaking report links.";
    select.onchange = async () => {
      const browse = document.querySelector("#browse-report");
      browse.disabled = true;
      try {
        await ImportBranches.prepare();
      } finally {
        browse.disabled = false;
      }
    };
  }
  function options() {
    const select = document.querySelector("#import-project");
    if (select.disabled)
      throw new Error("Wait for project options to finish loading.");
    if (!ProjectManagement.validId(select.value)) {
      select.focus?.();
      throw new Error("Select a project before importing a report.");
    }
    if (document.querySelector("#import-branch").disabled)
      throw new Error("Wait for branch options to finish loading.");
    return { project: select.value };
  }
  const api = {
    current,
    prepare,
    options,
    preselect: (id) => {
      nextProject = id;
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ImportProjects = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
