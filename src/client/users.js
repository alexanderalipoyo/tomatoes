/* React owns the directory, filtering, dialogs, and mutation state. */
function updateUsersTeamStatus(status) {
  teamState = status;
}
function renderUsers(host) {
  globalThis.TomatoesReact.renderUsers(host, {
    request: teamRequest,
    can: hasAccess,
    onToast: showToast,
    currentProject: currentWorkspaceProject,
    onStatus: updateUsersTeamStatus,
  });
}
