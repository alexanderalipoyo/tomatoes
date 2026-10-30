const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const esbuild = require("esbuild");
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.FormData = dom.window.FormData;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const { renderToStaticMarkup } = require("react-dom/server");
const {
  normalizeReport,
  dashboardStats,
} = require("../../src/shared/report-data");
const fixture = require("../../examples/reports/results.json");
function loadComponent(relative) {
  const file = path.resolve(__dirname, "../../src/client/react", relative);
  const { outputFiles } = esbuild.buildSync({
    entryPoints: [file],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    external: ["react", "react/*", "react-dom", "react-dom/*"],
  });
  const module = { exports: {} };
  vm.runInNewContext(outputFiles[0].text, {
    require: createRequire(file),
    module,
    exports: module.exports,
    console,
    FormData: dom.window.FormData,
  });
  return module.exports;
}
const { AuthPage } = loadComponent("components/AuthPage.jsx");
const { DashboardWidgets, RunSummary } = loadComponent(
  "components/RunDashboard.jsx",
);
async function mount(component) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(component));
  return {
    host,
    cleanup: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}
test("React auth submits once while pending and renders server errors as text", async () => {
  let reject,
    calls = 0;
  const state = await mount(
    React.createElement(AuthPage, {
      route: "login",
      onSubmit: async (fields) => {
        calls++;
        assert.equal(fields.get("email"), "tester@example.com");
        await new Promise((_, fail) => {
          reject = fail;
        });
      },
    }),
  );
  try {
    const form = state.host.querySelector("form");
    form.elements.email.value = "tester@example.com";
    form.elements.password.value = "temporary-test-password";
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(state.host.querySelector("fieldset").disabled, true);
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(calls, 1);
    await act(async () =>
      reject(new Error("<script>server validation</script>")),
    );
    assert.equal(state.host.querySelector("fieldset").disabled, false);
    assert.equal(
      state.host.querySelector("#auth-error").lastElementChild.textContent,
      "<script>server validation</script>",
    );
    assert.equal(state.host.querySelector("script"), null);
  } finally {
    await state.cleanup();
  }
});
test("React recovery displays local inbox help and reset confirmation blocks mismatched passwords", async () => {
  const recovery = await mount(
    React.createElement(AuthPage, {
      route: "forgot-password",
      delivery: "local",
      onSubmit: async () => ({
        message: "Check your recovery inbox",
        delivery: "local",
      }),
    }),
  );
  try {
    const form = recovery.host.querySelector("form");
    form.elements.email.value = "tester@example.com";
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.match(
      recovery.host.querySelector("#auth-feedback").textContent,
      /password-recovery.js/,
    );
  } finally {
    await recovery.cleanup();
  }
  const reset = await mount(
    React.createElement(AuthPage, {
      route: "reset-password",
      onSubmit: async () => assert.fail("Mismatched passwords submitted"),
    }),
  );
  try {
    const form = reset.host.querySelector("form");
    form.elements.password.value = "first-test-password";
    form.elements.confirm.value = "another-test-password";
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    assert.equal(
      reset.host.querySelector("#auth-error").lastElementChild.textContent,
      "Passwords do not match.",
    );
  } finally {
    await reset.cleanup();
  }
});
test("React dashboard drills into the actual outcome, spec, and test IDs", async () => {
  const report = normalizeReport(fixture),
    stats = dashboardStats(report),
    calls = [];
  const state = await mount(
    React.createElement(DashboardWidgets, {
      report,
      stats,
      duration: String,
      openTests: (...args) => calls.push(args),
      showTest: (id) => calls.push([id]),
    }),
  );
  try {
    assert.equal(
      state.host.querySelectorAll(".spec-tile").length,
      report.specs.length,
    );
    assert.match(
      state.host.querySelector("#spec-summary").textContent,
      /107 specs/,
    );
    await act(async () =>
      state.host.querySelector('[data-outcome="failed"]').click(),
    );
    assert.deepEqual(calls.pop(), ["all", "failed"]);
    await act(async () => state.host.querySelector(".hotspot-row").click());
    assert.deepEqual(calls.pop(), [String(stats.failureSpecs[0].id), "failed"]);
    await act(async () => state.host.querySelector(".slow-test-row").click());
    assert.deepEqual(calls.pop(), [Number(stats.slowestTests[0].id)]);
  } finally {
    await state.cleanup();
  }
  const html = renderToStaticMarkup(
    React.createElement(RunSummary, {
      report,
      sourceName: "<img src=x onerror=alert(1)>",
      brand: { name: "<script>workspace</script>" },
      formatDate: String,
      duration: String,
    }),
  );
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<script>workspace"));
});
test("React shell keeps the feature host IDs unique and scripts start only after mount", () => {
  const { ApplicationShell } = loadComponent("ApplicationShell.jsx");
  const html = renderToStaticMarkup(React.createElement(ApplicationShell));
  const document = new JSDOM(html).window.document;
  const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    "overview",
    "dashboard-widgets",
    "results-body",
    "workspace-menu",
    "import-dialog",
    "detail",
    "toast",
    "mobile-navigation",
    "import-progress",
  ])
    assert.ok(document.getElementById(id), id);
  const page = fs.readFileSync(
    path.resolve(__dirname, "../../public/index.html"),
    "utf8",
  );
  assert.ok(page.includes("/js/react-app.js"));
  assert.ok(!page.includes('src="/js/app.js"'));
});

