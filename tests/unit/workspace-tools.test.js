const test = require("node:test");
const assert = require("node:assert/strict");
const { IDBFactory } = require("fake-indexeddb");
const { webcrypto } = require("node:crypto");
const { createHistory } = require("../../src/client/import-history");
const Workspace = require("../../src/shared/workspace-model");
const ReportData = require("../../src/shared/report-data");
const Features = require("../../src/shared/report-features");
const Investigations = require("../../src/shared/investigation-model");
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
      file: "test.cy.ts",
      suites: [],
      tests: [
        {
          title: "works",
          state: "failed",
          duration: 100,
          err: { message: "Expected 1 to equal 2" },
        },
      ],
    },
  ],
});
const store = () =>
  createHistory({ indexedDB: new IDBFactory(), crypto: webcrypto });
const save = async (history) => {
  const text = JSON.stringify(raw());
  return history.save({
    text,
    name: "report.json",
    report: ReportData.parseReportText(text),
  });
};
async function archive(history) {
  const snapshot = await history.snapshot();
  return {
    format: "tomatoes-backup",
    version: 1,
    entries: snapshot.entries,
    reports: snapshot.reports,
    evidence: await Promise.all(
      snapshot.evidence.map(async ({ blob, ...item }) => ({
        ...item,
        data: Buffer.from(await blob.arrayBuffer()).toString("base64"),
      })),
    ),
  };
}
const validate = (value) =>
  Workspace.validateBackup(value, {
    reportData: ReportData,
    validateEvidence: Features.validateEvidence,
    decode: (value) => new Uint8Array(Buffer.from(value, "base64")),
  });
