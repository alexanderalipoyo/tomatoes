const fs = require("node:fs/promises");
const path = require("node:path");
const { PROJECT_ROOT } = require("../config");
const { readJSON, writeJSON, writeText } = require("./json-store");
const allowed = (projects, project) =>
  !projects || projects.includes("*") || projects.includes(project);
function createFileStore(dataDir = path.join(PROJECT_ROOT, ".tomatoes-data")) {
  const file = (name) => path.join(dataDir, name + ".json");
  let queue = Promise.resolve();
  const serial = (action) => {
    const task = queue.catch(() => {}).then(action);
    queue = task;
    return task;
  };
  return {
    kind: "files",
    ready: async () => {},
    close: async () => {},
    async getPreferences(owner) {
      const rows = await readJSON(file("preferences"), []);
      return rows.find((row) => row.owner === owner)?.preferences || null;
    },
    async savePreferences(owner, patch, initializeOnly = false) {
      return serial(async () => {
        const rows = await readJSON(file("preferences"), []);
        const previous = rows.find((row) => row.owner === owner);
        if (initializeOnly && previous) return previous.preferences;
        const preferences = { ...(previous?.preferences || {}), ...patch };
        await writeJSON(file("preferences"), [
          ...rows.filter((row) => row.owner !== owner),
          { owner, preferences },
        ]);
        return preferences;
      });
    },
    getUsers: () => readJSON(file("users"), []),
    getTokens: () => readJSON(file("tokens"), []),
    async addUser(user) {
      return serial(async () => {
        const rows = await readJSON(file("users"), []);
        if (rows.some((row) => row.username === user.username))
          throw new Error("This username already exists.");
        await writeJSON(file("users"), [...rows, user]);
      });
    },
    async addToken(token) {
      return serial(async () => {
        const rows = await readJSON(file("tokens"), []);
        await writeJSON(file("tokens"), [...rows, token]);
      });
    },
    async listRuns(projects, project) {
      return (await readJSON(file("runs"), []))
        .filter(
          (row) =>
            allowed(projects, row.metadata.project) &&
            (!project || row.metadata.project === project),
        )
        .sort((a, b) => b.receivedAt - a.receivedAt);
    },
    async getRun(id, projects) {
      if (!/^[a-f0-9]{64}$/.test(id)) return null;
      const record = (await readJSON(file("runs"), [])).find(
        (row) => row.id === id && allowed(projects, row.metadata.project),
      );
      if (!record) return null;
      const originalText = await fs.readFile(
        path.join(dataDir, "reports", id + ".json"),
        "utf8",
      );
      return {
        record,
        report: JSON.parse(originalText.replace(/^\uFEFF/, "")),
        originalText,
      };
    },
    async saveRun(record, report, originalText = JSON.stringify(report)) {
      return serial(async () => {
        const rows = await readJSON(file("runs"), []);
        await writeText(
          path.join(dataDir, "reports", record.id + ".json"),
          originalText,
        );
        await writeJSON(file("runs"), [
          record,
          ...rows.filter((row) => row.id !== record.id),
        ]);
      });
    },
    async listEvidence(runId) {
      return (await readJSON(file("evidence"), [])).filter(
        (row) => row.runId === runId,
      );
    },
    async saveEvidence(record) {
      return serial(async () => {
        const rows = await readJSON(file("evidence"), []);
        await writeJSON(file("evidence"), [
          ...rows.filter((row) => row.id !== record.id),
          record,
        ]);
      });
    },
  };
}

module.exports = { createFileStore };