test("React result rows and history cards preserve inspection and recovery callbacks", async () => {
  const { ResultRows } = loadComponent("components/ResultRows.jsx");
  const report = normalizeReport(fixture),
    calls = [];
  const tableHost = document.createElement("table");
  const body = document.createElement("tbody");
  tableHost.append(body);
  document.body.append(tableHost);
  const root = createRoot(body);
  try {
    await act(async () =>
      root.render(
        React.createElement(ResultRows, {
          items: report.tests.slice(0, 1),
          isTests: true,
          duration: String,
          showTest: (id) => calls.push(id),
        }),
      ),
    );
    await act(async () => body.querySelector(".result-link").click());
    assert.equal(calls.pop(), report.tests[0].id);
  } finally {
    await act(async () => root.unmount());
    tableHost.remove();
  }
  const { HistoryCards } = loadComponent("components/HistoryCards.jsx");
  const entry = {
    id: "report-a",
    name: "<script>report</script>",
    status: "failed",
    counts: report.counts,
    lastImportedAt: Date.now(),
    start: report.start,
    passRate: report.passRate,
    duration: report.duration,
  };
  const state = await mount(
    React.createElement(HistoryCards, {
      entries: [entry],
      activeId: entry.id,
      formatDate: String,
      duration: String,
      href: () => "#runs",
      edit: (id) => calls.push(["edit", id]),
      trash: (id) => calls.push(["trash", id]),
    }),
  );
  try {
    await act(async () =>
      state.host.querySelector("[data-manage-history]").click(),
    );
    assert.deepEqual(calls.pop(), ["edit", entry.id]);
    await act(async () =>
      state.host.querySelector("[data-trash-history]").click(),
    );
    assert.deepEqual(calls.pop(), ["trash", entry.id]);
    assert.equal(state.host.querySelector("script"), null);
    assert.equal(state.host.querySelector("h3").textContent, entry.name);
  } finally {
    await state.cleanup();
  }
});

test("login password visibility preserves the value and never submits the form", async () => {
  const state = await mount(
    React.createElement(AuthPage, {
      route: "login",
      onSubmit: async () => assert.fail("Visibility toggle submitted the form"),
    }),
  );
  try {
    const input = state.host.querySelector('[name="password"]');
    input.value = "temporary-test-value";
    const toggle = state.host.querySelector('[aria-controls="auth-password"]');
    assert.equal(input.type, "password");
    await act(async () => toggle.click());
    assert.equal(input.type, "text");
    assert.equal(input.value, "temporary-test-value");
    assert.equal(toggle.getAttribute("aria-label"), "Hide password");
    assert.equal(toggle.getAttribute("aria-pressed"), "true");
    await act(async () => toggle.click());
    assert.equal(input.type, "password");
  } finally {
    await state.cleanup();
  }
});

