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

test("startup uses only a valid cached color hint and server confirmation replaces it", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../../src/client/appearance.js"),
    "utf8",
  );
  for (const cached of ["light", "dark", "system", "invalid"]) {
    const element = { dataset: {}, style: {} };
    let saved;
    const context = {
      document: { documentElement: element },
      matchMedia: () => ({ matches: true, addEventListener() {} }),
      localStorage: {
        getItem: () => cached,
        setItem: (key, value) => {
          saved = value;
        },
      },
    };
    vm.runInNewContext(source, context);
    assert.equal(element.dataset.theme, cached === "light" ? "light" : "dark");
    assert.equal(
      saved,
      undefined,
      "Reading a startup hint does not save a preference",
    );
    context.Appearance.apply("light");
    assert.equal(element.dataset.theme, "light");
    assert.equal(saved, "light");
  }
});
test("blocked browser storage does not stop appearance or server-confirmed changes", () => {
  const element = { dataset: {}, style: {} };
  const context = {
    document: { documentElement: element },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: {
      getItem() {
        throw Error("Blocked");
      },
      setItem() {
        throw Error("Blocked");
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../../src/client/appearance.js"),
      "utf8",
    ),
    context,
  );
  context.Appearance.apply("dark");
  assert.equal(element.dataset.theme, "dark");
});
test("appearance bootstrap runs before styles and deferred application scripts", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../../public/index.html"),
    "utf8",
  );
  assert.ok(html.includes('<script src="/js/appearance.js"></script>'));
  assert.ok(
    html.indexOf("/js/appearance.js") < html.indexOf("/css/styles.css"),
  );
});
