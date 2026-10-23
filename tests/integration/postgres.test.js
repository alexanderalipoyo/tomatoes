const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Pool } = require("pg");
const {
  loadLocalEnvironment,
  databaseConfig,
} = require("../../src/server/config");
const {
  createPostgresStore,
  createFileStore,
  schemaName,
} = require("../../src/server/storage/index");
const {
  createTeamService,
  hashPassword,
  hashToken,
} = require("../../src/server/team-service");
const { importFiles } = require("../../scripts/database");
const ReportData = require("../../src/shared/report-data");
const Investigations = require("../../src/shared/investigation-model");
loadLocalEnvironment();
const raw = () => ({
  stats: {
    tests: 1,
    passes: 0,
    failures: 1,
    pending: 0,
    skipped: 0,
    duration: 100,
    start: "2026-10-23T00:00:00Z",
    end: "2026-10-23T00:01:00Z",
  },
  results: [
    {
      file: "example.cy.ts",
      suites: [],
      tests: [
        {
          title: "works",
          state: "failed",
          duration: 100,
          err: { message: "timeout" },
        },
      ],
    },
  ],
});
function record(id = "a".repeat(64)) {
  const report = ReportData.normalizeReport(raw());
  return {
    id,
    name: "report.json",
    label: "Release check",
    notes: "Follow up",
    metadata: { project: "web", environment: "local" },
    receivedAt: 123456,
    importedAt: 123000,
    start: report.start,
    end: report.end,
    status: report.status,
    counts: report.counts,
    duration: report.duration,
    passRate: report.passRate,
  };
}
async function fixture(t, { teamMode = false } = {}) {
  const schema = "tomatoes_test_" + crypto.randomBytes(8).toString("hex");
  const pool = new Pool(databaseConfig());
  const store = createPostgresStore({ pool, schema });
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "tomatoes-pg-test-"));
  let server;
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      if (!/^tomatoes_test_[a-f0-9]{16}$/.test(schema))
        throw new Error("Unsafe test schema cleanup");
      await pool.query(`DROP SCHEMA ${schemaName(schema)} CASCADE`);
    } finally {
      await store.close();
    }
    const resolved = path.resolve(dataDir);
    if (
      !resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
      !path.basename(resolved).startsWith("tomatoes-pg-test-")
    )
      throw new Error("Unsafe test directory cleanup");
    await fs.rm(resolved, { recursive: true, force: true });
  });
  await store.migrate();
  await store.ready();
  const service = createTeamService({ store, dataDir, teamMode });
  server = http.createServer(async (req, res) => {
    if (
      !(await service.handle(req, res, new URL(req.url, "http://localhost")))
    ) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(route, { body, headers = {}, ...options } = {}) {
    const response = await fetch(origin + route, {
      ...options,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json(),
    };
  }
  return { store, pool, schema, dataDir, origin, request };
}
test("real PostgreSQL stores original JSON and notes, enforces project filters, and survives reconnection", async (t) => {
  const { store, pool, schema } = await fixture(t);
  await store.migrate();
  const text = "\uFEFF" + JSON.stringify(raw(), null, 2);
  await store.saveRun(record(), raw(), text);
  await Promise.all(
    Array.from({ length: 5 }, () => store.saveRun(record(), raw(), text)),
  );
  assert.equal((await store.listRuns(["web"])).length, 1);
  assert.equal((await store.listRuns(["other"])).length, 0);
  assert.equal((await store.listRuns(["*"], "web")).length, 1);
  assert.equal((await store.listRuns(["*"], "web' OR 1=1--")).length, 0);
  assert.equal(await store.getRun("a".repeat(64), ["other"]), null);
  const loaded = await store.getRun("a".repeat(64), ["web"]);
  assert.equal(loaded.originalText, text);
  assert.equal(loaded.record.notes, "Follow up");
  assert.equal(loaded.report.stats.tests, 1);
  const reopened = createPostgresStore({
    pool: new Pool(databaseConfig()),
    schema,
  });
  try {
    await reopened.ready();
    assert.equal(
      (await reopened.getRun("a".repeat(64), ["web"])).record.label,
      "Release check",
    );
  } finally {
    await reopened.close();
  }
  assert.equal(
    (
      await pool.query(
        `SELECT count(*)::int AS count FROM ${schemaName(schema)}.schema_migrations`,
      )
    ).rows[0].count,
    2,
  );
});
test("real PostgreSQL APIs enforce token scopes and preserve report text and attachment bytes", async (t) => {
  const api = await fixture(t, { teamMode: true });
  await api.store.addToken({
    hash: hashToken("test-pg-token"),
    project: "web",
    createdAt: new Date().toISOString(),
  });
  const authorization = { Authorization: "Bearer test-pg-token" };
  assert.equal((await api.request("/api/runs")).status, 401);
  const originalText = JSON.stringify(raw(), null, 2);
  const uploaded = await api.request("/api/runs", {
    method: "POST",
    headers: authorization,
    body: {
      reportText: originalText,
      metadata: { project: "web" },
      name: "test.json",
      label: "Release",
      notes: "Keep notes",
      importedAt: 123456,
    },
  });
  assert.equal(uploaded.status, 201);
  const id = uploaded.body.run.id;
  const loaded = await api.request("/api/runs/" + id, {
    headers: authorization,
  });
  assert.equal(loaded.body.originalText, originalText);
  assert.equal(loaded.body.run.notes, "Keep notes");
  assert.equal(
    (
      await api.request("/api/runs", {
        method: "POST",
        headers: authorization,
        body: { report: raw(), metadata: { project: "other" } },
      })
    ).status,
    403,
  );
  const testKey = Investigations.identity(
    ReportData.normalizeReport(raw()).tests[0],
  );
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9GkAAAAASUVORK5CYII=",
    "base64",
  );
  const evidence = await api.request(`/api/runs/${id}/evidence`, {
    method: "POST",
    headers: authorization,
    body: {
      testKey,
      name: "screen.png",
      type: "image/png",
      data: bytes.toString("base64"),
    },
  });
  assert.equal(evidence.status, 201);
  assert.equal(
    (await api.request(`/api/runs/${id}/evidence`, { headers: authorization }))
      .body.evidence.length,
    1,
  );
  const attachment = await fetch(
    `${api.origin}/api/runs/${id}/evidence/${evidence.body.evidence.id}`,
    { headers: authorization },
  );
  assert.deepEqual(Buffer.from(await attachment.arrayBuffer()), bytes);
  assert.equal(
    (
      await api.request(`/api/runs/${id}/evidence`, {
        method: "POST",
        headers: authorization,
        body: {
          testKey: "not-a-test",
          name: "screen.png",
          type: "image/png",
          data: bytes.toString("base64"),
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api.request(`/api/runs/${id}/evidence`, {
        method: "POST",
        headers: authorization,
        body: {
          testKey,
          name: "fake.png",
          type: "image/png",
          data: Buffer.from("<script>x</script>").toString("base64"),
        },
      })
    ).status,
    400,
  );
  await api.store.addToken({
    hash: hashToken("other-pg-token"),
    project: "other",
    createdAt: new Date().toISOString(),
  });
  assert.equal(
    (
      await api.request(`/api/runs/${id}/evidence`, {
        headers: { Authorization: "Bearer other-pg-token" },
      })
    ).status,
    404,
  );
});
test("real PostgreSQL account roles and sessions preserve read-only restrictions", async (t) => {
  const api = await fixture(t, { teamMode: true });
  await api.store.addUser({
    username: "viewer",
    role: "viewer",
    projects: ["web"],
    ...hashPassword("test-password-only"),
  });
  await api.store.saveRun(record(), raw());
  const login = await api.request("/api/login", {
    method: "POST",
    headers: { Origin: api.origin },
    body: { username: "viewer", password: "test-password-only" },
  });
  assert.equal(login.status, 200);
  const headers = {
    Cookie: login.headers.get("set-cookie").split(";")[0],
    Origin: api.origin,
    "X-CSRF-Token": login.body.csrf,
  };
  assert.equal(
    (await api.request("/api/runs", { headers })).body.runs.length,
    1,
  );
  assert.equal(
    (
      await api.request("/api/runs", {
        method: "POST",
        headers,
        body: { report: raw(), metadata: { project: "web" } },
      })
    ).status,
    403,
  );
  assert.equal(
    (await api.request("/api/team/status", { headers })).body.storage,
    "postgres",
  );
});
test("real PostgreSQL file migration is repeatable, preserves sources, and rolls back partial imports", async (t) => {
  const api = await fixture(t);
  const source = createFileStore(api.dataDir);
  const text = JSON.stringify(raw(), null, 2);
  await source.saveRun(record(), raw(), text);
  const attachmentId = "c".repeat(64);
  const attachmentBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  await fs.mkdir(path.join(api.dataDir, "attachments"), { recursive: true });
  await fs.writeFile(
    path.join(api.dataDir, "attachments", attachmentId + ".bin"),
    attachmentBytes,
  );
  await source.saveEvidence({
    id: attachmentId,
    runId: record().id,
    testKey: Investigations.identity(
      ReportData.normalizeReport(raw()).tests[0],
    ),
    name: "screenshot.png",
    type: "image/png",
    savedAt: Date.now(),
  });
  await source.addUser({
    username: "editor",
    role: "editor",
    projects: ["web"],
    ...hashPassword("test-password-only"),
  });
  assert.equal((await importFiles(api.store, api.dataDir)).imported, 1);
  assert.equal((await api.store.listEvidence(record().id)).length, 1);
  assert.equal(
    (await api.store.listEvidence(record().id))[0].contentHash,
    crypto.createHash("sha256").update(attachmentBytes).digest("hex"),
  );
  await api.store.saveRun({ ...record(), notes: "Database edit" }, raw(), text);
  assert.equal((await importFiles(api.store, api.dataDir)).skipped, 1);
  assert.equal(
    (await api.store.getRun(record().id, ["*"])).record.notes,
    "Database edit",
  );
  assert.equal(
    await fs.readFile(
      path.join(api.dataDir, "reports", record().id + ".json"),
      "utf8",
    ),
    text,
  );
  const newRecord = record("b".repeat(64));
  await assert.rejects(() =>
    api.store.importSnapshot({
      runs: [{ record: newRecord, report: raw(), originalText: text }],
      users: [
        {
          username: "invalid",
          role: "invalid",
          projects: ["web"],
          salt: "x",
          hash: "x",
        },
      ],
    }),
  );
  assert.equal(await api.store.getRun(newRecord.id, ["*"]), null);
  assert.equal(
    (await api.store.getUsers()).some((user) => user.username === "invalid"),
    false,
  );
});

test("PostgreSQL preferences isolate accounts, allow viewers' own settings, and enforce CSRF", async (t) => {
  const api = await fixture(t, { teamMode: true });
  for (const username of ["alice", "bob"])
    await api.store.addUser({
      username,
      role: "viewer",
      projects: ["web"],
      ...hashPassword("test-preference-password"),
    });
  await api.store.addToken({
    hash: hashToken("preference-ci-token"),
    project: "web",
    createdAt: new Date().toISOString(),
  });
  assert.equal((await api.request("/api/preferences")).status, 401);
  assert.equal(
    (
      await api.request("/api/preferences", {
        headers: { Authorization: "Bearer preference-ci-token" },
      })
    ).status,
    403,
  );
  async function login(username) {
    const result = await api.request("/api/login", {
      method: "POST",
      headers: { Origin: api.origin },
      body: { username, password: "test-preference-password" },
    });
    return {
      Cookie: result.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": result.body.csrf,
      Origin: api.origin,
    };
  }
  const alice = await login("alice"),
    bob = await login("bob");
  const dashboardGroups = [
    { id: "web", name: "Web", paths: ["cypress/web"], metrics: ["outcomes"] },
  ];
  const saved = await api.request("/api/preferences", {
    method: "PUT",
    headers: alice,
    body: { dashboardGroups, display: { timeZone: "UTC", rows: 30 } },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.profileId, "user:alice");
  assert.equal(
    (await api.request("/api/preferences", { headers: bob })).body.preferences,
    null,
  );
  assert.equal(
    (
      await api.request("/api/preferences", {
        method: "PUT",
        headers: { ...alice, "X-CSRF-Token": "wrong" },
        body: { dashboardGroups: [] },
      })
    ).status,
    403,
  );
  await Promise.all([
    api.store.savePreferences("user:alice", {
      display: { timeZone: "Asia/Singapore", rows: 50 },
    }),
    api.store.savePreferences("user:alice", { dashboardGroups: [] }),
  ]);
  await api.store.savePreferences(
    "user:alice",
    { display: { timeZone: "UTC", rows: 100 } },
    true,
  );
  const own = await api.store.getPreferences("user:alice");
  assert.equal(own.display.rows, 50);
  assert.deepEqual(own.dashboardGroups, []);
  const connection = new Pool(databaseConfig());
  const reopened = createPostgresStore({
    pool: connection,
    schema: api.schema,
  });
  try {
    assert.equal(
      (await reopened.getPreferences("user:alice")).display.rows,
      50,
    );
  } finally {
    await reopened.close();
  }
  await api.store.migrate();
  assert.equal((await api.store.getPreferences("user:alice")).display.rows, 50);
});
