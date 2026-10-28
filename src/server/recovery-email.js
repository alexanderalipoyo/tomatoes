function createRecoverySender(env = process.env, { request = fetch } = {}) {
  if (!env.RESEND_API_KEY || !env.TOMATOES_AUTH_EMAIL_FROM) return null;
  return async ({ email, link }) => {
    const response = await request("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.TOMATOES_AUTH_EMAIL_FROM,
        to: [email],
        subject: "Reset your Tomatoes password",
        text:
          "A password reset was requested for your Tomatoes account. This link expires in 15 minutes and can be used once.\n\n" +
          link +
          "\n\nIf you did not request this, you can ignore this message.",
      }),
    });
    if (!response.ok)
      throw Object.assign(
        new Error(
          "Password recovery could not be delivered. Please try again later.",
        ),
        { status: 503 },
      );
  };
}
module.exports = { createRecoverySender };
