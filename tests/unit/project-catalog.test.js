const test = require("node:test");
const assert = require("node:assert/strict");
const { summarize } = require("../../src/shared/project-catalog");
function run(
  id,
  project,
  branch,
  start = "2026-10-21T00:00:00Z",
  status = "passed",
) {
  return { id, metadata: { project, branch }, start, status };
}
test("project cards group recorded projects and branches and use the latest real outcome", () => {
  const cards = summarize([
    run("1", "Alpha", "main"),
    run("2", "Alpha", "main", "2026-10-22T00:00:00Z", "failed"),
    run("3", "Beta", "release"),
  ]);
  assert.deepEqual(
    cards.map((card) => card.name),
    ["Alpha", "Beta"],
  );
  assert.equal(cards[0].serverCount, 2);
  assert.equal(cards[0].branches.length, 1);
  assert.equal(cards[0].latest.status, "failed");
  assert.equal(cards[0].branches[0].latest.id, "2");
});
test("server copies and browser imports have separate counts without inventing a combined run total", () => {
  const server = run("same", "Alpha", "main");
  const cards = summarize(
    [server, server],
    [server, { ...run("trashed", "Alpha", "other"), deletedAt: 1 }],
  );
  assert.equal(cards[0].serverCount, 1);
  assert.equal(cards[0].browserCount, 1);
  assert.equal(cards[0].branches.length, 1);
});
test("browser-only projects and missing branch metadata stay explicit", () => {
  const cards = summarize([], [run("1", "Alpha", "")]);
  assert.equal(cards[0].serverCount, 0);
  assert.equal(cards[0].browserCount, 1);
  assert.equal(cards[0].branches[0].name, "");
  assert.equal(cards[0].latest.source, "browser");
  assert.deepEqual(summarize(), []);
});

test("view all runs stays scoped to the selected project across server and browser copies", () => {
  const { runsForProject } = require("../../src/shared/project-catalog");
  const runs = runsForProject(
    [run("server-1", "Alpha", "main"), run("server-2", "Beta", "main")],
    [
      run("local-1", "Alpha", "feature/a"),
      run("local-2", "Beta", "main"),
      { ...run("trash", "Alpha", "main"), deletedAt: 1 },
    ],
    "Alpha",
  );
  assert.equal(runs.length, 2);
  assert.ok(runs.every((item) => item.metadata.project === "Alpha"));
  assert.deepEqual(runs.map((item) => item.source).sort(), [
    "browser",
    "server",
  ]);
});
test("project run details handle unassigned projects and deduplicate within each source", () => {
  const { runsForProject } = require("../../src/shared/project-catalog");
  const item = run("one", "", "");
  assert.equal(
    runsForProject([item, item], [item], "Unassigned project").length,
    2,
  );
  assert.equal(runsForProject([item], [], "Other").length, 0);
});
