const test = require("node:test");
const assert = require("node:assert/strict");
const { read, build, resolve } = require("../../src/shared/report-links");
const first = "a".repeat(64),
  second = "b".repeat(64);
test("report URLs retain the exact import while switching views", () => {
  const dashboard = build("http://localhost:3000/?theme=light#history", {
    importId: first,
    view: "runs",
  });
  const results = new URL(dashboard);
  results.hash = "results";
  assert.equal(read(dashboard).importId, first);
  assert.equal(read(results.href).key, read(dashboard).key);
  assert.equal(new URL(dashboard).searchParams.get("theme"), "light");
  assert.notEqual(build(dashboard, { importId: second }), dashboard);
});
test("missing, duplicate and malformed report identifiers are handled explicitly", () => {
  assert.equal(read("http://localhost:3000/#runs").importId, null);
  for (const query of [
    "import=",
    "import=../secret",
    "import=invalid",
    `import=${first}&import=${second}`,
    "server=invalid",
  ])
    assert.throws(() => read("http://localhost/?" + query), /invalid/);
  assert.throws(
    () => build("http://localhost", { importId: "invalid" }),
    /Invalid/,
  );
});
test("a local report is resolved by its ID without replacing it with a newer server copy", async () => {
  const local = { entry: { id: first }, text: "original report" };
  let requested;
  const result = await resolve(
    { importId: first, serverId: second },
    {
      getLocal: async (id) => {
        requested = id;
        return local;
      },
      getServer: () => {
        throw new Error("Do not fetch a replacement");
      },
    },
  );
  assert.equal(requested, first);
  assert.equal(result.local, local);
});
test("missing browser reports recover only a matching authorized server copy", async () => {
  const server = { run: { id: second }, originalText: "original report" };
  const loaders = {
    getLocal: async () => {
      throw new Error("Missing");
    },
    getServer: async (id) => {
      assert.equal(id, second);
      return server;
    },
    verifyServer: async (_, id) => id === first,
  };
  assert.equal(
    (await resolve({ importId: first, serverId: second }, loaders)).server,
    server,
  );
  await assert.rejects(
    resolve(
      { importId: first, serverId: second },
      { ...loaders, verifyServer: async () => false },
    ),
    /does not match/,
  );
  await assert.rejects(
    resolve(
      { importId: first, serverId: second },
      {
        ...loaders,
        getServer: async () => {
          throw new Error("Sign in required");
        },
      },
    ),
    /Sign in/,
  );
});
test("trash and missing links never silently fall back to the latest imported report", async () => {
  await assert.rejects(
    resolve(
      { importId: first },
      {
        getLocal: async () => {
          throw new Error("Missing");
        },
      },
    ),
    /not available/,
  );
  await assert.rejects(
    resolve(
      { importId: first, serverId: second },
      {
        getLocal: async () => ({ entry: { deletedAt: 123 } }),
        getServer: () => {
          throw new Error("Must not restore trash");
        },
      },
    ),
    /trash/,
  );
});

test("dashboard links clear a spec filter inherited from another report view", () => {
  const url = build(`http://localhost:3000/?server=${first}&spec=91#results`, {
    importId: second,
    view: "runs",
  });
  assert.equal(new URL(url).searchParams.has("spec"), false);
  assert.equal(read(url).importId, second);
});
