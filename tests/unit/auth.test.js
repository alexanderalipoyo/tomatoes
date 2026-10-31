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
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    location: { protocol: "https:", hostname: "reports.example.com" },
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
  assert.equal(call.options.cache, "no-store");
  assert.equal(call.options.referrerPolicy, "no-referrer");
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
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    location: { protocol: "https:", hostname: "reports.example.com" },
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

test("authentication refuses remote HTTP while allowing HTTPS and loopback development", async () => {
  let calls = 0;
  const context = {
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    location: { protocol: "http:", hostname: "reports.example.com" },
    AbortSignal,
    teamRequest: async () => {
      calls++;
      return {};
    },
  };
  vm.runInNewContext(source, context);
  await assert.rejects(() => context.authRequest("/api/login", {}), /HTTPS/);
  assert.equal(calls, 0);
  context.location.hostname = "localhost";
  await context.authRequest("/api/login", {});
  context.location = { protocol: "https:", hostname: "reports.example.com" };
  await context.authRequest("/api/login", {});
  assert.equal(calls, 2);
});

test("Google login continues to the app when browser import history cannot load", async () => {
  const calls = [];
  const context = {
    authStatus: { authenticated: true, pendingOrganization: false },
    teamState: null,
    initializeAuth: async () => {},
    reloadUserPreferences: async () => {},
    refreshHistory: async () => {
      throw new Error("Browser storage unavailable");
    },
    historyNotice: (message) => calls.push(message),
    hideAuthScreen: () => calls.push("hide"),
    history: { replaceState: () => {} },
    location: { pathname: "/" },
    navigateReportLocation: async () => calls.push("navigate"),
    showToast: () => {},
    renderAuthScreen: () => calls.push("auth"),
  };
  vm.runInNewContext(
    source.slice(source.indexOf("async function finishGoogleSignIn")),
    context,
  );
  await context.finishGoogleSignIn();
  assert.ok(calls.includes("navigate"));
  assert.ok(
    calls.some((message) => message.includes("browser import history")),
  );
  context.authStatus.pendingOrganization = true;
  calls.length = 0;
  await context.finishGoogleSignIn({ refreshPending: true });
  assert.deepEqual(
    calls,
    [],
    "access checks preserve the pending page and its feedback",
  );
});
