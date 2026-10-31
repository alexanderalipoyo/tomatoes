/* Saved widget definitions are server user preferences; results are derived from the active report. */
function readCustomWidgets() {
  const state = userPreferences.getState();
  return { groups: state.preferences.dashboardGroups, error: state.error };
}
async function saveCustomWidgets(groups) {
  const state = await userPreferences.save({
    dashboardGroups: DashboardGroups.validateGroups(groups),
  });
  return state.preferences.dashboardGroups;
}
function showCustomSpec(id) {
  openTests(String(id), "all");
}
function renderCustomizedDashboard() {
  const { groups, error } = readCustomWidgets();
  $("#custom-dashboard-source").textContent =
    `Based on ${sourceName}. Groups may overlap; each widget counts a matching spec once.`;
  globalThis.TomatoesReact.renderGroups($("#custom-dashboard-content"), {
    groups,
    error,
    report,
    sourceName,
    duration,
    onSpec: showCustomSpec,
  });
}
function renderCustomWidgetSettings(alt) {
  const stored = readCustomWidgets();
  globalThis.TomatoesReact.renderGroupEditor(
    alt.querySelector("#custom-widget-settings-host"),
    {
      initialGroups: stored.groups,
      report,
      sourceName,
      duration,
      save: saveCustomWidgets,
      onSaved: renderCustomizedDashboard,
      onToast: showToast,
      can: hasAccess,
    },
  );
}
