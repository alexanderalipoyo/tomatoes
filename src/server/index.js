const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createTeamService } = require("./team-service");
const { createSlackNotifier } = require("./slack-notifier");
const { loadLocalEnvironment, PROJECT_ROOT } = require("./config");
const { createConfiguredStore } = require("./storage/index");
loadLocalEnvironment();
const store = createConfiguredStore();
const team = createTeamService({
  store,
  slackNotifier: createSlackNotifier({
    webhookURL: process.env.TOMATOES_SLACK_WEBHOOK_URL,
    enabled: process.env.TOMATOES_SLACK_ENABLED !== "false",
    baseURL: process.env.TOMATOES_REPORT_BASE_URL || "",
  }),
  dataDir:
    process.env.TOMATOES_DATA_DIR || path.join(PROJECT_ROOT, ".tomatoes-data"),
  teamMode: process.env.TOMATOES_TEAM_MODE === "1",
  publicOrigin: process.env.TOMATOES_PUBLIC_ORIGIN || "",
  ciToken: process.env.TOMATOES_CI_TOKEN || "",
  ciProject: process.env.TOMATOES_CI_PROJECT || "tomatoes",
});
const { getStaticFile } = require("./static-assets");
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
  const file = getStaticFile(url.pathname);
  if (!file) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  fs.readFile(file, (err, data) => {
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
async function start() {
  await store.ready();
  server.listen(process.env.PORT || 3000, "127.0.0.1", () =>
    console.log(
      `Dashboard available at http://localhost:${process.env.PORT || 3000} (${store.kind} storage)`,
    ),
  );
}
start().catch(async () => {
  console.error(
    "Unable to start Tomatoes storage. Check .env.local and run npm run db:migrate for PostgreSQL.",
  );
  await store.close().catch(() => {});
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
  });
