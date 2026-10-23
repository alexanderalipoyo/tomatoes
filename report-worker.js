importScripts("report-data.js");
self.onmessage = (event) => {
  try {
    self.postMessage({
      type: "progress",
      percent: 20,
      label: "Parsing JSON syntax",
    });
    const report = self.ReportData.parseReportText(
      event.data,
      (percent, label) =>
        self.postMessage({ type: "progress", percent, label }),
    );
    self.postMessage({ type: "complete", report });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};
