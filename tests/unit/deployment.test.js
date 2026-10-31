const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { build } = require("../../scripts/build");
const { PROJECT_ROOT } = require("../../src/server/config");
const { createServerlessHandler } = require("../../api/server");
const { createRecoverySender } = require("../../src/server/recovery-email");
function response() {
  return {
    headersSent: false,
    writableEnded: false,
    writeHead(status) {
      this.status = status;
      this.headersSent = true;
    },
    end(body) {
      this.body = body;
      this.writableEnded = true;
    },
  };
}
test("production assets resolve client scripts and exclude private reports, certificates and environment files", async () => {
  const manifest = await build();
  assert.ok(manifest.files.length > 30);
  for (const item of manifest.files) {
    assert.ok(
      !/(^|\/)(?:\.env|\.tomatoes-data|src\/server)|\.(?:crt|pem)$/.test(
        item.path,
      ),
    );
    assert.notEqual(item.path, "results.json");
    assert.equal(item.sha256.length, 64);
  }
  const root = path.join(PROJECT_ROOT, "dist");
  const html = await fs.readFile(path.join(root, "index.html"), "utf8");
  for (const [, url] of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g))
    assert.ok((await fs.stat(path.join(root, url.slice(1)))).isFile(), url);
  assert.ok(html.includes('name="tomatoes-analytics" content="disabled"'));
  await build({
    env: {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_OBSERVABILITY_CLIENT_CONFIG: JSON.stringify({
        analytics: { scriptSrc: "/telemetry/script.js" },
        secret: "private-value",
      }),
    },
  });
  const hosted = await fs.readFile(path.join(root, "index.html"), "utf8");
  const encoded = hosted.match(
    /name="tomatoes-analytics" content="([^"]+)"/,
  )[1];
  const analytics = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  assert.equal(analytics.enabled, true);
  assert.equal(analytics.client.analytics.scriptSrc, "/telemetry/script.js");
  assert.ok(!JSON.stringify(analytics).includes("private-value"));
  await build({ env: { VERCEL: "1", VERCEL_ENV: "preview" } });
  assert.ok(
    (await fs.readFile(path.join(root, "index.html"), "utf8")).includes(
      'name="tomatoes-analytics" content="disabled"',
    ),
  );
  await assert.rejects(() => build({ output: PROJECT_ROOT }), /dist directory/);
  const config = JSON.parse(
    await fs.readFile(path.join(PROJECT_ROOT, "vercel.json"), "utf8"),
  );
  assert.equal(config.outputDirectory, "dist");
  assert.equal(config.functions["api/server.js"].maxDuration, 60);
  assert.ok(config.rewrites.some((rule) => rule.source === "/results.json"));
});
test("serverless rewrites preserve query parameters and retry failed readiness checks without leaking errors", async () => {
  let attempts = 0,
    created = 0;
  const handler = createServerlessHandler(() => {
    created++;
    return {
      store: {
        ready: async () => {
          if (++attempts === 1) throw new Error("private-database-password");
        },
      },
      handler: async (req, res) => {
        res.writeHead(200);
        res.end(req.url);
      },
    };
  });
  let res = response();
  await handler(
    { url: "/api/server?__tomatoes_path=/api/runs&project=web" },
    res,
  );
  assert.equal(res.status, 503);
  assert.ok(!res.body.includes("private-database-password"));
  res = response();
  await handler(
    { url: "/api/server?__tomatoes_path=/api/runs&project=web" },
    res,
  );
  assert.equal(res.status, 200);
  assert.equal(res.body, "/api/runs?project=web");
  assert.equal(created, 1);
  res = response();
  await handler({ url: "/api/server?__tomatoes_path=/.env.production" }, res);
  assert.equal(res.status, 404);
});
test("hosted reset delivery is optional and test requests never send live email", async () => {
  assert.equal(createRecoverySender({}), null);
  let call;
  const sender = createRecoverySender(
    {
      RESEND_API_KEY: "test-key",
      TOMATOES_AUTH_EMAIL_FROM: "reports@example.com",
    },
    {
      request: async (url, options) => {
        call = { url, options };
        return { ok: true };
      },
    },
  );
  await sender({
    email: "test@example.com",
    link: "https://reports.example.com/#reset-password?token=test-only",
  });
  assert.equal(call.url, "https://api.resend.com/emails");
  assert.deepEqual(JSON.parse(call.options.body).to, ["test@example.com"]);
  const rejected = createRecoverySender(
    {
      RESEND_API_KEY: "test-key",
      TOMATOES_AUTH_EMAIL_FROM: "reports@example.com",
    },
    { request: async () => ({ ok: false }) },
  );
  await assert.rejects(
    () => rejected({ email: "test@example.com", link: "https://example.com" }),
    (error) => error.status === 503 && !error.message.includes("test-key"),
  );
});

