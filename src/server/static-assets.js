const path = require("node:path");
const { PROJECT_ROOT } = require("./config");
const files = Object.create(null);
function add(route, relative) {
  files[route] = path.join(PROJECT_ROOT, relative);
}
add("/", "public/index.html");
add("/index.html", "public/index.html");
add("/js/react-app.js", ".tomatoes-data/client-build/react-app.js");
for (const name of [
  "app",
  "notifications",
  "appearance",
  "report-navigation",
  "import-history",
  "report-import",
  "import-branches",
  "import-projects",
  "preferences",
  "custom-widgets",
  "insights",
  "investigations",
  "team",
  "report-worker",
  "report-views",
  "pdf-export",
  "workspace-tools",
  "workspace-menu",
  "profile",
  "users",
  "auth",
  "web-analytics",
  "projects",
  "integrations",
]) {
  add(`/js/${name}.js`, `src/client/${name}.js`);
  add(`/${name}.js`, `src/client/${name}.js`);
}
for (const name of [
  "report-data",
  "report-links",
  "project-catalog",
  "project-management",
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
  "appearance",
  "custom-widgets",
  "insights",
  "responsive",
  "investigations",
  "team",
  "auth",
]) {
  add(`/css/${name}.css`, `public/css/${name}.css`);
  add(`/${name}.css`, `public/css/${name}.css`);
}
add("/assets/tomatoes-logo.svg", "public/assets/tomatoes-logo.svg");
add(
  "/assets/fonts/NotoSans-Regular.ttf",
  "public/assets/fonts/NotoSans-Regular.ttf",
);
add(
  "/vendor/vercel-analytics.mjs",
  "node_modules/@vercel/analytics/dist/index.mjs",
);
add("/vendor/pdf.mjs", "node_modules/pdfjs-dist/build/pdf.mjs");
add("/vendor/pdf.worker.mjs", "node_modules/pdfjs-dist/build/pdf.worker.mjs");
add("/vendor/jspdf.umd.min.js", "node_modules/jspdf/dist/jspdf.umd.min.js");
add("/results.json", "examples/reports/results.json");
for (const name of ["terms-of-use", "privacy-policy"]) {
  add(`/legal/${name}.sample.md`, `docs/legal/${name}.sample.md`);
}
function getStaticFile(pathname) {
  return files[pathname] || null;
}
module.exports = { files, getStaticFile };
