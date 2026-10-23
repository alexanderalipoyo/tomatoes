const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
test("system appearance reacts to computer changes while explicit choices stay fixed", () => {
  const system = {
    matches: true,
    addEventListener(event, callback) {
      assert.equal(event, "change");
      this.changed = callback;
    },
  };
  const element = { dataset: {}, style: {} };
  const context = {
    document: { documentElement: element },
    matchMedia: (query) => {
      assert.equal(query, "(prefers-color-scheme: dark)");
      return system;
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/client/appearance.js"),
      "utf8",
    ),
    context,
  );
  assert.equal(element.dataset.theme, "dark");
  system.matches = false;
  system.changed();
  assert.equal(element.dataset.theme, "light");
  context.Appearance.apply("dark");
  system.changed();
  assert.equal(element.dataset.theme, "dark");
  assert.equal(element.style.colorScheme, "dark");
  context.Appearance.apply("light");
  system.matches = true;
  system.changed();
  assert.equal(element.dataset.theme, "light");
  context.Appearance.apply("system");
  assert.equal(element.dataset.theme, "dark");
  assert.equal(element.dataset.colorMode, "system");
});
