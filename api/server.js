const { createApplication } = require("../src/server/app");
function startupDiagnostic(error, env = process.env) {
  const known = {
    TOMATOES_CONFIG:
      "Check production database settings and the CA certificate.",
    TOMATOES_SCHEMA: "Run the production database migration.",
    ENOENT:
      "A required deployment file is missing; use an inline CA certificate on Vercel.",
    EROFS: "Hosted storage must use PostgreSQL rather than local files.",
    ENOTFOUND: "Database hostname could not be resolved.",
    ETIMEDOUT: "Database connection timed out.",
    ECONNREFUSED: "Database connection was refused.",
    "28P01": "Database credentials were rejected.",
    28000: "Database authentication was rejected.",
    SELF_SIGNED_CERT_IN_CHAIN: "Configure the Supabase CA certificate.",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "Configure the Supabase CA certificate.",
    CERT_HAS_EXPIRED: "The database CA certificate has expired.",
    ERR_TLS_CERT_ALTNAME_INVALID:
      "Database hostname does not match its certificate.",
  };
  const code = Object.hasOwn(known, error?.code)
    ? error.code
    : "STARTUP_FAILED";
  const missing = ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"].filter(
    (key) => !env[key],
  );
  if (env.VERCEL === "1" && env.TOMATOES_STORAGE !== "postgres")
    missing.push("TOMATOES_STORAGE=postgres");
  if (env.VERCEL === "1" && env.TOMATOES_TEAM_MODE !== "1")
    missing.push("TOMATOES_TEAM_MODE=1");
  return {
    event: "tomatoes_startup_failed",
    code,
    hint:
      known[code] ||
      "Check hosted storage, sign-in, origin, database connectivity, and schema migrations.",
    missing,
    inlineCertificateConfigured: Boolean(
      env.PGSSLROOTCERT_PEM || env.PGSSLROOTCERT_BASE64,
    ),
  };
}
function createServerlessHandler(
  factory = () => createApplication(),
  {
    reportError = (diagnostic) => console.error(JSON.stringify(diagnostic)),
  } = {},
) {
  let application, ready;
  return async function handler(req, res) {
    try {
      application ||= factory();
      ready ||= application.store.ready().catch((error) => {
        ready = null;
        throw error;
      });
      await ready;
      const url = new URL(req.url, "http://localhost");
      const route = url.searchParams.get("__tomatoes_path");
      if (route) {
        if (!route.startsWith("/api/") && route !== "/results.json") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        url.pathname = route;
        url.searchParams.delete("__tomatoes_path");
        req.url = url.pathname + url.search;
      }
      await application.handler(req, res);
    } catch (error) {
      reportError(startupDiagnostic(error));
      if (!res.headersSent) {
        res.writeHead(503, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(
          JSON.stringify({
            error:
              "Tomatoes is unavailable. Check deployment settings and database migrations.",
          }),
        );
      } else if (!res.writableEnded) res.end();
    }
  };
}
module.exports = createServerlessHandler();
module.exports.createServerlessHandler = createServerlessHandler;

module.exports.startupDiagnostic = startupDiagnostic;
