(function (root) {
  const Groups =
    typeof module !== "undefined" && module.exports
      ? require("./dashboard-groups")
      : root.DashboardGroups;
  const DEFAULT_DISPLAY = { timeZone: "Asia/Singapore", rows: 15 };
  function validatePatch(value) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !Object.keys(value).length ||
      Object.keys(value).some(
        (key) => !["display", "dashboardGroups"].includes(key),
      )
    )
      throw new Error("Use display or dashboardGroups preference sections.");
    const result = {};
    if (Object.hasOwn(value, "display")) {
      const display = value.display;
      if (
        !display ||
        typeof display !== "object" ||
        Array.isArray(display) ||
        Object.keys(display).some(
          (key) => !["timeZone", "rows"].includes(key),
        ) ||
        typeof display.timeZone !== "string" ||
        display.timeZone.length > 100 ||
        ![15, 30, 50, 100].includes(display.rows)
      )
        throw new Error(
          "Choose a valid time zone and results-per-page preference.",
        );
      try {
        new Intl.DateTimeFormat("en", { timeZone: display.timeZone });
      } catch {
        throw new Error("Choose a valid time zone.");
      }
      result.display = { timeZone: display.timeZone, rows: display.rows };
    }
    if (Object.hasOwn(value, "dashboardGroups"))
      result.dashboardGroups = Groups.validateGroups(value.dashboardGroups);
    return result;
  }
  function withDefaults(value = {}) {
    return {
      display: { ...DEFAULT_DISPLAY },
      dashboardGroups: [],
      ...validatePatch(
        Object.keys(value).length ? value : { display: DEFAULT_DISPLAY },
      ),
    };
  }
  const api = { DEFAULT_DISPLAY, validatePatch, withDefaults };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UserPreferenceModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
