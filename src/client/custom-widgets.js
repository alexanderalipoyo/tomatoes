/* Saved widget definitions are server user preferences; results are derived from the active report. */
function readCustomWidgets() {
  const state = userPreferences.getState();
  const owner = !authStatus
    ? null
    : authStatus.enabled
      ? authStatus.authenticated
        ? "user:" + authStatus.user.username
        : null
      : "local";
  const ready = state.ready && owner !== null && state.profileId === owner;
  return {
    groups: ready ? state.preferences.dashboardGroups : [],
    profileId: ready ? owner : "unavailable",
    ready,
    error: ready
      ? ""
      : state.error || "Load your saved preferences to see your widgets.",
  };
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
  const { groups, error, profileId } = readCustomWidgets();
  $("#custom-dashboard-source").textContent =
    `Your saved widget setup, using results from ${sourceName}. Groups may overlap; each widget counts a matching spec once.`;
  globalThis.TomatoesReact.renderGroups($("#custom-dashboard-content"), {
    groups,
    profileId,
    canManage: canAccessView("settings"),
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
      preferenceError: stored.error,
      ready: stored.ready,
      report,
      sourceName,
      duration,
      save: saveCustomWidgets,
      onSaved: renderCustomizedDashboard,
      onToast: showToast,
      can: (feature) => stored.ready && hasAccess(feature),
    },
  );
}
