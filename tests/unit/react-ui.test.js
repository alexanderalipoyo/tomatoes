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
    structuredClone,
    crypto: require("node:crypto").webcrypto,
    AbortSignal,
    window: dom.window,
    document: dom.window.document,
    URL,
    location: dom.window.location,
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
test("desktop and mobile navigation separate Previous runs from Latest run", () => {
  const { Sidebar } = loadComponent("components/Sidebar.jsx");
  const { MobileNavigation } = loadComponent("components/MobileNavigation.jsx");
  for (const Component of [Sidebar, MobileNavigation]) {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(React.createElement(Component));
    assert.equal(
      host.querySelector('[data-view="runs"]').getAttribute("href"),
      "#latest-run",
    );
    const previous = host.querySelector('[data-view="previous-runs"]');
    assert.equal(previous.getAttribute("href"), "#previous-runs");
    assert.match(previous.textContent, /Previous runs/);
  }
});

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
    assert.equal(form.elements.password.value, "");
    assert.equal(form.elements.email.value, "tester@example.com");
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

// Native dialogs are simulated so lifecycle and confirmation behavior can be tested.
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const change = async (element, value) =>
  act(async () => {
    const prototype =
      element.tagName === "SELECT"
        ? dom.window.HTMLSelectElement.prototype
        : element.type === "checkbox"
          ? dom.window.HTMLInputElement.prototype
          : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(
      prototype,
      element.type === "checkbox" ? "checked" : "value",
    ).set.call(element, value);
    element.dispatchEvent(
      new dom.window.Event(
        element.tagName === "SELECT" || element.type === "checkbox"
          ? "change"
          : "input",
        { bubbles: true },
      ),
    );
  });

