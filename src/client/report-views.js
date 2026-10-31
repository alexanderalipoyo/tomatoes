async function saveTestEvidence(test, file, runId) {
  requireAccess("test-results.attach-screenshots-and-recordings");
  let result;
  await investigationBusy(
    "Validating test evidence",
    async () => {
      await ReportFeatures.validateEvidence(file);
      const key = Investigations.identity(test);
      const hash = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      const id =
        runId +
        ":" +
        key +
        ":" +
        Array.from(new Uint8Array(hash), (value) =>
          value.toString(16).padStart(2, "0"),
        ).join("");
      paintProgress(70, "Saving evidence");
      await allowPaint();
      await ImportHistory.saveEvidence({
        id,
        runId,
        testKey: key,
        name: file.name.slice(0, 180),
        type: file.type,
        blob: file,
        savedAt: Date.now(),
      });
      const sync = await syncImportedReport(
        historyEntries.find((entry) => entry.id === runId),
      );
      result = {
        message: sync.saved
          ? "Evidence saved in this browser and the database."
          : sync.notice || "Evidence saved in this browser.",
      };
      showToast(result.message, sync.notice ? "warning" : "success");
    },
    (error) => {
      result = { message: error.message };
      showToast(`Evidence could not be saved: ${error.message}`, "error");
    },
  );
  $("#detail").showModal();
  return result;
}
function appendReportSettings(alt) {
  const actions = alt
    .querySelector("#export-report")
    ?.closest(".settings-buttons");
  if (actions) {
    document.querySelector("#export-pdf").onclick = () => exportReportPDF();
    document.querySelector("#export-run-summary").onclick = () =>
      downloadInvestigation(
        ReportFeatures.markdownSummary(
          report,
          sourceName,
          Investigations.failureGroups(report),
        ),
        "tomatoes-run-summary.md",
        "text/markdown",
      );
  }
}
