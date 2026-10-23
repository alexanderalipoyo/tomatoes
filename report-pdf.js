(function (root) {
  const LIMITS = {
    specs: 20,
    groups: 10,
    failures: 200,
    errorCharacters: 2000,
  };
  const colors = {
    ink: [28, 47, 57],
    muted: [92, 111, 120],
    green: [18, 126, 92],
    red: [196, 60, 69],
    amber: [167, 116, 28],
    gray: [122, 140, 153],
    pale: [243, 247, 248],
    line: [220, 229, 232],
  };
  const clean = (value) =>
    String(value ?? "Unavailable")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .replace(/\t/g, "  ");
  const milliseconds = (value) => {
    if (!Number.isFinite(value)) return "Unavailable";
    if (value < 1000) return `${Math.round(value)} ms`;
    const seconds = Math.round(value / 1000);
    if (seconds < 60) return `${seconds} s`;
    return `${Math.floor(seconds / 3600) ? Math.floor(seconds / 3600) + " h " : ""}${Math.floor(seconds / 60) % 60} m ${seconds % 60} s`;
  };
  function filename(importedAt, timeZone = "UTC") {
    const imported = new Date(importedAt);
    if (importedAt == null || !Number.isFinite(imported.getTime()))
      throw new Error(
        "The report import time is unavailable. Import the report again before exporting.",
      );
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(imported)
        .map(({ type, value }) => [type, value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}-report.pdf`;
  }
  async function createDocument(report, name, options = {}) {
    const {
      jsPDF,
      fontData,
      groups: sourceGroups = [],
      mode = "detailed",
      failureSearch = "",
      failureSpec = "",
      timeZone = "UTC",
      generatedAt = new Date(),
      importedAt = report.importedAt,
      onProgress = () => {},
      yieldControl = () => Promise.resolve(),
    } = options;
    if (!jsPDF || !fontData)
      throw new Error("The PDF tools could not be loaded. Please try again.");
    const query = failureSearch.trim().toLowerCase();
    const matchesFailure = (test) =>
      test.status === "failed" &&
      (!failureSpec || test.file === failureSpec) &&
      (!query ||
        `${test.fullTitle || test.title} ${test.file} ${test.error}`
          .toLowerCase()
          .includes(query));
    const failed = report.tests.filter(matchesFailure);
    const selectedIds = new Set(failed.map((test) => test.id));
    const groups = sourceGroups
      .map((group) => {
        const tests = group.tests.filter((test) => selectedIds.has(test.id));
        return {
          ...group,
          tests,
          specs: [...new Set(tests.map((test) => test.file))],
        };
      })
      .filter((group) => group.tests.length)
      .sort((a, b) => b.tests.length - a.tests.length);
    const doc = new jsPDF({
      unit: "mm",
      format: "a4",
      compress: true,
      putOnlyUsedFonts: true,
    });
    doc.addFileToVFS("NotoSans-Regular.ttf", fontData);
    doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    doc.setFont("NotoSans");
    doc.setProperties({
      title: `Tomatoes report - ${clean(name).slice(0, 160)}`,
      author: "Tomatoes",
      subject: "Cypress-generated test report summary",
      creator: "Tomatoes",
    });
    const left = 18,
      width = 174,
      bottom = 276;
    let y = 0;
    let section = "Overview";
    const date = (value) => {
      const parsed = new Date(value);
      if (!value || !Number.isFinite(parsed.getTime())) return "Unavailable";
      return (
        new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "medium",
          timeZone,
        }).format(parsed) + ` (${timeZone})`
      );
    };
    function header() {
      doc.setFillColor(...colors.green);
      doc.rect(0, 0, 210, 4, "F");
      // A compact vector tomato stays sharp in print.
      doc.setFillColor(225, 78, 65);
      doc.circle(22, 16, 3.5, "F");
      doc.setDrawColor(...colors.green);
      doc.setLineWidth(0.8);
      doc.line(22, 12.5, 23, 10.5);
      doc.line(22, 12.5, 19.5, 11.5);
      doc.setTextColor(...colors.ink);
      doc.setFontSize(15);
      doc.text("tomatoes", 29, 18);
      doc.setFontSize(8);
      doc.setTextColor(...colors.muted);
      doc.text(section.toUpperCase(), 192, 17, { align: "right" });
      doc.setDrawColor(...colors.line);
      doc.setLineWidth(0.2);
      doc.line(left, 24, 192, 24);
      y = 33;
    }
    function ensure(height) {
      if (y + height > bottom) {
        doc.addPage();
        header();
      }
    }
    function paragraph(
      value,
      { size = 9, color = colors.ink, gap = 3, indent = 0 } = {},
    ) {
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(clean(value), width - indent);
      const lineHeight = size * 0.45;
      for (const line of lines) {
        ensure(lineHeight);
        doc.setFontSize(size);
        doc.setTextColor(...color);
        doc.text(line, left + indent, y);
        y += lineHeight;
      }
      y += gap;
    }
    function heading(title, description) {
      ensure(24);
      y += 3;
      paragraph(title, { size: 14, gap: 3 });
      if (description)
        paragraph(description, { size: 8, color: colors.muted, gap: 4 });
    }
    function startSection(title, description, newPage = true) {
      section = title;
      if (newPage) {
        doc.addPage();
        header();
      }
      heading(title, description);
    }
    function lineCount(value, size, availableWidth = width) {
      doc.setFontSize(size);
      return doc.splitTextToSize(clean(value), availableWidth).length;
    }
    function rule() {
      ensure(5);
      doc.setDrawColor(...colors.line);
      doc.line(left, y, 192, y);
      y += 6;
    }
    header();
    paragraph(mode === "summary" ? "Run summary" : "Detailed run report", {
      size: 23,
      gap: 4,
    });
    paragraph(name, { size: 11, color: colors.muted });
    if (importedAt != null)
      paragraph(`Imported: ${date(importedAt)}`, {
        size: 8,
        color: colors.muted,
        gap: 4,
      });
    paragraph(
      `Status: ${report.status.toUpperCase()}   |   ${report.specs.length} specs   |   Run time: ${milliseconds(report.duration)}`,
      { size: 9 },
    );
    paragraph(`Started: ${date(report.start)}\nFinished: ${date(report.end)}`, {
      size: 8,
      color: colors.muted,
      gap: 5,
    });
    const c = report.counts;
    const metrics = [
      ["Registered tests", c.total],
      ["Passed", c.passed],
      ["Failed", c.failed],
      ["Pending", c.pending],
      ["Skipped", c.skipped],
      ["Pass rate", `${report.passRate.toFixed(1)}%`],
    ];
    ensure(40);
    const metricsY = y;
    metrics.forEach(([label, value], index) => {
      const x = left + (index % 3) * 59;
      const top = metricsY + Math.floor(index / 3) * 20;
      doc.setFillColor(...colors.pale);
      doc.roundedRect(x, top, 56, 17, 2, 2, "F");
      doc.setFontSize(8);
      doc.setTextColor(...colors.muted);
      doc.text(label, x + 4, top + 5);
      doc.setFontSize(14);
      doc.setTextColor(...(label === "Failed" ? colors.red : colors.ink));
      doc.text(String(value), x + 4, top + 13);
    });
    y += 43;
    paragraph(
      "Pass rate includes all registered tests, including pending and skipped outcomes.",
      { size: 8, color: colors.muted },
    );
    const segments = [
      ["passed", colors.green],
      ["failed", colors.red],
      ["pending", colors.amber],
      ["skipped", colors.gray],
      ["unknown", colors.ink],
    ];
    if (c.total) {
      ensure(15);
      let x = left;
      for (const [state, color] of segments) {
        const segmentWidth = width * ((c[state] || 0) / c.total);
        if (segmentWidth) {
          doc.setFillColor(...color);
          doc.rect(x, y, segmentWidth, 4, "F");
          x += segmentWidth;
        }
      }
      y += 10;
      paragraph(
        segments
          .filter(([state]) => c[state])
          .map(([state]) => `${state}: ${c[state]}`)
          .join("   /   "),
        { size: 8, color: colors.muted },
      );
    }
    if (failureSpec || query)
      paragraph(
        `Failure detail filter: ${failureSpec || "All specs"}${query ? ` / search: ${failureSearch}` : ""}. ${failed.length} of ${report.counts.failed} failures match. Overview totals describe the full run.`,
        { size: 8, color: colors.muted },
      );
    const labels = {
      project: "Project",
      environment: "Environment",
      branch: "Branch",
      commit: "Commit",
      buildUrl: "Build URL",
    };
    const metadata = Object.entries(report.metadata || {}).filter(
      ([, value]) => value,
    );
    if (metadata.length) {
      heading("Run identity");
      for (const [key, value] of metadata)
        paragraph(`${labels[key] || key}: ${value}`);
    }
    heading("Report notes");
    paragraph(
      "Cypress-generated Mochawesome results. This PDF is a summary; the original JSON remains the complete source. Browser attachments are not embedded.",
      { size: 8, color: colors.muted },
    );
    if (report.warnings.length)
      for (const warning of report.warnings)
        paragraph(warning, { size: 8, color: colors.red });
    else
      paragraph("Reported totals reconcile with the individual test records.", {
        size: 8,
        color: colors.muted,
      });
    onProgress(35, "Building spec and failure summaries");
    await yieldControl();
    const rankedSpecs = [...report.specs].sort(
      (a, b) => b.counts.failed - a.counts.failed || b.duration - a.duration,
    );
    startSection(
      "Spec results",
      `Showing ${Math.min(rankedSpecs.length, LIMITS.specs)} of ${rankedSpecs.length} specs, ranked by failures then duration. P/S = pending / skipped. Spec time sums recorded test durations.`,
      rankedSpecs.length > 0,
    );
    if (!rankedSpecs.length) paragraph("No spec records.");
    const columns = [18, 102, 116, 130, 144, 168, 192];
    function tableHeader() {
      doc.setFillColor(...colors.green);
      doc.rect(left, y - 4, width, 9, "F");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text("Spec file", left + 3, y + 1);
      ["Tests", "Passed", "Failed", "P/S", "Time"].forEach((label, index) =>
        doc.text(label, columns[index + 2] - 3, y + 1, { align: "right" }),
      );
      y += 10;
    }
    if (rankedSpecs.length) tableHeader();
    for (const [index, spec] of rankedSpecs.slice(0, LIMITS.specs).entries()) {
      const file = clean(spec.file);
      doc.setFontSize(8);
      const lines = doc.splitTextToSize(file, 78);
      const height = Math.max(14, lines.length * 3.6 + 7);
      if (y + height > bottom) {
        doc.addPage();
        header();
        tableHeader();
      }
      if (index % 2 === 0) {
        doc.setFillColor(...colors.pale);
        doc.rect(left, y - 4, width, height, "F");
      }
      doc.setFontSize(8);
      doc.setTextColor(...colors.ink);
      doc.text(lines, left + 3, y + 1, { lineHeightFactor: 1.27 });
      const values = [
        spec.counts.total,
        spec.counts.passed,
        spec.counts.failed,
        `${spec.counts.pending}/${spec.counts.skipped}`,
        milliseconds(spec.duration),
      ];
      values.forEach((value, index) => {
        doc.setFontSize(index === 4 ? 6.5 : 7.5);
        doc.setTextColor(
          ...(index === 2 && spec.counts.failed ? colors.red : colors.ink),
        );
        doc.text(String(value), columns[index + 2] - 3, y + 1, {
          align: "right",
        });
      });
      y += height;
    }
    y += 4;
    startSection(
      "Failure patterns",
      `Showing ${Math.min(groups.length, LIMITS.groups)} of ${groups.length} message groups. Matching messages are investigation signals, not confirmed shared causes.`,
      groups.length > 0,
    );
    if (!groups.length)
      paragraph(
        query || failureSpec
          ? "No failures match the selected filters."
          : "No failed tests recorded.",
      );
    for (const group of groups.slice(0, LIMITS.groups)) {
      ensure(20);
      paragraph(
        `${group.tests.length} tests across ${group.specs.length} specs`,
        { size: 9, gap: 2 },
      );
      const message = clean(group.fingerprint);
      paragraph(
        message.slice(0, 600) +
          (message.length > 600 ? " [message shortened]" : ""),
        { size: 8, color: colors.muted },
      );
      rule();
    }
    if (mode !== "summary") {
      startSection(
        "Failed test details",
        `Showing ${Math.min(failed.length, LIMITS.failures)} of ${failed.length} failed tests in report order. Error excerpts are limited to ${LIMITS.errorCharacters} characters each; use the original JSON for full stacks and source code.`,
        failed.length > 0,
      );
      if (!failed.length)
        paragraph(
          query || failureSpec
            ? "No failures match the selected filters."
            : "No failed tests recorded.",
        );
      for (
        let index = 0;
        index < Math.min(failed.length, LIMITS.failures);
        index++
      ) {
        const test = failed[index];
        const title = `${index + 1}. ${test.fullTitle || test.title}`;
        const details = `${test.file}\nDuration: ${milliseconds(test.duration)}`;
        const error = clean(test.error || "No error message recorded.");
        const excerpt =
          error.slice(0, LIMITS.errorCharacters) +
          (error.length > LIMITS.errorCharacters
            ? "\n[Error excerpt shortened; see original JSON.]"
            : "");
        const height =
          lineCount(title, 10) * 4.5 +
          lineCount(details, 8) * 3.6 +
          lineCount(excerpt, 8) * 3.6 +
          22;
        ensure(height <= bottom - 33 ? height : 30);
        doc.setFillColor(...colors.red);
        doc.rect(
          left - 3,
          y - 3,
          1,
          Math.min(lineCount(title, 10) * 4.5 + 1, 18),
          "F",
        );
        paragraph(title, { size: 10, gap: 3 });
        paragraph(details, { size: 8, color: colors.muted, gap: 4 });
        paragraph("ERROR DETAILS", { size: 7, color: colors.red, gap: 2 });
        paragraph(excerpt, { size: 8 });
        rule();
        if (index % 10 === 0) {
          onProgress(
            45 +
              Math.floor(
                (index / Math.min(failed.length, LIMITS.failures)) * 45,
              ),
            `Adding failed test ${index + 1} of ${Math.min(failed.length, LIMITS.failures)}`,
          );
          await yieldControl();
        }
      }
    }
    const pages = doc.getNumberOfPages();
    const generated = date(generatedAt);
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page);
      doc.setFontSize(7);
      doc.setTextColor(...colors.muted);
      doc.setDrawColor(...colors.line);
      doc.line(left, 282, 192, 282);
      doc.text(`Generated ${generated}`, left, 287);
      doc.text(`${page} / ${pages}`, 192, 287, { align: "right" });
      doc.setFontSize(6.5);
      doc.text("Tomatoes | Created by Alex Ali", left, 291);
    }
    onProgress(95, "Preparing PDF download");
    await yieldControl();
    return doc;
  }
  const api = { createDocument, filename, LIMITS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ReportPDF = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

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
        (error) => historyNotice(error.message),
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
            historyNotice("PDF download started.");
          } catch (error) {
            historyNotice(`PDF download failed: ${error.message}`);
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
      (error) => historyNotice(`PDF export failed: ${error.message}`),
    );
  }
  globalThis.exportReportPDF = exportReportPDF;
}
