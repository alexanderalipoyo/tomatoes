const path = require("node:path");
const fs = require("node:fs/promises");
const esbuild = require("esbuild");
const { PROJECT_ROOT } = require("./lib/project-files");
const output = path.join(
  PROJECT_ROOT,
  ".tomatoes-data/client-build/react-app.js",
);
async function buildReactClient() {
  const result = await esbuild.build({
    absWorkingDir: PROJECT_ROOT,
    entryPoints: ["src/client/react/main.jsx"],
    bundle: true,
    write: false,
    minify: true,
    format: "iife",
    target: ["es2022"],
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    legalComments: "inline",
  });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, result.outputFiles[0].contents);
}
module.exports = { buildReactClient, output };
