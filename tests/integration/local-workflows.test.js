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
  assert.equal((await put({ appearance: { colorMode: "dark" } })).status, 200);
  assert.equal((await put({ dashboardGroups })).status, 200);
  const saved = (await api.request("/api/preferences")).body;
  assert.equal(saved.profileId, "local");
  assert.equal(saved.preferences.appearance.colorMode, "dark");
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

test("identical report JSON on different branches retains independent browser and server runs", async (t) => {
  const api = await serviceFixture(t);
  const history = createHistory({
    indexedDB: new IDBFactory(),
    crypto: webcrypto,
  });
  const text = JSON.stringify(fixture());
  const ids = [];
  for (const branch of ["main", "feature/a"]) {
    const report = ReportData.parseReportText(text);
    report.metadata = ReportData.normalizeMetadata({ project: "web", branch });
    const local = await history.save({ text, name: "report.json", report });
    const response = await api.request("/api/runs", {
      method: "POST",
      headers: { Origin: api.origin },
      body: JSON.stringify({ reportText: text, metadata: report.metadata }),
    });
    assert.equal(response.status, 201);
    ids.push({ local: local.id, server: response.body.run.id });
    const restored = await history.get(local.id);
    assert.equal(restored.text, text);
    assert.equal(restored.entry.metadata.branch, branch);
    const server = await api.request("/api/runs/" + response.body.run.id);
    assert.equal(server.body.run.metadata.branch, branch);
    assert.equal(server.body.originalText, text);
    const repeat = await history.save({ text, name: "report.json", report });
    assert.equal(repeat.id, local.id);
  }
  assert.notEqual(ids[0].local, ids[1].local);
  assert.notEqual(ids[0].server, ids[1].server);
  assert.equal((await history.list()).length, 2);
  assert.equal((await api.request("/api/runs")).body.runs.length, 2);
});

