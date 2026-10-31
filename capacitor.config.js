const local = process.env.TOMATOES_IOS_MODE === "local";
const supplied = local
  ? process.env.TOMATOES_IOS_LOCAL_ORIGIN || "http://localhost:3004"
  : process.env.TOMATOES_IOS_PRODUCTION_ORIGIN ||
    "https://tomatoes-reports.vercel.app";
const origin = new URL(supplied);
if (
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  origin.pathname !== "/" ||
  (local
    ? !["http:", "https:"].includes(origin.protocol)
    : origin.protocol !== "https:") ||
  (local && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
) {
  throw new Error(
    "iOS requires a clean HTTPS production origin or a loopback local origin.",
  );
}
module.exports = {
  appId: "com.tomatoes.reports",
  appName: "Tomatoes",
  webDir: "dist",
  loggingBehavior: local ? "debug" : "none",
  server: {
    url: `${origin.origin}/#runs`,
    cleartext: local && origin.protocol === "http:",
  },
  ios: { contentInset: "automatic", preferredContentMode: "mobile" },
};