test("Caps Lock feedback is announced and cleared when the password loses focus", async () => {
  const state = await mount(
    React.createElement(AuthPage, { route: "login", onSubmit: async () => {} }),
  );
  try {
    const input = state.host.querySelector('[name="password"]');
    const key = new dom.window.KeyboardEvent("keydown", {
      bubbles: true,
      key: "A",
      modifierCapsLock: true,
    });
    await act(async () => input.dispatchEvent(key));
    assert.equal(
      state.host.querySelector("#auth-password-caps").textContent,
      "Caps Lock is on.",
    );
    await act(async () =>
      input.dispatchEvent(
        new dom.window.FocusEvent("focusout", { bubbles: true }),
      ),
    );
    assert.equal(state.host.querySelector("#auth-password-caps"), null);
  } finally {
    await state.cleanup();
  }
});

test("project editor supports repeated creation and preserves errors without closing", async () => {
  const { ProjectEditor } = loadComponent("components/ProjectEditor.jsx");
  const saved = [];
  let closed = 0;
  const state = await mount(
    React.createElement(ProjectEditor, {
      onSave: async (name) => {
        if (name === "Duplicate")
          throw new Error("A project with this name already exists.");
        saved.push(name);
        return { name };
      },
      onClose: () => closed++,
    }),
  );
  const change = async (value) =>
    act(async () => {
      const input = state.host.querySelector('[name="name"]');
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      ).set.call(input, value);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  const submit = async () =>
    act(async () =>
      state.host
        .querySelector("form")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
  try {
    await act(async () =>
      state.host.querySelector('[type="checkbox"]').click(),
    );
    await change("First project");
    await submit();
    assert.deepEqual(saved, ["First project"]);
    assert.equal(closed, 0);
    assert.equal(state.host.querySelector('[name="name"]').value, "");
    await change("Duplicate");
    await submit();
    assert.match(
      state.host.querySelector('[role="alert"]').textContent,
      /already exists/,
    );
    assert.equal(closed, 0);
    await change("Second project");
    await act(async () =>
      state.host.querySelector('[type="checkbox"]').click(),
    );
    await submit();
    assert.deepEqual(saved, ["First project", "Second project"]);
    assert.equal(closed, 1);
  } finally {
    await state.cleanup();
  }
});

test("project picker preserves multiple selections while searching and requires explicit all-project access", async () => {
  const { ProjectAccessPicker } = loadComponent(
    "components/ProjectAccessPicker.jsx",
  );
  const state = await mount(
    React.createElement(
      "form",
      null,
      React.createElement(ProjectAccessPicker, {
        projects: [
          { id: "web", name: "Website" },
          { id: "mobile", name: "Mobile app" },
          { id: "api", name: "API" },
        ],
        selected: ["web"],
      }),
    ),
  );
  try {
    const form = state.host.querySelector("form");
    await act(async () =>
      state.host.querySelector('input[aria-label="Mobile app"]').click(),
    );
    assert.deepEqual(new dom.window.FormData(form).getAll("projects").sort(), [
      "mobile",
      "web",
    ]);
    await act(async () => {
      const input = state.host.querySelector('[type="search"]');
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      ).set.call(input, "API");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(state.host.querySelectorAll('[type="checkbox"]').length, 1);
    assert.deepEqual(new dom.window.FormData(form).getAll("projects").sort(), [
      "mobile",
      "web",
    ]);
    await act(async () => state.host.querySelector('[value="all"]').click());
    assert.deepEqual(new dom.window.FormData(form).getAll("projects"), ["*"]);
    await act(async () =>
      state.host.querySelector('[value="specific"]').click(),
    );
    assert.deepEqual(new dom.window.FormData(form).getAll("projects").sort(), [
      "mobile",
      "web",
    ]);
  } finally {
    await state.cleanup();
  }
});
