const UserManagement = require("../user-management");
const Projects = require("../../shared/project-management");
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
  async function projectRows() {
    const users = (await readJSON(file("users"), [])).filter(
      UserManagement.belongsToOrganization,
    );
    const assigned = users.flatMap((user) =>
      user.projects.map((project) => ({ metadata: { project } })),
    );
    return Projects.merge(await readJSON(file("projects"), []), [
      ...(await readJSON(file("runs"), [])),
      ...assigned,
    ]);
  }
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
    async listProjects(scopes = ["*"]) {
      const rows = await projectRows();
      return rows.filter((project) => allowed(scopes, project.id));
    },
    async manageProject(body, id, clock = Date.now()) {
      return serial(async () => {
        const records = await readJSON(file("projects"), []);
        const rows = await projectRows();
        const next = Projects.change(rows, body, id, clock);
        await writeJSON(file("projects"), [
          ...records.filter((item) => item.id !== next.id),
          next,
        ]);
        return next;
      });
    },
    getUsers: () => readJSON(file("users"), []),
    async manageUser(username, mutate) {
      return serial(async () => {
        const rows = await readJSON(file("users"), []);
        const next = mutate(rows);
        await writeJSON(file("users"), [
          ...rows.filter((row) => row.username !== username),
          next,
        ]);
        return next;
      });
    },
    getTokens: () => readJSON(file("tokens"), []),
    async addUser(user) {
      return serial(async () => {
        const rows = await readJSON(file("users"), []);
        if (rows.some((row) => row.username === user.username))
          throw new Error("This username already exists.");
        if (
          user.email &&
          rows.some(
            (row) => row.email?.toLowerCase() === user.email.toLowerCase(),
          )
        )
          throw new Error(
            "This email address is already assigned to an account.",
          );
        await writeJSON(file("users"), [...rows, user]);
      });
    },
    async addToken(token) {
      return serial(async () => {
        const rows = await readJSON(file("tokens"), []);
        await writeJSON(file("tokens"), [...rows, token]);
      });
    },
    async setRunArchived(id, projects, archivedAt) {
      return serial(async () => {
        const rows = await readJSON(file("runs"), []);
        const index = rows.findIndex(
          (row) => row.id === id && allowed(projects, row.metadata.project),
        );
        if (index < 0) return null;
        rows[index] = { ...rows[index], archivedAt };
        await writeJSON(file("runs"), rows);
        return rows[index];
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
    async getRunSource(id, projects) {
      if (!/^[a-f0-9]{64}$/.test(id)) return null;
      const record = (await readJSON(file("runs"), [])).find(
        (row) => row.id === id && allowed(projects, row.metadata.project),
      );
      if (!record) return null;
      return {
        record,
        originalText: await fs.readFile(
          path.join(dataDir, "reports", id + ".json"),
          "utf8",
        ),
      };
    },
    async getRunSourceChunk(id, projects, offset, length) {
      const saved = await this.getRunSource(id, projects);
      if (!saved) return null;
      const source = Buffer.from(saved.originalText);
      return {
        totalBytes: source.length,
        bytes: source.subarray(offset, offset + length),
      };
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
        const previous = rows.find((row) => row.id === record.id);
        await writeJSON(file("runs"), [
          {
            ...record,
            archivedAt: previous
              ? previous.archivedAt || null
              : record.archivedAt || null,
          },
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
