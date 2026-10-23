const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { jsPDF } = require("jspdf");
const ReportData = require("../../src/shared/report-data");
const Investigations = require("../../src/shared/investigation-model");
const PDF = require("../../src/shared/report-pdf");
const fontData = fs
  .readFileSync(
    require.resolve("../../public/assets/fonts/NotoSans-Regular.ttf"),
  )
  .toString("base64");
const fixture = (tests = []) =>
  ReportData.normalizeReport({
    stats: {
      tests: tests.length,
      passes: tests.filter((t) => t.state === "passed").length,
      failures: tests.filter((t) => t.state === "failed").length,
      pending: 0,
      skipped: 0,
      start: "2026-10-23T00:00:00Z",
      end: "2026-10-23T00:01:00Z",
      duration: 60000,
    },
    results: tests.length
      ? [{ file: "cypress/e2e/example.cy.ts", suites: [], tests }]
      : [],
  });
async function generate(report, options = {}) {
  const text = [];
  function RecordingPDF(configuration) {
    const doc = new jsPDF(configuration);
    const original = doc.text;
    doc.text = function (value, x, y, ...rest) {
      text.push({ value: String(value), x, y, page: doc.getNumberOfPages() });
      return original.call(doc, value, x, y, ...rest);
    };
    return doc;
  }
  const doc = await PDF.createDocument(report, "résultats.json", {
    jsPDF: RecordingPDF,
    fontData,
    groups: Investigations.failureGroups(report),
    generatedAt: new Date("2026-10-23T00:00:00Z"),
    ...options,
  });
  return { doc, text, content: text.map((item) => item.value).join("\n") };
}
test("PDF exports actual totals, metadata and literal error text without modifying the run", async () => {
  const report = fixture([
    { title: "Works", state: "passed", duration: 20 },
    {
      title: "Fails",
      state: "failed",
      duration: 40,
      err: { message: "<script>alert('x')</script> – café" },
    },
  ]);
  report.metadata = {
    project: "tomatoes",
    branch: "feature/pdf",
    environment: "local",
  };
  const original = JSON.stringify(report);
  const { doc, content } = await generate(report, {
    timeZone: "Asia/Singapore",
  });
  assert.equal(JSON.stringify(report), original);
  assert.match(content, /Registered tests\n2\nPassed\n1\nFailed\n1/);
  assert.match(content, /Project: tomatoes/);
  assert.match(content, /Branch: feature\/pdf/);
  assert.match(content, /50.0%/);
  assert.match(content, /08:00:00 \(Asia\/Singapore\)/);
  assert.match(content, /<script>alert\('x'\)<\/script> – café/);
  assert.match(content, /Created by Alex Ali/);
  const bytes = Buffer.from(doc.output("arraybuffer"));
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(bytes.length > 10000);
});
test("empty PDF reports remain valid and make missing failure data explicit", async () => {
  const { doc, content } = await generate(fixture());
  assert.match(content, /No spec records/);
  assert.match(content, /No failed tests recorded/);
  assert.doesNotMatch(content, /NaN|Infinity/);
  assert.ok(doc.getNumberOfPages() >= 1);
});
test("PDF paginates long failures, labels excerpt and test limits, and numbers every page", async () => {
  const report = fixture(
    Array.from({ length: PDF.LIMITS.failures + 1 }, (_, index) => ({
      title: `Failure ${index + 1} ` + "long title ".repeat(12),
      state: "failed",
      duration: 10,
      err: { message: "lengthy failure message ".repeat(130) },
    })),
  );
  const progress = [];
  const { doc, content, text } = await generate(report, {
    onProgress: (value) => progress.push(value),
  });
  assert.match(content, /Showing 200 of 201 failed tests/);
  assert.match(content, /Error excerpt shortened/);
  assert.doesNotMatch(content, /201\. Failure 201/);
  const pages = doc.getNumberOfPages();
  assert.ok(pages > 10);
  for (let page = 1; page <= pages; page++)
    assert.ok(content.includes(`${page} / ${pages}`));
  assert.ok(text.every((item) => item.y >= 10 && item.y <= 291));
  assert.equal(progress.at(-1), 95);
});
test("PDF filenames use the saved import time and configured timezone", async () => {
  const importedAt = Date.parse("2026-10-23T08:10:14Z");
  assert.equal(
    PDF.filename(importedAt, "Asia/Singapore"),
    "2026-10-23_16-10-14-report.pdf",
  );
  assert.equal(PDF.filename(importedAt), "2026-10-23_08-10-14-report.pdf");
  assert.equal(PDF.filename(0), "1970-01-01_00-00-00-report.pdf");
  assert.throws(
    () => PDF.filename("../../unsafe report.json"),
    /import time is unavailable/,
  );
  assert.throws(() => PDF.filename(null), /import time is unavailable/);
  await assert.rejects(
    () => PDF.createDocument(fixture(), "report"),
    /tools could not be loaded/,
  );
});

test("PDF options filter failure details while preserving full-run totals, and summary omits the appendix", async () => {
  const report = fixture([
    {
      title: "Login error",
      state: "failed",
      duration: 10,
      err: { message: "Missing button" },
    },
    {
      title: "Checkout error",
      state: "failed",
      duration: 20,
      err: { message: "Payment timeout" },
    },
  ]);
  const filtered = await generate(report, { failureSearch: "Login" });
  assert.match(filtered.content, /Registered tests\n2/);
  assert.match(filtered.content, /1 of 2 failures match/);
  assert.match(filtered.content, /1\. Login error/);
  assert.doesNotMatch(filtered.content, /2\. Checkout error/);
  const summary = await generate(report, { mode: "summary" });
  assert.doesNotMatch(summary.content, /Failed test details|ERROR DETAILS/);
  assert.ok(summary.doc.getNumberOfPages() < filtered.doc.getNumberOfPages());
  const absent = await generate(report, { failureSpec: "different.cy.ts" });
  assert.match(absent.content, /0 of 2 failures match/);
});
