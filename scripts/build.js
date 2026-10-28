const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { PROJECT_ROOT } = require("../src/server/config");
const { files } = require("../src/server/static-assets");
async function build({
  output = path.join(PROJECT_ROOT, "dist"),
  env = process.env,
} = {}) {
  output = path.resolve(output);
  if (output !== path.join(PROJECT_ROOT, "dist"))
    throw new Error("Build output must be the project's dist directory.");
  // Only remove the explicitly checked, generated output folder.
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  const manifest = { version: 1, files: [] };
  const written = new Set();
  for (const [route, source] of Object.entries(files)) {
    if (route === "/results.json") continue;
    const relative = route === "/" ? "index.html" : route.slice(1);
    const target = path.resolve(output, relative);
    if (!target.startsWith(output + path.sep))
      throw new Error("Invalid public asset path.");
    if (written.has(relative)) continue;
    let bytes = await fs.readFile(source);
    if (
      relative === "index.html" &&
      env.VERCEL === "1" &&
      env.VERCEL_ENV === "production"
    ) {
      let client = {};
      if (env.VERCEL_OBSERVABILITY_CLIENT_CONFIG) {
        const supplied =
          JSON.parse(env.VERCEL_OBSERVABILITY_CLIENT_CONFIG).analytics || {};
        client.analytics = Object.fromEntries(
          [
            "scriptSrc",
            "eventEndpoint",
            "viewEndpoint",
            "sessionEndpoint",
            "dsn",
          ]
            .filter((key) => typeof supplied[key] === "string")
            .map((key) => [key, supplied[key]]),
        );
      }
      const encoded = Buffer.from(
        JSON.stringify({ enabled: true, client }),
      ).toString("base64");
      bytes = Buffer.from(
        bytes
          .toString("utf8")
          .replace(
            'name="tomatoes-analytics" content="disabled"',
            `name="tomatoes-analytics" content="${encoded}"`,
          ),
      );
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    written.add(relative);
    manifest.files.push({
      path: relative,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    });
  }
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  await fs.writeFile(
    path.join(output, "build-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}
if (require.main === module)
  build()
    .then((manifest) =>
      console.log(
        `Production build complete: ${manifest.files.length} public assets in dist/. No database connection or migration was performed.`,
      ),
    )
    .catch(() => {
      console.error(
        "Production build failed. Verify dependencies and public assets.",
      );
      process.exitCode = 1;
    });
module.exports = { build };