test("hosted handlers accept platform-parsed JSON, enforce origins and request limits, and set secure cookies", async () => {
  const {
    createTeamService,
    hashPassword,
  } = require("../../src/server/team-service");
  const record = {
    username: "hosted",
    role: "admin",
    projects: ["*"],
    ...hashPassword("test-only-password"),
  };
  const service = createTeamService({
    store: {
      kind: "postgres",
      getUsers: async () => [record],
      getOrganization: async () => ({
        id: "default",
        name: "Test organization",
      }),
      getTokens: async () => [],
    },
    teamMode: true,
    hosted: true,
    publicOrigin: "https://reports.example.com",
    additionalOrigins: ["https://deployment.vercel.app"],
  });
  const request = (host, origin, body) => ({
    method: "POST",
    url: "/api/login",
    headers: { host, origin, "content-type": "application/json" },
    socket: { remoteAddress: "127.0.0.1" },
    body,
  });
  const capture = () => ({
    ...response(),
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
      this.headersSent = true;
    },
  });
  let res = capture();
  await service.handle(
    request("deployment.vercel.app", "https://deployment.vercel.app", {
      username: "hosted",
      password: "test-only-password",
    }),
    res,
    new URL("https://deployment.vercel.app/api/login"),
  );
  assert.equal(res.status, 200);
  assert.match(res.headers["Set-Cookie"], /; Secure/);
  res = capture();
  await service.handle(
    request("deployment.vercel.app", "https://evil.example", {
      username: "hosted",
      password: "test-only-password",
    }),
    res,
    new URL("https://deployment.vercel.app/api/login"),
  );
  assert.equal(res.status, 403);
  res = capture();
  await service.handle(
    request("deployment.vercel.app", "https://deployment.vercel.app", {
      username: "x".repeat(9000),
    }),
    res,
    new URL("https://deployment.vercel.app/api/login"),
  );
  assert.equal(res.status, 413);
});

test("deployment verification catches missing scripts and protected previews", async () => {
  const { checkDeployment } = require("../../scripts/check-deployment");
  const request = async (url) => {
    const route = url.pathname;
    if (route === "/api/team/status")
      return Response.json({ enabled: true, storage: "postgres" });
    if (route === "/build-manifest.json")
      return Response.json({ version: 1, files: [{ path: "js/auth.js" }] });
    return new Response("asset", {
      headers: {
        "content-type": route.endsWith(".js")
          ? "text/javascript"
          : route.endsWith(".css")
            ? "text/css"
            : "text/html",
      },
    });
  };
  const healthy = await checkDeployment("https://example.com", { request });
  assert.deepEqual(healthy.failures, []);
  const missing = await checkDeployment("https://example.com", {
    request: (url) =>
      url.pathname === "/js/auth.js"
        ? new Response("Not found", { status: 404 })
        : request(url),
  });
  assert.deepEqual(missing.failures, ["/js/auth.js: HTTP 404"]);
  const protectedPreview = await checkDeployment("https://example.com", {
    request: async () => new Response(null, { status: 302 }),
  });
  assert.ok(
    protectedPreview.failures.every((failure) =>
      failure.includes("deployment protection"),
    ),
  );
  const htmlFallback = await checkDeployment("https://example.com", {
    request: (url) =>
      url.pathname === "/js/auth.js"
        ? new Response("login", { headers: { "content-type": "text/html" } })
        : request(url),
  });
  assert.ok(
    htmlFallback.failures.some((failure) =>
      failure.includes("expected JavaScript"),
    ),
  );
});

