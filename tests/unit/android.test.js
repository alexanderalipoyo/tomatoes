const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { assetLinks } = require("../../scripts/android/write-assetlinks");
const { getStaticFile } = require("../../src/server/static-assets");
test("Android association validates public certificate fingerprints and binds only the production package", () => {
  const fingerprint = Array(32).fill("ab").join(":");
  const [statement] = assetLinks(fingerprint);
  assert.equal(statement.target.package_name, "com.tomatoes.reports");
  assert.equal(
    statement.target.sha256_cert_fingerprints[0],
    fingerprint.toUpperCase(),
  );
  assert.deepEqual(statement.relation, [
    "delegate_permission/common.handle_all_urls",
  ]);
  for (const invalid of [
    "",
    "http://localhost",
    "AB:CD",
    Array(32).fill("xx").join(":"),
  ])
    assert.throws(() => assetLinks(invalid));
});
test("Android verification assets are public build inputs and do not expose private signing files", () => {
  const statements = JSON.parse(
    fs.readFileSync(getStaticFile("/.well-known/assetlinks.json"), "utf8"),
  );
  assert.ok(Array.isArray(statements));
  const manifest = JSON.parse(
    fs.readFileSync(getStaticFile("/manifest.webmanifest"), "utf8"),
  );
  assert.equal(manifest.start_url, "/#runs");
  assert.equal(
    getStaticFile("/.tomatoes-data/android-signing/signing.json"),
    null,
  );
  assert.equal(getStaticFile("/tomatoes-release.p12"), null);
});