test("backup restores original JSON, metadata, names, notes, trash, and attachment bytes together", async () => {
  const source = store(),
    entry = await save(source);
  await source.updateDetails(entry.id, {
    label: "Release check",
    notes: "Investigate login",
    deletedAt: Date.now(),
  });
  await source.updateMetadata(entry.id, {
    project: "tomatoes",
    environment: "local",
  });
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  await source.saveEvidence({
    id: entry.id + ":test:attachment",
    runId: entry.id,
    testKey: "test",
    name: "screen.png",
    type: "image/png",
    savedAt: Date.now(),
    blob: new Blob([bytes], { type: "image/png" }),
  });
  const backup = await validate(await archive(source)),
    target = store();
  assert.deepEqual(await target.restoreSnapshot(backup), {
    added: 1,
    skipped: 0,
  });
  assert.equal((await target.list()).length, 0);
  const restored = await target.get(entry.id);
  assert.equal(restored.text, JSON.stringify(raw()));
  assert.equal(restored.entry.label, "Release check");
  assert.equal(restored.entry.notes, "Investigate login");
  assert.equal(restored.entry.metadata.environment, "local");
  assert.deepEqual(
    new Uint8Array(
      await (await target.listEvidence(entry.id, "test"))[0].blob.arrayBuffer(),
    ),
    bytes,
  );
  await target.updateDetails(entry.id, { deletedAt: null });
  assert.equal((await target.list()).length, 1);
  await source.close();
  await target.close();
});
test("restoring a duplicate preserves local edits and original import timestamps", async () => {
  const source = store(),
    entry = await save(source),
    backup = await validate(await archive(source));
  await source.updateDetails(entry.id, {
    label: "Local edit",
    notes: "Keep this note",
  });
  assert.deepEqual(await source.restoreSnapshot(backup), {
    added: 0,
    skipped: 1,
  });
  const updated = (await source.get(entry.id)).entry;
  assert.equal(updated.label, "Local edit");
  assert.equal(updated.notes, "Keep this note");
  assert.equal(updated.importedAt, entry.importedAt);
  await source.close();
});
test("backup validation rejects invalid reports and evidence before storage is changed", async () => {
  const source = store(),
    entry = await save(source),
    original = await archive(source);
  for (const change of [
    (value) => (value.version = 2),
    (value) => value.entries.push(value.entries[0]),
    (value) => (value.entries[0].importedAt = -1),
    (value) => (value.reports[0].text = '{"unrelated":true}'),
    (value) => value.evidence.push({ runId: "missing" }),
  ]) {
    const bad = structuredClone(original);
    change(bad);
    await assert.rejects(() => validate(bad));
  }
  assert.equal((await source.list()).length, 1);
  assert.equal((await source.get(entry.id)).text, JSON.stringify(raw()));
  const bad = structuredClone(original);
  bad.evidence.push({
    id: entry.id + ":bad",
    runId: entry.id,
    testKey: "test",
    name: "fake.png",
    type: "image/png",
    savedAt: Date.now(),
    data: Buffer.from("<script>bad</script>").toString("base64"),
  });
  await assert.rejects(() => validate(bad), /content does not match/);
  await source.close();
});
test("a conflicting report aborts the entire restore transaction", async () => {
  const history = store(),
    entry = await save(history),
    backup = await validate(await archive(history));
  const extra = {
    ...backup.entries[0],
    id: "f".repeat(64),
    label: "Would be new",
  };
  backup.entries.unshift(extra);
  backup.reports.push({ id: extra.id, text: backup.reports[0].text });
  backup.reports.find((item) => item.id === entry.id).text = JSON.stringify({
    ...raw(),
    tomatoes: { project: "different" },
  });
  await assert.rejects(() => history.restoreSnapshot(backup), /conflicts/);
  assert.equal((await history.list()).length, 1);
  assert.equal((await history.get(entry.id)).text, JSON.stringify(raw()));
  await history.close();
});
test("trash is reversible and reimport preserves saved notes while restoring the report", async () => {
  const history = store(),
    entry = await save(history);
  await history.updateDetails(entry.id, {
    notes: "Keep evidence",
    deletedAt: Date.now(),
  });
  assert.equal((await history.list()).length, 0);
  assert.equal((await history.list(true)).length, 1);
  const imported = await save(history);
  assert.equal(imported.notes, "Keep evidence");
  assert.equal(imported.deletedAt, null);
  assert.equal((await history.list()).length, 1);
  await history.close();
});
test("trend filters and comparability isolate missing project, environment, and branch labels", () => {
  const entries = [
    {
      id: "a",
      metadata: { project: "web", environment: "local", branch: "main" },
    },
    {
      id: "b",
      metadata: { project: "web", environment: "staging", branch: "main" },
    },
    { id: "c", metadata: {} },
    {
      id: "d",
      metadata: { project: "web", environment: "local", branch: "feature" },
    },
    {
      id: "e",
      metadata: { project: "web", environment: "local", branch: "main" },
      deletedAt: 1,
    },
  ];
  assert.deepEqual(
    Workspace.filterEntries(entries, {
      project: "web",
      environment: "local",
    }).map((x) => x.id),
    ["a", "d"],
  );
  assert.deepEqual(
    Workspace.filterEntries(entries, { branch: "__unlabelled__" }).map(
      (x) => x.id,
    ),
    ["c"],
  );
  assert.deepEqual(
    Workspace.comparableEntries(entries, entries[0].metadata).map((x) => x.id),
    ["a"],
  );
  assert.deepEqual(
    Workspace.comparableEntries(entries, {}).map((x) => x.id),
    ["c"],
  );
});
test("failure history measures distinct report recurrence and chronological first/last occurrence", () => {
  const failed = ReportData.parseReportText(JSON.stringify(raw()));
  const passing = ReportData.parseReportText(
    JSON.stringify({
      ...raw(),
      stats: { ...raw().stats, passes: 1, failures: 0 },
      results: [
        {
          file: "test.cy.ts",
          suites: [],
          tests: [{ title: "works", state: "passed", duration: 100 }],
        },
      ],
    }),
  );
  const runs = [
    {
      id: "a",
      fingerprint: "one",
      start: "2026-10-21T00:00:00Z",
      report: failed,
    },
    {
      id: "b",
      fingerprint: "two",
      start: "2026-10-23T00:00:00Z",
      report: failed,
    },
    {
      id: "copy",
      fingerprint: "two",
      start: "2026-10-23T00:00:00Z",
      report: failed,
    },
    {
      id: "c",
      fingerprint: "three",
      start: "2026-10-24T00:00:00Z",
      report: passing,
    },
  ];
  const result = Workspace.failureTrends(runs, Investigations);
  assert.equal(result.runs, 3);
  assert.equal(result.patterns[0].runs, 2);
  assert.equal(result.patterns[0].tests, 2);
  assert.equal(result.patterns[0].first, Date.parse(runs[0].start));
  assert.equal(result.patterns[0].last, Date.parse(runs[1].start));
});

test("run fingerprints ignore JSON formatting and test ordering while preserving outcome differences", () => {
  const original = ReportData.parseReportText(JSON.stringify(raw(), null, 2));
  const compact = ReportData.parseReportText(JSON.stringify(raw()));
  assert.equal(
    Workspace.runFingerprint(original),
    Workspace.runFingerprint(compact),
  );
  compact.tests[0].status = "passed";
  assert.notEqual(
    Workspace.runFingerprint(original),
    Workspace.runFingerprint(compact),
  );
});
