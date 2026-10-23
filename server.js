const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const files = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js",
  "/report-data.js": "report-data.js",
  "/results.json": "results.json",
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const server = http.createServer((req, res) => {
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
    });
    res.end(data);
  });
});
server.listen(process.env.PORT || 3000, "127.0.0.1", () =>
  console.log(
    "Dashboard available at http://localhost:" + (process.env.PORT || 3000),
  ),
);
