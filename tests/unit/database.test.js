const test = require("node:test");
const assert = require("node:assert/strict");
const { checkDatabase, errorMessage } = require("../../scripts/check-database");
test("database connection checks only read server identity and always close the client", async () => {
  const calls = [];
  class FakeClient {
    constructor(config) {
      calls.push(config);
    }
    async connect() {
      calls.push("connect");
    }
    async query(sql) {
      calls.push(sql);
      return {
        rows: [
          { database: "tomatoes", username: "tomatoes_app", version: "18" },
        ],
      };
    }
    async end() {
      calls.push("end");
    }
  }
  const result = await checkDatabase({
    ClientType: FakeClient,
    config: { database: "tomatoes" },
  });
  assert.equal(result.database, "tomatoes");
  assert.equal(calls[0].options, "-c default_transaction_read_only=on");
  assert.match(calls[2], /^SELECT current_database/);
  assert.equal(calls.at(-1), "end");
});
test("failed connection checks close the client and do not expose credential errors", async () => {
  let closed = false;
  class FailedClient {
    async connect() {
      throw new Error("password private-secret");
    }
    async end() {
      closed = true;
    }
  }
  await assert.rejects(() => checkDatabase({ ClientType: FailedClient }));
  assert.equal(closed, true);
  assert.doesNotMatch(
    errorMessage(new Error("password private-secret")),
    /private-secret/,
  );
  assert.match(errorMessage({ code: "3D000" }), /does not exist/);
});

test("production database configuration requires explicit credentials and verified TLS", () => {
  const { databaseConfig } = require("../../src/server/config");
  const env = {
    NODE_ENV: "production",
    PGHOST: "db.example.supabase.co",
    PGDATABASE: "postgres",
    PGUSER: "postgres",
    PGPASSWORD: "test-only-secret",
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: "test-ca.crt",
  };
  let certificatePath;
  const config = databaseConfig({
    env,
    readFile: (file) => {
      certificatePath = file;
      return "TEST CERTIFICATE";
    },
  });
  assert.equal(config.host, env.PGHOST);
  assert.equal(config.database, "postgres");
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.ssl.ca, "TEST CERTIFICATE");
  assert.ok(certificatePath.endsWith("test-ca.crt"));
  assert.throws(
    () => databaseConfig({ env: { ...env, PGPASSWORD: "" } }),
    /production environment/,
  );
  assert.throws(
    () => databaseConfig({ env: { ...env, PGSSLMODE: "disable" } }),
    /require PGSSLMODE=verify-full/,
  );
  assert.throws(
    () =>
      databaseConfig({
        env,
        readFile: () => {
          throw new Error("private certificate details");
        },
      }),
    (error) =>
      error.code === "TOMATOES_CONFIG" &&
      !error.message.includes("private certificate details"),
  );
  assert.equal(databaseConfig({ env: {} }).ssl, false);
});
test("production environment loading excludes local files and honors deployment overrides", async (t) => {
  const fs = require("node:fs/promises"),
    os = require("node:os"),
    path = require("node:path"),
    { spawnSync } = require("node:child_process");
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "tomatoes-env-test-"));
  t.after(async () => {
    const resolved = path.resolve(folder);
    if (
      !resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) ||
      !path.basename(resolved).startsWith("tomatoes-env-test-")
    )
      throw new Error("Unsafe test cleanup path");
    await fs.rm(resolved, { recursive: true, force: true });
  });
  await fs.writeFile(
    path.join(folder, ".env.local"),
    "PGHOST=local-only\nLOCAL_ONLY_MARKER=should-not-load\n",
  );
  await fs.writeFile(
    path.join(folder, ".env.production"),
    "PGHOST=production-only\n",
  );
  const configPath = require.resolve("../../src/server/config");
  const code = `require(${JSON.stringify(configPath)}).loadLocalEnvironment({root:${JSON.stringify(folder)}}); console.log(JSON.stringify({host:process.env.PGHOST,local:process.env.LOCAL_ONLY_MARKER || null}));`;
  const env = { ...process.env, NODE_ENV: "production" };
  delete env.PGHOST;
  delete env.LOCAL_ONLY_MARKER;
  let result = spawnSync(process.execPath, ["-e", code], {
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    host: "production-only",
    local: null,
  });
  result = spawnSync(process.execPath, ["-e", code], {
    env: { ...env, PGHOST: "deployment-host" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    host: "deployment-host",
    local: null,
  });
});

test("hosted CA certificates can be supplied without packaging a private certificate file", () => {
  const { databaseConfig } = require("../../src/server/config");
  const env = {
    NODE_ENV: "production",
    PGHOST: "db.example.com",
    PGUSER: "postgres",
    PGDATABASE: "postgres",
    PGPASSWORD: "test-only-password",
    PGSSLROOTCERT: "must-not-be-read",
    PGSSLROOTCERT_PEM: "TEST\\nCERTIFICATE",
  };
  const config = databaseConfig({
    env,
    readFile: () => {
      throw new Error("Must not read local files");
    },
  });
  assert.equal(config.ssl.ca, "TEST\nCERTIFICATE");
  assert.equal(config.ssl.rejectUnauthorized, true);
});
