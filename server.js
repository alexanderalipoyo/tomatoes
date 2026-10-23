const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createTeamService } = require("./server-team");
const team = createTeamService({
  dataDir:
    process.env.TOMATOES_DATA_DIR || path.join(__dirname, ".tomatoes-data"),
  teamMode: process.env.TOMATOES_TEAM_MODE === "1",
  publicOrigin: process.env.TOMATOES_PUBLIC_ORIGIN || "",
  ciToken: process.env.TOMATOES_CI_TOKEN || "",
  ciProject: process.env.TOMATOES_CI_PROJECT || "tomatoes",
});
const files = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/insights.css": "insights.css",
  "/responsive.css": "responsive.css",
  "/investigations.css": "investigations.css",
  "/team.css": "team.css",
  "/assets/tomatoes-logo.svg": "assets/tomatoes-logo.svg",
  "/app.js": "app.js",
  "/insights.js": "insights.js",
  "/workspace-tools.js": "workspace-tools.js",
  "/report-features.js": "report-features.js",
  "/report-pdf.js": "report-pdf.js",
  "/vendor/pdf.mjs": "node_modules/pdfjs-dist/build/pdf.mjs",
  "/vendor/pdf.worker.mjs": "node_modules/pdfjs-dist/build/pdf.worker.mjs",
  "/vendor/jspdf.umd.min.js": "node_modules/jspdf/dist/jspdf.umd.min.js",
  "/assets/fonts/NotoSans-Regular.ttf": "assets/fonts/NotoSans-Regular.ttf",
  "/team.js": "team.js",
  "/investigation-model.js": "investigation-model.js",
  "/investigations.js": "investigations.js",
  "/import-history.js": "import-history.js",
  "/report-data.js": "report-data.js",
  "/report-worker.js": "report-worker.js",
  "/results.json": "results.json",
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml; charset=utf-8",
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (await team.handle(req, res, url)) return;
  if (url.pathname === "/results.json") {
    try {
      await team.authenticateData(req);
    } catch (error) {
      res.writeHead(error.status || 500, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ error: error.message }));
      return;
    }
  }
  const file = files[new URL(req.url, "http://localhost").pathname];
  if (!file) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  fs.readFile(path.join(__dirname, file), (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end("Unable to read file");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' blob: https://fonts.gstatic.com; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; frame-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    res.end(data);
  });
});
server.listen(process.env.PORT || 3000, "127.0.0.1", () =>
  console.log(
    "Dashboard available at http://localhost:" + (process.env.PORT || 3000),
  ),
);
