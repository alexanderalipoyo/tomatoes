(function (root) {
  function time(run) {
    return Date.parse(run.start || "") || run.importedAt || run.receivedAt || 0;
  }
  function runsForProject(serverRuns, browserImports, name) {
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
  function summarize(serverRuns = [], browserImports = []) {
    const projects = new Map();
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
            branches: new Map(),
          });
        const project = projects.get(name);
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
  const api = { summarize, runsForProject };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ProjectCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
