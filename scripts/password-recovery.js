const fs = require("node:fs/promises");
const path = require("node:path");
const { hashToken } = require("../src/server/team-service");
const { loadLocalEnvironment, PROJECT_ROOT } = require("../src/server/config");
const { createConfiguredStore } = require("../src/server/storage");
async function readRecoveryLink({ email, dataDir, store, now = Date.now() }) {
  email = String(email || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Usage: node scripts/password-recovery.js YOUR_EMAIL");
  const folder = dataDir;
  let record;
  try {
    record = JSON.parse(
      await fs.readFile(
        path.join(folder, "recovery-inbox", hashToken(email) + ".json"),
        "utf8",
      ),
    );
  } catch {
    throw new Error(
      "No recovery link found. Request one from Forgot password first.",
    );
  }
  if (!Number.isFinite(record.expires) || record.expires <= now)
    throw new Error(
      "This link has expired. Request a new one from Forgot password.",
    );
  let token;
  try {
    const url = new URL(record.link);
    token = new URLSearchParams(url.hash.split("?")[1]).get("token");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !/^[A-Za-z0-9_-]{43}$/.test(token || "")
    )
      throw new Error();
  } catch {
    throw new Error("This recovery message is invalid. Request a new link.");
  }
  const current = (await store.getUsers()).find(
    (user) =>
      !user.disabled &&
      user.email?.toLowerCase() === email &&
      user.resetHash === hashToken(token) &&
      Number(user.resetExpires) > now,
  );
  if (!current)
    throw new Error(
      "This link was used, replaced, or revoked. Request a new one from Forgot password.",
    );
  return record.link;
}
async function main() {
  loadLocalEnvironment();
  const store = createConfiguredStore();
  try {
    await store.ready();
    const link = await readRecoveryLink({
      email: process.argv[2],
      dataDir:
        process.env.TOMATOES_DATA_DIR ||
        path.join(PROJECT_ROOT, ".tomatoes-data"),
      store,
    });
    process.stdout.write(
      "Private password-reset link (do not share):\n" + link + "\n",
    );
  } finally {
    await store.close();
  }
}
module.exports = { readRecoveryLink };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
