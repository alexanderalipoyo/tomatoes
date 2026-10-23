const test = require("node:test");
const assert = require("node:assert/strict");
const ReportData = require("../../src/shared/report-data");
const {
  buildSlackMessage,
  createSlackNotifier,
  reportURL,
} = require("../../src/server/slack-notifier");
const record = {
  id: "a".repeat(64),
  name: "report.json",
  metadata: { project: "web" },
};
const raw = () => ({
  stats: {
    tests: 4,
    passes: 1,
    failures: 1,
    pending: 1,
    skipped: 1,
    duration: 1234000,
    start: "2026-10-24T01:00:00Z",
  },
  results: [
    {
      file: "cypress/e2e/admin.cy.js",
      tests: [
        { title: "passes", state: "passed", duration: 10 },
        { title: "fails", state: "failed", duration: 20 },
        { title: "pending", state: "pending" },
        { title: "skipped", state: "skipped" },
      ],
      suites: [],
    },
  ],
});
const sample = () => ReportData.normalizeReport(raw());
const hook = "https://hooks.slack.com/services/TTEST/BTEST/fakeToken";
test("Slack messages use recorded totals and omit invented run, author, branch and build information", () => {
  const value = buildSlackMessage({
    record,
    report: sample(),
    baseURL: "http://localhost:3000",
  });
  const text = JSON.stringify(value);
  assert.match(text, /Failed run/);
  assert.match(text, /no retry evidence/);
  assert.match(text, /25.0%/);
  assert.match(text, /20m 34s/);
  assert.doesNotMatch(text, /GitHub Actions|Alex Ali|Run #|cloud.cypress.io/);
  assert.equal(value.blocks[1].text.text.includes("\n"), true);
  assert.equal(value.unfurl_links, false);
  assert.match(text, /spec=0/);
});
test("flaky counts require explicit failed-then-passed retry records", () => {
  const value = raw();
  value.results[0].tests[0].attempts = [
    { state: "failed" },
    { state: "passed" },
  ];
  const message = buildSlackMessage({
    record,
    report: ReportData.normalizeReport(value),
    baseURL: "https://reports.example",
  });
  const text = JSON.stringify(message);
  assert.match(text, /Confirmed flaky \(retry evidence\):\*\s*1/);
  assert.match(text, /Retry evidence: 1 of 4 tests/);
});
test("report text cannot inject Slack mentions and spec review is capped at five", () => {
  const value = raw();
  value.results = Array.from({ length: 8 }, (_, i) => ({
    ...value.results[0],
    file: `cypress/${i}/<!channel>.cy.js`,
  }));
  const message = buildSlackMessage({
    record: { ...record, label: "<!channel>" },
    report: ReportData.normalizeReport(value),
    baseURL: "https://reports.example",
  });
  assert.doesNotMatch(JSON.stringify(message), /<!channel>/);
  assert.match(JSON.stringify(message), /Showing 5 of 8/);
  assert.equal(
    message.blocks.filter((block) => block.text?.text.includes("spec=")).length,
    5,
  );
});
test("notifications POST JSON once per import event, including concurrent duplicate requests", async () => {
  const requests = [];
  const notifier = createSlackNotifier({
    webhookURL: hook,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response("ok");
    },
  });
  const request = {
    eventId: "event-one",
    record,
    report: sample(),
    origin: "http://localhost:3000",
    owner: "local",
  };
  const results = await Promise.all([
    notifier.notify(request),
    notifier.notify(request),
  ]);
  assert.equal(requests.length, 1);
  assert.equal(results[1].duplicate, true);
  assert.equal(requests[0].options.redirect, "error");
  assert.equal(JSON.parse(requests[0].options.body).blocks[0].type, "header");
  assert.throws(
    () =>
      notifier.notify({
        ...request,
        record: { ...record, id: "b".repeat(64) },
      }),
    /already used/,
  );
  await notifier.notify({ ...request, eventId: "event-two" });
  assert.equal(requests.length, 2);
});
test("disabled, invalid, rejected and unconfirmed deliveries do not expose credentials or retry automatically", async () => {
  const disabled = createSlackNotifier({
    fetchImpl: () => {
      throw new Error("No requests");
    },
  });
  assert.equal((await disabled.notify({})).status, "disabled");
  const request = {
    eventId: "one",
    record,
    report: sample(),
    origin: "http://localhost:3000",
    owner: "local",
  };
  for (const webhookURL of [
    "http://hooks.slack.com/services/T/B/token",
    "https://untrusted.example/services/T/B/token",
  ]) {
    const invalid = createSlackNotifier({
      webhookURL,
      fetchImpl: () => {
        throw new Error("Must not fetch");
      },
    });
    await assert.rejects(invalid.notify(request), /configuration is invalid/);
  }
  let calls = 0;
  const failing = createSlackNotifier({
    webhookURL: hook,
    fetchImpl: async () => {
      calls++;
      throw new Error(hook);
    },
  });
  await assert.rejects(
    failing.notify(request),
    (error) =>
      !error.message.includes("fakeToken") &&
      /no automatic retry/.test(error.message),
  );
  await assert.rejects(failing.notify(request));
  assert.equal(calls, 1);
  const rejected = createSlackNotifier({
    webhookURL: hook,
    fetchImpl: async () => new Response("invalid_payload", { status: 400 }),
  });
  await assert.rejects(rejected.notify(request), /HTTP 400/);
  assert.throws(
    () => reportURL("https://user:secret@reports.example", record.id),
    /without credentials/,
  );
});
