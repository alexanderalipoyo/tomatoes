/* Track page names only; report identifiers and recovery tokens stay out of analytics. */
async function startWebAnalytics({
  browser = window,
  page = document,
  loadSDK = () => import("/vendor/vercel-analytics.mjs"),
} = {}) {
  const encoded = page.querySelector(
    'meta[name="tomatoes-analytics"]',
  )?.content;
  if (!encoded || encoded === "disabled") return;
  const configuration = JSON.parse(browser.atob(encoded));
  if (!configuration.enabled) return;
  const { inject, pageview } = await loadSDK();
  const routes = new Set([
    "runs",
    "results",
    "failures",
    "analytics",
    "compare",
    "flaky",
    "settings",
    "workspace-settings",
    "users",
    "profile",
    "projects",
    "integrations",
    "history",
    "login",
    "forgot-password",
    "reset-password",
  ]);
  let previous;
  const currentPath = () => {
    const route = browser.location.hash.slice(1).split("?")[0];
    return "/app/" + (routes.has(route) ? route : "runs");
  };
  inject(
    {
      mode: "production",
      disableAutoTrack: true,
      beforeSend(event) {
        const url = new URL(browser.location.origin);
        url.pathname = currentPath();
        return { ...event, url: url.href };
      },
    },
    JSON.stringify(configuration.client),
  );
  const recordPage = () => {
    const path = currentPath();
    if (path === previous) return;
    previous = path;
    pageview({ route: path, path });
  };
  recordPage();
  browser.addEventListener("hashchange", recordPage);
}
if (typeof module !== "undefined" && module.exports)
  module.exports = { startWebAnalytics };
else
  startWebAnalytics().catch(() => {
    /* Analytics must never interrupt the dashboard. */
  });
