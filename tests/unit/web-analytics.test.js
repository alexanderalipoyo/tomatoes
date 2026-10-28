const test = require("node:test");
const assert = require("node:assert/strict");
const { startWebAnalytics } = require("../../src/client/web-analytics");
test("analytics tracks hash pages once and strips report identifiers and reset tokens", async () => {
  const views = [],
    listeners = {};
  let options;
  const browser = {
    location: { origin: "https://example.com", hash: "#results" },
    atob: (value) => Buffer.from(value, "base64").toString("utf8"),
    addEventListener: (event, callback) => {
      listeners[event] = callback;
    },
  };
  await startWebAnalytics({
    browser,
    page: {
      querySelector: () => ({
        content: Buffer.from(JSON.stringify({ enabled: true })).toString(
          "base64",
        ),
      }),
    },
    loadSDK: async () => ({
      inject: (value) => {
        options = value;
      },
      pageview: (value) => views.push(value),
    }),
  });
  assert.equal(options.disableAutoTrack, true);
  assert.deepEqual(views, [{ route: "/app/results", path: "/app/results" }]);
  listeners.hashchange();
  assert.equal(views.length, 1);
  browser.location.hash = "#reset-password?token=private-reset-token";
  listeners.hashchange();
  assert.equal(views[1].path, "/app/reset-password");
  const event = options.beforeSend({
    type: "pageview",
    url: "https://example.com/?import=private-report#reset-password?token=private-reset-token",
  });
  assert.equal(event.url, "https://example.com/app/reset-password");
  assert.ok(!JSON.stringify(views).includes("private"));
});
test("local and preview builds never load the analytics SDK", async () => {
  await startWebAnalytics({
    page: { querySelector: () => ({ content: "disabled" }) },
    browser: {},
    loadSDK: async () => {
      assert.fail("Unexpected analytics request");
    },
  });
});
