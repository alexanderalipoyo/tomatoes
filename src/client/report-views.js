if (typeof document !== "undefined") {
  let evidenceURLs = [];
  function releaseEvidenceURLs() {
    evidenceURLs.forEach((url) => URL.revokeObjectURL(url));
    evidenceURLs = [];
  }
  function appendTestEvidence(test) {
    releaseEvidenceURLs();
    const content = document.querySelector("#detail-content");
    if (test.attempts?.length) {
      const recovered =
        test.status === "passed" &&
        test.attempts.at(-1).state === "passed" &&
        test.attempts
          .slice(0, -1)
          .some((attempt) => attempt.state === "failed");
      content.insertAdjacentHTML(
        "beforeend",
        `<section class="retry-evidence"><h2>Retry evidence</h2><p>${recovered ? "Recovered after a failed attempt." : "Recorded attempt outcomes."}</p>${test.attempts.map((attempt, index) => `<div class="retry-attempt"><strong>Attempt ${index + 1}</strong>${badge(attempt.state)}<span>${duration(attempt.duration)}</span>${attempt.error ? `<pre>${esc(attempt.error)}</pre>` : ""}</div>`).join("")}</section>`,
      );
    }
    content.insertAdjacentHTML(
      "beforeend",
      `<section id="test-evidence" class="test-evidence"><h2>Screenshots & recordings</h2><p class="widget-footnote">Attach local test evidence to this saved report. PNG, JPEG, WebP, MP4, or WebM; up to 25 MB each.</p><button class="button" id="attach-evidence" ${activeHistoryId ? "" : "disabled"}>Attach evidence</button><input id="evidence-file" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" hidden /><p id="evidence-status" role="status">${activeHistoryId ? "" : "Save this report in history before attaching evidence."}</p><div id="evidence-list"></div><p class="widget-footnote">Attachments are stored in this browser and remain separate from the original JSON. With PostgreSQL enabled, they are also copied to the server when access is available.</p></section>`,
    );
    const section = document.querySelector("#test-evidence"),
      runId = activeHistoryId,
      key = Investigations.identity(test);
    document.querySelector("#attach-evidence").onclick = () =>
      document.querySelector("#evidence-file").click();
    document.querySelector("#evidence-file").onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      await investigationBusy(
        "Validating test evidence",
        async () => {
          await ReportFeatures.validateEvidence(file);
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
          showTest(test.id);
          document.querySelector("#evidence-status").textContent = sync.saved
            ? "Evidence saved in this browser and the database."
            : sync.notice || "Evidence saved in this browser.";
          showToast(
            document.querySelector("#evidence-status").textContent,
            sync.notice ? "warning" : "success",
          );
        },
        (error) => {
          showTest(test.id);
          document.querySelector("#evidence-status").textContent =
            error.message;
          showToast(`Evidence could not be saved: ${error.message}`, "error");
        },
      );
    };
    if (runId)
      ImportHistory.listEvidence(runId, key)
        .then((records) => {
          if (!section.isConnected) return;
          const list = section.querySelector("#evidence-list");
          list.innerHTML =
            records
              .map(
                (record, index) =>
                  `<article class="evidence-item"><strong>${esc(record.name)}</strong><button class="button" data-preview-evidence="${index}">Preview ${record.type.startsWith("video/") ? "recording" : "image"}</button><div class="evidence-preview"></div></article>`,
              )
              .join("") ||
            '<p class="widget-footnote">No evidence attached yet.</p>';
          list.querySelectorAll("[data-preview-evidence]").forEach(
            (button) =>
              (button.onclick = () => {
                const record = records[Number(button.dataset.previewEvidence)],
                  url = URL.createObjectURL(record.blob);
                evidenceURLs.push(url);
                const host = button.nextElementSibling;
                host.replaceChildren();
                const media = document.createElement(
                  record.type.startsWith("video/") ? "video" : "img",
                );
                if (record.type.startsWith("video/")) {
                  media.controls = true;
                  media.preload = "metadata";
                } else media.alt = record.name;
                media.src = url;
                host.append(media);
                button.disabled = true;
              }),
          );
        })
        .catch(() => {
          if (section.isConnected)
            section.querySelector("#evidence-status").textContent =
              "Evidence storage is unavailable.";
        });
  }
  function appendReportSettings(alt) {
    const actions = alt
      .querySelector("#export-report")
      ?.closest(".settings-buttons");
    if (actions) {
      actions.insertAdjacentHTML(
        "beforeend",
        '<button class="button" type="button" id="export-run-summary">Download run summary</button><button class="button" type="button" id="export-pdf">Download PDF report</button>',
      );
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
  function retryEvidenceMarkup() {
    const data = ReportData.retryStats(report);
    return `<article class="insight-card"><div class="widget-heading"><div><h2>Retry-based flakiness</h2><p>${data.withEvidence} tests include explicit attempt records.</p></div></div><div class="test-history-metrics"><div><strong>${data.retried}</strong><span>Tests retried</span></div><div><strong>${data.confirmed.length}</strong><span>Recovered after failure</span></div></div>${data.confirmed.map((test) => `<button class="analysis-row" data-retry-test="${test.id}"><span>${esc(test.title)}<small>${esc(test.file)}</small></span><strong>${test.attempts.length} attempts →</strong></button>`).join("") || `<p>${data.withEvidence ? "No passed tests have a preceding failed attempt in the supplied evidence." : "This report has no attempt records. Include attempts in the JSON to establish retry-based flakiness."}</p>`}</article>`;
  }
  globalThis.appendTestEvidence = appendTestEvidence;
  globalThis.appendReportSettings = appendReportSettings;
  globalThis.retryEvidenceMarkup = retryEvidenceMarkup;
  document.addEventListener("DOMContentLoaded", () =>
    document
      .querySelector("#detail")
      ?.addEventListener("close", releaseEvidenceURLs),
  );
}
