if (typeof document !== "undefined") {
  let pdfResources;
  function loadPDFResources() {
    if (!pdfResources) {
      pdfResources = Promise.all([
        new Promise((resolve, reject) => {
          if (window.jspdf?.jsPDF) return resolve(window.jspdf.jsPDF);
          const script = document.createElement("script");
          script.src = "/vendor/jspdf.umd.min.js";
          script.onload = () =>
            window.jspdf?.jsPDF
              ? resolve(window.jspdf.jsPDF)
              : reject(new Error("PDF tools unavailable."));
          script.onerror = () => {
            script.remove();
            reject(new Error("Could not load PDF tools. Please try again."));
          };
          document.head.append(script);
        }),
        fetch("/assets/fonts/NotoSans-Regular.ttf").then(async (response) => {
          if (!response.ok)
            throw new Error("Could not load the PDF font. Please try again.");
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 8192)
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 8192),
            );
          return btoa(binary);
        }),
      ]).catch((error) => {
        pdfResources = null;
        throw error;
      });
    }
    return pdfResources;
  }
  let pdfPreviewURL = null;
  let disposePDFPreview = () => {};
  async function renderPDFPreview(doc) {
    const host = document.querySelector("#pdf-page-preview");
    let disposed = false,
      task,
      loadingTask,
      pdf;
    disposePDFPreview = () => {
      disposed = true;
      task?.cancel();
      if (pdf) pdf.destroy();
      else loadingTask?.destroy();
    };
    try {
      const renderer = await import("/vendor/pdf.mjs");
      if (disposed) return;
      renderer.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";
      loadingTask = renderer.getDocument({
        data: new Uint8Array(doc.output("arraybuffer")),
        isEvalSupported: false,
        useSystemFonts: false,
      });
      pdf = await loadingTask.promise;
      if (disposed) {
        pdf.destroy();
        return;
      }
      host.innerHTML =
        '<div class="pdf-page-toolbar"><button class="button" id="pdf-previous-page" disabled>Previous page</button><span id="pdf-page-number" role="status"></span><button class="button" id="pdf-next-page">Next page</button></div><div class="pdf-page-canvas"><canvas aria-label="PDF report page preview" role="img"></canvas></div>';
      let pageNumber = 1;
      const previous = host.querySelector("#pdf-previous-page"),
        next = host.querySelector("#pdf-next-page"),
        label = host.querySelector("#pdf-page-number"),
        canvas = host.querySelector("canvas");
      async function renderPage() {
        previous.disabled = true;
        next.disabled = true;
        label.textContent = `Rendering page ${pageNumber} of ${pdf.numPages}`;
        try {
          const page = await pdf.getPage(pageNumber);
          if (disposed) return;
          const base = page.getViewport({ scale: 1 }),
            targetWidth = Math.max(
              240,
              (host.clientWidth || Math.min(innerWidth - 64, 820)) - 24,
            ),
            ratio = Math.min(devicePixelRatio || 1, 2);
          const viewport = page.getViewport({
            scale: targetWidth / base.width,
          });
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = viewport.width + "px";
          canvas.style.height = viewport.height + "px";
          canvas.setAttribute(
            "aria-label",
            `PDF report preview, page ${pageNumber} of ${pdf.numPages}`,
          );
          task = page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
            transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
          });
          await task.promise;
          if (disposed) return;
          label.textContent = `Page ${pageNumber} of ${pdf.numPages}`;
          previous.disabled = pageNumber === 1;
          next.disabled = pageNumber === pdf.numPages;
          host.querySelector(".pdf-page-canvas").scrollTop = 0;
        } catch (error) {
          if (!disposed)
            label.textContent =
              "Page preview unavailable. You can still download the PDF.";
        }
      }
      previous.onclick = () => {
        pageNumber--;
        renderPage();
      };
      next.onclick = () => {
        pageNumber++;
        renderPage();
      };
      await renderPage();
    } catch (error) {
      if (!disposed && host.isConnected)
        host.innerHTML =
          '<p role="status">The preview could not load. Use Download PDF or Open full preview.</p>';
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelector("#detail").addEventListener("close", () => {
      disposePDFPreview();
      disposePDFPreview = () => {};
      if (pdfPreviewURL) URL.revokeObjectURL(pdfPreviewURL);
      pdfPreviewURL = null;
    });
  });
  async function exportReportPDF(historyId = null, initialOptions = {}) {
    if (loading) return;
    const entry = historyEntries.find(
      (item) => item.id === (historyId || activeHistoryId),
    );
    let optionReport = report;
    if (historyId && historyId !== activeHistoryId) {
      optionReport = null;
      await investigationBusy(
        "Reading PDF export options",
        async () => {
          optionReport = await readInvestigationReport(historyId);
        },
        (error) => historyNotice(error.message, "error"),
      );
      if (!optionReport) return;
    }
    document.querySelector("#detail-content").innerHTML =
      `<div class="dialog-heading"><h2 id="detail-title">Export PDF report</h2><p>${esc(entry?.label || entry?.name || sourceName)}</p></div><form class="pdf-options preference-form" id="pdf-options"><label>Report detail<select id="pdf-mode"><option value="summary">Brief summary</option><option value="detailed" selected>Detailed report with failed tests</option></select></label><label>Failure search<input id="pdf-failure-search" type="search" maxlength="180" placeholder="Test title, path, or error message"/></label><label>Failure spec path<input id="pdf-failure-spec" list="pdf-spec-options" placeholder="All specs (or enter an exact spec path)"/><datalist id="pdf-spec-options">${
        optionReport
          ? optionReport.specs
              .filter((spec) => spec.counts.failed)
              .map((spec) => `<option value="${esc(spec.file)}"></option>`)
              .join("")
          : ""
      }</datalist></label><p class="widget-footnote">Overview totals always cover the full run. Filters apply to failure patterns and failed-test details. The summary includes top specs and patterns; detailed reports add up to 200 matching failed tests.</p><button class="button primary" type="submit">Preview PDF</button></form>`;
    document.querySelector("#pdf-mode").value =
      initialOptions.mode || "detailed";
    document.querySelector("#pdf-failure-search").value =
      initialOptions.failureSearch || "";
    document.querySelector("#pdf-failure-spec").value =
      initialOptions.failureSpec || "";
    document.querySelector("#pdf-options").onsubmit = (event) => {
      event.preventDefault();
      generatePDFPreview(historyId, {
        mode: document.querySelector("#pdf-mode").value,
        failureSearch: document.querySelector("#pdf-failure-search").value,
        failureSpec: document.querySelector("#pdf-failure-spec").value.trim(),
      });
    };
    document.querySelector("#detail").showModal();
  }
  async function generatePDFPreview(historyId, options) {
    await investigationBusy(
      "Preparing PDF export",
      async () => {
        let selected = report,
          name = sourceName;
        if (historyId) {
          selected = await readInvestigationReport(
            historyId,
            (percent, label) => paintProgress(Math.floor(percent / 7), label),
          );
          name =
            historyEntries.find((entry) => entry.id === historyId)?.label ||
            historyEntries.find((entry) => entry.id === historyId)?.name ||
            "report.json";
        }
        const entry = historyEntries.find(
          (item) => item.id === (historyId || activeHistoryId),
        );
        const importedAt =
          entry?.lastImportedAt ?? entry?.importedAt ?? selected?.importedAt;
        const outputName = ReportPDF.filename(importedAt, preferences.timeZone);
        if (!selected)
          throw new Error("Import or open a report before exporting.");
        paintProgress(15, "Loading PDF tools");
        const [jsPDF, fontData] = await loadPDFResources();
        const doc = await ReportPDF.createDocument(selected, name, {
          jsPDF,
          fontData,
          groups: Investigations.failureGroups(selected),
          timeZone: preferences.timeZone,
          importedAt,
          ...options,
          onProgress: paintProgress,
          yieldControl: allowPaint,
        });
        const blob = doc.output("blob");
        pdfPreviewURL = URL.createObjectURL(blob);
        document.querySelector("#detail-content").innerHTML =
          `<div class="dialog-heading"><h2 id="detail-title">PDF preview</h2><p>${esc(outputName)} · ${doc.getNumberOfPages()} pages · ${(blob.size / 1024).toFixed(0)} KB</p></div><div class="pdf-preview-actions"><button class="button primary" id="download-preview-pdf">Download PDF</button><a class="button" href="${pdfPreviewURL}" target="_blank" rel="noopener">Open full preview</a><button class="button" id="change-pdf-options">Change options</button></div><p class="widget-footnote">If your browser cannot show the embedded preview, use Open full preview or Download PDF.</p><div id="pdf-page-preview" aria-label="PDF page preview"><p role="status">Loading PDF preview…</p></div>`;
        document.querySelector("#download-preview-pdf").onclick = async () => {
          const button = document.querySelector("#download-preview-pdf");
          button.disabled = true;
          try {
            await doc.save(outputName, { returnPromise: true });
            historyNotice("PDF download started.", "success");
          } catch (error) {
            historyNotice(`PDF download failed: ${error.message}`, "error");
          } finally {
            if (button.isConnected) button.disabled = false;
          }
        };
        document.querySelector("#change-pdf-options").onclick = () => {
          document.querySelector("#detail").close();
          exportReportPDF(historyId, options);
        };
        paintProgress(97, "Rendering PDF preview");
        await renderPDFPreview(doc);
        document.querySelector("#detail").showModal();
      },
      (error) => historyNotice(`PDF export failed: ${error.message}`, "error"),
    );
  }
  globalThis.exportReportPDF = exportReportPDF;
}
