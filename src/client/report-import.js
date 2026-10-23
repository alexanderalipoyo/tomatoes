(function (root) {
  function setup({ document, isBusy, importFile }) {
    const get = (id) => document.getElementById(id);
    const dialog = get("import-dialog");
    const zone = get("report-drop-zone");
    const input = get("report-file");
    const error = get("import-selection-error");
    let dragDepth = 0;
    let importing = false;
    const busy = () => importing || isBusy();
    const isFileDrag = (event) =>
      Array.from(event.dataTransfer?.types || []).includes("Files");
    function resetDrag() {
      dragDepth = 0;
      zone.classList.remove("is-dragging");
    }
    function clearError() {
      error.hidden = true;
      error.textContent = "";
    }
    async function selectFiles(files) {
      resetDrag();
      if (busy()) return;
      if (files.length !== 1) {
        error.textContent = files.length
          ? "Please import one report at a time. Drop a single .json file."
          : "Drop a JSON report file. Folders are not supported.";
        error.hidden = false;
        return;
      }
      clearError();
      importing = true;
      dialog.close();
      try {
        await importFile(files[0]);
      } finally {
        importing = false;
        input.value = "";
      }
    }
    get("import-report").addEventListener("click", () => {
      if (busy() || dialog.open) return;
      clearError();
      resetDrag();
      dialog.showModal();
    });
    get("close-import").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", resetDrag);
    get("browse-report").addEventListener("click", () => {
      if (!busy()) input.click();
    });
    input.addEventListener("change", () => {
      if (input.files.length) void selectFiles(input.files);
      input.value = "";
    });
    zone.addEventListener("dragenter", (event) => {
      if (!isFileDrag(event) || busy()) return;
      event.preventDefault();
      dragDepth++;
      zone.classList.add("is-dragging");
    });
    zone.addEventListener("dragleave", (event) => {
      if (!isFileDrag(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) resetDrag();
    });
    zone.addEventListener("dragover", (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = busy() ? "none" : "copy";
    });
    zone.addEventListener("drop", (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (dialog.open) void selectFiles(event.dataTransfer.files);
      else resetDrag();
    });
    // Keep a missed drop from navigating away from the dashboard or interrupting rendering.
    document.addEventListener("dragover", (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (!zone.contains(event.target) || busy())
        event.dataTransfer.dropEffect = "none";
    });
    document.addEventListener("drop", (event) => {
      if (isFileDrag(event)) event.preventDefault();
      resetDrag();
    });
    document.addEventListener("dragend", resetDrag);
  }
  const api = { setup };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ReportImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
