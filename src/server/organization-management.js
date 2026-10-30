const Projects = require("../shared/project-management");
function validatePatch(value) {
  const fail = () => {
    throw Object.assign(
      new Error("Use an organization name and a valid PNG logo up to 100 KB."),
      { status: 400 },
    );
  };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Object.keys(value).length ||
    Object.keys(value).some((key) => !["name", "logo"].includes(key))
  )
    fail();
  const result = {};
  if (Object.hasOwn(value, "name"))
    result.name = Projects.validateName({ name: value.name });
  if (Object.hasOwn(value, "logo")) {
    const logo = value.logo;
    if (typeof logo !== "string" || logo.length > 100000) fail();
    if (logo) {
      if (
        !/^data:image\/png;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          logo,
        )
      )
        fail();
      const data = Buffer.from(logo.split(",")[1], "base64");
      if (
        data.length < 45 ||
        !data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
        data.readUInt32BE(8) !== 13 ||
        data.toString("ascii", 12, 16) !== "IHDR" ||
        !data
          .subarray(-12)
          .equals(Buffer.from("0000000049454e44ae426082", "hex"))
      )
        fail();
      const width = data.readUInt32BE(16),
        height = data.readUInt32BE(20);
      if (!width || !height || width > 256 || height > 256) fail();
    }
    result.logo = logo;
  }
  return result;
}
module.exports = { validatePatch };
