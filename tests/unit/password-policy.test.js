const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validatePassword,
  matchesIdentity,
} = require("../../src/server/password-policy");
const { hashPassword } = require("../../src/server/team-service");
test("new passwords reject account identifiers and common examples", () => {
  const identity = {
    username: "automation-user",
    email: "automation@example.com",
  };
  for (const password of [
    identity.username,
    identity.email,
    identity.email.toUpperCase(),
    "password1234",
    "123456789012",
    " ".repeat(15),
    "short",
  ])
    assert.throws(
      () => validatePassword(password, identity),
      (error) => error.status === 400,
    );
  assert.equal(
    validatePassword("A unique sample passphrase!", identity),
    "A unique sample passphrase!",
  );
  assert.equal(matchesIdentity(identity.email, identity), true);
  assert.equal(matchesIdentity("other sample password", identity), false);
});
test("password records use independent salted hashes and contain no plaintext", () => {
  const password = "temporary-safe-passphrase";
  const a = hashPassword(password),
    b = hashPassword(password);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.deepEqual(Object.keys(a).sort(), ["hash", "salt"]);
  assert.ok(!JSON.stringify(a).includes(password));
});
