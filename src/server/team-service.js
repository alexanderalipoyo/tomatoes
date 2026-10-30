const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { PROJECT_ROOT } = require("./config");
const ReportData = require("../shared/report-data");
const ReportTransfer = require("./report-transfer");
const UserPreferences = require("../shared/user-preferences");
const { createFileStore } = require("./storage/index");
const { readJSON, writeJSON } = require("./storage/json-store");
const UserManagement = require("./user-management");
const Features = require("../shared/report-features");
const Investigations = require("../shared/investigation-model");
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
  dataDir = path.join(PROJECT_ROOT, ".tomatoes-data"),
  teamMode = false,
  publicOrigin = "",
  additionalOrigins = [],
  ciToken = "",
  ciProject = "tomatoes",
  now = () => Date.now(),
  slackNotifier = null,
  hosted = false,
  recoverySender = null,
  store = createFileStore(dataDir),
} = {}) {
  const sessions = new Map(),
    attempts = new Map();
  const recoveryAttempts = new Map();
  let recoveryDeliveryQueue = Promise.resolve();
  const maxRequestBytes = hosted ? 4 * 1024 * 1024 : Infinity;
  const saveSession = async (key, value) =>
    store.setSession
      ? store.setSession(key, value, now())
      : sessions.set(key, value);
  const deleteSession = async (key) =>
    store.deleteSession ? store.deleteSession(key) : sessions.delete(key);
  const revokeSessions = async (username) => {
    if (store.revokeSessions) return store.revokeSessions(username);
    for (const [key, value] of sessions)
      if (value.username === username) sessions.delete(key);
  };
  const clientAddress = (req) =>
    hosted
      ? String(req.headers["x-real-ip"] || req.socket.remoteAddress)
      : req.socket.remoteAddress;
  const send = (res, status, value, headers = {}) => {
    let serialized = JSON.stringify(value);
    if (hosted && Buffer.byteLength(serialized) > maxRequestBytes) {
      status = 413;
      serialized = JSON.stringify({
        error:
          "This response exceeds the hosted 4 MB limit. Open this report in your local Tomatoes installation.",
      });
    }
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    res.end(serialized);
  };
  const trustedOrigins = [publicOrigin, ...additionalOrigins]
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);
  function validHost(req) {
    try {
      const hostname = new URL("http://" + req.headers.host).hostname;
      return trustedOrigins.length
        ? trustedOrigins.some(
            (origin) => new URL(origin).host === req.headers.host,
          )
        : ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
    } catch {
      return false;
    }
  }
  function checkOrigin(req) {
    const expected = trustedOrigins.length
      ? trustedOrigins.filter(
          (origin) => new URL(origin).host === req.headers.host,
        )
      : ["http://" + req.headers.host];
    if (!expected.includes(req.headers.origin))
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
    const saved = store.getSession
      ? await store.getSession(key)
      : sessions.get(key);
    if (!saved) return null;
    if (saved.expires <= now()) {
      await deleteSession(key);
      return null;
    }
    const users = await store.getUsers();
    const user = users.find((user) => user.username === saved.username);
    if (!user || user.disabled || saved.passwordHash !== user.hash) {
      await deleteSession(key);
      return null;
    }
    const organization = await store.getOrganization(
      user.organizationId || "default",
    );
    if (!organization) {
      await deleteSession(key);
      return null;
    }
    const accessibleProjects = await store.listProjects(
      user.projects,
      organization.id,
    );
    return {
      ...saved,
      organization,
      accessibleProjects,
      projectScopes: accessibleProjects.map((project) => project.id),
      key,
      username: user.username,
      fullName: user.fullName || user.username,
      role: user.role,
      projects: user.projects,
      organizationId: user.organizationId || UserManagement.ORGANIZATION_ID,
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
      const project = await store.getProject(token.project);
      return {
        role: "ci",
        projects: [token.project],
        projectScopes: [token.project],
        organizationId: project?.organizationId || "default",
        kind: "token",
      };
    }
    if (!teamMode)
      return {
        role: "admin",
        projects: ["*"],
        projectScopes: ["*"],
        organizationId: "default",
        kind: "local",
      };
    const user = await session(req);
    if (!user) throw apiError(401, "Sign in to access the local team store.");
    return { ...user, kind: "session" };
  }
  function canAccess(user, project) {
    const scopes = user.projectScopes || user.projects;
    return scopes.includes("*") || scopes.includes(project);
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
    limit = Math.min(limit, maxRequestBytes);
    if (req.body !== undefined) {
      const text = Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body);
      return Buffer.byteLength(text) > limit
        ? Promise.reject(
            apiError(413, "Request exceeds the hosted upload limit."),
          )
        : Promise.resolve(text);
    }
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
          organization:
            user?.organization ||
            (!teamMode ? await store.getOrganization("default") : null),
          accessibleProjects:
            user?.accessibleProjects ||
            (!teamMode ? await store.listProjects(["*"], "default") : []),
          authenticated: Boolean(user),
          user: user
            ? {
                fullName: user.fullName || user.username,
                username: user.username,
                role: user.role,
                projects: user.projects,
                organizationId:
                  user.organizationId || UserManagement.ORGANIZATION_ID,
              }
            : null,
          csrf: user?.csrf || null,
          ciConfigured: Boolean(ciToken || tokens.length),
          slackConfigured: Boolean(slackNotifier?.enabled),
          storage: store.kind === "postgres" ? "postgres" : "local-server",
          recoveryDelivery: hosted
            ? recoverySender
              ? "email"
              : "unavailable"
            : "local",
          maxRequestBytes: hosted ? maxRequestBytes : null,
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
        const identifier =
          typeof (body?.email ?? body?.username) === "string"
            ? (body.email ?? body.username).trim().toLowerCase()
            : "";
        const key = clientAddress(req) + ":" + identifier;
        const persistentAttemptKey = hashToken("login:" + key);
        if (
          store.consumeAuthAttempt &&
          !(await store.consumeAuthAttempt(
            persistentAttemptKey,
            5,
            15 * 60 * 1000,
            now(),
          ))
        )
          throw apiError(
            429,
            "Too many sign-in attempts. Try again in 15 minutes.",
          );
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
        const matches = users.filter(
          (item) =>
            !item.disabled &&
            (item.username === identifier ||
              (item.email && item.email.toLowerCase() === identifier)),
        );
        const user = matches.length === 1 ? matches[0] : null;
        if (
          !verifyPassword(body?.password, user) ||
          !(await store.getOrganization(user.organizationId || "default"))
        ) {
          const record =
            previous && previous.until > now()
              ? previous
              : { count: 0, until: now() + 15 * 60 * 1000 };
          record.count++;
          attempts.set(key, record);
          if (attempts.size > 1000)
            for (const [old, value] of attempts)
              if (value.until < now()) attempts.delete(old);
          throw apiError(401, "Email, username, or password is incorrect.");
        }
        const username = user.username;
        attempts.delete(key);
        if (store.clearAuthAttempt)
          await store.clearAuthAttempt(persistentAttemptKey);
        const token = crypto.randomBytes(32).toString("base64url"),
          csrf = crypto.randomBytes(24).toString("base64url");
        for (const [key, value] of sessions)
          if (value.expires < now()) sessions.delete(key);
        if (sessions.size >= 1000)
          sessions.delete(sessions.keys().next().value);
        await saveSession(hashToken(token), {
          passwordHash: user.hash,
          username,
          csrf,
          expires: now() + 8 * 60 * 60 * 1000,
        });
        const secure = publicOrigin.startsWith("https:") ? "; Secure" : "";
        send(
          res,
          200,
          {
            user: {
              username,
              role: user.role,
              projects: user.projects,
              organizationId:
                user.organizationId || UserManagement.ORGANIZATION_ID,
            },
            csrf,
          },
          {
            "Set-Cookie": `tomatoes_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`,
          },
        );
        return true;
      }
      if (
        req.method === "POST" &&
        ["/api/forgot-password", "/api/reset-password"].includes(url.pathname)
      ) {
        checkOrigin(req);
        if (!teamMode)
          throw apiError(409, "Password recovery requires sign-in mode.");
        const key = clientAddress(req) + ":" + url.pathname;
        if (
          store.consumeAuthAttempt &&
          !(await store.consumeAuthAttempt(
            hashToken("recovery:" + key),
            10,
            15 * 60 * 1000,
            now(),
          ))
        )
          throw apiError(
            429,
            "Too many recovery attempts. Try again in 15 minutes.",
          );
        for (const [id, attempt] of recoveryAttempts)
          if (attempt.until <= now()) recoveryAttempts.delete(id);
        const attempt = recoveryAttempts.get(key) || {
          count: 0,
          until: now() + 15 * 60 * 1000,
        };
        if (
          attempt.count >= 10 ||
          (!recoveryAttempts.has(key) && recoveryAttempts.size >= 1000)
        )
          throw apiError(
            429,
            "Too many recovery attempts. Try again in 15 minutes.",
          );
        attempt.count++;
        recoveryAttempts.set(key, attempt);
        const body = await bodyJSON(req, 8192);
        if (url.pathname === "/api/forgot-password") {
          if (hosted && !recoverySender)
            throw apiError(
              503,
              "Password recovery email is not configured. Contact your workspace administrator.",
            );
          const email =
            typeof body?.email === "string"
              ? body.email.trim().toLowerCase()
              : "";
          if (
            !email ||
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          )
            throw apiError(400, "Enter a valid account email address.");
          const candidates = (await store.getUsers()).filter(
            (user) => !user.disabled && user.email?.toLowerCase() === email,
          );
          const matches = [];
          for (const user of candidates)
            if (await store.getOrganization(user.organizationId || "default"))
              matches.push(user);
          if (matches.length === 1) {
            const target = matches[0];
            const token = crypto.randomBytes(32).toString("base64url");
            const expires = now() + 15 * 60 * 1000;
            // Keep database token replacement and private inbox delivery in order.
            const delivery = recoveryDeliveryQueue
              .catch(() => {})
              .then(async () => {
                await store.manageUser(target.username, (rows) => {
                  const user = rows.find(
                    (item) => item.username === target.username,
                  );
                  if (
                    !UserManagement.belongsToOrganization(
                      user,
                      target.organizationId || "default",
                    ) ||
                    user.disabled ||
                    user.email?.toLowerCase() !== email
                  )
                    throw apiError(
                      400,
                      "Could not prepare password recovery. Please try again.",
                    );
                  return {
                    ...user,
                    resetHash: hashToken(token),
                    resetExpires: expires,
                  };
                });
                const link =
                  (publicOrigin || "http://" + req.headers.host) +
                  "/#reset-password?token=" +
                  token;
                if (hosted) await recoverySender({ email, link });
                else {
                  const folder = path.join(dataDir, "recovery-inbox");
                  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
                  await writeJSON(
                    path.join(folder, hashToken(email) + ".json"),
                    { email, expires, link },
                  );
                }
              });
            recoveryDeliveryQueue = delivery;
            await delivery;
          }
          send(res, 202, {
            message: hosted
              ? "If an active account matches this email, a password-reset email has been sent. Links expire after 15 minutes."
              : "If an active account matches this email, a reset link is available in the private local recovery inbox. Links expire after 15 minutes.",
            delivery: hosted ? "email" : "local",
          });
          return true;
        }
        if (
          typeof body?.token !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(body.token)
        )
          throw apiError(
            400,
            "This reset link is invalid or expired. Request a new one.",
          );
        let credentials;
        try {
          credentials = hashPassword(body.password);
        } catch (error) {
          throw apiError(400, error.message);
        }
        const digest = hashToken(body.token);
        const target = (await store.getUsers()).find(
          (user) => user.resetHash === digest,
        );
        if (
          !target ||
          !(await store.getOrganization(target.organizationId || "default"))
        )
          throw apiError(
            400,
            "This reset link is invalid or expired. Request a new one.",
          );
        await store.manageUser(target.username, (rows) => {
          const user = rows.find((item) => item.username === target.username);
          if (
            !UserManagement.belongsToOrganization(
              user,
              target.organizationId || "default",
            ) ||
            user.disabled ||
            user.resetHash !== digest ||
            Number(user.resetExpires) <= now()
          )
            throw apiError(
              400,
              "This reset link is invalid or expired. Request a new one.",
            );
          return {
            ...user,
            ...credentials,
            resetHash: null,
            resetExpires: null,
          };
        });
        await revokeSessions(target.username);
        send(
          res,
          200,
          { message: "Password updated. Sign in with your new password." },
          {
            "Set-Cookie":
              "tomatoes_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          },
        );
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/logout") {
        const user = await principal(req);
        canWrite({ ...req, headers: req.headers }, { ...user, role: "editor" });
        if (user.key) await deleteSession(user.key);
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
      if (url.pathname === "/api/organization") {
        if (user.kind === "token")
          throw apiError(403, "CI tokens cannot manage organizations.");
        if (req.method === "GET") {
          send(res, 200, {
            organization: await store.getOrganization(user.organizationId),
            projects: await store.listProjects(
              user.projects,
              user.organizationId,
            ),
            canManage: UserManagement.isGlobalAdmin(user, user.organizationId),
          });
          return true;
        }
        if (req.method !== "PATCH")
          throw apiError(405, "Use GET or PATCH for the current organization.");
        if (!UserManagement.isGlobalAdmin(user, user.organizationId))
          throw apiError(
            403,
            "Only organization admins can update organization settings.",
          );
        canWrite(req, user);
        const body = await bodyJSON(req, 128 * 1024);
        const changes = require("./organization-management").validatePatch(
          body,
        );
        const organization = await store.saveOrganization(
          user.organizationId,
          changes.name,
          false,
          changes.logo,
        );
        send(res, 200, { organization });
        return true;
      }
      if (
        url.pathname === "/api/projects" ||
        url.pathname.startsWith("/api/projects/")
      ) {
        if (user.kind === "token")
          throw apiError(403, "CI tokens cannot manage the project directory.");
        const canManage = UserManagement.isGlobalAdmin(
          user,
          user.organizationId,
        );
        if (req.method === "GET" && url.pathname === "/api/projects") {
          send(res, 200, {
            projects: await store.listProjects(
              user.projects,
              user.organizationId,
            ),
            organization: await store.getOrganization(user.organizationId),
            canManage,
          });
          return true;
        }
        if (!canManage)
          throw apiError(
            403,
            "Only admins with all-project access can create or rename projects.",
          );
        const creating =
          req.method === "POST" && url.pathname === "/api/projects";
        const match = url.pathname.match(
          /^\/api\/projects\/([a-zA-Z0-9][a-zA-Z0-9_.-]{0,79})$/,
        );
        if (!creating && !(req.method === "PATCH" && match))
          throw apiError(
            405,
            "Use POST to create a project or PATCH to rename it.",
          );
        canWrite(req, user);
        const body = await bodyJSON(req, 4096);
        const project = await store.manageProject(
          body,
          creating ? null : match[1],
          now(),
          user.organizationId,
        );
        send(res, creating ? 201 : 200, { project });
        return true;
      }
      if (
        url.pathname === "/api/users" ||
        url.pathname.startsWith("/api/users/")
      ) {
        if (
          user.kind === "token" ||
          !UserManagement.isGlobalAdmin(user, user.organizationId)
        )
          throw apiError(
            403,
            "Only admins with all-project access can manage users.",
          );
        if (req.method === "GET" && url.pathname === "/api/users") {
          send(res, 200, {
            users: (await store.getUsers())
              .filter((row) =>
                UserManagement.belongsToOrganization(row, user.organizationId),
              )
              .map(UserManagement.publicUser),
            organization: await store.getOrganization(user.organizationId),
            projects: await store.listProjects(["*"], user.organizationId),
            roles: UserManagement.roles,
            currentUsername: user.username || null,
            localMode: !teamMode,
          });
          return true;
        }
        if (
          !(url.pathname === "/api/users"
            ? req.method === "POST"
            : ["PUT", "DELETE"].includes(req.method))
        )
          throw apiError(405, "Use GET, POST, PUT, or DELETE for users.");
        canWrite(req, user);
        const creating = req.method === "POST" && url.pathname === "/api/users";
        const username = creating
          ? null
          : decodeURIComponent(url.pathname.slice("/api/users/".length));
        if (!creating && !/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(username))
          throw apiError(400, "Choose a valid username.");
        const body =
          req.method === "DELETE" ? null : await bodyJSON(req, 16384);
        const changes = body
          ? UserManagement.validateUser(body, creating, user.organizationId)
          : null;
        if (
          changes &&
          !creating &&
          body.username !== undefined &&
          body.username !== username
        )
          throw apiError(400, "Usernames cannot be changed.");
        const target = creating ? changes.username : username;
        const credentials = creating ? hashPassword(body.password) : null;
        const availableProjects = new Set(
          (await store.listProjects(["*"], user.organizationId)).map(
            (project) => project.id,
          ),
        );
        if (
          changes &&
          !changes.projects.includes("*") &&
          changes.projects.some((id) => !availableProjects.has(id))
        )
          throw apiError(
            400,
            "Choose projects that belong to the current organization.",
          );
        const saved = await store.manageUser(target, (rows) => {
          if (
            user.kind === "session" &&
            !rows.some(
              (row) =>
                row.username === user.username &&
                UserManagement.isGlobalAdmin(row, user.organizationId),
            )
          )
            throw apiError(
              403,
              "Your user-management access has changed. Sign in again.",
            );
          const previous = rows.find((row) => row.username === target);
          if (
            !creating &&
            (!previous ||
              !UserManagement.belongsToOrganization(
                previous,
                user.organizationId,
              ))
          )
            throw apiError(404, "User not found.");
          if (
            changes?.email &&
            rows.some(
              (row) =>
                row.username !== target &&
                row.email?.toLowerCase() === changes.email.toLowerCase(),
            )
          )
            throw apiError(
              409,
              "This email address is already assigned to an account.",
            );
          if (creating && previous)
            throw apiError(
              409,
              "This username already exists. Restore the account if it is deactivated.",
            );
          const next = creating
            ? { ...changes, ...credentials }
            : req.method === "DELETE"
              ? { ...previous, disabled: true }
              : { ...previous, ...changes, username: target };
          if (
            user.username === target &&
            (next.disabled ||
              next.role !== previous.role ||
              JSON.stringify([...next.projects].sort()) !==
                JSON.stringify([...previous.projects].sort()))
          )
            throw apiError(
              409,
              "You cannot deactivate your own account or change your own access. Ask another administrator.",
            );
          if (
            previous &&
            UserManagement.isGlobalAdmin(previous, user.organizationId) &&
            !UserManagement.isGlobalAdmin(next, user.organizationId) &&
            !rows.some(
              (row) =>
                row.username !== target &&
                UserManagement.isGlobalAdmin(row, user.organizationId),
            )
          )
            throw apiError(
              409,
              "Keep at least one active admin with all-project access.",
            );
          if (next.disabled || next.email !== previous?.email) {
            next.resetHash = null;
            next.resetExpires = null;
          }
          return next;
        });
        if (saved.disabled) await revokeSessions(target);
        send(res, creating ? 201 : 200, {
          user: UserManagement.publicUser(saved),
        });
        return true;
      }
      if (url.pathname === "/api/preferences") {
        if (user.kind === "token")
          throw apiError(403, "CI tokens cannot access user preferences.");
        const owner =
          user.kind === "session" ? "user:" + user.username : "local";
        const profile =
          user.kind === "session" ? user.username : "Local profile";
        if (req.method === "GET") {
          const preferences = await store.getPreferences(owner);
          send(res, 200, {
            preferences: preferences
              ? UserPreferences.withDefaults(preferences)
              : null,
            profile,
            profileId: owner,
            storage: store.kind,
          });
          return true;
        }
        if (req.method === "PUT") {
          // Viewers can manage their own preferences without project write access.
          canWrite(req, { ...user, role: "editor" });
          let patch;
          try {
            patch = UserPreferences.validatePatch(
              await bodyJSON(req, 1024 * 1024),
            );
          } catch (error) {
            throw apiError(error.status || 400, error.message);
          }
          const saved = await store.savePreferences(
            owner,
            patch,
            req.headers["if-none-match"] === "*",
          );
          send(res, 200, {
            preferences: UserPreferences.withDefaults(saved),
            profile,
            profileId: owner,
            storage: store.kind,
          });
          return true;
        }
        throw apiError(405, "Use GET or PUT for preferences.");
      }
      const archiveMatch = url.pathname.match(
        /^\/api\/runs\/([a-f0-9]{64})\/archive$/,
      );
      if (archiveMatch) {
        if (req.method !== "POST")
          throw apiError(405, "Use POST to archive or restore a run.");
        if (user.kind === "token")
          throw apiError(403, "CI tokens cannot archive or restore reports.");
        canWrite(req, user);
        const body = await bodyJSON(req, 1024);
        if (
          !body ||
          typeof body.archived !== "boolean" ||
          Object.keys(body).some((key) => key !== "archived")
        )
          throw apiError(400, "Choose whether to archive or restore this run.");
        const run = await store.setRunArchived(
          archiveMatch[1],
          user.projectScopes,
          body.archived ? now() : null,
        );
        if (!run)
          throw apiError(404, "Report not found in your accessible projects.");
        send(res, 200, { run });
        return true;
      }
      if (req.method === "GET" && url.pathname === "/api/runs") {
        const project = url.searchParams.get("project");
        if (project && !canAccess(user, project))
          throw apiError(403, "This project is outside your access scope.");
        const records = await store.listRuns(user.projectScopes, project);
        send(res, 200, {
          canArchive: user.kind !== "token" && user.role !== "viewer",
          runs: records
            .filter(
              (record) =>
                (!record.archivedAt ||
                  url.searchParams.get("includeArchived") === "1") &&
                canAccess(user, record.metadata.project) &&
                (!project || record.metadata.project === project),
            )
            .sort((a, b) => b.receivedAt - a.receivedAt),
        });
        return true;
      }
      if (req.method === "POST" && url.pathname === "/api/runs") {
        canWrite(req, user);
        const body = await ReportTransfer.unpack(
          await bodyJSON(req, ReportData.MAX_REPORT_BYTES * 2 + 65536),
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
        const id = hashToken(
          ReportData.reportIdentityText(
            text,
            metadata.project,
            metadata.branch,
          ),
        );
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
      const slackMatch = url.pathname.match(
        /^\/api\/runs\/([a-f0-9]{64})\/slack-notification$/,
      );
      if (req.method === "POST" && slackMatch) {
        if (user.kind === "token")
          throw apiError(
            403,
            "Slack import notifications require browser access.",
          );
        canWrite(req, user);
        const body = await bodyJSON(req, 4096);
        if (
          !body ||
          typeof body.eventId !== "string" ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
            body.eventId,
          )
        )
          throw apiError(400, "Use a valid import event identifier.");
        const saved = await store.getRun(slackMatch[1], user.projectScopes);
        if (!saved)
          throw apiError(404, "Report not found in your accessible projects.");
        if (!slackNotifier?.enabled) {
          send(res, 200, { status: "disabled" });
          return true;
        }
        const normalized = ReportData.parseReportText(
          saved.originalText || JSON.stringify(saved.report),
        );
        try {
          const result = await slackNotifier.notify({
            eventId: body.eventId,
            record: saved.record,
            report: normalized,
            origin: publicOrigin || "http://" + req.headers.host,
            owner: user.username || "local",
          });
          send(res, 200, result);
        } catch (error) {
          throw apiError(error.status || 502, error.message);
        }
        return true;
      }
      const evidenceMatch = url.pathname.match(
        /^\/api\/runs\/([0-9a-f]{64})\/evidence(?:\/([0-9a-f]{64}))?$/,
      );
      if (evidenceMatch) {
        const saved = await store.getRun(evidenceMatch[1], user.projectScopes);
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
          const storedBytes = store.getEvidenceContent
            ? await store.getEvidenceContent(record.id)
            : null;
          if (hosted && !storedBytes)
            throw apiError(
              404,
              "This attachment must be migrated from local storage before it can be opened here.",
            );
          const bytes =
            storedBytes ||
            (await fs.readFile(
              path.join(dataDir, "attachments", record.id + ".bin"),
            ));
          if (bytes.length > maxRequestBytes)
            throw apiError(
              413,
              "This attachment exceeds the hosted download limit.",
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
          if (store.kind === "postgres")
            await store.saveEvidence(record, bytes);
          else {
            if (hosted)
              throw apiError(
                503,
                "Hosted attachments require PostgreSQL storage.",
              );
            const destination = path.join(dataDir, "attachments", id + ".bin");
            await fs.mkdir(path.dirname(destination), { recursive: true });
            try {
              await fs.writeFile(destination, bytes, {
                flag: "wx",
                mode: 0o600,
              });
            } catch (error) {
              if (error.code !== "EEXIST") throw error;
            }
            await store.saveEvidence(record);
          }
          send(res, 201, { evidence: record });
          return true;
        }
        throw apiError(404, "Attachment endpoint not found.");
      }
      const transferMatch = url.pathname.match(
        /^\/api\/runs\/([0-9a-f]{64})\/source$/,
      );
      if (req.method === "GET" && transferMatch) {
        const id = transferMatch[1];
        if (url.searchParams.has("offset")) {
          const rawOffset = url.searchParams.get("offset");
          const offset = Number(rawOffset);
          if (
            !/^(0|[1-9][0-9]*)$/.test(rawOffset) ||
            !Number.isSafeInteger(offset) ||
            offset >= ReportData.MAX_REPORT_BYTES ||
            offset % ReportTransfer.CHUNK_BYTES !== 0
          )
            throw apiError(400, "Invalid report chunk offset.");
          const part = await store.getRunSourceChunk(
            id,
            user.projectScopes,
            offset,
            ReportTransfer.CHUNK_BYTES,
          );
          if (!part)
            throw apiError(
              404,
              "Report not found in your accessible projects.",
            );
          if (offset >= part.totalBytes)
            throw apiError(416, "Report chunk is outside the file.");
          send(res, 200, {
            offset,
            totalBytes: part.totalBytes,
            data: part.bytes.toString("base64"),
          });
        } else {
          const saved = await store.getRunSource(id, user.projectScopes);
          if (!saved)
            throw apiError(
              404,
              "Report not found in your accessible projects.",
            );
          send(
            res,
            200,
            await ReportTransfer.transfer(
              saved,
              hosted ? maxRequestBytes : 4 * 1024 * 1024,
            ),
          );
        }
        return true;
      }
      const match = url.pathname.match(/^\/api\/runs\/([0-9a-f]{64})$/);
      if (req.method === "GET" && match) {
        const saved = await store.getRun(match[1], user.projectScopes);
        if (!saved)
          throw apiError(404, "Report not found in your accessible projects.");
        const payload = {
          run: saved.record,
          report: saved.report,
          originalText: saved.originalText || JSON.stringify(saved.report),
        };
        // Keep the original JSON once when the duplicate would exceed hosting limits.
        if (
          hosted &&
          Buffer.byteLength(JSON.stringify(payload)) > maxRequestBytes
        )
          delete payload.report;
        send(res, 200, payload);
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
