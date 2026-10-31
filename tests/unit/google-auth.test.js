const test = require("node:test");
const assert = require("node:assert/strict");
const { createGoogleAuth } = require("../../src/server/google-auth");
const clientId = "1234567890-test.apps.googleusercontent.com";
const base = {
  iss: "https://accounts.google.com",
  aud: clientId,
  sub: "google-test-user",
  email: "Member@gmail.com",
  email_verified: true,
  nonce: "nonce",
  iat: 1000,
  exp: 1500,
  name: " Member Name ",
};
test("Google sign-in validates audience, issuer, expiry, nonce, verified Gmail and subject", async () => {
  let claims = { ...base };
  const auth = createGoogleAuth(
    { TOMATOES_GOOGLE_CLIENT_ID: clientId },
    { now: () => 1100 * 1000, verifyToken: async () => claims },
  );
  assert.deepEqual(await auth.verify("signed-token", "nonce"), {
    sub: base.sub,
    email: "member@gmail.com",
    fullName: "Member Name",
  });
  for (const patch of [
    { aud: "someone-else" },
    { iss: "https://evil.example" },
    { exp: 1099 },
    { iat: 1200 },
    { nonce: "wrong" },
    { email_verified: false },
    { email_verified: "true" },
    { email: "member@unverified.example" },
    { sub: "" },
    { azp: "wrong-client" },
  ]) {
    claims = { ...base, ...patch };
    await assert.rejects(
      auth.verify("token", "nonce"),
      /could not be verified/,
    );
  }
  await assert.rejects(auth.verify("x".repeat(12001), "nonce"));
  const rejected = createGoogleAuth(
    { TOMATOES_GOOGLE_CLIENT_ID: clientId },
    {
      verifyToken: async () => {
        throw new Error("invalid signature");
      },
    },
  );
  await assert.rejects(
    rejected.verify("token", "nonce"),
    /could not be verified/,
  );
  assert.equal(createGoogleAuth({}).enabled, false);
  assert.throws(
    () => createGoogleAuth({ TOMATOES_GOOGLE_CLIENT_ID: "invalid" }),
    /valid Google/,
  );
});
