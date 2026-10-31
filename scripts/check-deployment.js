const { files } = require("../src/server/static-assets");
async function checkDeployment(origin, { request = fetch } = {}) {
  const base = new URL(origin);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password
  )
    throw new Error("Provide an HTTP(S) deployment URL without credentials.");
  const failures = [];
  const routes = [
    "/",
    ...Object.keys(files).filter(
      (route) => route.startsWith("/js/") || route.startsWith("/css/"),
    ),
    "/build-manifest.json",
    "/api/team/status",
  ];
  for (const route of routes) {
    try {
      const response = await request(new URL(route, base.origin), {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      const type = response.headers.get("content-type") || "";
      if (response.status !== 200) {
        failures.push(
          `${route}: HTTP ${response.status}${response.status >= 300 && response.status < 400 ? " (redirect; check deployment protection)" : ""}`,
        );
        if (
          route === "/api/team/status" &&
          response.status === 403 &&
          type.includes("application/json")
        ) {
          const payload = await response.json();
          if (payload.error?.includes("Unrecognized server host"))
            failures.push(
              `Host configuration: set TOMATOES_PUBLIC_ORIGIN=${base.origin} in this Vercel project's Production environment, check TOMATOES_REPORT_BASE_URL, and redeploy. The current host is outside the configured allowlist.`,
            );
        } else await response.body?.cancel();
        continue;
      }
      if (route.endsWith(".js") && !/(?:javascript|ecmascript)/i.test(type))
        failures.push(
          `${route}: expected JavaScript, received ${type || "no content type"}`,
        );
      else if (route.endsWith(".css") && !type.includes("text/css"))
        failures.push(
          `${route}: expected CSS, received ${type || "no content type"}`,
        );
      else if (route === "/" && !type.includes("text/html"))
        failures.push("/: expected HTML");
      if (route === "/api/team/status") {
        const status = await response.json();
        if (status.enabled !== true || status.storage !== "postgres")
          failures.push(
            `${route}: hosted sign-in and PostgreSQL must be enabled`,
          );
      } else if (route === "/build-manifest.json") {
        const manifest = await response.json();
        if (
          manifest.version !== 1 ||
          !manifest.files?.some((item) => item.path === "js/auth.js")
        )
          failures.push(`${route}: missing generated application assets`);
      } else await response.body?.cancel();
    } catch {
      failures.push(`${route}: unavailable or invalid response`);
    }
  }
  return { checked: routes.length, failures };
}
if (require.main === module) {
  const origin = process.argv[2];
  if (!origin) {
    console.error("Usage: npm run deploy:check -- https://your-app.vercel.app");
    process.exitCode = 1;
  } else
    checkDeployment(origin)
      .then(({ checked, failures }) => {
        if (failures.length) {
          console.error("Deployment check failed:\n" + failures.join("\n"));
          console.error(
            "Deploy the repository root with npm run vercel-build and output directory dist. Confirm package.json and vercel.json are in the deployed commit.",
          );
          process.exitCode = 1;
        } else
          console.log(
            `Deployment verified: ${checked} pages, assets, and API checks passed.`,
          );
      })
      .catch(() => {
        console.error("Invalid deployment URL.");
        process.exitCode = 1;
      });
}
module.exports = { checkDeployment };
