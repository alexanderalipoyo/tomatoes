/* Project services are passed to the React page; React owns rendering and dialogs. */
function updateProjectDirectory(directory) {
  workspaceProjects = directory;
  renderWorkspaceIdentity();
  if (report) renderSummary();
}
function importToWorkspaceProject(id) {
  ImportProjects.preselect(id);
  document.getElementById("import-report").click();
}
function projectReportLink(run) {
  return ReportLinks.build(location.href, {
    ...(run.source === "server"
      ? { serverId: run.id }
      : { importId: run.id, serverId: reportServerLinks.get(run.id) }),
    view: "runs",
  });
}
function renderProjects(host) {
  globalThis.TomatoesReact.renderProjects(host, {
    request: teamRequest,
    historyStore: ImportHistory,
    historyFallback: historyEntries,
    can: hasAccess,
    branding: workspaceBranding,
    currentProject: currentWorkspaceProject,
    organization:
      typeof authStatus !== "undefined" ? authStatus?.organization : null,
    reportLink: projectReportLink,
    openReport: openHistoryReportLink,
    onImport: importToWorkspaceProject,
    onDirectory: updateProjectDirectory,
    onHistory: refreshHistory,
    onToast: showToast,
    formatDate: date,
  });
}
