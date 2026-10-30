const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePatch } = require("../../src/server/organization-management");
const Projects = require("../../src/shared/project-management");
const logo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8RsAAAAASUVORK5CYII=";
test("organization updates validate names and bounded raster logos without requiring unrelated fields", () => {
  assert.deepEqual(validatePatch({ logo }), { logo });
  assert.deepEqual(validatePatch({ logo: "" }), { logo: "" });
  assert.deepEqual(validatePatch({ name: " Renamed " }), { name: "Renamed" });
  for (const value of [
    {},
    { logo: null },
    { logo: "data:image/svg+xml;base64,PHN2Zz4=" },
    { logo: "https://example.com/logo.png" },
    { logo: "x".repeat(100001) },
    { logo: "data:image/png;base64,iVBORw0KGgo=" },
    { name: "" },
    { logo, organizationId: "other" },
  ])
    assert.throws(
      () => validatePatch(value),
      (error) => error.status === 400,
    );
  const oversized = Buffer.from(logo.split(",")[1], "base64");
  oversized.writeUInt32BE(512, 16);
  assert.throws(
    () =>
      validatePatch({
        logo: "data:image/png;base64," + oversized.toString("base64"),
      }),
    (error) => error.status === 400,
  );
});
test("shared organization logo brands every project while preserving project names and fallback logos", () => {
  const directory = [
    { id: "portal", name: "Portal", registered: true },
    { id: "mobile", name: "Mobile", registered: true },
  ];
  const personal = [
    {
      project: "portal",
      name: "Old label",
      logo: "project-logo",
      website: "https://example.com",
    },
  ];
  const organization = { id: "default", name: "Organization", logo };
  assert.equal(
    Projects.branding("portal", directory, personal, organization).logo,
    logo,
  );
  assert.equal(
    Projects.branding("mobile", directory, personal, organization).logo,
    logo,
  );
  assert.equal(
    Projects.branding("portal", directory, personal, organization).name,
    "Portal",
  );
  assert.equal(
    Projects.branding("portal", directory, personal, {}).logo,
    "project-logo",
  );
});
