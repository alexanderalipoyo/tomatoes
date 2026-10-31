const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
function config(env = {}) {
  return spawnSync(
    process.execPath,
    ["-e", 'console.log(JSON.stringify(require("./capacitor.config.js")))'],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        TOMATOES_IOS_MODE: "production",
        TOMATOES_IOS_PRODUCTION_ORIGIN: "https://tomatoes-reports.vercel.app",
        ...env,
      },
    },
  );
}
test("iOS production requires HTTPS without credentials or URL decorations", () => {
  for (const origin of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com/?secret=yes",
    "https://example.com/#fragment",
  ]) {
    assert.notEqual(
      config({ TOMATOES_IOS_PRODUCTION_ORIGIN: origin }).status,
      0,
    );
  }
  const actual = JSON.parse(config().stdout);
  assert.equal(actual.server.url, "https://tomatoes-reports.vercel.app/#runs");
  assert.equal(actual.server.cleartext, false);
  assert.equal(actual.loggingBehavior, "none");
  assert.equal(actual.server.allowNavigation, undefined);
});
test("iOS local mode restricts cleartext to loopback", () => {
  const actual = JSON.parse(
    config({
      TOMATOES_IOS_MODE: "local",
      TOMATOES_IOS_LOCAL_ORIGIN: "http://localhost:3004",
    }).stdout,
  );
  assert.equal(actual.server.url, "http://localhost:3004/#runs");
  assert.equal(actual.server.cleartext, true);
  assert.notEqual(
    config({
      TOMATOES_IOS_MODE: "local",
      TOMATOES_IOS_LOCAL_ORIGIN: "http://external.example.com",
    }).status,
    0,
  );
});
test(
  "iOS build refuses unsupported hosts before invoking Xcode",
  { skip: process.platform === "darwin" },
  () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/ios-production.mjs", "build"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /require macOS with Xcode/);
  },
);
