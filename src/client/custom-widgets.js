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
  const profileOwner = authStatus?.preferenceProfileId || owner;
  const ready =
    state.ready && owner !== null && state.profileId === profileOwner;
  return {
    groups: ready ? state.preferences.dashboardGroups : [],
    sharedGroups: ready
      ? (state.sharedDashboardGroups || []).flatMap((setup) =>
          setup.groups.map((group) => ({
            ...group,
            id: "shared:" + setup.owner + ":" + group.id,
            sharedBy: setup.owner,
          })),
        )
      : [],
    sharing: ready && state.preferences.shareDashboardGroups === true,
    profileId: ready ? profileOwner : "unavailable",
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
  const { groups, sharedGroups, error, profileId } = readCustomWidgets();
  $("#custom-dashboard-source").textContent =
    `Your saved widget setup, using results from ${sourceName}. Groups may overlap; each widget counts a matching spec once.`;
  const settingsButton = $("#open-custom-widget-settings");
  if (settingsButton) settingsButton.onclick = openCustomWidgetSettings;
  globalThis.TomatoesReact.renderGroups($("#custom-dashboard-content"), {
    groups: [...groups, ...sharedGroups],
    profileId,
    canManage: canAccessView("settings"),
    error,
    report,
    sourceName,
    duration,
    onSpec: showCustomSpec,
  });
}
function openCustomWidgetSettings() {
  const stored = readCustomWidgets();
  globalThis.TomatoesReact.openGroupSettings({
    initialGroups: stored.groups,
    initialSharing: stored.sharing,
    canShare: Boolean(authStatus?.enabled && authStatus?.authenticated),
    preferenceError: stored.error,
    ready: stored.ready,
    report,
    sourceName,
    duration,
    save: saveCustomWidgets,
    saveSharing: async (enabled) => {
      const state = await userPreferences.save({
        shareDashboardGroups: enabled,
      });
      return state.preferences.shareDashboardGroups === true;
    },
    onSaved: renderCustomizedDashboard,
    onToast: showToast,
    can: (feature) => stored.ready && hasAccess(feature),
  });
}
function renderCustomWidgetSettings(alt) {
  globalThis.TomatoesReact.renderGroupSettingsLauncher(
    alt.querySelector("#custom-widget-settings-host"),
    { onOpen: openCustomWidgetSettings },
  );
}
