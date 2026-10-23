const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}
async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  try {
    await fs.writeFile(temporary, text, { mode: 0o600 });
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}
async function writeJSON(file, value) {
  return writeText(file, JSON.stringify(value));
}
module.exports = { readJSON, writeJSON, writeText };
