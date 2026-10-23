const test = require("node:test");
const assert = require("node:assert/strict");
const Model = require("../../src/shared/user-preferences");
const { create } = require("../../src/client/preferences");
const group = {
  id: "admin",
  name: "Admin",
  paths: ["cypress/e2e/admin"],
  metrics: ["outcomes"],
};
function fixture({ legacy, signedIn = false } = {}) {
  let status = signedIn
    ? {
        enabled: true,
        authenticated: true,
        user: { username: "alex" },
        csrf: "csrf",
      }
    : { enabled: false };
  const rows = new Map(),
    calls = [];
  let fail = false;
  const request = async (route, options = {}) => {
    calls.push({ route, ...options });
    if (fail) throw new Error("Server unavailable");
    if (route === "/api/team/status") return status;
    const id = status.enabled ? "user:" + status.user.username : "local";
    if (
      options.method === "PUT" &&
      !(options.headers["If-None-Match"] === "*" && rows.has(id))
    )
      rows.set(id, { ...rows.get(id), ...JSON.parse(options.body) });
    return {
      preferences: rows.get(id) || null,
      profileId: id,
      profile: id,
      storage: "postgres",
    };
  };
  return {
    client: create({ request, legacy }),
    rows,
    calls,
    setStatus(value) {
      status = value;
    },
    setFail(value) {
      fail = value;
    },
  };
}
test("preference validation limits settings to known sections, time zones, row counts and valid groups", () => {
  for (const value of [
    null,
    [],
    {},
    { owner: "someone-else" },
    { display: { timeZone: "invalid/zone", rows: 15 } },
    { display: { timeZone: "UTC", rows: 1000 } },
    { dashboardGroups: [{ ...group, paths: [] }] },
  ])
    assert.throws(() => Model.validatePatch(value));
  assert.deepEqual(
    Model.validatePatch({ display: { timeZone: "UTC", rows: 30 } }),
    { display: { timeZone: "UTC", rows: 30 } },
  );
});
test("legacy browser settings migrate only into an empty local server profile", async () => {
  let reads = 0;
  const f = fixture({
    legacy: () => {
      reads++;
      return {
        display: { timeZone: "UTC", rows: 30 },
        dashboardGroups: [group],
      };
    },
  });
  const state = await f.client.initialize();
  assert.equal(state.ready, true);
  assert.equal(f.rows.get("local").dashboardGroups[0].name, "Admin");
  await f.client.save({ display: { timeZone: "Asia/Singapore", rows: 50 } });
  await f.client.initialize();
  assert.equal(reads, 1);
  assert.equal(f.client.getState().preferences.display.rows, 50);
  assert.equal(f.client.getState().preferences.dashboardGroups.length, 1);
});
test("signed-in users start with their database preferences and never inherit browser legacy groups", async () => {
  const f = fixture({
    signedIn: true,
    legacy: () => {
      throw new Error("Must not read another profile's browser settings");
    },
  });
  await f.client.initialize();
  assert.deepEqual(f.client.getState().preferences.dashboardGroups, []);
  await f.client.save({ dashboardGroups: [group] });
  assert.equal(f.rows.get("user:alex").dashboardGroups.length, 1);
  assert.equal(f.rows.has("local"), false);
});
test("failed saves do not change confirmed preferences and account changes block stale writes", async () => {
  const f = fixture();
  await f.client.initialize();
  f.setFail(true);
  await assert.rejects(
    f.client.save({ dashboardGroups: [group] }),
    /unavailable/,
  );
  assert.deepEqual(f.client.getState().preferences.dashboardGroups, []);
  f.setFail(false);
  f.setStatus({
    enabled: true,
    authenticated: true,
    user: { username: "other" },
  });
  await assert.rejects(
    f.client.save({ dashboardGroups: [group] }),
    /account changed/,
  );
  assert.equal(f.rows.has("user:other"), false);
});
test("sign-out clears the active preference profile and disables saving", async () => {
  const f = fixture({ signedIn: true });
  await f.client.initialize();
  await f.client.save({ dashboardGroups: [group] });
  f.setStatus({ enabled: true, authenticated: false });
  const state = await f.client.initialize();
  assert.equal(state.ready, false);
  assert.equal(state.profileId, null);
  assert.deepEqual(state.preferences.dashboardGroups, []);
  await assert.rejects(f.client.save({ dashboardGroups: [] }), /Reload/);
});
