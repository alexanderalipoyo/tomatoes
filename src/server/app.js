const ReportData = require("../shared/report-data");
const fs = require("node:fs");
const path = require("node:path");
const { createTeamService } = require("./team-service");
const { createSlackNotifier } = require("./slack-notifier");
const { createConfiguredStore } = require("./storage");
const { getStaticFile } = require("./static-assets");
const { PROJECT_ROOT } = require("./config");
const { createRecoverySender } = require("./recovery-email");
function createApplication({
  env = process.env,
  store = createConfiguredStore(),
} = {}) {
  const hosted = env.VERCEL === "1";
  const deploymentHost =
    env.VERCEL_ENV === "production"
      ? env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL
      : env.VERCEL_URL;
  const origin =
    env.TOMATOES_PUBLIC_ORIGIN ||
    (hosted && deploymentHost ? "https://" + deploymentHost : "");
  const additionalOrigins = hosted
    ? [
        env.VERCEL_URL,
        env.VERCEL_ENV === "production"
          ? env.VERCEL_PROJECT_PRODUCTION_URL
          : null,
      ]
        .filter(Boolean)
        .map((host) => "https://" + host)
    : [];
  if (
    hosted &&
    (store.kind !== "postgres" ||
      env.TOMATOES_TEAM_MODE !== "1" ||
      !origin ||
      new URL(origin).protocol !== "https:")
  )
    throw new Error(
      "Hosted deployments require PostgreSQL, sign-in, and an HTTPS application origin.",
    );
  const team = createTeamService({
    store,
    hosted,
    teamMode: env.TOMATOES_TEAM_MODE === "1",
    publicOrigin: origin,
    additionalOrigins,
    dataDir: env.TOMATOES_DATA_DIR || path.join(PROJECT_ROOT, ".tomatoes-data"),
    ciToken: env.TOMATOES_CI_TOKEN || "",
    ciProject: env.TOMATOES_CI_PROJECT || "tomatoes",
    recoverySender: createRecoverySender(env),
    slackNotifier: createSlackNotifier({
      webhookURL: env.TOMATOES_SLACK_WEBHOOK_URL,
      enabled: env.TOMATOES_SLACK_ENABLED !== "false",
      baseURL: env.TOMATOES_REPORT_BASE_URL || origin,
    }),
  });
  const types = {
    ".md": "text/plain; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".ttf": "font/ttf",
    ".svg": "image/svg+xml; charset=utf-8",
  };
  const handler = async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (await team.handle(req, res, url)) return;
    let dataUser;
    if (url.pathname === "/results.json") {
      try {
        dataUser = await team.authenticateData(req);
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
    let data;
    try {
      data = await fs.promises.readFile(file);
    } catch {
      res.writeHead(500);
      res.end("Unable to read file");
      return;
    }
    if (
      dataUser &&
      !(dataUser.projectScopes || dataUser.projects).includes("*")
    ) {
      const sampleProject =
        ReportData.normalizeReport(JSON.parse(data.toString("utf8"))).metadata
          .project || "tomatoes";
      if (
        !(dataUser.projectScopes || dataUser.projects).includes(sampleProject)
      ) {
        res.writeHead(403, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(
          JSON.stringify({
            error:
              "This report is outside your assigned projects. Open a project you can access.",
          }),
        );
        return;
      }
    }
    if (hosted && data.length > 4 * 1024 * 1024) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error:
            "This report exceeds the hosted response limit. Use the local Tomatoes server.",
        }),
      );
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
  };
  return { handler, store, team };
}
module.exports = { createApplication };
