(function (root) {
  const Groups =
    typeof module !== "undefined" && module.exports
      ? require("./dashboard-groups")
      : root.DashboardGroups;
  const DEFAULT_APPEARANCE = { colorMode: "system" };
  const DEFAULT_PROFILE = { firstName: "", lastName: "", email: "" };
  const DEFAULT_DISPLAY = { timeZone: "Asia/Singapore", rows: 15 };
  function profileChanged(before, after) {
    return ["firstName", "lastName", "email"].some(
      (key) =>
        String(before?.[key] || "").trim() !==
        String(after?.[key] || "").trim(),
    );
  }
  function validatePatch(value) {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !Object.keys(value).length ||
      Object.keys(value).some(
        (key) =>
          ![
            "display",
            "dashboardGroups",
            "appearance",
            "profile",
            "importBranches",
            "workspaces",
          ].includes(key),
      )
    )
      throw new Error(
        "Use display, dashboardGroups, appearance, profile, importBranches, or workspaces preference sections.",
      );
    const result = {};
    if (Object.hasOwn(value, "workspaces")) {
      if (
        !Array.isArray(value.workspaces) ||
        value.workspaces.length > 50 ||
        JSON.stringify(value.workspaces).length > 700000
      )
        throw new Error(
          "Workspace branding storage is full. Remove an unused logo first.",
        );
      const seen = new Set();
      result.workspaces = value.workspaces.map((item) => {
        if (
          !item ||
          typeof item !== "object" ||
          Array.isArray(item) ||
          Object.keys(item).some(
            (key) => !["project", "name", "website", "logo"].includes(key),
          ) ||
          ["project", "name", "website", "logo"].some(
            (key) => typeof item[key] !== "string",
          ) ||
          !item.project ||
          item.project.length > 80 ||
          seen.has(item.project) ||
          !item.name.trim() ||
          item.name.length > 80 ||
          item.website.length > 500 ||
          /[\x00-\x1f\x7f]/.test(item.project + item.name + item.website) ||
          item.logo.length > 100000 ||
          (item.logo &&
            !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(
              item.logo,
            ))
        )
          throw new Error(
            "Enter a workspace name up to 80 characters and a valid PNG logo.",
          );
        if (item.website) {
          let url;
          try {
            url = new URL(item.website);
          } catch {
            throw new Error(
              "Enter a complete website URL starting with https:// or http://.",
            );
          }
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw new Error(
              "Use an http or https website without credentials.",
            );
        }
        seen.add(item.project);
        return {
          project: item.project,
          name: item.name.trim(),
          website: item.website.trim(),
          logo: item.logo,
        };
      });
    }
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
    if (Object.hasOwn(value, "appearance")) {
      const appearance = value.appearance;
      if (
        !appearance ||
        typeof appearance !== "object" ||
        Array.isArray(appearance) ||
        Object.keys(appearance).some((key) => key !== "colorMode") ||
        !["light", "dark", "system"].includes(appearance.colorMode)
      )
        throw new Error("Choose Light, Dark, or System color mode.");
      result.appearance = { colorMode: appearance.colorMode };
    }
    if (Object.hasOwn(value, "profile")) {
      const profile = value.profile;
      if (
        !profile ||
        typeof profile !== "object" ||
        Array.isArray(profile) ||
        Object.keys(profile).some(
          (key) => !["firstName", "lastName", "email"].includes(key),
        ) ||
        ["firstName", "lastName", "email"].some(
          (key) =>
            typeof profile[key] !== "string" ||
            /[\x00-\x1f\x7f]/.test(profile[key]),
        ) ||
        (!profile.firstName.trim() &&
          (profile.lastName.trim() || profile.email.trim())) ||
        profile.firstName.length > 80 ||
        profile.lastName.length > 80 ||
        profile.email.length > 254 ||
        (profile.email &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim()))
      )
        throw new Error(
          "Enter a first name, a last name of up to 80 characters, and a valid optional email address.",
        );
      result.profile = {
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        email: profile.email.trim(),
      };
    }
    if (Object.hasOwn(value, "importBranches")) {
      if (
        !Array.isArray(value.importBranches) ||
        value.importBranches.length > 100
      )
        throw new Error("Keep branch defaults for up to 100 projects.");
      const seen = new Set();
      result.importBranches = value.importBranches.map((item) => {
        if (
          !item ||
          typeof item !== "object" ||
          Array.isArray(item) ||
          Object.keys(item).some(
            (key) => !["project", "branch"].includes(key),
          ) ||
          typeof item.project !== "string" ||
          !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(item.project) ||
          typeof item.branch !== "string" ||
          item.branch.length > 160 ||
          /[\x00-\x1f\x7f]/.test(item.branch) ||
          seen.has(item.project)
        )
          throw new Error("Choose a valid project and branch default.");
        seen.add(item.project);
        return { project: item.project, branch: item.branch.trim() };
      });
    }
    if (Object.hasOwn(value, "dashboardGroups"))
      result.dashboardGroups = Groups.validateGroups(value.dashboardGroups);
    return result;
  }
  function withDefaults(value = {}) {
    return {
      display: { ...DEFAULT_DISPLAY },
      dashboardGroups: [],
      importBranches: [],
      workspaces: [],
      appearance: { ...DEFAULT_APPEARANCE },
      profile: { ...DEFAULT_PROFILE },
      ...validatePatch(
        Object.keys(value).length ? value : { display: DEFAULT_DISPLAY },
      ),
    };
  }
  const api = {
    profileChanged,
    DEFAULT_APPEARANCE,
    DEFAULT_DISPLAY,
    DEFAULT_PROFILE,
    validatePatch,
    withDefaults,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.UserPreferenceModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
