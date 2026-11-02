const test = require("node:test");
const assert = require("node:assert/strict");
const { sharedWidgetSetups } = require("../../src/server/shared-widgets");
test("shared widget setups follow active organization membership and skip disabled or invalid owners", () => {
  const groups = [
    { id: "g", name: "Group", paths: ["cypress/e2e/a"], metrics: ["passRate"] },
  ];
  const users = [
    {
      username: "multi",
      role: "admin",
      projects: ["*"],
      organizationId: "a",
      memberships: [
        {
          organizationId: "b",
          role: "viewer",
          projects: ["*"],
          disabled: false,
        },
      ],
    },
    {
      username: "disabled",
      role: "admin",
      organizationId: "b",
      disabled: true,
    },
    { username: "invalid", role: "admin", organizationId: "b" },
  ];
  const rows = [
    {
      owner: "user:multi",
      preferences: { shareDashboardGroups: true, dashboardGroups: groups },
    },
    {
      owner: "user:multi:org:b",
      preferences: { shareDashboardGroups: true, dashboardGroups: groups },
    },
    {
      owner: "user:disabled",
      preferences: { shareDashboardGroups: true, dashboardGroups: groups },
    },
    {
      owner: "user:invalid",
      preferences: {
        shareDashboardGroups: true,
        dashboardGroups: [{ bad: true }],
      },
    },
  ];
  assert.deepEqual(sharedWidgetSetups(rows, users, "b", null), [
    { owner: "multi", groups },
  ]);
  assert.deepEqual(
    sharedWidgetSetups(rows, users, "b", "user:multi:org:b"),
    [],
  );
  assert.deepEqual(sharedWidgetSetups(rows, users, "c", null), []);
  users[0].memberships[0].disabled = true;
  assert.deepEqual(sharedWidgetSetups(rows, users, "b", null), []);
});
