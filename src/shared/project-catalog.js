(function (root) {
  function time(run) {
    return (
      Number(
        run.serverReceivedAt ||
          run.receivedAt ||
          run.lastImportedAt ||
          run.importedAt,
      ) ||
      Date.parse(run.start || "") ||
      0
    );
  }
  function runsForProject(serverRuns, browserImports, name, archived = false) {
    const seen = new Set();
    return [
      ["server", serverRuns],
      ["browser", browserImports],
    ]
      .flatMap(([source, rows]) =>
        rows
          .filter((run) => {
            const key = source + ":" + run.id;
            if (
              run.deletedAt ||
              Boolean(run.archivedAt) !== archived ||
              (run.metadata?.project || "Unassigned project") !== name ||
              seen.has(key)
            )
              return false;
            seen.add(key);
            return true;
          })
          .map((run) => ({ ...run, source })),
      )
      .sort((a, b) => time(b) - time(a));
  }
  function summarize(serverRuns = [], browserImports = [], registered = []) {
    const projects = new Map();
    for (const project of registered)
      projects.set(project.id, {
        name: project.id,
        displayName: project.registered ? project.name : undefined,
        registered: project.registered,
        serverCount: 0,
        browserCount: 0,
        latest: null,
        archivedServerCount: 0,
        archivedBrowserCount: 0,
        branches: new Map(),
      });
    const seen = new Set();
    for (const [source, rows] of [
      ["server", serverRuns],
      ["browser", browserImports],
    ]) {
      for (const run of rows) {
        if (run.deletedAt || seen.has(source + ":" + run.id)) continue;
        seen.add(source + ":" + run.id);
        const name = run.metadata?.project || "Unassigned project";
        if (!projects.has(name))
          projects.set(name, {
            name,
            serverCount: 0,
            browserCount: 0,
            latest: null,
            archivedServerCount: 0,
            archivedBrowserCount: 0,
            branches: new Map(),
          });
        const project = projects.get(name);
        if (run.archivedAt) {
          project[
            source === "server" ? "archivedServerCount" : "archivedBrowserCount"
          ]++;
          continue;
        }
        const key = source === "server" ? "serverCount" : "browserCount";
        const branch = run.metadata?.branch || "";
        if (!project.branches.has(branch))
          project.branches.set(branch, {
            name: branch,
            serverCount: 0,
            browserCount: 0,
            latest: null,
          });
        const group = project.branches.get(branch);
        const item = { ...run, source };
        for (const target of [project, group]) {
          target[key]++;
          if (!target.latest || time(item) > time(target.latest))
            target.latest = item;
        }
      }
    }
    return [...projects.values()]
      .map((project) => ({
        ...project,
        branches: [...project.branches.values()].sort(
          (a, b) => time(b.latest) - time(a.latest),
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function importedRuns(serverRuns = [], browserImports = [], project = "") {
    const active = (run) =>
      !run.deletedAt &&
      !run.archivedAt &&
      (!project || run.metadata?.project === project);
    const shared = serverRuns.filter(active);
    const seen = new Set();
    return [
      ...shared.map((run) => ({ ...run, source: "server" })),
      ...browserImports
        .filter(active)
        .filter((run) => !run.serverId || !shared.length)
        .map((run) => ({ ...run, source: "browser" })),
    ]
      .filter((run) => {
        const key =
          run.source === "server"
            ? run.id
            : run.serverId || "browser:" + run.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const imported = (run) =>
          Number(
            run.source === "server"
              ? run.receivedAt || run.importedAt || 0
              : run.serverReceivedAt ||
                  run.lastImportedAt ||
                  run.importedAt ||
                  0,
          );
        return imported(b) - imported(a) || a.id.localeCompare(b.id);
      });
  }
  const api = { summarize, runsForProject, importedRuns };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ProjectCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