test("React role matrix combines page and feature filters and saves the complete draft with revision", async () => {
  const { RoleAccessPage } = loadComponent("pages/RoleAccessPage.jsx"),
    Policy = require("../../src/shared/access-policy"),
    calls = [];
  const request = async (route, options) => {
    calls.push({ route, ...options });
    return options
      ? { revision: 5 }
      : {
          features: Policy.features,
          permissions: {
            editor: Policy.configured({}, "editor"),
            viewer: Policy.configured({}, "viewer"),
          },
          revision: 4,
          organization: { name: "Dynamic organization" },
        };
  };
  const state = await mount(
    React.createElement(RoleAccessPage, {
      request,
      onRefresh: async () => {},
      onToast: () => {},
    }),
  );
  try {
    assert.equal(
      state.host.querySelectorAll('[data-role="admin"]:checked:disabled')
        .length,
      136,
    );
    const key = "settings-appearance.save-appearance-preferences";
    await act(async () =>
      state.host
        .querySelector(`[data-role="editor"][data-permission="${key}"]`)
        .click(),
    );
    await change(state.host.querySelector("#role-access-page"), "Users");
    await change(state.host.querySelector("#role-access-kind"), "editable");
    assert.match(
      state.host.querySelector("#role-access-count").textContent,
      /3 of 136/,
    );
    await change(
      state.host.querySelector("#role-access-search"),
      "no-such-feature",
    );
    assert.match(state.host.textContent, /No matching features/);
    await act(async () =>
      state.host.querySelector("#role-access-clear").click(),
    );
    await change(state.host.querySelector("#role-access-kind"), "changed");
    assert.equal(state.host.querySelectorAll('[data-role="editor"]').length, 1);
    await act(async () =>
      state.host
        .querySelector("form")
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    const body = JSON.parse(calls.at(-1).body);
    assert.equal(body.revision, 4);
    assert.equal(body.permissions.editor[key], false);
    assert.equal(Object.keys(body.permissions.viewer).length, 136);
    assert.equal(state.host.querySelector("#role-access-save").disabled, true);
  } finally {
    await state.cleanup();
  }
});
const pageRun = (n) => ({
  id: n.toString(16).padStart(64, "0"),
  name: `report-${n}.json`,
  status: "passed",
  receivedAt: 1000 - n,
  start: "2026-10-31T00:00:00Z",
  metadata: { project: "web", branch: "main" },
  counts: { total: 1, passed: 1, failed: 0, pending: 0, skipped: 0 },
  duration: 1,
  passRate: 100,
});
test("React Projects loads older runs without duplicates even when browser storage is blocked", async () => {
  const { ProjectsPage } = loadComponent("pages/ProjectsPage.jsx"),
    requests = [];
  const request = async (route) => {
    requests.push(route);
    if (route === "/api/projects")
      return {
        projects: [{ id: "web", name: "Web", registered: true }],
        canManage: false,
      };
    return route.includes("cursor=")
      ? { runs: [pageRun(2), pageRun(3)], nextCursor: null }
      : { runs: [pageRun(1), pageRun(2)], nextCursor: "page-2" };
  };
  const state = await mount(
    React.createElement(ProjectsPage, {
      request,
      historyStore: {
        list: async () => {
          throw new Error("Storage blocked");
        },
      },
      historyFallback: [],
      can: () => true,
      branding: (id) => ({ name: id }),
      currentProject: "web",
      reportLink: (run) => "#runs?" + run.id,
      openReport: () => {},
      onImport: () => {},
      onDirectory: () => {},
      onHistory: async () => {},
      onToast: () => {},
      formatDate: (value) => value,
    }),
  );
  try {
    assert.match(
      state.host.textContent,
      /Browser archives could not be loaded/,
    );
    assert.match(
      state.host.querySelector("#projects-page-status").textContent,
      /2 shared reports/,
    );
    assert.equal(
      requests.filter((route) => route.includes("cursor=")).length,
      0,
    );
    await act(async () =>
      state.host.querySelector("[data-project-runs]").click(),
    );
    assert.equal(state.host.querySelector("#project-runs-dialog").open, true);
    await act(async () =>
      state.host.querySelector("#project-runs-more").click(),
    );
    assert.match(
      state.host.querySelector("#projects-page-status").textContent,
      /3 shared reports/,
    );
    assert.equal(
      state.host.querySelectorAll("[data-open-project-run]").length,
      3,
    );
    assert.equal(state.host.querySelector("#project-runs-more").hidden, true);
    assert.equal(
      requests.filter((route) => route.includes("cursor=")).length,
      1,
    );
  } finally {
    await state.cleanup();
  }
});
test("React Sharing appends older reports without resetting the first page", async () => {
  const { SharingPage } = loadComponent("pages/SharingPage.jsx"),
    requests = [];
  const request = async (route) => {
    requests.push(route);
    return route === "/api/team/status"
      ? {
          enabled: false,
          storage: "postgres",
          accessibleProjects: [{ id: "web", name: "Web" }],
        }
      : route.includes("cursor=")
        ? { runs: [pageRun(2), pageRun(3)], nextCursor: null }
        : { runs: [pageRun(1), pageRun(2)], nextCursor: "page-2" };
  };
  const state = await mount(
    React.createElement(SharingPage, {
      request,
      onStatus: () => {},
      branding: (id) => ({ name: id }),
      selectedProject: "web",
      hasReport: false,
      historyCount: 0,
      onToast: () => {},
      onOpen: async () => {},
      onPublish: async () => {},
      onSaveHistory: async () => {},
    }),
  );
  try {
    assert.equal(state.host.querySelectorAll("[data-open-shared]").length, 2);
    await act(async () => state.host.querySelector("#team-load-more").click());
    assert.equal(state.host.querySelectorAll("[data-open-shared]").length, 3);
    assert.equal(state.host.querySelector("#team-load-more").hidden, true);
    assert.equal(
      requests.filter((route) => route.includes("cursor=")).length,
      1,
    );
    assert.equal(
      requests.filter((route) => route === "/api/team/status").length,
      1,
    );
  } finally {
    await state.cleanup();
  }
});
test("React analytics and widget editor render real report data without HTML templates", async () => {
  const report = normalizeReport(fixture),
    { AnalyticsPage } = loadComponent("pages/AnalyticsPage.jsx"),
    { GroupWidgetEditor } = loadComponent("components/GroupWidgets.jsx");
  const analytics = await mount(
    React.createElement(AnalyticsPage, {
      report,
      sourceName: "report.json",
      entries: [],
      activeId: null,
      formatDate: (value) => value,
      duration: (value) => String(value),
      onTest: () => {},
      onArea: () => {},
      onHistory: () => {},
    }),
  );
  try {
    assert.match(analytics.host.textContent, /Failure patterns/);
    assert.equal(
      analytics.host.querySelectorAll("[data-trend-filter]").length,
      3,
    );
  } finally {
    await analytics.cleanup();
  }
  const editor = await mount(
    React.createElement(GroupWidgetEditor, {
      initialGroups: [],
      report,
      sourceName: "report.json",
      duration: (value) => String(value),
      save: async (value) => value,
      onSaved: () => {},
      onToast: () => {},
      can: () => true,
    }),
  );
  try {
    assert.ok(
      editor.host.querySelector("#custom-widget-path-choice").options.length >
        1,
    );
    assert.match(editor.host.textContent, /Live group preview/);
  } finally {
    await editor.cleanup();
  }
});
test("every client view uses React rendering and startup modules are bundled at build time", async () => {
  const { listFiles } = require("../../scripts/lib/project-files");
  for (const file of listFiles("src/client"))
    assert.doesNotMatch(
      fs.readFileSync(file, "utf8"),
      /\.innerHTML\s*=|\.insertAdjacentHTML\(/,
      file,
    );
  const runtime = fs.readFileSync(
    path.resolve(__dirname, "../../src/client/react/runtime.js"),
    "utf8",
  );
  assert.ok(runtime.includes("tomatoes:controllers"));
  assert.doesNotMatch(runtime, /createElement|appendChild|document/);
  const source =
    await require("../../scripts/lib/client-runtime").clientRuntimeSource();
  assert.ok(source.includes("export async function startFeatureControllers"));
});

test("remaining React report views render fixtures and imported error text safely", () => {
  const report = normalizeReport(fixture),
    state = {
      ready: true,
      profileId: "local",
      profile: "Local",
      storage: "postgres",
      preferences: {
        profile: { firstName: "Alex", lastName: "Ali", email: "" },
      },
    };
  const { ReportSettingsPage } = loadComponent("pages/ReportSettingsPage.jsx"),
    { FlakyPage } = loadComponent("pages/FlakyPage.jsx"),
    { ComparisonForm, ComparisonOutput, FailureGroups } = loadComponent(
      "components/InvestigationViews.jsx",
    ),
    { TestDetail, PDFOptions, PDFPreview } = loadComponent(
      "components/ReportDialogs.jsx",
    ),
    { AppearanceSettings, GeneralSettings, OrganizationSettings } =
      loadComponent("pages/WorkspaceSettings.jsx"),
    Model = require("../../src/shared/investigation-model");
  const views = [
    [
      ReportSettingsPage,
      {
        report,
        sourceName: "fixture.json",
        zones: ["UTC"],
        preferences: { timeZone: "UTC" },
        pageSize: 15,
        historyCount: 1,
        state,
        formatDate: (value) => value,
        duration: (value) => String(value),
      },
    ],
    [
      FlakyPage,
      {
        report,
        entries: [],
        stability: null,
        duration: (value) => String(value),
        onAnalyze: () => {},
        onTest: () => {},
      },
    ],
    [
      ComparisonForm,
      { entries: [], selection: {}, formatDate: (value) => value },
    ],
    [
      ComparisonOutput,
      {
        comparison: { result: Model.compareRuns(report, report) },
        labels: {
          regressions: "New regressions",
          fixed: "Fixed",
          added: "Added",
          missing: "Missing",
          stateChanges: "State changes",
          stillFailing: "Still failing",
          slower: "Slower",
        },
        filter: "regressions",
        rows: [],
        search: "",
        duration: (value) => String(value),
      },
    ],
    [
      FailureGroups,
      {
        report,
        groups: Model.failureGroups(report),
        expanded: false,
        duration: (value) => String(value),
      },
    ],
    [PDFOptions, { name: "fixture.json", report, initialOptions: {} }],
    [
      PDFPreview,
      { outputName: "report.pdf", pageCount: 1, size: 10, url: "blob:test" },
    ],
    [AppearanceSettings, { state, selected: "system" }],
    [
      GeneralSettings,
      {
        state,
        draft: { saving: false },
        brand: { name: "Web", project: "web", logo: "", website: "" },
        registered: true,
      },
    ],
    [
      OrganizationSettings,
      {
        organization: { id: "default" },
        draft: { name: "Organization", logo: "" },
        canManage: true,
      },
    ],
  ];
  for (const [View, props] of views)
    assert.ok(
      renderToStaticMarkup(React.createElement(View, props)).length > 0,
      View.name,
    );
  const malicious = '<script>alert("report")</script>',
    test = {
      ...report.tests[0],
      error: malicious,
      stack: malicious,
      code: malicious,
      context: malicious,
    };
  const markup = renderToStaticMarkup(
    React.createElement(TestDetail, {
      test,
      duration: String,
      can: () => true,
      runId: null,
      listEvidence: async () => [],
      onUpload: async () => {},
      onHistory: () => {},
    }),
  );
  assert.ok(!markup.includes("<script>"));
  assert.ok(markup.includes("&lt;script&gt;"));
});
test("React Users keeps Editor access read-only and respects role filters", async () => {
  const { UsersPage } = loadComponent("pages/UsersPage.jsx"),
    Policy = require("../../src/shared/access-policy"),
    permissions = Policy.resolve({}, "editor");
  const data = {
    users: [
      {
        username: "alex",
        fullName: "Alex Ali",
        email: "alex@example.com",
        role: "admin",
        projects: ["web"],
        disabled: false,
      },
    ],
    roles: [
      {
        id: "admin",
        name: "Admin",
        description: "Organization administration",
      },
      { id: "viewer", name: "Viewer", description: "Read reports" },
    ],
    projects: [{ id: "web", name: "Web" }],
    organization: { id: "default", name: "Organization" },
    currentUsername: "editor",
    localMode: false,
  };
  const state = await mount(
    React.createElement(UsersPage, {
      request: async (route) =>
        route === "/api/team/status" ? { enabled: true } : data,
      can: (id) => Policy.can(permissions, id),
      onToast: () => {},
      currentProject: "web",
      onStatus: () => {},
    }),
  );
  try {
    assert.match(state.host.textContent, /Alex Ali/);
    assert.equal(state.host.querySelector("#users-add"), null);
    assert.equal(state.host.querySelector("[data-user-edit]"), null);
    assert.equal(state.host.querySelector("[data-user-status]"), null);
    assert.equal(
      state.host.querySelectorAll(".users-role-filter input").length,
      2,
    );
  } finally {
    await state.cleanup();
  }
});

test("React Users hides organization administration from project-scoped Admins", async () => {
  const { UsersPage } = loadComponent("pages/UsersPage.jsx");
  const state = await mount(
    React.createElement(UsersPage, {
      request: async (route) =>
        route === "/api/team/status"
          ? { enabled: true, canManageRoleAccess: false }
          : {
              users: [
                {
                  username: "member",
                  fullName: "Member",
                  role: "viewer",
                  projects: ["web"],
                  disabled: false,
                },
              ],
              organization: { name: "Organization" },
              roles: [],
              projects: [],
              currentUsername: "scoped",
            },
      can: () => true,
      onStatus: () => {},
      onToast: () => {},
      currentProject: "web",
    }),
  );
  try {
    assert.equal(state.host.querySelector("#users-add"), null);
    assert.equal(state.host.querySelector("[data-user-edit]"), null);
    assert.equal(state.host.querySelector("[data-user-status]"), null);
  } finally {
    await state.cleanup();
  }
});

test("workspace menu exposes a direct permission-gated Projects route independently of profile", () => {
  const { WorkspaceMenu } = loadComponent("components/WorkspaceMenu.jsx");
  const markup = renderToStaticMarkup(React.createElement(WorkspaceMenu));
  const host = document.createElement("div");
  host.innerHTML = markup;
  assert.equal(
    host.querySelector("#workspace-menu-projects").getAttribute("href"),
    "#projects",
  );
  assert.equal(
    host.querySelector("#workspace-menu-projects").dataset.accessView,
    "projects",
  );
  assert.equal(
    host.querySelector("#workspace-menu-profile").dataset.accessView,
    "profile",
  );
  assert.equal(
    host.querySelector("[data-workspace-menu-link]").dataset.accessView,
    "workspace-settings",
  );
});

test("custom dashboard honors saved metrics and does not offer unauthorized setup", () => {
  const { GroupDashboard, GroupWidgetEditor } = loadComponent(
    "components/GroupWidgets.jsx",
  );
  const report = normalizeReport(fixture);
  const props = {
    report,
    sourceName: "report.json",
    duration: String,
    onSpec: () => {},
  };
  const html = renderToStaticMarkup(
    React.createElement(GroupDashboard, {
      ...props,
      groups: [
        {
          id: "mine",
          name: "My preferred widget",
          paths: [report.specs[0].file],
          metrics: ["passRate"],
        },
      ],
    }),
  );
  assert.match(html, /My preferred widget/);
  assert.match(html, /Pass rate/);
  assert.doesNotMatch(html, /Cumulative test time/);
  const empty = renderToStaticMarkup(
    React.createElement(GroupDashboard, {
      ...props,
      groups: [],
      canManage: false,
    }),
  );
  assert.doesNotMatch(empty, /href="#settings"/);
  const unavailable = renderToStaticMarkup(
    React.createElement(GroupWidgetEditor, {
      ...props,
      initialGroups: [],
      ready: false,
      preferenceError: "Preferences unavailable",
      can: () => false,
    }),
  );
  assert.match(unavailable, /Preferences unavailable/);
  assert.match(unavailable, /inert/);
});

test("organization settings and adding an organization are separate menu actions", () => {
  const { WorkspaceMenu } = loadComponent("components/WorkspaceMenu.jsx");
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(React.createElement(WorkspaceMenu));
  const settings = host.querySelector("[data-workspace-menu-link]");
  const add = host.querySelector("#workspace-menu-add-organization");
  assert.match(settings.textContent, /Organization settings/);
  assert.ok(settings.querySelector("svg"));
  assert.equal(settings.querySelector(".workspace-menu-plus"), null);
  assert.match(add.textContent, /Add organization/);
  assert.equal(add.tagName, "BUTTON");
  assert.equal(add.disabled, false);
  assert.equal(add.hasAttribute("data-organization-create"), true);
  assert.doesNotMatch(add.textContent, /Coming soon/);
  assert.notEqual(settings, add);
});

test("Add organization form prevents duplicate creation and opens the created organization separately", async () => {
  const { OrganizationCreateForm } = loadComponent(
    "components/Organizations.jsx",
  );
  let resolveCreate,
    calls = 0,
    switched;
  const state = await mount(
    React.createElement(OrganizationCreateForm, {
      onCreate: async (name) => {
        calls++;
        assert.equal(name, "New workspace");
        return new Promise((resolve) => {
          resolveCreate = resolve;
        });
      },
      onSwitch: async (id) => {
        switched = id;
      },
      onToast: () => {},
    }),
  );
  try {
    const input = state.host.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    ).set;
    await act(async () => {
      setter.call(input, "New workspace");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    const form = state.host.querySelector("form");
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(calls, 1);
    assert.equal(state.host.querySelector("fieldset").disabled, true);
    await act(async () =>
      resolveCreate({ id: "second", name: "New workspace" }),
    );
    assert.equal(state.host.querySelector("form"), null);
    assert.match(
      state.host.textContent,
      /existing organization and projects remain/,
    );
    await act(async () => state.host.querySelector("button").click());
    assert.equal(switched, "second");
  } finally {
    await state.cleanup();
  }
});

test("organization list shows only additional memberships and switches the chosen identity", async () => {
  const { OrganizationList } = loadComponent("components/Organizations.jsx");
  let selected;
  const state = await mount(
    React.createElement(OrganizationList, {
      organizations: [
        { id: "first", name: "Current" },
        { id: "second", name: "Second" },
      ],
      currentId: "first",
      onSwitch: async (id) => {
        selected = id;
      },
    }),
  );
  try {
    assert.equal(state.host.querySelectorAll("button").length, 1);
    assert.match(state.host.textContent, /Second/);
    await act(async () => state.host.querySelector("button").click());
    assert.equal(selected, "second");
  } finally {
    await state.cleanup();
  }
});

test("Gmail signup has a separate screen and pending accounts cannot enter the report UI", async () => {
  const { AuthPage } = loadComponent("components/AuthPage.jsx");
  const signup = await mount(
    React.createElement(AuthPage, {
      route: "signup",
      onSubmit: async () => {},
      google: { enabled: false },
    }),
  );
  try {
    assert.match(signup.host.textContent, /Create your account/);
    assert.match(signup.host.textContent, /administrator setup/);
    assert.equal(signup.host.querySelector('input[type="password"]'), null);
    assert.equal(
      signup.host.querySelector('.auth-secondary-link[href="#login"]')
        .textContent,
      "Already have an account? Sign in",
    );
  } finally {
    await signup.cleanup();
  }
  let refreshed = 0,
    signedOut = 0;
  const pending = await mount(
    React.createElement(AuthPage, {
      route: "pending",
      user: { fullName: "Gmail Member", email: "member@gmail.com" },
      onRefreshAccess: async () => {
        refreshed++;
      },
      onSignOut: async () => {
        signedOut++;
      },
    }),
  );
  try {
    assert.match(pending.host.textContent, /member@gmail.com/);
    assert.match(pending.host.textContent, /organization administrator/);
    assert.equal(pending.host.querySelector("form"), null);
    await act(async () => pending.host.querySelectorAll("button")[0].click());
    await act(async () => pending.host.querySelectorAll("button")[1].click());
    assert.equal(refreshed, 1);
    assert.equal(signedOut, 1);
  } finally {
    await pending.cleanup();
  }
});

test("Google button sends the server nonce to Google and verifies a returned credential once", async () => {
  const { GoogleSignIn } = loadComponent("components/GoogleSignIn.jsx");
  let options,
    callbackCalls = 0;
  dom.window.google = {
    accounts: {
      id: {
        initialize: (value) => {
          options = value;
        },
        renderButton: (host) => {
          const button = document.createElement("button");
          button.textContent = "Continue with Google";
          host.append(button);
        },
      },
    },
  };
  const state = await mount(
    React.createElement(GoogleSignIn, {
      enabled: { clientId: "client.apps.googleusercontent.com" },
      mode: "signup",
      onChallenge: async (mode) => {
        assert.equal(mode, "signup");
        return { nonce: "server-nonce" };
      },
      onCredential: async (credential) => {
        callbackCalls++;
        assert.equal(credential, "signed-token");
      },
    }),
  );
  try {
    assert.equal(options.nonce, "server-nonce");
    assert.equal(options.auto_select, false);
    await act(async () => options.callback({ credential: "signed-token" }));
    assert.equal(callbackCalls, 1);
  } finally {
    await state.cleanup();
    delete dom.window.google;
  }
});

test("pending access blocks rapid repeated checks and preserves useful feedback", async () => {
  const { PendingAccess } = loadComponent("components/GoogleSignIn.jsx");
  let calls = 0,
    finish;
  const state = await mount(
    React.createElement(PendingAccess, {
      user: { fullName: "Member", email: "member@gmail.com" },
      onRefresh: async () => {
        calls++;
        await new Promise((resolve) => {
          finish = resolve;
        });
      },
      onSignOut: async () => {},
    }),
  );
  try {
    const button = state.host.querySelector("button");
    await act(async () => {
      button.click();
      button.click();
    });
    assert.equal(calls, 1);
    assert.equal(button.disabled, true);
    await act(async () => finish());
    assert.equal(button.disabled, false);
    assert.match(state.host.textContent, /No organization membership yet/);
  } finally {
    await state.cleanup();
  }
});

test("custom widgets combine search and status, sort metrics, and reset saved order", async () => {
  const { GroupDashboard } = loadComponent("components/GroupWidgets.jsx");
  const report = normalizeReport({
    stats: {},
    results: [
      {
        file: "cypress/e2e/a/spec.cy.js",
        tests: [{ state: "passed", duration: 100 }],
        suites: [],
      },
      {
        file: "cypress/smoke/b/spec.cy.js",
        tests: [
          { state: "failed", duration: 500 },
          { state: "failed", duration: 300 },
        ],
        suites: [],
      },
      {
        file: "cypress/e2e/c/spec.cy.js",
        tests: [{ state: "pending", duration: 0 }],
        suites: [],
      },
    ],
  });
  const groups = [
    {
      id: "b",
      name: "Zulu smoke",
      paths: ["cypress/smoke/b"],
      metrics: ["passRate"],
    },
    { id: "a", name: "Alpha", paths: ["cypress/e2e/a"], metrics: ["passRate"] },
    {
      id: "c",
      name: "Pending",
      paths: ["cypress/e2e/c"],
      metrics: ["passRate"],
    },
    { id: "empty", name: "Empty", paths: ["missing"], metrics: ["passRate"] },
  ];
  const original = JSON.stringify(groups);
  const state = await mount(
    React.createElement(GroupDashboard, {
      groups,
      report,
      sourceName: "test",
      duration: String,
      onSpec: () => {},
    }),
  );
  const names = () =>
    [...state.host.querySelectorAll("article h3")].map((el) => el.textContent);
  const change = async (label, value) =>
    act(async () => {
      const field = [...state.host.querySelectorAll("label")]
        .find((el) => el.textContent.includes(label))
        .querySelector("input,select");
      const prototype =
        field.tagName === "INPUT"
          ? dom.window.HTMLInputElement.prototype
          : dom.window.HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(
        field,
        value,
      );
      field.dispatchEvent(
        new dom.window.Event(field.tagName === "INPUT" ? "input" : "change", {
          bubbles: true,
        }),
      );
    });
  try {
    assert.deepEqual(names(), ["Zulu smoke", "Alpha", "Pending", "Empty"]);
    await change("Group name", "Alpha");
    assert.deepEqual(names(), ["Alpha"]);
    await change("Result status", "failed");
    assert.equal(names().length, 0);
    await act(async () =>
      [...state.host.querySelectorAll("button")]
        .find((el) => el.textContent === "Reset display")
        .click(),
    );
    assert.deepEqual(names(), ["Zulu smoke", "Alpha", "Pending", "Empty"]);
    await change("Group name", "Zulu smoke");
    await change("Search widgets", "  CYPRESS/SMOKE  ");
    assert.deepEqual(names(), ["Zulu smoke"]);
    await change("Result status", "passed");
    assert.equal(names().length, 0);
    assert.match(state.host.textContent, /No widgets match/);
    await act(async () =>
      [...state.host.querySelectorAll("button")]
        .find((el) => el.textContent === "Clear filters")
        .click(),
    );
    assert.equal(state.host.querySelectorAll("select")[0].value, "");
    for (const [sort, expected] of [
      ["name-asc", ["Alpha", "Empty", "Pending", "Zulu smoke"]],
      ["name-desc", ["Zulu smoke", "Pending", "Empty", "Alpha"]],
      ["failed", ["Zulu smoke", "Alpha", "Pending", "Empty"]],
      ["pass-asc", ["Zulu smoke", "Pending", "Alpha", "Empty"]],
      ["pass-desc", ["Alpha", "Zulu smoke", "Pending", "Empty"]],
      ["duration", ["Zulu smoke", "Alpha", "Pending", "Empty"]],
      ["tests", ["Zulu smoke", "Alpha", "Pending", "Empty"]],
    ]) {
      await change("Sort widgets", sort);
      assert.deepEqual(names(), expected, sort);
    }
    for (const [status, expected] of [
      ["passed", "Alpha"],
      ["failed", "Zulu smoke"],
      ["incomplete", "Pending"],
      ["empty", "Empty"],
    ]) {
      await change("Result status", status);
      assert.deepEqual(names(), [expected]);
    }
    await act(async () =>
      [...state.host.querySelectorAll("button")]
        .find((el) => el.textContent === "Reset display")
        .click(),
    );
    assert.deepEqual(names(), ["Zulu smoke", "Alpha", "Pending", "Empty"]);
    assert.equal(JSON.stringify(groups), original);
  } finally {
    await state.cleanup();
  }
});

test("custom widget subgroup dropdown includes every partner's roles without crossing test types", async () => {
  const { GroupDashboard } = loadComponent("components/GroupWidgets.jsx");
  const names = [
    "E2E : HIPAA COMP - EMPLOYEE",
    "E2E : HIPAA COMP - MANAGER",
    "E2E : INTERNAL BPP - MANAGER",
    "SMOKE : HIPAA COMP - PARTNER ADMIN",
    "E2E : HIPAA COMP EXTRA - MANAGER",
  ];
  const groups = names.map((name, index) => ({
    id: String(index),
    name,
    paths: ["cypress/e2e/example"],
    metrics: ["passRate"],
  }));
  const state = await mount(
    React.createElement(GroupDashboard, {
      groups,
      report: { specs: [] },
      sourceName: "test",
      duration: String,
      onSpec: () => {},
    }),
  );
  const select = [...state.host.querySelectorAll("label")]
    .find((el) => el.textContent.includes("Group name"))
    .querySelector("select");
  const choose = async (value) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLSelectElement.prototype,
        "value",
      ).set.call(select, value);
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
  const visible = () =>
    [...state.host.querySelectorAll("article h3")].map((el) => el.textContent);
  try {
    assert.ok(
      [...select.querySelectorAll('optgroup[label="Subgroups"] option')].some(
        (el) => el.textContent === "E2E : INTERNAL BPP",
      ),
    );
    await choose("E2E : HIPAA COMP");
    assert.deepEqual(visible(), names.slice(0, 2));
    await choose("E2E : INTERNAL BPP");
    assert.deepEqual(visible(), [names[2]]);
    await choose("SMOKE : HIPAA COMP");
    assert.deepEqual(visible(), [names[3]]);
    await choose(names[0]);
    assert.deepEqual(visible(), [names[0]]);
    await choose("");
    assert.deepEqual(visible(), names);
  } finally {
    await state.cleanup();
  }
});
