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
  assert.equal(f.client.getState().ready, true);
  assert.equal(
    f.calls.some((call) => call.method === "PUT"),
    false,
  );
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

test("appearance defaults to system for existing profiles and validates modes", () => {
  assert.deepEqual(
    Model.withDefaults({ display: { timeZone: "UTC", rows: 30 } }).appearance,
    { colorMode: "system" },
  );
  for (const colorMode of ["light", "dark", "system"])
    assert.deepEqual(Model.validatePatch({ appearance: { colorMode } }), {
      appearance: { colorMode },
    });
  for (const appearance of [
    null,
    [],
    {},
    { colorMode: "automatic" },
    { colorMode: "dark", extra: true },
  ])
    assert.throws(() => Model.validatePatch({ appearance }));
});
test("appearance persists independently of report preferences and across reloads", async () => {
  const f = fixture();
  await f.client.initialize();
  await f.client.save({ appearance: { colorMode: "dark" } });
  await f.client.save({ dashboardGroups: [group] });
  await f.client.save({ display: { timeZone: "UTC", rows: 50 } });
  const restored = await f.client.initialize();
  assert.equal(restored.preferences.appearance.colorMode, "dark");
  assert.equal(restored.preferences.display.rows, 50);
  assert.equal(restored.preferences.dashboardGroups[0].name, "Admin");
  f.setStatus({
    enabled: true,
    authenticated: true,
    user: { username: "other" },
  });
  assert.equal(
    (await f.client.initialize()).preferences.appearance.colorMode,
    "system",
  );
});

test("profile preferences validate contact details and preserve other preference sections", async () => {
  for (const profile of [
    null,
    [],
    { firstName: "Alex", lastName: "Ali", email: "not-an-email" },
    { firstName: "Alex", lastName: "Ali", email: "", role: "admin" },
    { firstName: "Alex", lastName: "x".repeat(81), email: "" },
    { firstName: "Alex\n", lastName: "Ali", email: "" },
  ])
    assert.throws(() => Model.validatePatch({ profile }));
  const f = fixture({ signedIn: true });
  await f.client.initialize();
  await f.client.save({
    profile: {
      firstName: " Alex ",
      lastName: " Ali ",
      email: " alex@example.com ",
    },
  });
  await f.client.save({ appearance: { colorMode: "dark" } });
  const reloaded = await f.client.initialize();
  assert.deepEqual(reloaded.preferences.profile, {
    firstName: "Alex",
    lastName: "Ali",
    email: "alex@example.com",
  });
  assert.equal(reloaded.preferences.appearance.colorMode, "dark");
  f.setStatus({
    enabled: true,
    authenticated: true,
    user: { username: "other" },
  });
  assert.deepEqual(
    (await f.client.initialize()).preferences.profile,
    Model.DEFAULT_PROFILE,
  );
});

test("last used branch defaults survive preference reloads without replacing display or other project defaults", async () => {
  const f = fixture({ signedIn: true });
  await f.client.initialize();
  const importBranches = [
    { project: "web", branch: "feature/a" },
    { project: "api", branch: "main" },
  ];
  await f.client.save({ importBranches });
  await f.client.save({ display: { timeZone: "UTC", rows: 30 } });
  const restored = await f.client.initialize();
  assert.deepEqual(restored.preferences.importBranches, importBranches);
  assert.equal(restored.preferences.display.rows, 30);
});

test("profile change tracking ignores whitespace and clearing a reverted edit", () => {
  const saved = {
    firstName: "Alex",
    lastName: "Ali",
    email: "alex@example.com",
  };
  assert.equal(Model.profileChanged(saved, { ...saved }), false);
  assert.equal(
    Model.profileChanged(saved, { ...saved, firstName: " Alex " }),
    false,
  );
  assert.equal(
    Model.profileChanged(saved, { ...saved, firstName: "Other" }),
    true,
  );
  assert.equal(Model.profileChanged(saved, { ...saved, email: "" }), true);
});

test("workspace branding persists by project without replacing other preferences", async () => {
  const f = fixture({});
  await f.client.initialize();
  const workspaces = [
    {
      project: "alpha",
      name: "Alpha Team",
      website: "https://example.com",
      logo: "",
    },
    { project: "beta", name: "Beta", website: "", logo: "" },
  ];
  await f.client.save({ workspaces });
  const restored = await f.client.initialize();
  assert.deepEqual(restored.preferences.workspaces, workspaces);
  assert.equal(restored.preferences.appearance.colorMode, "system");
  assert.deepEqual(Model.withDefaults({}).workspaces, []);
});
test("workspace branding rejects executable logos, unsafe links, duplicates, and oversized images", () => {
  const brand = { project: "alpha", name: "Alpha", website: "", logo: "" };
  for (const patch of [
    { logo: "data:image/svg+xml;base64,PHN2Zz4=" },
    { website: "javascript:alert(1)" },
    { website: "https://user:password@example.com" },
    { name: "" },
    { logo: "x".repeat(100001) },
  ]) {
    assert.throws(() =>
      Model.validatePatch({ workspaces: [{ ...brand, ...patch }] }),
    );
  }
  assert.throws(() => Model.validatePatch({ workspaces: [brand, brand] }));
  assert.deepEqual(
    Model.validatePatch({ workspaces: [{ ...brand, name: " Alpha " }] })
      .workspaces[0],
    brand,
  );
});
