function openAnalyticsArea(folder) {
  openTests("all", "all");
  $("#search").value = folder;
  renderResults();
}
function openAnalyticsHistory(id) {
  loadReport(null, { historyId: id, openDashboard: true });
}
function renderAnalytics(alt) {
  globalThis.TomatoesReact.renderAnalytics(alt, {
    report,
    sourceName,
    entries: historyEntries,
    activeId: activeHistoryId,
    formatDate: date,
    duration,
    onTest: showTest,
    onArea: openAnalyticsArea,
    onHistory: openAnalyticsHistory,
  });
}
function renderFlaky(alt) {
  globalThis.TomatoesReact.renderFlaky(alt, {
    report,
    entries: historyEntries,
    stability,
    duration,
    onAnalyze: analyzeStability,
    onTest: showTest,
  });
}
async function analyzeStability() {
  if (loading) return;
  const focused = document.activeElement;
  loading = true;
  document.body.classList.add("is-rendering");
  $("#report-content").setAttribute("aria-busy", "true");
  paintProgress(0, "Reading saved runs");
  $("#import-progress").showModal();
  $("#import-progress").focus();
  try {
    const selected = historyEntries.find(
      (entry) => entry.id === activeHistoryId,
    );
    const entries = historyEntries.slice(0, 10);
    if (selected && !entries.some((entry) => entry.id === selected.id))
      entries[entries.length - 1] = selected;
    entries.sort(
      (a, b) =>
        (Date.parse(a.start) || a.lastImportedAt) -
        (Date.parse(b.start) || b.lastImportedAt),
    );
    const runs = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const saved = await ImportHistory.get(entry.id);
      const run = await processReport(saved.text, (percent, label) =>
        paintProgress(
          Math.floor(((index + percent / 100) / entries.length) * 90),
          `Run ${index + 1}/${entries.length}: ${label}`,
        ),
      );
      runs.push({
        id: entry.id,
        label: date(entry.start),
        tests: run.tests.map((test) => ({
          file: test.file,
          fullTitle: test.fullTitle,
          title: test.title,
          status: test.status,
        })),
      });
    }
    paintProgress(94, "Comparing test outcomes");
    await allowPaint();
    stability = ReportData.stabilityStats(runs, report);
    paintProgress(98, "Rendering stability analysis");
    await allowPaint();
    renderFlaky($("#alternate"));
    paintProgress(100, "Analysis ready");
    await allowPaint();
  } catch (error) {
    globalThis.TomatoesReact.renderMessage($("#stability-results"), {
      message: `Analysis could not finish: ${error.message}`,
      error: true,
    });
  } finally {
    loading = false;
    document.body.classList.remove("is-rendering");
    $("#report-content").setAttribute("aria-busy", "false");
    $("#import-progress").close();
    if (focused?.isConnected) focused.focus();
    else $("#analyze-stability")?.focus();
  }
}
function renderSettings(alt) {
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = [
    ...new Set(["Asia/Singapore", "UTC", localZone, preferences.timeZone]),
  ];
  const savedEntry = historyEntries.find(
    (entry) => entry.id === activeHistoryId,
  );
  globalThis.TomatoesReact.renderReportSettings(alt, {
    report,
    sourceName,
    zones,
    preferences,
    pageSize,
    savedEntry,
    historyCount: historyEntries.length,
    state: userPreferences.getState(),
    formatDate: date,
    duration,
  });
  $("#reload-user-preferences").onclick = async (event) => {
    event.target.disabled = true;
    const state = await reloadUserPreferences();
    showToast(
      state.ready ? "Preferences reloaded from the server." : state.error,
      state.ready ? "success" : "error",
    );
    if (view === "settings") renderSettings(alt);
  };
  appendReportSettings(alt);
  renderCustomWidgetSettings(alt);
  async function applySettings(next) {
    const form = $("#display-settings");
    form.inert = true;
    try {
      await userPreferences.save({ display: next });
    } catch (error) {
      if (form.isConnected) $("#settings-feedback").textContent = error.message;
      showToast(`Preferences could not be saved: ${error.message}`, "error");
      return;
    } finally {
      form.inert = false;
    }
    preferences = next;
    stability = null;
    pageSize = next.rows;
    page = 1;
    renderSummary();
    renderHistory();
    renderResults();
    if (view === "settings" && form.isConnected) renderSettings(alt);
    showToast("Preferences saved to your server profile.", "success");
  }
  $("#display-settings").onsubmit = (event) => {
    event.preventDefault();
    applySettings({
      timeZone: $("#setting-zone").value,
      rows: Number($("#setting-rows").value),
    });
  };
  $("#reset-display").onclick = () => applySettings({ ...preferenceDefaults });
  if (!userPreferences.getState().ready)
    $("#display-settings")
      .querySelectorAll("input,select,button")
      .forEach((input) => (input.disabled = true));
  $("#revalidate-report").onclick = () => $("#refresh").click();
  $("#export-report").onclick = async () => {
    const button = $("#export-report");
    button.disabled = true;
    try {
      let text;
      if (activeHistoryId)
        text = (await ImportHistory.get(activeHistoryId)).text;
      else if (currentFile) text = await currentFile.text();
      else {
        const response = await fetch("results.json");
        if (!response.ok) throw new Error("Report source unavailable.");
        text = await response.text();
      }
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = sourceName
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/(?:\.json)?$/i, ".json");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Original JSON download started.", "success");
    } catch (error) {
      $("#export-feedback").textContent = `Download failed: ${error.message}`;
      showToast(`Download failed: ${error.message}`, "error");
    } finally {
      button.disabled = false;
    }
  };
}
