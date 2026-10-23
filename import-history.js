(function (root) {
  function createHistory({
    indexedDB = root.indexedDB,
    crypto = root.crypto,
    name = "tomatoes-import-history",
  } = {}) {
    let connection;
    function open() {
      if (!indexedDB)
        return Promise.reject(new Error("Browser storage is unavailable."));
      if (!connection)
        connection = new Promise((resolve, reject) => {
          const request = indexedDB.open(name, 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            db.createObjectStore("entries", { keyPath: "id" });
            db.createObjectStore("reports", { keyPath: "id" });
            db.createObjectStore("preferences");
          };
          request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
          };
          request.onerror = () => {
            connection = null;
            reject(
              request.error || new Error("Could not open import history."),
            );
          };
          request.onblocked = () => {
            connection = null;
            reject(
              new Error(
                "History storage is busy. Close other dashboard tabs and retry.",
              ),
            );
          };
        });
      return connection;
    }
    function complete(tx, result) {
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(result());
        tx.onabort = () =>
          reject(
            tx.error ||
              new Error(
                "History could not be saved. Browser storage may be full.",
              ),
          );
        tx.onerror = () => {};
      });
    }
    async function list() {
      const db = await open();
      const tx = db.transaction("entries", "readonly");
      const request = tx.objectStore("entries").getAll();
      return complete(tx, () =>
        request.result.sort(
          (a, b) =>
            b.lastImportedAt - a.lastImportedAt || a.id.localeCompare(b.id),
        ),
      );
    }
    async function get(id) {
      const db = await open();
      const tx = db.transaction(["entries", "reports"], "readonly");
      const entry = tx.objectStore("entries").get(id);
      const report = tx.objectStore("reports").get(id);
      const saved = await complete(tx, () =>
        entry.result && report.result
          ? { entry: entry.result, text: report.result.text }
          : null,
      );
      if (!saved)
        throw new Error(
          "This import is no longer available in browser storage.",
        );
      return saved;
    }
    async function lastActive() {
      const db = await open();
      const tx = db.transaction("preferences", "readonly");
      const request = tx.objectStore("preferences").get("active");
      return complete(tx, () => request.result || null);
    }
    async function markActive(id) {
      const db = await open();
      const tx = db.transaction("preferences", "readwrite");
      tx.objectStore("preferences").put(id, "active");
      return complete(tx, () => id);
    }
    async function save({
      text,
      name,
      report,
      source = "imported",
      touch = true,
    }) {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
      );
      const id = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const db = await open();
      const tx = db.transaction(
        ["entries", "reports", "preferences"],
        "readwrite",
      );
      const entries = tx.objectStore("entries");
      const request = entries.get(id);
      let entry;
      request.onsuccess = () => {
        const previous = request.result;
        const now = Date.now();
        entry = {
          id,
          name: touch || !previous ? name : previous.name,
          source:
            (touch && source === "imported") || previous?.source === "imported"
              ? "imported"
              : "bundled",
          importedAt: previous?.importedAt || now,
          lastImportedAt: touch || !previous ? now : previous.lastImportedAt,
          start: report.start,
          end: report.end,
          duration: report.duration,
          status: report.status,
          counts: { ...report.counts },
          specs: report.specs.length,
          passRate: report.passRate,
        };
        entries.put(entry);
        if (!previous) tx.objectStore("reports").put({ id, text });
        tx.objectStore("preferences").put(id, "active");
      };
      return complete(tx, () => entry);
    }
    async function close() {
      if (connection) (await connection).close();
      connection = null;
    }
    return { list, get, save, lastActive, markActive, close };
  }
  if (typeof module !== "undefined" && module.exports)
    module.exports = { createHistory };
  else root.ImportHistory = createHistory();
})(typeof globalThis !== "undefined" ? globalThis : this);
