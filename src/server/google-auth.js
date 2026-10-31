const { OAuth2Client } = require("google-auth-library");
function createGoogleAuth(
  env = process.env,
  { verifyToken, now = () => Date.now() } = {},
) {
  const clientId = (env.TOMATOES_GOOGLE_CLIENT_ID || "").trim();
  if (
    clientId &&
    !/^[a-zA-Z0-9_.-]{8,200}\.apps\.googleusercontent\.com$/.test(clientId)
  )
    throw Object.assign(
      new Error("Set a valid Google Web application client ID."),
      { code: "TOMATOES_GOOGLE_CONFIG" },
    );
  const client = new OAuth2Client({
    clientId,
    transporterOptions: { timeout: 10000 },
  });
  const failure = () =>
    Object.assign(
      new Error("Google sign-in could not be verified. Please try again."),
      { status: 401 },
    );
  return {
    enabled: Boolean(clientId),
    clientId,
    async verify(credential, nonce) {
      if (
        !clientId ||
        typeof credential !== "string" ||
        credential.length > 12000 ||
        !credential
      )
        throw failure();
      let payload;
      try {
        payload = verifyToken
          ? await verifyToken(credential)
          : (
              await client.verifyIdToken({
                idToken: credential,
                audience: clientId,
              })
            ).getPayload();
      } catch {
        throw failure();
      }
      const clock = Math.floor(now() / 1000);
      if (
        !payload ||
        !["accounts.google.com", "https://accounts.google.com"].includes(
          payload.iss,
        ) ||
        payload.aud !== clientId ||
        (payload.azp && payload.azp !== clientId) ||
        !Number.isFinite(payload.exp) ||
        payload.exp <= clock ||
        !Number.isFinite(payload.iat) ||
        payload.iat > clock + 60 ||
        payload.iat < clock - 3600 ||
        typeof payload.sub !== "string" ||
        !/^[a-zA-Z0-9_-]{1,255}$/.test(payload.sub) ||
        payload.email_verified !== true ||
        typeof payload.email !== "string" ||
        payload.email.length > 254 ||
        !/^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@gmail\.com$/i.test(
          payload.email,
        ) ||
        payload.nonce !== nonce
      )
        throw failure();
      const email = payload.email.toLowerCase();
      const name =
        typeof payload.name === "string"
          ? payload.name
              .trim()
              .slice(0, 160)
              .replace(/[\x00-\x1f\x7f]/g, "")
          : "";
      return { sub: payload.sub, email, fullName: name || email.split("@")[0] };
    },
  };
}
module.exports = { createGoogleAuth };
