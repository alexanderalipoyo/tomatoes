const fs = require("node:fs");
const path = require("node:path");
const PROJECT_ROOT = path.resolve(__dirname, "../..");
function listFiles(relative, extension = ".js") {
  const result = [];
  function visit(folder) {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, item.name);
      if (item.isDirectory()) visit(full);
      else if (item.isFile() && item.name.endsWith(extension))
        result.push(full);
    }
  }
  visit(path.join(PROJECT_ROOT, relative));
  return result.sort();
}
module.exports = { PROJECT_ROOT, listFiles };
