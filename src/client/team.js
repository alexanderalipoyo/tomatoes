let teamState = null;
let teamRenderVersion = 0;
let teamProject = "";
async function teamRequest(route, options = {}) {
  const limit =
    typeof authStatus !== "undefined" ? authStatus?.maxRequestBytes : null;
  const { onDownloadProgress, ...requestOptions } = options;
  options = requestOptions;
  if (
    (!options.method || options.method === "GET") &&
    /^\/api\/runs\/[a-f0-9]{64}$/.test(route)
  ) {
    return ReportTransferClient.download(
      route,
      (path) => teamRequest(path, options),
      onDownloadProgress,
    );
  }
  if (
    limit &&
    ["/api/runs", "/api/imports", "/api/history-imports"].includes(route) &&
    options.method === "POST" &&
    typeof options.body === "string" &&
    new TextEncoder().encode(options.body).length > limit
  ) {
    options = {
      ...options,
      body: await ReportTransferClient.packUpload(options.body, limit),
    };
  }
  if (
    limit &&
    typeof options.body === "string" &&
    new TextEncoder().encode(options.body).length > limit
  )
    throw new Error(
      "This report still exceeds the hosted upload limit after compression. Its browser copy remains available; reduce embedded artifacts or publish from a local Tomatoes server.",
    );
  const headers = {
    "Content-Type": "application/json",
    ...(typeof authStatus !== "undefined" &&
    authStatus?.enabled &&
    authStatus?.organization?.id
      ? { "X-Tomatoes-Organization": authStatus.organization.id }
      : {}),
    ...(options.headers || {}),
  };
  if (teamState?.csrf) headers["X-CSRF-Token"] = teamState.csrf;
  const response = await fetch(route, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const result = await response.json();
  if (
    response.status === 401 &&
    !["/api/login", "/api/reset-password", "/api/auth/google"].includes(
      route,
    ) &&
    typeof authSessionExpired === "function"
  )
    authSessionExpired();
  if (!response.ok)
    throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}
async function originalReportText() {
  if (activeHistoryId) return (await ImportHistory.get(activeHistoryId)).text;
  if (currentFile) return currentFile.text();
  const response = await fetch("results.json");
  if (!response.ok) throw new Error("Report source unavailable.");
  return response.text();
}
function isTeamSettingsView(alt) {
  return isSharingSettingsView() && alt.isConnected;
}
function updateSharingStatus(status) {
  teamState = status;
}
async function publishCurrentReport(project) {
  let failure = null;
  await investigationBusy(
    "Publishing report to the team store",
    async () => {
      teamState = await teamRequest("/api/team/status");
      paintProgress(35, "Saving report and attachments");
      await uploadBrowserReport(
        historyEntries.find((entry) => entry.id === activeHistoryId),
        project,
      );
    },
    (error) => {
      failure = error;
    },
  );
  if (failure) throw failure;
  return "Report and attachments saved to the server.";
}
async function saveBrowserImports() {
  let failure = null,
    count = 0;
  await investigationBusy(
    "Saving browser history",
    async () => {
      teamState = await teamRequest("/api/team/status");
      const entries = await ImportHistory.list();
      const ids = new Set();
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const saved = await uploadBrowserReport(
          entry,
          entry.metadata?.project || "tomatoes",
          "history",
        );
        ids.add(saved.id);
        paintProgress(
          Math.round(((index + 1) / entries.length) * 95),
          `Saved import ${index + 1} of ${entries.length}`,
        );
        await allowPaint();
      }
      count = ids.size;
    },
    (error) => {
      failure = error;
    },
  );
  if (failure) throw failure;
  return `Saved ${count} reports and their attachments to the server. Browser history was preserved.`;
}
function openSharedReport(id) {
  return loadReport(null, { serverId: id, fromURL: true, openDashboard: true });
}
function renderTeam(alt) {
  if (!isTeamSettingsView(alt)) return;
  globalThis.TomatoesReact.renderSharing(alt, {
    request: teamRequest,
    onStatus: updateSharingStatus,
    branding: workspaceBranding,
    selectedProject: report?.metadata?.project || currentWorkspaceProject,
    hasReport: !!report,
    historyCount: historyEntries.length,
    onPublish: publishCurrentReport,
    onSaveHistory: saveBrowserImports,
    onOpen: openSharedReport,
    onToast: showToast,
    formatDate: date,
  });
}
async function uploadBrowserReport(
  entry,
  projectOverride = null,
  imported = false,
) {
  const text = entry
    ? (await ImportHistory.get(entry.id)).text
    : await originalReportText();
  const metadata = {
    ...(entry?.metadata || report.metadata),
    project:
      projectOverride ||
      entry?.metadata?.project ||
      report.metadata?.project ||
      "tomatoes",
  };
  const saved = await teamRequest(
    imported === "history"
      ? "/api/history-imports"
      : imported
        ? "/api/imports"
        : "/api/runs",
    {
      method: "POST",
      body: JSON.stringify({
        reportText: text,
        name: entry?.name || sourceName,
        label: entry?.label || "",
        notes: entry?.notes || "",
        importedAt: entry?.lastImportedAt || report.importedAt || Date.now(),
        metadata,
      }),
    },
  );
  const attachments = entry ? await ImportHistory.listEvidence(entry.id) : [];
  for (const attachment of attachments) {
    const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    await teamRequest(`/api/runs/${saved.run.id}/evidence`, {
      method: "POST",
      body: JSON.stringify({
        testKey: attachment.testKey,
        name: attachment.name,
        type: attachment.type,
        data: btoa(binary),
      }),
    });
    await allowPaint();
  }
  if (entry) reportServerLinks.set(entry.id, saved.run.id);
  return saved.run;
}
async function restoreSharedEvidence(saved, localId) {
  const payload = await teamRequest(`/api/runs/${saved.run.id}/evidence`);
  for (const record of payload.evidence) {
    const response = await fetch(
      `/api/runs/${saved.run.id}/evidence/${record.id}`,
      { credentials: "same-origin" },
    );
    if (!response.ok)
      throw new Error("A shared attachment could not be downloaded.");
    const blob = await response.blob();
    await ReportFeatures.validateEvidence(blob);
    await ImportHistory.saveEvidence({
      id: `${localId}:${record.testKey}:${record.contentHash || record.id}`,
      runId: localId,
      testKey: record.testKey,
      name: record.name,
      type: record.type,
      savedAt: record.savedAt,
      blob,
    });
  }
}
async function syncImportedReport(entry) {
  try {
    const status = await teamRequest("/api/team/status");
    if (status.storage !== "postgres" && !status.slackConfigured)
      return { saved: false };
    teamState = status;
    if (status.enabled && !status.authenticated)
      return {
        saved: false,
        notice:
          "Saved in this browser. Sign in under Settings > Sharing & access to save a PostgreSQL copy.",
      };
    if (status.user?.role === "viewer")
      return {
        saved: false,
        notice:
          "Saved in this browser. Your account has read-only database access.",
      };
    const run = await uploadBrowserReport(entry, null, true);
    return { saved: true, run };
  } catch (error) {
    return {
      saved: false,
      notice: `Saved in this browser. The database copy could not be saved: ${error.message}`,
    };
  }
}

async function notifyImportedRun(serverId, eventId) {
  try {
    const result = await teamRequest(
      `/api/runs/${serverId}/slack-notification`,
      {
        method: "POST",
        body: JSON.stringify({ eventId }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (result.status === "sent")
      showToast("Report imported and Slack notified.", "success");
  } catch (error) {
    showToast(
      `Report imported, but Slack was not confirmed: ${error.message}`,
      "warning",
    );
  }
}
