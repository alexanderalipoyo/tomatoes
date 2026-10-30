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
    const users = (await readJSON(file("users"), [])).filter((user) =>
      UserManagement.belongsToOrganization(user),
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
    async getOrganization(id = "default") {
      const rows = await readJSON(file("organizations"), []);
      return (
        rows.find((row) => row.id === id) ||
        (id === "default"
          ? { id, name: "Tomatoes organization", createdAt: 0 }
          : null)
      );
    },
    async saveOrganization(id, name, creating = false, logo = undefined) {
      return serial(async () => {
        const rows = await readJSON(file("organizations"), []);
        if (creating && (id === "default" || rows.some((row) => row.id === id)))
          throw Object.assign(new Error("Organization already exists."), {
            status: 409,
          });
        const previous = rows.find((row) => row.id === id);
        if (!creating && !previous && id !== "default") return null;
        const next = {
          id,
          name: name ?? previous?.name ?? "Tomatoes organization",
          logo: logo ?? previous?.logo ?? "",
          createdAt: previous?.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        await writeJSON(file("organizations"), [
          ...rows.filter((row) => row.id !== id),
          next,
        ]);
        return next;
      });
    },
    async getProject(id) {
      return (await projectRows()).find((project) => project.id === id) || null;
    },
    async listProjects(scopes = ["*"], organizationId = "default") {
      const rows = await projectRows();
      return rows
        .filter(
          (project) =>
            (project.organizationId || "default") === organizationId &&
            allowed(scopes, project.id),
        )
        .map((project) => ({
          ...project,
          organizationId: project.organizationId || "default",
        }));
    },
    async manageProject(
      body,
      id,
      clock = Date.now(),
      organizationId = "default",
    ) {
      return serial(async () => {
        const records = await readJSON(file("projects"), []);
        const rows = await projectRows();
        const next = Projects.changeInOrganization(
          rows,
          body,
          id,
          clock,
          organizationId,
        );
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
    async listRunsPage(projects, { project, includeArchived, limit, cursor }) {
      const rows = await readJSON(file("runs"), []);
      return rows
        .filter(
          (row) =>
            allowed(projects, row.metadata.project) &&
            (!project || row.metadata.project === project) &&
            (includeArchived || !row.archivedAt) &&
            (!cursor ||
              (row.receivedAt || 0) < cursor.receivedAt ||
              ((row.receivedAt || 0) === cursor.receivedAt &&
                row.id < cursor.id)),
        )
        .sort(
          (a, b) =>
            (b.receivedAt || 0) - (a.receivedAt || 0) ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
        )
        .slice(0, limit + 1);
    },
    async listBranchesPage(projects, project, cursor = null) {
      const rows = await readJSON(file("runs"), []);
      return [
        ...new Set(
          rows
            .filter(
              (row) =>
                row.metadata.project === project && allowed(projects, project),
            )
            .map((row) => row.metadata.branch)
            .filter(
              (branch) =>
                typeof branch === "string" &&
                branch.trim() &&
                branch.length <= 160 &&
                !/[\x00-\x1f\x7f]/.test(branch),
            )
            .map((branch) => branch.trim()),
        ),
      ]
        .sort()
        .filter((branch) => cursor === null || branch > cursor)
        .slice(0, 101);
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
