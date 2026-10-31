const fs = require("node:fs");
const path = require("node:path");
const { PROJECT_ROOT } = require("../../src/server/config");
function assetLinks(fingerprint) {
  if (!/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(fingerprint || ""))
    throw new Error("Use the release certificate SHA-256 fingerprint.");
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.tomatoes.reports",
        sha256_cert_fingerprints: [fingerprint.toUpperCase()],
      },
    },
  ];
}
if (require.main === module) {
  (async () => {
    const formatted = await require("prettier").format(
      JSON.stringify(assetLinks(process.argv[2])),
      { parser: "json" },
    );
    fs.writeFileSync(
      path.join(PROJECT_ROOT, "public/.well-known/assetlinks.json"),
      formatted,
    );
  })().catch(() => {
    console.error(
      "Could not generate the Android site association. Verify the release certificate fingerprint and dependencies.",
    );
    process.exitCode = 1;
  });
}
module.exports = { assetLinks };
