const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("../../src/client/report-import");

function fixture(importFile = async () => {}, config = {}) {
  class Element extends EventTarget {
    constructor() {
      super();
      const classes = new Set();
      this.classList = {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
      };
      this.open = false;
      this.hidden = true;
      this.value = "";
      this.files = [];
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    }
    click() {
      this.dispatchEvent(new Event("click"));
    }
    contains(target) {
      return target === this;
    }
  }
  const elements = Object.fromEntries(
    [
      "import-dialog",
      "report-drop-zone",
      "report-file",
      "import-selection-error",
      "import-report",
      "close-import",
      "browse-report",
    ].map((id) => [id, new Element()]),
  );
  const document = new EventTarget();
  document.getElementById = (id) => elements[id];
  let busy = false;
  const imports = [];
  setup({
    ...config,
    document,
    isBusy: () => busy,
    importFile: async (file, options) => {
      imports.push(file);
      await importFile(file, options);
    },
  });
  function fire(id, type, files = [], types = ["Files"]) {
    const event = new Event(type, { cancelable: true });
    event.dataTransfer = { types, files };
    (id === "document" ? document : elements[id]).dispatchEvent(event);
    return event;
  }
  return {
    elements,
    imports,
    fire,
    setBusy(value) {
      busy = value;
    },
  };
}

test("dropped and browsed reports enter the same importer with the original file", async () => {
  const f = fixture();
  const file = { name: "report.json", size: 100 };
  f.elements["import-report"].click();
  assert.equal(f.elements["import-dialog"].open, true);
  assert.equal(
    f.fire("report-drop-zone", "drop", [file]).defaultPrevented,
    true,
  );
  assert.equal(f.elements["import-dialog"].open, false);
  assert.equal(f.imports[0], file);
  await new Promise(setImmediate);
  f.elements["import-report"].click();
  f.elements["report-file"].files = [file];
  f.elements["report-file"].value = "report.json";
  f.fire("report-file", "change");
  assert.equal(f.imports[1], file);
  assert.equal(f.elements["report-file"].value, "");
});

test("multiple files and folder drops keep the dialog open without importing", () => {
  const f = fixture();
  f.elements["import-report"].click();
  f.fire("report-drop-zone", "drop", [
    { name: "one.json" },
    { name: "two.json" },
  ]);
  assert.match(
    f.elements["import-selection-error"].textContent,
    /one report at a time/,
  );
  assert.equal(f.elements["import-selection-error"].hidden, false);
  assert.equal(f.elements["import-dialog"].open, true);
  f.fire("report-drop-zone", "drop", []);
  assert.match(f.elements["import-selection-error"].textContent, /Folders/);
  assert.equal(f.imports.length, 0);
});

test("rendering and an in-flight import block additional drops", async () => {
  let finish;
  const f = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const file = { name: "report.json" };
  f.elements["import-report"].click();
  f.setBusy(true);
  f.fire("report-drop-zone", "drop", [file]);
  assert.equal(f.imports.length, 0);
  assert.equal(
    f.fire("report-drop-zone", "dragover").dataTransfer.dropEffect,
    "none",
  );
  f.setBusy(false);
  f.fire("report-drop-zone", "drop", [file]);
  f.elements["import-report"].click();
  f.fire("report-drop-zone", "drop", [file]);
  assert.equal(f.imports.length, 1);
  assert.equal(f.elements["import-dialog"].open, false);
  finish();
  await new Promise(setImmediate);
});

test("nested drag events retain the highlight until leaving or cancelling", () => {
  const f = fixture();
  const zone = f.elements["report-drop-zone"];
  f.elements["import-report"].click();
  f.fire("report-drop-zone", "dragenter");
  f.fire("report-drop-zone", "dragenter");
  f.fire("report-drop-zone", "dragleave");
  assert.equal(zone.classList.contains("is-dragging"), true);
  f.fire("report-drop-zone", "dragleave");
  assert.equal(zone.classList.contains("is-dragging"), false);
  f.fire("report-drop-zone", "dragenter");
  f.elements["close-import"].click();
  assert.equal(zone.classList.contains("is-dragging"), false);
});

test("missed file drops prevent navigation and text drags stay untouched", () => {
  const f = fixture();
  assert.equal(
    f.fire("document", "drop", [{ name: "report.json" }]).defaultPrevented,
    true,
  );
  assert.equal(f.fire("document", "dragover").dataTransfer.dropEffect, "none");
  assert.equal(
    f.fire("document", "drop", [], ["text/plain"]).defaultPrevented,
    false,
  );
  assert.equal(f.imports.length, 0);
});

test("branch selection reaches the importer for drops and validation keeps invalid choices in the dialog", async () => {
  let selected;
  const f = fixture(
    async (file, options) => {
      selected = options;
    },
    { getImportOptions: () => ({ branch: "feature/a" }) },
  );
  f.elements["import-report"].click();
  f.fire("report-drop-zone", "drop", [{ name: "report.json" }]);
  assert.deepEqual(selected, { branch: "feature/a" });
  const invalid = fixture(async () => {}, {
    getImportOptions: () => {
      throw Error("Enter a branch name");
    },
  });
  invalid.elements["import-report"].click();
  invalid.fire("report-drop-zone", "drop", [{ name: "report.json" }]);
  assert.equal(invalid.imports.length, 0);
  assert.equal(invalid.elements["import-dialog"].open, true);
  assert.match(
    invalid.elements["import-selection-error"].textContent,
    /branch name/,
  );
});
test("loading previous branches blocks file imports until branch options are ready", async () => {
  let ready;
  const f = fixture(async () => {}, {
    prepareImport: () =>
      new Promise((resolve) => {
        ready = resolve;
      }),
  });
  f.elements["import-report"].click();
  assert.equal(f.elements["browse-report"].disabled, true);
  f.fire("report-drop-zone", "drop", [{ name: "report.json" }]);
  assert.equal(f.imports.length, 0);
  ready();
  await new Promise(setImmediate);
  assert.equal(f.elements["browse-report"].disabled, false);
  f.fire("report-drop-zone", "drop", [{ name: "report.json" }]);
  assert.equal(f.imports.length, 1);
});

test("mandatory import fields block both the file picker and dropped files", () => {
  let valid = false;
  const f = fixture(async () => {}, {
    getImportOptions: () => {
      if (!valid) throw new Error("Select a project and branch.");
      return { project: "portal", branch: "main" };
    },
  });
  let pickerOpened = 0;
  f.elements["report-file"].click = () => {
    pickerOpened++;
  };
  f.elements["import-report"].click();
  f.elements["browse-report"].click();
  assert.equal(pickerOpened, 0);
  assert.match(
    f.elements["import-selection-error"].textContent,
    /Select a project and branch/,
  );
  f.fire("report-drop-zone", "drop", [{ name: "report.json" }]);
  assert.equal(f.imports.length, 0);
  assert.equal(f.elements["import-dialog"].open, true);
  valid = true;
  f.elements["browse-report"].click();
  assert.equal(pickerOpened, 1);
  assert.equal(f.elements["import-selection-error"].hidden, true);
});
