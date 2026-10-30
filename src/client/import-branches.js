(function (root) {
  function choices(rows, project, previous, active = "") {
    const branches = [
      ...new Set(
        rows
          .filter(
            (row) =>
              !row.deletedAt &&
              (row.metadata?.project || "tomatoes") === project,
          )
          .map((row) => row.metadata?.branch)
          .filter(
            (branch) =>
              typeof branch === "string" &&
              branch.trim() &&
              branch.length <= 160 &&
              !/[\x00-\x1f\x7f]/.test(branch),
          )
          .map((branch) => branch.trim()),
      ),
    ].sort((a, b) => a.localeCompare(b));
    const selected =
      previous === ""
        ? null
        : branches.includes(previous)
          ? previous
          : branches.includes(active)
            ? active
            : null;
    return { branches, selected };
  }
  let revision = 0;
  async function prepare() {
    const version = ++revision;
    const select = document.querySelector("#import-branch");
    const hint = document.querySelector("#import-branch-hint");
    const project =
      typeof ImportProjects !== "undefined"
        ? ImportProjects.current()
        : report?.metadata?.project || "tomatoes";
    hint.textContent = `Loading previous branches for ${project}...`;
    select.disabled = true;
    document.querySelector("#import-new-branch-field").hidden = true;
    let server = [],
      unavailable = false;
    const dialog = document.querySelector("#import-dialog");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    dialog.addEventListener("close", cancel, { once: true });
    try {
      server = (
        await teamRequest("/api/runs?project=" + encodeURIComponent(project), {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        })
      ).runs;
    } catch {
      unavailable = true;
    } finally {
      dialog.removeEventListener("close", cancel);
    }
    if (version !== revision || !document.querySelector("#import-dialog").open)
      return;
    const previous = userPreferences
      .getState()
      .preferences.importBranches.find(
        (item) => item.project === project,
      )?.branch;
    const result = choices(
      [...server, ...historyEntries],
      project,
      previous,
      report?.metadata?.branch || "",
    );
    select.replaceChildren();
    function option(value, label) {
      const item = document.createElement("option");
      item.value = value;
      item.textContent = label;
      return item;
    }
    select.append(option("__report__", "Use branch from report"));
    for (const branch of result.branches)
      select.append(option("branch:" + branch, branch));
    select.append(option("__new__", "Create a new branch..."));
    select.value =
      result.selected === null ? "__report__" : "branch:" + result.selected;
    select.disabled = false;
    const input = document.querySelector("#import-new-branch");
    input.value = "";
    select.onchange = () => {
      const creating = select.value === "__new__";
      document.querySelector("#import-new-branch-field").hidden = !creating;
      input.required = creating;
      if (creating) input.focus();
    };
    input.required = false;
    hint.textContent = `${result.branches.length} existing ${result.branches.length === 1 ? "branch" : "branches"} in ${project}. Choose a branch before selecting your file.${unavailable ? " Server branches could not be loaded; showing browser history." : ""}`;
  }
  function options() {
    const selected = document.querySelector("#import-branch").value;
    if (selected === "__report__") return {};
    const branch =
      selected === "__new__"
        ? document.querySelector("#import-new-branch").value.trim()
        : selected.slice("branch:".length);
    if (!branch || branch.length > 160 || /[\x00-\x1f\x7f]/.test(branch))
      throw new Error(
        "Enter a branch name of 1 to 160 characters before selecting a report.",
      );
    return { branch };
  }
  async function remember(metadata) {
    const state = userPreferences.getState();
    if (!state.ready) return;
    const project = metadata.project || "tomatoes";
    const defaults = state.preferences.importBranches.filter(
      (item) => item.project !== project,
    );
    defaults.push({ project, branch: metadata.branch || "" });
    try {
      await userPreferences.save({ importBranches: defaults.slice(-100) });
    } catch {
      showToast(
        "Report imported, but the branch default could not be saved. Reload preferences and try again.",
        "warning",
      );
    }
  }
  const api = { choices, prepare, options, remember };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ImportBranches = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
