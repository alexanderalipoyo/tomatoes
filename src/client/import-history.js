(function (root) {
  const Data =
    typeof module !== "undefined" && module.exports
      ? require("../shared/report-data")
      : root.ReportData;
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
          const request = indexedDB.open(name, 2);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("entries"))
              db.createObjectStore("entries", { keyPath: "id" });
            if (!db.objectStoreNames.contains("reports"))
              db.createObjectStore("reports", { keyPath: "id" });
            if (!db.objectStoreNames.contains("preferences"))
              db.createObjectStore("preferences");
            if (!db.objectStoreNames.contains("evidence"))
              db.createObjectStore("evidence", { keyPath: "id" }).createIndex(
                "runId",
                "runId",
              );
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
    async function list(
      includeDeleted = false,
      includeArchived = includeDeleted,
    ) {
      const db = await open();
      const tx = db.transaction("entries", "readonly");
      const request = tx.objectStore("entries").getAll();
      return complete(tx, () =>
        request.result
          .filter(
            (entry) =>
              (includeDeleted || !entry.deletedAt) &&
              (includeArchived || !entry.archivedAt),
          )
          .sort(
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
        new TextEncoder().encode(
          Data.reportIdentityText(
            text,
            report.metadata?.project || "",
            report.metadata?.branch || "",
          ),
        ),
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
          metadata: previous?.metadata || report.metadata || {},
          label: previous?.label || "",
          notes: previous?.notes || "",
          deletedAt: null,
          archivedAt: previous?.archivedAt || null,
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

    async function updateMetadata(id, metadata) {
      const db = await open();
      const tx = db.transaction("entries", "readwrite");
      const store = tx.objectStore("entries");
      const request = store.get(id);
      let updated;
      request.onsuccess = () => {
        if (!request.result) {
          tx.abort();
          return;
        }
        updated = { ...request.result, metadata };
        store.put(updated);
      };
      return complete(tx, () => updated);
    }
    async function updateDetails(id, changes) {
      const db = await open();
      const tx = db.transaction("entries", "readwrite");
      const store = tx.objectStore("entries"),
        request = store.get(id);
      let updated;
      request.onsuccess = () => {
        if (!request.result) {
          tx.abort();
          return;
        }
        updated = { ...request.result, ...changes, id };
        store.put(updated);
      };
      return complete(tx, () => updated);
    }
    async function snapshot() {
      const db = await open();
      const tx = db.transaction(["entries", "reports", "evidence"], "readonly");
      const entries = tx.objectStore("entries").getAll();
      const reports = tx.objectStore("reports").getAll();
      const evidence = tx.objectStore("evidence").getAll();
      return complete(tx, () => ({
        entries: entries.result,
        reports: reports.result,
        evidence: evidence.result,
      }));
    }
    async function restoreSnapshot(data) {
      const db = await open();
      const tx = db.transaction(
        ["entries", "reports", "evidence"],
        "readwrite",
      );
      const entries = tx.objectStore("entries"),
        reports = tx.objectStore("reports"),
        evidence = tx.objectStore("evidence");
      let added = 0,
        skipped = 0,
        conflict = false;
      const textById = new Map(
        data.reports.map((item) => [item.id, item.text]),
      );
      for (const entry of data.entries) {
        const existing = entries.get(entry.id);
        existing.onsuccess = () => {
          if (!existing.result) {
            entries.put(entry);
            reports.put({ id: entry.id, text: textById.get(entry.id) });
            added++;
          } else {
            skipped++;
            const source = reports.get(entry.id);
            source.onsuccess = () => {
              if (source.result?.text !== textById.get(entry.id)) {
                conflict = true;
                tx.abort();
              }
            };
          }
        };
      }
      for (const record of data.evidence) {
        const existing = evidence.get(record.id);
        existing.onsuccess = () => {
          if (!existing.result) evidence.put(record);
        };
      }
      try {
        return await complete(tx, () => ({ added, skipped }));
      } catch (error) {
        if (conflict)
          throw new Error(
            "Backup conflicts with an existing report. No data was restored.",
          );
        throw error;
      }
    }
    async function saveEvidence(record) {
      const db = await open();
      const tx = db.transaction("evidence", "readwrite");
      tx.objectStore("evidence").put(record);
      return complete(tx, () => record);
    }
    async function listEvidence(runId, testKey) {
      const db = await open();
      const tx = db.transaction("evidence", "readonly");
      const request = tx.objectStore("evidence").index("runId").getAll(runId);
      return complete(tx, () =>
        request.result.filter(
          (item) => testKey === undefined || item.testKey === testKey,
        ),
      );
    }
    async function close() {
      if (connection) (await connection).close();
      connection = null;
    }
    return {
      list,
      get,
      save,
      lastActive,
      markActive,
      updateMetadata,
      updateDetails,
      snapshot,
      restoreSnapshot,
      saveEvidence,
      listEvidence,
      close,
    };
  }
  if (typeof module !== "undefined" && module.exports)
    module.exports = { createHistory };
  else root.ImportHistory = createHistory();
})(typeof globalThis !== "undefined" ? globalThis : this);