test("startup diagnostics expose setting names and safe hints without secrets", () => {
  const { startupDiagnostic } = require("../../api/server");
  const diagnostic = startupDiagnostic(
    { code: "28P01", message: "secret-password", stack: "private-stack" },
    { VERCEL: "1", PGPASSWORD: "secret-password" },
  );
  assert.equal(diagnostic.code, "28P01");
  assert.ok(diagnostic.missing.includes("PGHOST"));
  assert.ok(diagnostic.missing.includes("TOMATOES_STORAGE=postgres"));
  assert.ok(!JSON.stringify(diagnostic).includes("secret-password"));
  assert.ok(!JSON.stringify(diagnostic).includes("private-stack"));
  assert.equal(
    startupDiagnostic({ code: "private-secret" }, {}).code,
    "STARTUP_FAILED",
  );
});

test("renamed deployment domains require the matching configured origin while other hosts stay blocked", async () => {
  const { createTeamService } = require("../../src/server/team-service");
  const store = { kind: "postgres", getTokens: async () => [] };
  const request = {
    method: "GET",
    headers: { host: "tomatoes-reports.vercel.app" },
  };
  const route = new URL("https://tomatoes-reports.vercel.app/api/team/status");
  const oldService = createTeamService({
    store,
    teamMode: true,
    hosted: true,
    publicOrigin: "https://tomatoes-rho.vercel.app",
  });
  let res = response();
  await oldService.handle(request, res, route);
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, "Unrecognized server host.");
  const corrected = createTeamService({
    store,
    teamMode: true,
    hosted: true,
    publicOrigin: "https://tomatoes-reports.vercel.app",
  });
  res = response();
  await corrected.handle(request, res, route);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).authenticated, false);
  res = response();
  await corrected.handle(
    { ...request, headers: { host: "untrusted.example.com" } },
    res,
    route,
  );
  assert.equal(res.status, 403);
});

test("deployment verification explains an outdated public origin", async () => {
  const { checkDeployment } = require("../../scripts/check-deployment");
  const result = await checkDeployment("https://tomatoes-reports.vercel.app", {
    request: async (url) =>
      url.pathname === "/api/team/status"
        ? Response.json({ error: "Unrecognized server host." }, { status: 403 })
        : new Response("", { status: 404 }),
  });
  assert.ok(
    result.failures.some(
      (message) =>
        message.includes(
          "TOMATOES_PUBLIC_ORIGIN=https://tomatoes-reports.vercel.app",
        ) && message.includes("redeploy"),
    ),
  );
});

test("hosted applications require HTTPS origins and declare HSTS", () => {
  const { createApplication } = require("../../src/server/app");
  assert.throws(
    () =>
      createApplication({
        store: { kind: "postgres" },
        env: {
          VERCEL: "1",
          VERCEL_ENV: "production",
          TOMATOES_TEAM_MODE: "1",
          TOMATOES_PUBLIC_ORIGIN: "http://reports.example.com",
        },
      }),
    /HTTPS/,
  );
  const config = require("../../vercel.json");
  assert.ok(
    config.headers.some((rule) =>
      rule.headers.some(
        (header) =>
          header.key === "Strict-Transport-Security" &&
          header.value.includes("max-age="),
      ),
    ),
  );
});
