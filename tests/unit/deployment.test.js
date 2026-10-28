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
