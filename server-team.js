const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const ReportData = require("./report-data");
const { createFileStore } = require("./team-store");
const { readJSON, writeJSON } = require("./json-store");
const Features = require("./report-features");
const Investigations = require("./investigation-model");
const hashToken = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error("Passwords must be 12–256 characters.");
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function verifyPassword(password, record) {
  if (typeof password !== "string" || password.length > 256) return false;
  const salt = record?.salt || "00000000000000000000000000000000";
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(record?.hash || "00".repeat(64), "hex");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected) &&
    Boolean(record)
  );
}
function apiError(status, message) {
  return Object.assign(new Error(message), { status });
}
function createTeamService({
  dataDir = path.join(__dirname, ".tomatoes-data"),
  teamMode = false,
  publicOrigin = "",
  ciToken = "",
  ciProject = "tomatoes",
  now = () => Date.now(),
  store = createFileStore(dataDir),
} = {}) {
  const sessions = new Map(),
    attempts = new Map();
  const send = (res, status, value, headers = {}) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    res.end(JSON.stringify(value));
  };
  function validHost(req) {
    try {
      const hostname = new URL("http://" + req.headers.host).hostname;
      return publicOrigin
        ? new URL(publicOrigin).host === req.headers.host
        : ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
    } catch {
      return false;
    }
  }
  function checkOrigin(req) {
    const expected = publicOrigin || "http://" + req.headers.host;
    if (req.headers.origin !== expected)
      throw apiError(
        403,
        "This action requires a request from the Tomatoes origin.",
      );
  }
  async function session(req) {
    const cookie = String(req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("tomatoes_session="));
    if (!cookie) return null;
    const key = hashToken(cookie.slice("tomatoes_session=".length));
    const saved = sessions.get(key);
    if (!saved) return null;
    if (saved.expires <= now()) {
      sessions.delete(key);
      return null;
    }
    const users = await store.getUsers();
    const user = users.find((user) => user.username === saved.username);
    if (!user) {
      sessions.delete(key);
      return null;
    }
    return {
      ...saved,
      key,
      username: user.username,
      role: user.role,
      projects: user.projects,
    };
  }
  async function principal(req) {
    const authorization = String(req.headers.authorization || "");
    if (authorization) {
      if (!authorization.startsWith("Bearer "))
        throw apiError(401, "Invalid CI authorization.");
      const digest = hashToken(authorization.slice(7));
      const tokens = await store.getTokens();
      const token =
        tokens.find((record) => record.hash === digest) ||
        (ciToken && hashToken(ciToken) === digest
          ? { project: ciProject }
          : null);
      if (!token) throw apiError(401, "Invalid CI token.");
      return { role: "ci", projects: [token.project], kind: "token" };
    }
    if (!teamMode) return { role: "admin", projects: ["*"], kind: "local" };
    const user = await session(req);
    if (!user) throw apiError(401, "Sign in to access the local team store.");
    return { ...user, kind: "session" };
  }
  function canAccess(user, project) {
    return user.projects.includes("*") || user.projects.includes(project);
  }
  function canWrite(req, user) {
    if (user.role === "viewer")
      throw apiError(403, "This account has read-only project access.");
    if (user.kind !== "token") {
      checkOrigin(req);
      if (user.kind === "session" && req.headers["x-csrf-token"] !== user.csrf)
        throw apiError(
          403,
          "The session action token is invalid. Sign in again.",
        );
    }
  }
  function readBody(req, limit = ReportData.MAX_REPORT_BYTES) {
    return new Promise((resolve, reject) => {
      let length = 0,
        parts = [],
        exceeded = false;
      req.setTimeout(30000, () => {
        reject(apiError(408, "Upload timed out."));
        req.destroy();
      });
      req.on("data", (chunk) => {
        length += chunk.length;
        if (length > limit) {
          if (!exceeded) {
            exceeded = true;
            parts = [];
            reject(apiError(413, "Report upload exceeds the size limit."));
          }
        } else if (!exceeded) parts.push(chunk);
      });
      req.on("end", () => {
        req.setTimeout(0);
        if (!exceeded) resolve(Buffer.concat(parts).toString("utf8"));
      });
      req.on("error", () =>
        reject(apiError(400, "Could not read request body.")),
      );
    });
  }
  async function bodyJSON(req, limit) {
    if (
      !String(req.headers["content-type"] || "")
        .toLowerCase()
        .startsWith("application/json")
    )
      throw apiError(415, "Use Content-Type: application/json.");
    let value;
    try {
      value = JSON.parse(await readBody(req, limit));
    } catch (error) {
      if (error.status) throw error;
      throw apiError(400, "Request body is not valid JSON.");
    }
    return value;
  }
  async function authenticateData(req) {
    if (!validHost(req)) throw apiError(403, "Unrecognized server host.");
    return principal(req);
  }
  async function handle(req, res, url) {
    if (!url.pathname.startsWith("/api/")) return false;
    try {
      if (!validHost(req)) throw apiError(403, "Unrecognized server host.");
      if (req.method === "GET" && url.pathname === "/api/team/status") {
        const user = teamMode ? await session(req) : null;
        const tokens = await store.getTokens();
        send(res, 200, {
          enabled: teamMode,
          authenticated: Boolean(user),
          user: user
            ? {
                username: user.username,
                role: user.role,
                projects: user.projects,
              }
            : null,
          csrf: user?.csrf || null,
          ciConfigured: Boolean(ciToken || tokens.length),
          storage: store.kind === "postgres" ? "postgres" : "local-server",
        });
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/login") {
        checkOrigin(req);
        if (!teamMode)
          throw apiError(
            409,
            "Sign-in is not enabled. The server is in local mode.",
          );
        const body = await bodyJSON(req, 8192);
        const username =
          typeof body?.username === "string"
            ? body.username.trim().toLowerCase()
            : "";
        const key = req.socket.remoteAddress + ":" + username;
        const previous = attempts.get(key);
        if (!previous && attempts.size >= 1000) {
          for (const [id, value] of attempts)
            if (value.until <= now()) attempts.delete(id);
          if (attempts.size >= 1000)
            throw apiError(429, "Sign-in is temporarily rate limited.");
        }
        if (previous && previous.until > now() && previous.count >= 5)
          throw apiError(
            429,
            "Too many sign-in attempts. Try again in 15 minutes.",
          );
        const users = await store.getUsers();
        const user = users.find((item) => item.username === username);
        if (!verifyPassword(body?.password, user)) {
          const record =
            previous && previous.until > now()
              ? previous
              : { count: 0, until: now() + 15 * 60 * 1000 };
          record.count++;
          attempts.set(key, record);
          if (attempts.size > 1000)
            for (const [old, value] of attempts)
              if (value.until < now()) attempts.delete(old);
          throw apiError(401, "Username or password is incorrect.");
        }
        attempts.delete(key);
        const token = crypto.randomBytes(32).toString("base64url"),
          csrf = crypto.randomBytes(24).toString("base64url");
        for (const [key, value] of sessions)
          if (value.expires < now()) sessions.delete(key);
        if (sessions.size >= 1000)
          sessions.delete(sessions.keys().next().value);
        sessions.set(hashToken(token), {
          username,
          csrf,
          expires: now() + 8 * 60 * 60 * 1000,
        });
        const secure = publicOrigin.startsWith("https:") ? "; Secure" : "";
        send(
          res,
          200,
          {
            user: { username, role: user.role, projects: user.projects },
            csrf,
          },
          {
            "Set-Cookie": `tomatoes_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`,
          },
        );
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/logout") {
        const user = await principal(req);
        canWrite({ ...req, headers: req.headers }, { ...user, role: "editor" });
        if (user.key) sessions.delete(user.key);
        send(
          res,
          200,
          { ok: true },
          {
            "Set-Cookie":
              "tomatoes_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          },
        );
        return true;
      }
      const user = await principal(req);
      if (req.method === "GET" && url.pathname === "/api/runs") {
        const project = url.searchParams.get("project");
        if (project && !canAccess(user, project))
          throw apiError(403, "This project is outside your access scope.");
        const records = await store.listRuns(user.projects, project);
        send(res, 200, {
          runs: records
            .filter(
              (record) =>
                canAccess(user, record.metadata.project) &&
                (!project || record.metadata.project === project),
            )
            .sort((a, b) => b.receivedAt - a.receivedAt),
        });
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/runs") {
        canWrite(req, user);
        const body = await bodyJSON(
          req,
          ReportData.MAX_REPORT_BYTES * 2 + 65536,
        );
        let raw;
        try {
          raw =
            typeof body?.reportText === "string"
              ? JSON.parse(body.reportText.replace(/^\uFEFF/, ""))
              : body?.report || body;
        } catch {
          throw apiError(400, "Report text is not valid JSON.");
        }
        const wrapped = Boolean(
          body?.report || typeof body?.reportText === "string",
        );
        let report, metadata;
        try {
          if (wrapped && body.metadata !== undefined)
            ReportData.normalizeMetadata(body.metadata);
          report = ReportData.parseReportText(JSON.stringify(raw));
          metadata = ReportData.normalizeMetadata({
            ...report.metadata,
            ...(wrapped ? body.metadata : {}),
            project:
              (wrapped ? body.metadata?.project : report.metadata.project) ||
              report.metadata.project ||
              (user.kind === "token" ? user.projects[0] : "tomatoes"),
          });
        } catch (error) {
          throw apiError(400, error.message);
        }
        if (!canAccess(user, metadata.project))
          throw apiError(403, "This project is outside your access scope.");
        const text = JSON.stringify(raw);
        const originalText =
          typeof body?.reportText === "string" ? body.reportText : text;
        if (
          Buffer.byteLength(originalText, "utf8") > ReportData.MAX_REPORT_BYTES
        )
          throw apiError(413, "Report exceeds the 50 MB limit.");
        if (
          body?.label !== undefined &&
          (typeof body.label !== "string" || body.label.length > 180)
        )
          throw apiError(400, "Report label must be up to 180 characters.");
        if (
          body?.notes !== undefined &&
          (typeof body.notes !== "string" || body.notes.length > 2000)
        )
          throw apiError(400, "Report notes must be up to 2000 characters.");
        if (
          body?.importedAt !== undefined &&
          (!Number.isFinite(body.importedAt) ||
            body.importedAt <= 0 ||
            body.importedAt > 8640000000000000)
        )
          throw apiError(400, "Report import time is invalid.");
        const id = hashToken(metadata.project + "\0" + text);
        const record = {
          id,
          name:
            typeof body?.name === "string"
              ? body.name.slice(0, 180)
              : "ci-report.json",
          metadata,
          label: body?.label || "",
          notes: body?.notes || "",
          importedAt: body?.importedAt || now(),
          receivedAt: now(),
          start: report.start,
          end: report.end,
          status: report.status,
          counts: report.counts,
          duration: report.duration,
          passRate: report.passRate,
        };
        await store.saveRun(record, raw, originalText);
        send(res, 201, { run: record });
        return true;
      }
      const evidenceMatch = url.pathname.match(
        /^\/api\/runs\/([0-9a-f]{64})\/evidence(?:\/([0-9a-f]{64}))?$/,
      );
      if (evidenceMatch) {
        const saved = await store.getRun(evidenceMatch[1], user.projects);
        if (!saved)
          throw apiError(404, "Report not found in your accessible projects.");
        if (req.method === "GET" && !evidenceMatch[2]) {
          const evidence = await store.listEvidence(evidenceMatch[1]);
          send(res, 200, {
            evidence: evidence.map(({ fileName, ...item }) => item),
          });
          return true;
        }
        if (req.method === "GET" && evidenceMatch[2]) {
          const record = (await store.listEvidence(evidenceMatch[1])).find(
            (item) => item.id === evidenceMatch[2],
          );
          if (!record) throw apiError(404, "Attachment not found.");
          const bytes = await fs.readFile(
            path.join(dataDir, "attachments", record.id + ".bin"),
          );
          res.writeHead(200, {
            "Content-Type": record.type,
            "Content-Length": bytes.length,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "attachment",
          });
          res.end(bytes);
          return true;
        }
        if (req.method === "POST" && !evidenceMatch[2]) {
          canWrite(req, user);
          const body = await bodyJSON(req, 36 * 1024 * 1024);
          if (
            typeof body?.testKey !== "string" ||
            body.testKey.length > 16000 ||
            typeof body.name !== "string" ||
            !body.name.trim() ||
            body.name.length > 180 ||
            typeof body.data !== "string" ||
            body.data.length % 4 !== 0 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)
          )
            throw apiError(400, "Invalid attachment details.");
          const normalized = ReportData.normalizeReport(saved.report);
          if (
            !normalized.tests.some(
              (test) => Investigations.identity(test) === body.testKey,
            )
          )
            throw apiError(
              400,
              "Attachment test was not found in this report.",
            );
          const bytes = Buffer.from(body.data, "base64");
          try {
            await Features.validateEvidence(
              new Blob([bytes], { type: body.type }),
            );
          } catch (error) {
            throw apiError(400, error.message);
          }
          const id = crypto
            .createHash("sha256")
            .update(evidenceMatch[1] + "\0" + body.testKey + "\0")
            .update(bytes)
            .digest("hex");
          const record = {
            id,
            runId: evidenceMatch[1],
            testKey: body.testKey,
            name: body.name,
            type: body.type,
            size: bytes.length,
            contentHash: crypto
              .createHash("sha256")
              .update(bytes)
              .digest("hex"),
            savedAt: now(),
          };
          const destination = path.join(dataDir, "attachments", id + ".bin");
          await fs.mkdir(path.dirname(destination), { recursive: true });
          try {
            await fs.writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
          } catch (error) {
            if (error.code !== "EEXIST") throw error;
          }
          await store.saveEvidence(record);
          send(res, 201, { evidence: record });
          return true;
        }
        throw apiError(404, "Attachment endpoint not found.");
      }
      const match = url.pathname.match(/^\/api\/runs\/([0-9a-f]{64})$/);
      if (req.method === "GET" && match) {
        const saved = await store.getRun(match[1], user.projects);
        if (!saved)
          throw apiError(404, "Report not found in your accessible projects.");
        send(res, 200, {
          run: saved.record,
          report: saved.report,
          originalText: saved.originalText,
        });
        return true;
      }
      throw apiError(404, "API endpoint not found.");
    } catch (error) {
      send(res, error.status || 500, {
        error: error.status
          ? error.message
          : "Local team storage is unavailable.",
      });
      return true;
    }
  }
  return { handle, authenticateData, teamMode, store };
}
module.exports = {
  createTeamService,
  hashPassword,
  verifyPassword,
  hashToken,
  readJSON,
  writeJSON,
};
