const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const ReportData = require("./report-data");
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
async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}
async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  try {
    await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
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
} = {}) {
  const sessions = new Map(),
    attempts = new Map();
  let queue = Promise.resolve();
  const usersPath = path.join(dataDir, "users.json"),
    tokensPath = path.join(dataDir, "tokens.json"),
    indexPath = path.join(dataDir, "runs.json");
  const serialize = (action) => {
    const job = queue.catch(() => {}).then(action);
    queue = job;
    return job;
  };
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
    const users = await readJSON(usersPath, []);
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
      const tokens = await readJSON(tokensPath, []);
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
        const tokens = await readJSON(tokensPath, []);
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
          storage: "local-server",
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
        const users = await readJSON(usersPath, []);
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
        const records = await readJSON(indexPath, []);
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
        const body = await bodyJSON(req);
        const raw = body?.report || body;
        let report, metadata;
        try {
          if (body?.report && body.metadata !== undefined)
            ReportData.normalizeMetadata(body.metadata);
          report = ReportData.parseReportText(JSON.stringify(raw));
          metadata = ReportData.normalizeMetadata({
            ...report.metadata,
            ...(body?.report ? body.metadata : {}),
            project:
              (body?.report
                ? body.metadata?.project
                : report.metadata.project) ||
              report.metadata.project ||
              (user.kind === "token" ? user.projects[0] : "tomatoes"),
          });
        } catch (error) {
          throw apiError(400, error.message);
        }
        if (!canAccess(user, metadata.project))
          throw apiError(403, "This project is outside your access scope.");
        const text = JSON.stringify(raw);
        const id = hashToken(metadata.project + "\0" + text);
        const record = {
          id,
          name:
            typeof body?.name === "string"
              ? body.name.slice(0, 180)
              : "ci-report.json",
          metadata,
          receivedAt: now(),
          start: report.start,
          end: report.end,
          status: report.status,
          counts: report.counts,
          duration: report.duration,
          passRate: report.passRate,
        };
        await serialize(async () => {
          const records = await readJSON(indexPath, []);
          await writeJSON(path.join(dataDir, "reports", id + ".json"), raw);
          await writeJSON(indexPath, [
            record,
            ...records.filter((item) => item.id !== id),
          ]);
        });
        send(res, 201, { run: record });
        return true;
      }
      const match = url.pathname.match(/^\/api\/runs\/([0-9a-f]{64})$/);
      if (req.method === "GET" && match) {
        const records = await readJSON(indexPath, []);
        const record = records.find(
          (item) =>
            item.id === match[1] && canAccess(user, item.metadata.project),
        );
        if (!record)
          throw apiError(404, "Report not found in your accessible projects.");
        const report = await readJSON(
          path.join(dataDir, "reports", record.id + ".json"),
          null,
        );
        if (!report)
          throw apiError(404, "Stored report content is unavailable.");
        send(res, 200, { run: record, report });
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
  return { handle, authenticateData, teamMode };
}
module.exports = {
  createTeamService,
  hashPassword,
  verifyPassword,
  hashToken,
  readJSON,
  writeJSON,
};