test("user CRUD retains accounts for restoration, protects the last admin, and never exposes credentials", async (t) => {
  const f = await serviceFixture(t);
  for (const id of ["web", "api"])
    await f.request("/api/projects", {
      method: "POST",
      headers: { Origin: f.origin },
      body: JSON.stringify({ id, name: id }),
    });
  const body = (username, role = "viewer", projects = ["web"]) => ({
    username,
    fullName: "Example User",
    email: `${username}@example.com`,
    role,
    projects,
    disabled: false,
    password: "test-only-password-123",
  });
  const request = (route, method, value, headers = {}) =>
    f.request(route, {
      method,
      headers: { Origin: f.origin, ...headers },
      ...(value ? { body: JSON.stringify(value) } : {}),
    });
  assert.equal(
    (await request("/api/users", "POST", body("reader"))).status,
    201,
  );
  assert.equal(
    (await request("/api/users", "POST", body("reader"))).status,
    409,
  );
  assert.equal(
    (await request("/api/users", "POST", { ...body("bad"), role: "owner" }))
      .status,
    400,
  );
  const directory = await f.request("/api/users");
  assert.equal(directory.body.users.length, 1);
  assert.doesNotMatch(
    JSON.stringify(directory.body),
    /password|salt|hash|test-only/,
  );
  const updated = {
    ...directory.body.users[0],
    fullName: "Updated Name",
    role: "editor",
    projects: ["api"],
  };
  assert.equal(
    (await request("/api/users/reader", "PUT", updated)).status,
    200,
  );
  assert.equal(
    (
      await request("/api/users/reader", "PUT", {
        ...updated,
        username: "renamed",
      })
    ).status,
    400,
  );
  assert.equal((await request("/api/users/reader", "DELETE")).status, 200);
  const disabled = (await f.request("/api/users")).body.users[0];
  assert.equal(disabled.disabled, true);
  assert.deepEqual(disabled.projects, ["api"]);
  assert.equal(
    (
      await request("/api/users/reader", "PUT", {
        ...disabled,
        disabled: false,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/users/reader", "PUT", {
        ...disabled,
        password: "another-password",
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/users", "POST", body("root1", "admin", ["*"]))).status,
    201,
  );
  assert.equal((await request("/api/users/root1", "DELETE")).status, 409);
  assert.equal(
    (await request("/api/users", "POST", body("root2", "admin", ["*"]))).status,
    201,
  );
  const results = await Promise.all([
    request("/api/users/root1", "DELETE"),
    request("/api/users/root2", "DELETE"),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await request("/api/users/missing", "DELETE")).status, 404);
  assert.equal(
    (
      await request("/api/users", "POST", body("cross-site"), {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
});
test("user administration enforces global admin scope, CSRF, self-protection, and deactivation of live sessions", async (t) => {
  const f = await serviceFixture(t, { teamMode: true });
  const password = "test-only-password-123";
  await writeJSON(path.join(f.dataDir, "users.json"), [
    {
      username: "root",
      role: "admin",
      projects: ["*"],
      ...hashPassword(password),
    },
    {
      username: "scoped",
      role: "admin",
      projects: ["web"],
      ...hashPassword(password),
    },
    {
      username: "editor",
      role: "editor",
      projects: ["web"],
      ...hashPassword(password),
    },
    {
      username: "reader",
      role: "viewer",
      projects: ["web"],
      ...hashPassword(password),
    },
  ]);
  const login = async (username) => {
    const result = await f.request("/api/login", {
      method: "POST",
      headers: { Origin: f.origin },
      body: JSON.stringify({ username, password }),
    });
    return {
      Cookie: result.headers.get("set-cookie").split(";")[0],
      Origin: f.origin,
      "X-CSRF-Token": result.body.csrf,
    };
  };
  assert.equal((await f.request("/api/users")).status, 401);
  for (const username of ["scoped", "editor", "reader"])
    assert.equal(
      (await f.request("/api/users", { headers: await login(username) }))
        .status,
      403,
    );
  const root = await login("root");
  const reader = await login("reader");
  assert.equal((await f.request("/api/users", { headers: root })).status, 200);
  const records = (await f.request("/api/users", { headers: root })).body.users;
  const self = records.find((u) => u.username === "root");
  assert.equal(
    (await f.request("/api/users/root", { method: "DELETE", headers: root }))
      .status,
    409,
  );
  assert.equal(
    (
      await f.request("/api/users/root", {
        method: "PUT",
        headers: root,
        body: JSON.stringify({ ...self, role: "viewer" }),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/api/users/reader", {
        method: "DELETE",
        headers: { ...root, "X-CSRF-Token": "bad" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.request("/api/users/reader", { method: "DELETE", headers: root }))
      .status,
    200,
  );
  assert.equal(
    (await f.request("/api/preferences", { headers: reader })).status,
    401,
  );
  assert.equal(
    (
      await f.request("/api/login", {
        method: "POST",
        headers: { Origin: f.origin },
        body: JSON.stringify({ username: "reader", password }),
      })
    ).status,
    401,
  );
  const restored = records.find((u) => u.username === "reader");
  assert.equal(
    (
      await f.request("/api/users/reader", {
        method: "PUT",
        headers: root,
        body: JSON.stringify(restored),
      })
    ).status,
    200,
  );
  const newReader = await login("reader");
  assert.equal(
    (await f.request("/api/preferences", { headers: newReader })).status,
    200,
  );
  assert.equal(
    (await f.request("/api/users", { headers: newReader })).status,
    403,
  );
});

test("email login and local recovery expire old links, consume tokens once, and revoke existing sessions", async (t) => {
  let clock = Date.now();
  const f = await serviceFixture(t, { teamMode: true, now: () => clock });
  const email = "alextest@gmail.com",
    password = "old-test-password-123",
    nextPassword = "new-test-password-456";
  await writeJSON(path.join(f.dataDir, "users.json"), [
    {
      username: "alex",
      fullName: "Alex Ali",
      email,
      role: "admin",
      projects: ["*"],
      ...hashPassword(password),
    },
  ]);
  const post = (route, body, origin = f.origin) =>
    f.request(route, {
      method: "POST",
      headers: { Origin: origin },
      body: JSON.stringify(body),
    });
  const login = await post("/api/login", {
    username: " ALEXTEST@GMAIL.COM ",
    password,
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.username, "alex");
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const known = await post("/api/forgot-password", { email });
  const unknown = await post("/api/forgot-password", {
    email: "unknown@example.com",
  });
  assert.equal(known.status, 202);
  assert.deepEqual(known.body, unknown.body);
  const inbox = path.join(
    f.dataDir,
    "recovery-inbox",
    hashToken(email) + ".json",
  );
  const token = async () =>
    new URLSearchParams(
      JSON.parse(await fs.readFile(inbox, "utf8")).link.split("?")[1],
    ).get("token");
  const old = await token();
  assert.doesNotMatch(JSON.stringify(known.body), new RegExp(old));
  clock += 16 * 60 * 1000;
  assert.equal(
    (await post("/api/reset-password", { token: old, password: nextPassword }))
      .status,
    400,
  );
  assert.equal(
    (await post("/api/forgot-password", { email }, "https://evil.example"))
      .status,
    403,
  );
  await post("/api/forgot-password", { email });
  const replaced = await token();
  await post("/api/forgot-password", { email });
  const current = await token();
  assert.notEqual(current, replaced);
  assert.equal(
    (
      await post("/api/reset-password", {
        token: replaced,
        password: nextPassword,
      })
    ).status,
    400,
  );
  assert.equal(
    (await post("/api/reset-password", { token: current, password: "short" }))
      .status,
    400,
  );
  const attempts = await Promise.all([
    post("/api/reset-password", { token: current, password: nextPassword }),
    post("/api/reset-password", { token: current, password: nextPassword }),
  ]);
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 400]);
  assert.equal(
    (await f.request("/api/preferences", { headers: { Cookie: cookie } }))
      .status,
    401,
  );
  assert.equal((await post("/api/login", { email, password })).status, 401);
  assert.equal(
    (await post("/api/login", { email, password: nextPassword })).status,
    200,
  );
  const stored = JSON.parse(
    await fs.readFile(path.join(f.dataDir, "users.json"), "utf8"),
  )[0];
  assert.equal(stored.resetHash, null);
  assert.notEqual(stored.hash, hashToken(nextPassword));
});
test("password recovery rate limits requests and does not create links for disabled accounts", async (t) => {
  const f = await serviceFixture(t, { teamMode: true });
  await writeJSON(path.join(f.dataDir, "users.json"), [
    {
      username: "alex",
      email: "alextest@gmail.com",
      disabled: true,
      role: "admin",
      projects: ["*"],
      ...hashPassword("test-password-only"),
    },
  ]);
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await f.request("/api/forgot-password", {
          method: "POST",
          headers: { Origin: f.origin },
          body: JSON.stringify({ email: "alextest@gmail.com" }),
        })
      ).status,
      202,
    );
  assert.equal(
    (
      await f.request("/api/forgot-password", {
        method: "POST",
        headers: { Origin: f.origin },
        body: JSON.stringify({ email: "alextest@gmail.com" }),
      })
    ).status,
    429,
  );
  await assert.rejects(() => fs.access(path.join(f.dataDir, "recovery-inbox")));
});

test("concurrent recovery requests leave a usable inbox link and recovery tools reject consumed or replaced links", async (t) => {
  const { readRecoveryLink } = require("../../scripts/password-recovery");
  const f = await serviceFixture(t, { teamMode: true });
  const email = "local-recovery@example.com";
  const usersFile = path.join(f.dataDir, "users.json");
  await writeJSON(usersFile, [
    {
      username: "alex",
      email,
      role: "admin",
      projects: ["*"],
      ...hashPassword("test-password-only"),
    },
  ]);
  const request = () =>
    f.request("/api/forgot-password", {
      method: "POST",
      headers: { Origin: f.origin },
      body: JSON.stringify({ email }),
    });
  const results = await Promise.all(Array.from({ length: 4 }, request));
  assert.ok(results.every((result) => result.status === 202));
  const store = {
    getUsers: async () => JSON.parse(await fs.readFile(usersFile, "utf8")),
  };
  const options = { email, dataDir: f.dataDir, store };
  const link = await readRecoveryLink(options);
  const token = new URLSearchParams(link.split("?")[1]).get("token");
  assert.equal((await store.getUsers())[0].resetHash, hashToken(token));
  await assert.rejects(
    () => readRecoveryLink({ ...options, now: Date.now() + 16 * 60 * 1000 }),
    /expired/,
  );
  await request();
  const next = await readRecoveryLink(options);
  assert.notEqual(next, link);
  const currentToken = new URLSearchParams(next.split("?")[1]).get("token");
  assert.equal(
    (
      await f.request("/api/reset-password", {
        method: "POST",
        headers: { Origin: f.origin },
        body: JSON.stringify({
          token: currentToken,
          password: "new-test-password-only",
        }),
      })
    ).status,
    200,
  );
  await assert.rejects(
    () => readRecoveryLink(options),
    /used, replaced, or revoked/,
  );
});

test("run archiving is reversible, scoped, permission-checked, and survives reimport", async (t) => {
  const f = await serviceFixture(t, {
    teamMode: true,
    ciToken: "test-archive-ci",
    ciProject: "web",
  });
  const password = "test-password-only";
  await writeJSON(path.join(f.dataDir, "users.json"), [
    ...[
      ["editor", "editor", "web"],
      ["reader", "viewer", "web"],
      ["other", "editor", "other"],
    ].map(([username, role, project]) => ({
      username,
      role,
      projects: [project],
      ...hashPassword(password),
    })),
  ]);
  const login = async (username) => {
    const result = await f.request("/api/login", {
      method: "POST",
      headers: { Origin: f.origin },
      body: JSON.stringify({ username, password }),
    });
    return {
      Origin: f.origin,
      Cookie: result.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": result.body.csrf,
    };
  };
  const editor = await login("editor"),
    reader = await login("reader"),
    other = await login("other");
  const payload = {
    report: fixture(),
    metadata: { project: "web", branch: "main" },
    name: "archivable.json",
    reportText: JSON.stringify(fixture(), null, 2),
  };
  const uploaded = await f.request("/api/runs", {
    method: "POST",
    headers: editor,
    body: JSON.stringify(payload),
  });
  assert.equal(uploaded.status, 201);
  const id = uploaded.body.run.id,
    route = `/api/runs/${id}/archive`;
  const change = (headers, archived) =>
    f.request(route, {
      method: "POST",
      headers,
      body: JSON.stringify({ archived }),
    });
  assert.equal((await change(reader, true)).status, 403);
  assert.equal((await change(other, true)).status, 404);
  assert.equal(
    (await change({ ...editor, "X-CSRF-Token": "bad" }, true)).status,
    403,
  );
  assert.equal(
    (await change({ ...editor, Origin: "https://evil.example" }, true)).status,
    403,
  );
  assert.equal(
    (await change({ Authorization: "Bearer test-archive-ci" }, true)).status,
    403,
  );
  assert.equal((await change(editor, "yes")).status, 400);
  assert.equal((await change(editor, true)).status, 200);
  assert.equal(
    (await f.request("/api/runs", { headers: editor })).body.runs.length,
    0,
  );
  assert.equal(
    (await f.request("/api/runs?includeArchived=1", { headers: editor })).body
      .runs.length,
    1,
  );
  const saved = await f.request(`/api/runs/${id}`, { headers: editor });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.originalText, payload.reportText);
  await f.request("/api/runs", {
    method: "POST",
    headers: editor,
    body: JSON.stringify(payload),
  });
  assert.ok(
    (await f.request(`/api/runs/${id}`, { headers: editor })).body.run
      .archivedAt,
  );
  assert.equal((await change(editor, false)).status, 200);
  assert.equal(
    (await f.request("/api/runs", { headers: editor })).body.runs.length,
    1,
  );
  assert.equal(
    (await f.request(`/api/runs/${id}`, { headers: editor })).body.originalText,
    payload.reportText,
  );
});

test("organization admins create and rename durable projects while reports retain stable scope", async (t) => {
  const service = await serviceFixture(t);
  const post = (body) =>
    service.request("/api/projects", {
      method: "POST",
      headers: { Origin: service.origin },
      body: JSON.stringify(body),
    });
  const created = await post({ name: "Customer Portal" });
  assert.equal(created.status, 201);
  const id = created.body.project.id;
  assert.equal((await post({ name: "customer portal" })).status, 409);
  assert.equal((await post({ name: "Mobile app" })).status, 201);
  assert.equal(
    (
      await service.request("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: "No origin" }),
      })
    ).status,
    403,
  );
  const uploaded = await service.request("/api/runs", {
    method: "POST",
    headers: { Origin: service.origin },
    body: JSON.stringify({ report: fixture(), metadata: { project: id } }),
  });
  assert.equal(uploaded.status, 201);
  const renamed = await service.request("/api/projects/" + id, {
    method: "PATCH",
    headers: { Origin: service.origin },
    body: JSON.stringify({ name: "Web Platform" }),
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.project.id, id);
  const run = await service.request("/api/runs/" + uploaded.body.run.id);
  assert.equal(run.body.run.metadata.project, id);
  const { createFileStore } = require("../../src/server/storage");
  const reopened = createFileStore(service.dataDir);
  assert.equal(
    (await reopened.listProjects()).find((row) => row.id === id).name,
    "Web Platform",
  );
  const races = await Promise.all([
    post({ name: "Race" }),
    post({ name: "race" }),
  ]);
  assert.deepEqual(races.map((response) => response.status).sort(), [201, 409]);
  assert.equal(
    (
      await service.request("/api/projects/missing", {
        method: "PATCH",
        headers: { Origin: service.origin },
        body: JSON.stringify({ name: "Absent" }),
      })
    ).status,
    404,
  );
});
test("project directory enforces admin roles, existing scope, CSRF, and CI separation", async (t) => {
  const service = await serviceFixture(t, {
    teamMode: true,
    ciToken: "projects-test-token",
    ciProject: "portal",
  });
  const user = (username, role, projects) => ({
    username,
    fullName: username,
    role,
    projects,
    ...hashPassword("temporary-test-password"),
  });
  await writeJSON(path.join(service.dataDir, "users.json"), [
    user("admin", "admin", ["*"]),
    user("reader", "viewer", ["portal"]),
    user("editor", "editor", ["*"]),
    user("limited", "admin", ["portal"]),
  ]);
  async function signIn(username) {
    const result = await service.request("/api/login", {
      method: "POST",
      headers: { Origin: service.origin },
      body: JSON.stringify({ username, password: "temporary-test-password" }),
    });
    assert.equal(result.status, 200);
    const cookie = result.headers.get("set-cookie").split(";")[0];
    const status = await service.request("/api/team/status", {
      headers: { Cookie: cookie },
    });
    return {
      Cookie: cookie,
      Origin: service.origin,
      "X-CSRF-Token": status.body.csrf,
    };
  }
  const admin = await signIn("admin");
  assert.equal(
    (
      await service.request("/api/projects", {
        method: "POST",
        headers: { Cookie: admin.Cookie, Origin: service.origin },
        body: JSON.stringify({ name: "No CSRF" }),
      })
    ).status,
    403,
  );
  for (const [id, name] of [
    ["portal", "Customer portal"],
    ["private", "Private project"],
  ]) {
    const existing = id === "portal";
    assert.equal(
      (
        await service.request(
          existing ? "/api/projects/portal" : "/api/projects",
          {
            method: existing ? "PATCH" : "POST",
            headers: admin,
            body: JSON.stringify(existing ? { name } : { id, name }),
          },
        )
      ).status,
      existing ? 200 : 201,
    );
  }
  for (const username of ["reader", "editor", "limited"]) {
    const headers = await signIn(username);
    assert.equal(
      (
        await service.request("/api/projects", {
          method: "POST",
          headers,
          body: JSON.stringify({ name: "Forbidden" }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await service.request("/api/projects/portal", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ name: "Forbidden" }),
        })
      ).status,
      403,
    );
  }
  const reader = await signIn("reader"),
    listing = await service.request("/api/projects", { headers: reader });
  assert.equal(listing.body.canManage, false);
  assert.deepEqual(
    listing.body.projects.map((row) => row.id),
    ["portal"],
  );
  assert.equal(
    (
      await service.request("/api/projects", {
        headers: { Authorization: "Bearer projects-test-token" },
      })
    ).status,
    403,
  );
});

test("organization members receive only selected projects and assignment changes affect live sessions", async (t) => {
  const f = await serviceFixture(t);
  const write = (route, body, method = "POST") =>
    f.request(route, {
      method,
      headers: { Origin: f.origin },
      body: JSON.stringify(body),
    });
  for (const id of ["portal", "mobile", "secret"])
    assert.equal((await write("/api/projects", { id, name: id })).status, 201);
  const account = {
    username: "member",
    fullName: "Member",
    email: "member@example.com",
    role: "editor",
    projects: ["portal", "mobile"],
    disabled: false,
    password: "temporary-member-password",
  };
  const created = await write("/api/users", account);
  assert.equal(created.status, 201);
  assert.equal(created.body.user.organizationId, "default");
  assert.equal(
    (
      await write("/api/users", {
        ...account,
        username: "bad",
        email: "bad@example.com",
        projects: ["outside"],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("/api/users", {
        ...account,
        username: "other",
        email: "other@example.com",
        organizationId: "another-organization",
      })
    ).status,
    400,
  );
  const runs = {};
  for (const project of ["portal", "mobile", "secret"])
    runs[project] = (
      await write("/api/runs", { report: fixture(), metadata: { project } })
    ).body.run.id;
  const restricted = await serviceFixture(t, {
    teamMode: true,
    dataDir: f.dataDir,
  });
  const login = await restricted.request("/api/login", {
    method: "POST",
    headers: { Origin: restricted.origin },
    body: JSON.stringify({ username: "member", password: account.password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const headers = { Cookie: cookie };
  const status = await restricted.request("/api/team/status", { headers });
  assert.equal(status.body.user.organizationId, status.body.organization.id);
  const directory = await restricted.request("/api/projects", { headers });
  assert.deepEqual(directory.body.projects.map((item) => item.id).sort(), [
    "mobile",
    "portal",
  ]);
  assert.equal(
    (await restricted.request("/api/runs/" + runs.portal, { headers })).status,
    200,
  );
  assert.equal(
    (await restricted.request("/api/runs/" + runs.secret, { headers })).status,
    404,
  );
  assert.equal(
    (await restricted.request("/api/runs?project=secret", { headers })).status,
    403,
  );
  assert.equal(
    (await restricted.request("/api/runs", { headers })).body.runs.length,
    2,
  );
  assert.equal(
    (
      await restricted.request("/api/runs", {
        method: "POST",
        headers: {
          ...headers,
          Origin: restricted.origin,
          "X-CSRF-Token": status.body.csrf,
        },
        body: JSON.stringify({
          report: fixture(),
          metadata: { project: "secret" },
        }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await write(
        "/api/users/member",
        { ...created.body.user, projects: ["mobile"] },
        "PUT",
      )
    ).status,
    200,
  );
  assert.equal(
    (await restricted.request("/api/runs/" + runs.portal, { headers })).status,
    404,
  );
  assert.equal(
    (await restricted.request("/api/runs/" + runs.mobile, { headers })).status,
    200,
  );
  const usersFile = path.join(f.dataDir, "users.json");
  const records = JSON.parse(await fs.readFile(usersFile, "utf8"));
  records.push({
    username: "outsider",
    fullName: "Other Organization",
    email: "outsider@example.com",
    role: "admin",
    projects: ["*"],
    organizationId: "other",
    ...hashPassword("temporary-outsider-password"),
  });
  await writeJSON(usersFile, records);
  assert.equal(
    (
      await restricted.request("/api/login", {
        method: "POST",
        headers: { Origin: restricted.origin },
        body: JSON.stringify({
          username: "outsider",
          password: "temporary-outsider-password",
        }),
      })
    ).status,
    401,
  );
  assert.ok(
    !(await f.request("/api/users")).body.users.some(
      (item) => item.username === "outsider",
    ),
  );
  assert.equal(
    (
      await write(
        "/api/users/outsider",
        { ...created.body.user, username: "outsider", projects: ["*"] },
        "PUT",
      )
    ).status,
    404,
  );
});

test("bundled report access respects the signed-in user's project scope", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tomatoes-test-"));
  const { createFileStore } = require("../../src/server/storage/index");
  const { createApplication } = require("../../src/server/app");
  const store = createFileStore(dataDir);
  const password = "temporary-sample-password";
  await store.manageUser("sample-viewer", () => ({
    username: "sample-viewer",
    role: "viewer",
    projects: ["unrelated"],
    organizationId: "default",
    ...hashPassword(password),
  }));
  const app = createApplication({
    store,
    env: {
      NODE_ENV: "test",
      TOMATOES_TEAM_MODE: "1",
      TOMATOES_DATA_DIR: dataDir,
    },
  });
  const server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    const resolved = path.resolve(dataDir);
    if (
      !resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
      !path.basename(resolved).startsWith("tomatoes-test-")
    )
      throw new Error("Unsafe test cleanup path");
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(origin + "/api/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ username: "sample-viewer", password }),
  });
  assert.equal(login.status, 200);
  const headers = { Cookie: login.headers.get("set-cookie").split(";")[0] };
  assert.equal(
    (await fetch(origin + "/results.json", { headers })).status,
    403,
  );
  const bundled = ReportData.normalizeReport(
    require("../../examples/reports/results.json"),
  );
  await store.manageUser("sample-viewer", (rows) => ({
    ...rows.find((user) => user.username === "sample-viewer"),
    projects: [bundled.metadata.project || "tomatoes"],
  }));
  assert.equal(
    (await fetch(origin + "/results.json", { headers })).status,
    200,
  );
});
