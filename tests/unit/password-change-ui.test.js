const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
function fixture(fail = false) {
  const dom = new JSDOM(
    '<section><form id="change-password-form"><input name="currentPassword" type="password"/><input name="password" type="password"/><input name="confirm" type="password"/><button type="submit">Update password</button></form></section>',
  );
  const requests = [],
    messages = [];
  const context = {
    authStatus: { user: { username: "member" } },
    FormData: dom.window.FormData,
    location: { hash: "profile" },
    showToast: (message) => messages.push(message),
    teamRequest: async () => ({
      csrf: "sample",
      authenticated: true,
      user: { username: "member" },
    }),
    authRequest: async (route, options) => {
      requests.push({ route, body: JSON.parse(options.body) });
      if (fail) throw new Error("Current password is incorrect.");
    },
    initializeAuth: async () => {},
    reloadUserPreferences: async () => {},
    renderAuthScreen: (message) => messages.push(message),
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/client/profile.js"),
      "utf8",
    ),
    context,
  );
  const host = dom.window.document.querySelector("section"),
    form = host.querySelector("form");
  context.setupPasswordChange(host);
  form.elements.currentPassword.value = "old sample password";
  form.elements.password.value = "new sample password";
  form.elements.confirm.value = "new sample password";
  return { dom, context, form, requests, messages };
}
test("password change returns to sign-in and clears entered secrets", async () => {
  const f = fixture();
  await f.form.onsubmit({ preventDefault() {} });
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].route, "/api/change-password");
  assert.equal(f.context.location.hash, "login");
  for (const input of f.form.querySelectorAll("input"))
    assert.equal(input.value, "");
  assert.ok(
    f.messages.some((message) => message.includes("existing sessions")),
  );
  f.dom.window.close();
});
test("password-change errors clear passwords and keep the user on their profile", async () => {
  const f = fixture(true);
  await f.form.onsubmit({ preventDefault() {} });
  assert.equal(f.context.location.hash, "profile");
  assert.equal(f.form.querySelector("button").disabled, false);
  for (const input of f.form.querySelectorAll("input"))
    assert.equal(input.value, "");
  f.dom.window.close();
});
test("mismatched new passwords are rejected before making a request", async () => {
  const f = fixture();
  f.form.elements.confirm.value = "different password";
  await f.form.onsubmit({ preventDefault() {} });
  assert.equal(f.requests.length, 0);
  assert.ok(f.messages.includes("Passwords do not match."));
  f.dom.window.close();
});

test("account changes prevent a stale profile from changing another account's password", async () => {
  const f = fixture();
  f.context.teamRequest = async () => ({
    authenticated: true,
    user: { username: "other" },
  });
  await f.form.onsubmit({ preventDefault() {} });
  assert.equal(f.requests.length, 0);
  assert.ok(
    f.messages.some((message) => message.includes("Your account changed")),
  );
  f.dom.window.close();
});
