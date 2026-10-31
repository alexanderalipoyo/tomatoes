if (typeof document !== "undefined") {
  let trendFilters = null;
  let trashedActiveId = null;
  function invalidateSavedAnalysis(id) {
    investigationCache.delete(id);
    stability = null;
    comparison = null;
  }
  function appendHistoryTools() {
    let host = document.querySelector("#history-tools");
    if (!host) {
      host = document.createElement("div");
      host.id = "history-tools";
      document.querySelector("#history-list").before(host);
    }
    globalThis.TomatoesReact.renderHistoryTools(host);
    if (navigator.storage?.estimate)
      navigator.storage
        .estimate()
        .then(({ usage, quota }) => {
          if (!host.isConnected) return;
          const target = host.querySelector("#storage-usage");
          if (target)
            target.textContent = `${((usage || 0) / 1048576).toFixed(1)} MB used for this site${quota ? ` / ${(quota / 1048576).toFixed(0)} MB available quota` : ""}. Trash continues to use storage.`;
        })
        .catch(() => {
          if (host.querySelector("#storage-usage"))
            host.querySelector("#storage-usage").textContent =
              "Storage estimate unavailable.";
        });
    else
      host.querySelector("#storage-usage").textContent =
        "Storage estimate unavailable.";
    document.querySelector("#backup-history").onclick = backupHistory;
    document.querySelector("#restore-history").onclick = () =>
      document.querySelector("#backup-file").click();
    document.querySelector("#backup-file").onchange = (event) => {
      const file = event.target.files[0];
      if (file) restoreHistory(file);
      event.target.value = "";
    };
    document.querySelector("#show-trash").onclick = showHistoryTrash;
  }
  async function backupHistory() {
    if (typeof requireAccess === "function")
      requireAccess("import-history.download-browser-backups");
    if (authStatus?.enabled) await initializeAuth();
    await investigationBusy(
      "Preparing browser backup",
      async () => {
        const snapshot = await ImportHistory.snapshot();
        let size = snapshot.reports.reduce(
          (sum, item) => sum + new TextEncoder().encode(item.text).byteLength,
          0,
        );
        size += snapshot.evidence.reduce(
          (sum, item) => sum + Math.ceil(item.blob.size / 3) * 4,
          0,
        );
        if (size > WorkspaceTools.MAX_BACKUP_BYTES)
          throw new Error(
            "The backup exceeds 100 MB. This browser archive is too large for a single backup.",
          );
        const evidence = [];
        for (let index = 0; index < snapshot.evidence.length; index++) {
          const { blob, ...record } = snapshot.evidence[index];
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 8192)
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 8192),
            );
          evidence.push({ ...record, data: btoa(binary) });
          paintProgress(
            10 + Math.floor(((index + 1) / snapshot.evidence.length) * 70),
            `Packing attachment ${index + 1} of ${snapshot.evidence.length}`,
          );
          await allowPaint();
        }
        const text = JSON.stringify({
          format: "tomatoes-backup",
          version: 1,
          createdAt: new Date().toISOString(),
          entries: snapshot.entries,
          reports: snapshot.reports,
          evidence,
        });
        if (new Blob([text]).size > WorkspaceTools.MAX_BACKUP_BYTES)
          throw new Error("The backup exceeds 100 MB.");
        downloadInvestigation(
          text,
          `tomatoes-backup-${new Date().toISOString().slice(0, 10)}.json`,
          "application/json",
        );
        historyNotice(
          "Backup download started. Keep this file to restore your reports and attachments.",
          "success",
        );
      },
      (error) => historyNotice(`Backup failed: ${error.message}`, "error"),
    );
  }
  async function restoreHistory(file) {
    if (typeof requireAccess === "function")
      requireAccess("import-history.restore-browser-backups");
    await investigationBusy(
      "Validating backup",
      async () => {
        if (!file.size || file.size > WorkspaceTools.MAX_BACKUP_BYTES)
          throw new Error("Choose a backup between 1 byte and 100 MB.");
        let value;
        try {
          value = JSON.parse(await file.text());
        } catch {
          throw new Error("The backup is not valid JSON.");
        }
        paintProgress(20, "Checking every report and attachment");
        await allowPaint();
        const data = await WorkspaceTools.validateBackup(value, {
          reportData: ReportData,
          validateEvidence: ReportFeatures.validateEvidence,
          decode: (value) =>
            Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
        });
        paintProgress(80, "Restoring browser history");
        await allowPaint();
        const result = await ImportHistory.restoreSnapshot(data);
        investigationCache.clear();
        stability = null;
        comparison = null;
        await refreshHistory();
        historyNotice(
          `Restored ${result.added} reports; ${result.skipped} existing reports kept. Missing attachments were merged. Your selected report is unchanged.`,
          "success",
        );
      },
      (error) => historyNotice(`Restore failed: ${error.message}`, "error"),
    );
  }
  function editHistoryEntry(id) {
    if (
      typeof hasAccess === "function" &&
      !hasAccess("import-history.edit-report-names") &&
      !hasAccess("import-history.edit-report-notes")
    )
      return;
    const entry = historyEntries.find((item) => item.id === id);
    if (!entry) return;
    globalThis.TomatoesReact.renderHistoryEdit(
      document.querySelector("#detail-content"),
      { entry },
    );
    document.querySelector("#history-edit").onsubmit = async (event) => {
      event.preventDefault();
      const label = document.querySelector("#history-label").value.trim(),
        notes = document.querySelector("#history-notes").value.trim();
      if (!label) return;
      try {
        await ImportHistory.updateDetails(id, {
          ...(typeof hasAccess !== "function" ||
          hasAccess("import-history.edit-report-names")
            ? { label }
            : {}),
          ...(typeof hasAccess !== "function" ||
          hasAccess("import-history.edit-report-notes")
            ? { notes }
            : {}),
        });
        if (id === activeHistoryId) {
          sourceName = label;
          renderSummary();
        }
        invalidateSavedAnalysis(id);
        await refreshHistory();
        document.querySelector("#detail").close();
        historyNotice("Report name and notes saved.", "success");
      } catch (error) {
        document.querySelector("#history-edit-status").textContent =
          error.message;
        showToast(
          `Report details could not be saved: ${error.message}`,
          "error",
        );
      }
    };
    document.querySelector("#detail").showModal();
  }
  async function trashHistoryEntry(id) {
    if (typeof requireAccess === "function")
      requireAccess("import-history.move-imports-to-trash");
    await investigationBusy(
      "Moving report to trash",
      async () => {
        await ImportHistory.updateDetails(id, { deletedAt: Date.now() });
        invalidateSavedAnalysis(id);
        await refreshHistory();
        if (id === activeHistoryId) {
          trashedActiveId = id;
          await ImportHistory.markActive(historyEntries[0]?.id || null);
          activeHistoryId = null;
        }
        historyNotice(
          "Report moved to trash. It remains recoverable, including its attachments.",
          "success",
        );
        const banner = document.querySelector("#history-notice"),
          undo = document.createElement("button");
        undo.className = "button";
        undo.textContent = "Undo";
        undo.onclick = () => restoreTrashedEntry(id);
        banner.append(" ", undo);
      },
      (error) => historyNotice(error.message, "error"),
    );
  }
  async function restoreTrashedEntry(id) {
    if (typeof requireAccess === "function")
      requireAccess("import-history.restore-trashed-imports");
    try {
      await ImportHistory.updateDetails(id, { deletedAt: null });
      if (id === trashedActiveId && !activeHistoryId) {
        activeHistoryId = id;
        await ImportHistory.markActive(id);
      }
      if (id === trashedActiveId) trashedActiveId = null;
      invalidateSavedAnalysis(id);
      await refreshHistory();
      historyNotice("Report restored from trash.", "success");
    } catch (error) {
      historyNotice(error.message);
    }
  }
  async function showHistoryTrash() {
    if (typeof requireAccess === "function")
      requireAccess("import-history.restore-trashed-imports");
    try {
      const entries = (await ImportHistory.list(true)).filter(
        (entry) => entry.deletedAt,
      );
      const host = document.querySelector("#trash-list");
      globalThis.TomatoesReact.renderTrash(host, { entries, formatDate: date });
      host
        .querySelectorAll("[data-restore-trash]")
        .forEach(
          (button) =>
            (button.onclick = () =>
              restoreTrashedEntry(button.dataset.restoreTrash)),
        );
    } catch (error) {
      historyNotice(error.message);
    }
  }
  function filteredTrendEntries() {
    if (!trendFilters)
      trendFilters = {
        project: report.metadata?.project || "",
        environment: report.metadata?.environment || "",
        branch: "",
      };
    return WorkspaceTools.filterEntries(historyEntries, trendFilters);
  }
  function appendFailureTrends(host) {
    globalThis.TomatoesReact.renderFailureTrends(
      host.querySelector("#failure-trends-host"),
    );
    document.querySelector("#analyze-failure-history").onclick = async () => {
      await investigationBusy(
        "Reading comparable failure history",
        async () => {
          let entries = WorkspaceTools.comparableEntries(
            historyEntries,
            report.metadata,
          )
            .sort(
              (a, b) =>
                (Date.parse(b.start) || b.lastImportedAt) -
                (Date.parse(a.start) || a.lastImportedAt),
            )
            .slice(0, 20);
          const selected = historyEntries.find(
            (entry) => entry.id === activeHistoryId,
          );
          if (selected && !entries.some((entry) => entry.id === selected.id))
            entries = [selected, ...entries.slice(0, 19)];
          const runs = [];
          for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            const data = await readInvestigationReport(entry.id);
            const hash = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(WorkspaceTools.runFingerprint(data)),
            );
            const fingerprint = Array.from(new Uint8Array(hash), (b) =>
              b.toString(16).padStart(2, "0"),
            ).join("");
            runs.push({
              id: entry.id,
              fingerprint,
              start: entry.start,
              importedAt: entry.lastImportedAt,
              report: data,
            });
            paintProgress(
              Math.round(((index + 1) / entries.length) * 90),
              `Reading run ${index + 1} of ${entries.length}`,
            );
            await allowPaint();
          }
          const trends = WorkspaceTools.failureTrends(runs, Investigations);
          globalThis.TomatoesReact.renderFailureTrendResults(
            document.querySelector("#failure-history-results"),
            { trends, formatDate: date },
          );
        },
        (error) =>
          historyNotice(`Failure history unavailable: ${error.message}`),
      );
    };
  }
  Object.assign(globalThis, {
    appendHistoryTools,
    editHistoryEntry,
    trashHistoryEntry,
    filteredTrendEntries,
    appendFailureTrends,
  });
}
