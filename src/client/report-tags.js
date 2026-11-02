(function (root) {
  let preparing = false,
    version = 0;
  function localTags(project) {
    return (typeof historyEntries === "undefined" ? [] : historyEntries)
      .filter(
        (entry) => !entry.deletedAt && entry.metadata?.project === project,
      )
      .flatMap((entry) => entry.metadata?.tags || []);
  }
  async function suggestions(project) {
    const values = localTags(project);
    try {
      const payload = await teamRequest(
        "/api/projects/" + encodeURIComponent(project) + "/tags",
      );
      values.push(...payload.tags);
    } catch {
      /* Browser history remains available when offline. */
    }
    return [
      ...new Map(values.map((tag) => [tag.toLowerCase(), tag])).values(),
    ].sort((a, b) => a.localeCompare(b));
  }
  async function prepare() {
    const current = ++version;
    const project = document.querySelector("#import-project")?.value;
    const host = document.querySelector("#import-tags-host");
    if (!host) return;
    preparing = true;
    const clearError = () => {
      const error = document.querySelector("#import-selection-error");
      if (error) {
        error.hidden = true;
        error.textContent = "";
      }
    };
    globalThis.TomatoesReact.renderTagPicker(host, {
      inputId: "import-tags",
      initialTags: [],
      suggestions: [],
      required: true,
      disabled: true,
      pickerKey: current + ":loading",
    });
    try {
      const choices = project ? await suggestions(project) : [];
      if (current !== version) return;
      globalThis.TomatoesReact.renderTagPicker(host, {
        inputId: "import-tags",
        initialTags: [],
        suggestions: choices,
        required: true,
        disabled: !project,
        pickerKey: current,
        onChange: clearError,
      });
    } finally {
      if (current === version) preparing = false;
    }
  }
  function options() {
    if (preparing)
      throw new Error("Wait for tag suggestions to finish loading.");
    try {
      return {
        tags: ReportData.normalizeTags(
          JSON.parse(document.querySelector("#import-tags")?.value || "[]"),
          true,
        ),
      };
    } catch (error) {
      document.querySelector("#import-tags-search")?.focus();
      throw error;
    }
  }
  async function save(entry, values) {
    const tags = ReportData.normalizeTags(values, true);
    const isActive = entry.id === activeHistoryId;
    const serverId =
      entry.serverId ||
      knownReportServerId(entry.id, entry) ||
      (isActive ? new URL(location.href).searchParams.get("server") : null);
    if (!entry.id && !serverId)
      throw new Error("Save this report before adding tags.");
    if (serverId)
      await teamRequest("/api/runs/" + serverId + "/tags", {
        method: "PATCH",
        body: JSON.stringify({ tags }),
      });
    if (entry.id)
      await ImportHistory.updateMetadata(entry.id, { ...entry.metadata, tags });
    if (isActive) {
      report.metadata = { ...report.metadata, tags };
      renderSummary();
    }
    invalidateSavedAnalysis(entry.id);
    await refreshHistory();
    return tags;
  }
  async function edit(id = activeHistoryId) {
    if (!hasAccess("import-history.edit-report-notes")) return;
    let entry =
      historyEntries.find((item) => item.id === id) ||
      (id === activeHistoryId
        ? {
            id: activeHistoryId,
            name: sourceName,
            metadata: report.metadata,
            serverId: new URL(location.href).searchParams.get("server"),
          }
        : null);
    if (!entry) return;
    try {
      const serverId = entry.serverId || knownReportServerId(entry.id, entry);
      if (serverId) {
        try {
          const latest = await teamRequest("/api/runs/" + serverId + "/tags");
          entry = {
            ...entry,
            metadata: { ...entry.metadata, tags: latest.tags },
          };
        } catch {
          /* Keep browser tags usable offline. */
        }
      }
      const choices = await suggestions(
        entry.metadata?.project || currentWorkspaceProject || "tomatoes",
      );
      globalThis.TomatoesReact.renderReportTagEditor(
        document.querySelector("#detail-content"),
        {
          entry,
          suggestions: choices,
          save: (tags) => save(entry, tags),
          onCancel: () => document.querySelector("#detail").close(),
          onError: (message) =>
            showToast("Could not save report tags: " + message, "error"),
          onSaved: () => {
            document.querySelector("#detail").close();
            showToast("Report tags saved.", "success");
          },
        },
      );
      document.querySelector("#detail").showModal();
    } catch (error) {
      showToast("Could not open report tags: " + error.message, "error");
    }
  }
  const api = { prepare, options, suggestions, edit, save };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ReportTags = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
