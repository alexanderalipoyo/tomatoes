const test = require("node:test");
const assert = require("node:assert/strict");
const { catalog } = require("../../src/client/integrations");
test("integration states follow server configuration without claiming CI provider apps are connected", () => {
  const enabled = catalog({ ciConfigured: true, slackConfigured: true });
  assert.deepEqual(
    enabled.filter((item) => item.group === "Enabled").map((item) => item.id),
    ["ci", "slack"],
  );
  assert.equal(enabled.find((item) => item.id === "github").state, "Via CI");
  assert.equal(enabled.find((item) => item.id === "github").group, "Available");
  const fresh = catalog({ ciConfigured: false, slackConfigured: false });
  assert.equal(
    fresh.some((item) => item.group === "Enabled"),
    false,
  );
  assert.equal(fresh.find((item) => item.id === "ci").group, "New");
});
test("unsupported integrations have no setup action", () => {
  for (const id of ["teams", "jira", "sso", "mcp"]) {
    const entry = catalog({}).find((item) => item.id === id);
    assert.equal(entry.setup, null);
    assert.equal(entry.state, "Not available yet");
  }
});
