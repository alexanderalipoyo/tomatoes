const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  createTeamService,
  hashPassword,
  hashToken,
  writeJSON,
} = require("../../src/server/team-service");
const ReportData = require("../../src/shared/report-data");
const Features = require("../../src/shared/report-features");
const { createHistory } = require("../../src/client/import-history");
const { IDBFactory } = require("fake-indexeddb");
const { webcrypto } = require("node:crypto");
const fixture = () => ({
  stats: {
    tests: 1,
    passes: 1,
    failures: 0,
    pending: 0,
    skipped: 0,
    duration: 100,
    start: "2026-10-23T00:00:00Z",
    end: "2026-10-23T00:00:01Z",
  },
  results: [
    {
      file: "example.cy.ts",
      tests: [{ title: "works", state: "passed", duration: 10 }],
      suites: [],
    },
  ],
});
async function serviceFixture(t, options = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tomatoes-test-"));
  const service = createTeamService({ dataDir, ...options });
  const server = http.createServer(async (req, res) => {
    if (
      !(await service.handle(req, res, new URL(req.url, "http://localhost")))
    ) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    const resolved = path.resolve(dataDir);
    if (
      !resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
      !path.basename(resolved).startsWith("tomatoes-test-")
    )
      throw new Error("Unsafe test cleanup path");
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return {
    dataDir,
    origin,
    request: async (route, options = {}) => {
      const response = await fetch(origin + route, {
        ...options,
        headers: { "Content-Type": "application/json", ...options.headers },
      });
      return {
        status: response.status,
        headers: response.headers,
        body: await response.json(),
      };
    },
  };
}
test("retry evidence confirms only a failed attempt followed by a final passing attempt", () => {
  const raw = fixture();
  raw.results[0].tests[0].attempts = [
    { state: "failed", duration: 20, error: { message: "timeout" } },
    { state: "passed", wallClockDuration: 10 },
  ];
  const report = ReportData.parseReportText(JSON.stringify(raw));
  const evidence = ReportData.retryStats(report);
  assert.equal(evidence.retried, 1);
  assert.equal(evidence.confirmed.length, 1);
  assert.equal(report.tests[0].attempts[0].error, "timeout");
  raw.results[0].tests[0].state = "failed";
  assert.equal(
    ReportData.retryStats(ReportData.normalizeReport(raw)).confirmed.length,
    0,
  );
  raw.results[0].tests[0].attempts = [{ state: "failed" }, { state: "failed" }];
  assert.equal(
    ReportData.retryStats(ReportData.normalizeReport(raw)).confirmed.length,
    0,
  );
  raw.results[0].tests[0].attempts = [{ state: "success" }];
  assert.throws(
    () => ReportData.parseReportText(JSON.stringify(raw)),
    /recognized state/,
  );
  assert.equal(
    ReportData.retryStats(ReportData.normalizeReport(fixture())).withEvidence,
    0,
  );
});
test("run metadata validates project names and build URLs without treating them as executable content", () => {
  const raw = fixture();
  raw.tomatoes = {
    project: "tomatoes-web",
    environment: "staging",
    branch: "feature/a",
    commit: "abc123",
    buildUrl: "https://ci.example/run/1",
  };
  const report = ReportData.parseReportText(JSON.stringify(raw));
  assert.equal(report.metadata.branch, "feature/a");
  for (const buildUrl of [
    "javascript:alert(1)",
    "data:text/html,x",
    "https://user:secret@example.com",
  ])
    assert.throws(() => ReportData.normalizeMetadata({ buildUrl }), /URL/);
  assert.throws(
    () => ReportData.normalizeMetadata({ project: "../../outside" }),
    /Project/,
  );
  assert.throws(() => ReportData.normalizeMetadata([]), /object/);
});
test("evidence validates signatures as well as type and size", async () => {
  const png = new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    "test.png",
    { type: "image/png" },
  );
  assert.equal((await Features.validateEvidence(png)).extension, "png");
  await assert.rejects(
    Features.validateEvidence(
      new File(["<svg/>"], "fake.png", { type: "image/png" }),
    ),
    /content/,
  );
  await assert.rejects(
    Features.validateEvidence(
      new File(["<svg/>"], "script.svg", { type: "image/svg+xml" }),
    ),
    /Choose/,
  );
  await assert.rejects(
    Features.validateEvidence(new File([], "empty.png", { type: "image/png" })),
    /between/,
  );
  await assert.rejects(
    Features.validateEvidence({ type: "image/png", size: 26 * 1024 * 1024 }),
    /25 MB/,
  );
});
test("metadata and evidence persist with a browser import and do not change the original JSON", async () => {
  const history = createHistory({
    indexedDB: new IDBFactory(),
    crypto: webcrypto,
  });
  const raw = fixture(),
    text = JSON.stringify(raw);
  const entry = await history.save({
    text,
    name: "test.json",
    report: ReportData.normalizeReport(raw),
  });
  await history.updateMetadata(
    entry.id,
    ReportData.normalizeMetadata({ project: "web", branch: "main" }),
  );
  await history.saveEvidence({
    id: "evidence-test",
    runId: entry.id,
    testKey: "key",
    blob: new Blob(["image-bytes"]),
    name: "screenshot.png",
    type: "image/png",
  });
  const restored = await history.get(entry.id);
  assert.equal(restored.text, text);
  assert.equal(restored.entry.metadata.project, "web");
  const evidence = await history.listEvidence(entry.id, "key");
  assert.equal(evidence.length, 1);
  assert.equal(await evidence[0].blob.text(), "image-bytes");
  assert.equal((await history.listEvidence(entry.id, "other")).length, 0);
  await history.close();
});
test("browser history upgrades v1 without deleting earlier imports", async () => {
  const indexedDB = new IDBFactory();
  await new Promise((resolve, reject) => {
    const request = indexedDB.open("migration", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("entries", { keyPath: "id" });
      request.result.createObjectStore("reports", { keyPath: "id" });
      request.result.createObjectStore("preferences");
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["entries", "reports"], "readwrite");
      tx.objectStore("entries").put({
        id: "legacy",
        name: "old.json",
        lastImportedAt: 1,
      });
      tx.objectStore("reports").put({ id: "legacy", text: "{}" });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
    request.onerror = () => reject(request.error);
  });
  const history = createHistory({
    indexedDB,
    crypto: webcrypto,
    name: "migration",
  });
  assert.equal((await history.get("legacy")).entry.name, "old.json");
  await history.saveEvidence({
    id: "new",
    runId: "legacy",
    testKey: "test",
    blob: new Blob(["x"]),
  });
  assert.equal((await history.listEvidence("legacy", "test")).length, 1);
  await history.close();
});
test("CI uploads require a valid project-scoped token and reports survive service restart", async (t) => {
  const api = await serviceFixture(t, {
    ciToken: "test-token-only",
    ciProject: "web",
  });
  const payload = {
    report: fixture(),
    metadata: { project: "web", branch: "main" },
    name: "report.json",
  };
  assert.equal(
    (
      await api.request("/api/runs", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
        body: JSON.stringify(payload),
      })
    ).status,
    401,
  );
  const uploaded = await api.request("/api/runs", {
    method: "POST",
    headers: { Authorization: "Bearer test-token-only" },
    body: JSON.stringify(payload),
  });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.run.metadata.project, "web");
  assert.equal(
    (
      await api.request("/api/runs", {
        method: "POST",
        headers: { Authorization: "Bearer test-token-only" },
        body: JSON.stringify({ ...payload, metadata: { project: "other" } }),
      })
    ).status,
    403,
  );
  const duplicate = await api.request("/api/runs", {
    method: "POST",
    headers: { Authorization: "Bearer test-token-only" },
    body: JSON.stringify(payload),
  });
  assert.equal(duplicate.body.run.id, uploaded.body.run.id);
  assert.equal((await api.request("/api/runs")).body.runs.length, 1);
  const stored = JSON.parse(
    await fs.readFile(
      path.join(api.dataDir, "reports", uploaded.body.run.id + ".json"),
      "utf8",
    ),
  );
  assert.equal(stored.stats.tests, 1);
  const reopened = createTeamService({ dataDir: api.dataDir });
  let result;
  const req = {
    method: "GET",
    headers: { host: "127.0.0.1:3000" },
    url: "/api/runs",
  };
  const res = {
    writeHead(status) {
      assert.equal(status, 200);
    },
    end(value) {
      result = JSON.parse(value);
    },
  };
  await reopened.handle(req, res, new URL("http://127.0.0.1/api/runs"));
  assert.equal(result.runs.length, 1);
});
test("local browser publishing checks origin and rejects invalid reports and host headers", async (t) => {
  const api = await serviceFixture(t);
  const body = JSON.stringify({
    report: fixture(),
    metadata: { project: "web" },
  });
  assert.equal(
    (await api.request("/api/runs", { method: "POST", body })).status,
    403,
  );
  assert.equal(
    (
      await api.request("/api/runs", {
        method: "POST",
        headers: { Origin: "https://untrusted.example" },
        body,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api.request("/api/runs", {
        method: "POST",
        headers: { Origin: api.origin },
        body,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await api.request("/api/runs", {
        method: "POST",
        headers: { Origin: api.origin },
        body: '{"report":{}}',
      })
    ).status,
    400,
  );
  const hostileStatus = await new Promise((resolve, reject) => {
    const request = http.get(
      new URL("/api/runs", api.origin),
      { headers: { Host: "untrusted.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
  });
  assert.equal(hostileStatus, 403);
  assert.equal(
    (
      await api.request("/api/runs", {
        method: "POST",
        headers: { Origin: api.origin },
        body: JSON.stringify({
          report: fixture(),
          metadata: { buildUrl: "javascript:x" },
        }),
      })
    ).status,
    400,
  );
});
test("team sessions enforce sign-in, CSRF, project scope, read-only roles, and logout", async (t) => {
  const api = await serviceFixture(t, {
    teamMode: true,
    ciToken: "test-ci-scope",
    ciProject: "secret",
  });
  await writeJSON(path.join(api.dataDir, "users.json"), [
    {
      username: "reader",
      role: "viewer",
      projects: ["web"],
      ...hashPassword("test-password-123"),
    },
    {
      username: "editor",
      role: "editor",
      projects: ["web"],
      ...hashPassword("test-password-456"),
    },
  ]);
  assert.equal((await api.request("/api/runs")).status, 401);
  const secret = await api.request("/api/runs", {
    method: "POST",
    headers: { Authorization: "Bearer test-ci-scope" },
    body: JSON.stringify({
      report: fixture(),
      metadata: { project: "secret" },
    }),
  });
  assert.equal(secret.status, 201);
  const login = await api.request("/api/login", {
    method: "POST",
    headers: { Origin: api.origin },
    body: JSON.stringify({ username: "reader", password: "test-password-123" }),
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await api.request("/api/team/status", { headers: { Cookie: cookie } }))
      .body.authenticated,
    true,
  );
  assert.equal(
    (await api.request("/api/runs", { headers: { Cookie: cookie } })).body.runs
      .length,
    0,
  );
  assert.equal(
    (
      await api.request("/api/runs/" + secret.body.run.id, {
        headers: { Cookie: cookie },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await api.request("/api/runs", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: api.origin,
          "X-CSRF-Token": login.body.csrf,
        },
        body: JSON.stringify({
          report: fixture(),
          metadata: { project: "web" },
        }),
      })
    ).status,
    403,
  );
  const editor = await api.request("/api/login", {
    method: "POST",
    headers: { Origin: api.origin },
    body: JSON.stringify({ username: "editor", password: "test-password-456" }),
  });
  const editorCookie = editor.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (
      await api.request("/api/runs", {
        method: "POST",
        headers: { Cookie: editorCookie, Origin: api.origin },
        body: JSON.stringify({
          report: fixture(),
          metadata: { project: "web" },
        }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api.request("/api/runs", {
        method: "POST",
        headers: {
          Cookie: editorCookie,
          Origin: api.origin,
          "X-CSRF-Token": editor.body.csrf,
        },
        body: JSON.stringify({
          report: fixture(),
          metadata: { project: "web" },
        }),
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await api.request("/api/logout", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: api.origin,
          "X-CSRF-Token": login.body.csrf,
        },
        body: "{}",
      })
    ).status,
    200,
  );
  assert.equal(
    (await api.request("/api/runs", { headers: { Cookie: cookie } })).status,
    401,
  );
});
test("sign-in attempts are rate limited and session expiry is enforced", async (t) => {
  let clock = Date.now();
  const api = await serviceFixture(t, { teamMode: true, now: () => clock });
  await writeJSON(path.join(api.dataDir, "users.json"), [
    {
      username: "alex",
      role: "editor",
      projects: ["web"],
      ...hashPassword("test-password-123"),
    },
  ]);
  for (let index = 0; index < 5; index++)
    assert.equal(
      (
        await api.request("/api/login", {
          method: "POST",
          headers: { Origin: api.origin },
          body: JSON.stringify({ username: "alex", password: "wrong" }),
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await api.request("/api/login", {
        method: "POST",
        headers: { Origin: api.origin },
        body: JSON.stringify({
          username: "alex",
          password: "test-password-123",
        }),
      })
    ).status,
    429,
  );
  clock += 16 * 60 * 1000;
  const login = await api.request("/api/login", {
    method: "POST",
    headers: { Origin: api.origin },
    body: JSON.stringify({ username: "alex", password: "test-password-123" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  clock += 9 * 60 * 60 * 1000;
  assert.equal(
    (await api.request("/api/runs", { headers: { Cookie: cookie } })).status,
    401,
  );
});
test("run summary escapes report text and includes identity and outcome totals", () => {
  const report = ReportData.normalizeReport(fixture());
  report.metadata = ReportData.normalizeMetadata({
    project: "web",
    branch: "feature/[safe]",
  });
  const markdown = Features.markdownSummary(report, "<report>.json");
  assert.match(markdown, /web/);
  assert.ok(!markdown.includes("<report>"));
  assert.match(markdown, /\| 1 \| 1 \| 0 \| 0 \| 0 \|/);
});

test("publisher validates and uploads a real file while preserving report metadata", async (t) => {
  const { publishReport } = require("../../scripts/publish-report");
  const api = await serviceFixture(t, {
    ciToken: "publisher-test-token",
    ciProject: "web",
  });
  const raw = fixture();
  raw.tomatoes = {
    project: "web",
    branch: "feature/report",
    environment: "local",
  };
  const file = path.join(api.dataDir, "publisher-fixture.json");
  await fs.writeFile(file, JSON.stringify(raw));
  assert.equal((await publishReport({ file, dryRun: true })).valid, true);
  const uploaded = await publishReport({
    file,
    url: api.origin,
    token: "publisher-test-token",
    metadata: { commit: "abc123" },
  });
  assert.equal(uploaded.run.metadata.project, "web");
  assert.equal(uploaded.run.metadata.branch, "feature/report");
  assert.equal(uploaded.run.metadata.commit, "abc123");
  const stored = await api.request("/api/runs/" + uploaded.run.id);
  assert.equal(stored.body.report.tomatoes.environment, "local");
  await fs.writeFile(file, '{"unrelated":true}');
  await assert.rejects(() =>
    publishReport({ file, url: api.origin, token: "publisher-test-token" }),
  );
  assert.equal((await api.request("/api/runs")).body.runs.length, 1);
});

test("local preferences persist, merge sections, and reject invalid or cross-origin updates", async (t) => {
  const api = await serviceFixture(t);
  const put = (body, headers = {}) =>
    api.request("/api/preferences", {
      method: "PUT",
      headers: { Origin: api.origin, ...headers },
      body: JSON.stringify(body),
    });
  assert.equal((await api.request("/api/preferences")).body.preferences, null);
  assert.equal(
    (await put({ display: { timeZone: "UTC", rows: 30 } })).status,
    200,
  );
  const dashboardGroups = [
    {
      id: "admin",
      name: "Admin",
      paths: ["cypress/admin"],
      metrics: ["passRate"],
    },
  ];
  assert.equal((await put({ dashboardGroups })).status, 200);
  const saved = (await api.request("/api/preferences")).body;
  assert.equal(saved.profileId, "local");
  assert.equal(saved.preferences.display.rows, 30);
  assert.equal(saved.preferences.dashboardGroups.length, 1);
  const reopened =
    require("../../src/server/storage/file-store").createFileStore(api.dataDir);
  assert.equal(
    (await reopened.getPreferences("local")).display.timeZone,
    "UTC",
  );
  assert.equal(
    (
      await put(
        { display: { timeZone: "UTC", rows: 100 } },
        { "If-None-Match": "*" },
      )
    ).body.preferences.display.rows,
    30,
  );
  assert.equal((await put({ owner: "other" })).status, 400);
  assert.equal(
    (await put({ display: { timeZone: "UTC", rows: 500 } })).status,
    400,
  );
  assert.equal(
    (
      await put(
        { dashboardGroups: [] },
        { Origin: "https://untrusted.example" },
      )
    ).status,
    403,
  );
});

test("Slack notifications use the saved report, require origin checks, and are not sent on upload or read", async (t) => {
  const { createSlackNotifier } = require("../../src/server/slack-notifier");
  const delivered = [];
  const notifier = createSlackNotifier({
    webhookURL: "https://hooks.slack.com/services/TTEST/BTEST/fakeToken",
    fetchImpl: async (_, options) => {
      delivered.push(JSON.parse(options.body));
      return new Response("ok");
    },
  });
  const api = await serviceFixture(t, { slackNotifier: notifier });
  const uploaded = await api.request("/api/runs", {
    method: "POST",
    headers: { Origin: api.origin },
    body: JSON.stringify({ report: fixture(), name: "import.json" }),
  });
  const id = uploaded.body.run.id;
  await api.request("/api/runs/" + id);
  assert.equal(delivered.length, 0);
  const route = `/api/runs/${id}/slack-notification`;
  const body = JSON.stringify({
    eventId: "12345678-1234-4234-8234-123456789012",
    counts: { failed: 999 },
  });
  assert.equal(
    (
      await api.request(route, {
        method: "POST",
        body,
        headers: { Origin: "https://untrusted.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api.request(route, {
        method: "POST",
        body: JSON.stringify({ eventId: "invalid" }),
        headers: { Origin: api.origin },
      })
    ).status,
    400,
  );
  const result = await api.request(route, {
    method: "POST",
    body,
    headers: { Origin: api.origin },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "sent");
  assert.match(delivered[0].text, /0 failed, 1 passed/);
  assert.doesNotMatch(delivered[0].text, /999/);
  await api.request(route, {
    method: "POST",
    body,
    headers: { Origin: api.origin },
  });
  assert.equal(delivered.length, 1);
  assert.equal(
    (
      await api.request(`/api/runs/${"0".repeat(64)}/slack-notification`, {
        method: "POST",
        body,
        headers: { Origin: api.origin },
      })
    ).status,
    404,
  );
});

test("Slack delivery respects signed-in roles, project scope, CSRF, and rejects CI tokens", async (t) => {
  let deliveries = 0;
  const notifier = {
    enabled: true,
    notify: async () => {
      deliveries++;
      return { status: "sent" };
    },
  };
  const api = await serviceFixture(t, {
    teamMode: true,
    ciToken: "slack-fixture-token",
    ciProject: "web",
    slackNotifier: notifier,
  });
  await writeJSON(path.join(api.dataDir, "users.json"), [
    {
      username: "editor",
      role: "editor",
      projects: ["web"],
      ...hashPassword("fixture-test-password"),
    },
    {
      username: "viewer",
      role: "viewer",
      projects: ["web"],
      ...hashPassword("fixture-test-password"),
    },
    {
      username: "outside",
      role: "editor",
      projects: ["other"],
      ...hashPassword("fixture-test-password"),
    },
  ]);
  const upload = await api.request("/api/runs", {
    method: "POST",
    headers: { Authorization: "Bearer slack-fixture-token" },
    body: JSON.stringify({ report: fixture(), metadata: { project: "web" } }),
  });
  const route = `/api/runs/${upload.body.run.id}/slack-notification`;
  const body = JSON.stringify({
    eventId: "22345678-1234-4234-8234-123456789012",
  });
  assert.equal(
    (
      await api.request(route, {
        method: "POST",
        body,
        headers: { Authorization: "Bearer slack-fixture-token" },
      })
    ).status,
    403,
  );
  async function login(username) {
    const value = await api.request("/api/login", {
      method: "POST",
      headers: { Origin: api.origin },
      body: JSON.stringify({ username, password: "fixture-test-password" }),
    });
    return {
      Origin: api.origin,
      Cookie: value.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": value.body.csrf,
    };
  }
  const viewer = await login("viewer"),
    outside = await login("outside"),
    editor = await login("editor");
  assert.equal(
    (await api.request(route, { method: "POST", body, headers: viewer }))
      .status,
    403,
  );
  assert.equal(
    (await api.request(route, { method: "POST", body, headers: outside }))
      .status,
    404,
  );
  assert.equal(
    (
      await api.request(route, {
        method: "POST",
        body,
        headers: { ...editor, "X-CSRF-Token": "wrong" },
      })
    ).status,
    403,
  );
  assert.equal(deliveries, 0);
  assert.equal(
    (await api.request(route, { method: "POST", body, headers: editor }))
      .status,
    200,
  );
  assert.equal(deliveries, 1);
});
