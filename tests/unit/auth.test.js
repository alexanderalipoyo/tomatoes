const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(
  path.join(__dirname, "../../src/client/auth.js"),
  "utf8",
);
test("authentication requests have a deadline and preserve server validation messages", async () => {
  let call;
  const context = {
    AbortSignal,
    teamRequest: async (route, options) => {
      call = { route, options };
      return { ok: true };
    },
  };
  vm.runInNewContext(source, context);
  assert.equal(
    (await context.authRequest("/api/login", { method: "POST", body: "{}" }))
      .ok,
    true,
  );
  assert.equal(call.options.method, "POST");
  assert.ok(call.options.signal instanceof AbortSignal);
  const serverError = new Error("Email, username, or password is incorrect.");
  context.teamRequest = async () => {
    throw serverError;
  };
  await assert.rejects(
    () => context.authRequest("/api/login", {}),
    (error) => error === serverError,
  );
});
test("timed-out authentication explains how to recover from an unconfirmed password change", async () => {
  const context = {
    AbortSignal,
    teamRequest: async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    },
  };
  vm.runInNewContext(source, context);
  await assert.rejects(
    () => context.authRequest("/api/reset-password", {}),
    /try signing in before requesting another link/,
  );
});
