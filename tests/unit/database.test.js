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
