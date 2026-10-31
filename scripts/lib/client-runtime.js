const fs = require("node:fs/promises");
const path = require("node:path");
const { PROJECT_ROOT } = require("./project-files");
const { getStaticFile } = require("../../src/server/static-assets");
async function clientRuntimeSource() {
  const catalog = await fs.readFile(
    path.join(PROJECT_ROOT, "src/client/react/runtime-modules.json"),
    "utf8",
  );
  const routes = JSON.parse(catalog);
  if (
    !Array.isArray(routes) ||
    !routes.length ||
    routes.some(
      (route) =>
        typeof route !== "string" || !/^\/js\/[a-z0-9-]+\.js$/.test(route),
    )
  )
    throw new Error("Invalid client runtime module catalog.");
  const modules = [];
  for (const route of routes) {
    const file = getStaticFile(route);
    if (!file) throw new Error("Unregistered client module: " + route);
    const source = await fs.readFile(file, "utf8");
    modules.push(
      source.replace(
        /typeof module !== "undefined" && module\.exports/g,
        "false",
      ),
    );
  }
  return `export async function startFeatureControllers(){\nglobalThis.canAccessBrowserImport=canAccessBrowserImport;\n${modules.join("\n;\n")}\n}`;
}
function clientRuntimePlugin() {
  return {
    name: "tomatoes-client-runtime",
    setup(build) {
      build.onResolve({ filter: /^tomatoes:controllers$/ }, () => ({
        path: "controllers",
        namespace: "tomatoes-runtime",
      }));
      build.onLoad(
        { filter: /.*/, namespace: "tomatoes-runtime" },
        async () => ({
          contents: await clientRuntimeSource(),
          loader: "js",
          resolveDir: path.join(PROJECT_ROOT, "src/client"),
        }),
      );
    },
  };
}
module.exports = { clientRuntimeSource, clientRuntimePlugin };
