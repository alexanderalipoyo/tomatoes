const path = require("node:path");
const { PROJECT_ROOT } = require("./config");
const files = Object.create(null);
function add(route, relative) {
  files[route] = path.join(PROJECT_ROOT, relative);
}
add("/", "public/index.html");
add("/index.html", "public/index.html");
for (const name of [
  "app",
  "notifications",
  "report-navigation",
  "import-history",
  "report-import",
  "preferences",
  "custom-widgets",
  "insights",
  "investigations",
  "team",
  "report-worker",
  "report-views",
  "pdf-export",
  "workspace-tools",
]) {
  add(`/js/${name}.js`, `src/client/${name}.js`);
  add(`/${name}.js`, `src/client/${name}.js`);
}
for (const name of [
  "report-data",
  "report-links",
  "dashboard-groups",
  "user-preferences",
  "investigation-model",
  "report-features",
  "report-pdf",
  "workspace-model",
]) {
  add(`/js/${name}.js`, `src/shared/${name}.js`);
  add(`/${name}.js`, `src/shared/${name}.js`);
}
for (const name of [
  "styles",
  "custom-widgets",
  "insights",
  "responsive",
  "investigations",
  "team",
]) {
  add(`/css/${name}.css`, `public/css/${name}.css`);
  add(`/${name}.css`, `public/css/${name}.css`);
}
add("/assets/tomatoes-logo.svg", "public/assets/tomatoes-logo.svg");
add(
  "/assets/fonts/NotoSans-Regular.ttf",
  "public/assets/fonts/NotoSans-Regular.ttf",
);
add("/vendor/pdf.mjs", "node_modules/pdfjs-dist/build/pdf.mjs");
add("/vendor/pdf.worker.mjs", "node_modules/pdfjs-dist/build/pdf.worker.mjs");
add("/vendor/jspdf.umd.min.js", "node_modules/jspdf/dist/jspdf.umd.min.js");
add("/results.json", "examples/reports/results.json");
function getStaticFile(pathname) {
  return files[pathname] || null;
}
module.exports = { files, getStaticFile };
