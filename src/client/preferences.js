(function (root) {
  const Model =
    typeof module !== "undefined" && module.exports
      ? require("../shared/user-preferences")
      : root.UserPreferenceModel;
  function create({ request, legacy = () => ({}) }) {
    let epoch = 0;
    let queue = Promise.resolve();
    let state = {
      preferences: Model.withDefaults(),
      ready: false,
      profile: null,
      profileId: null,
      storage: null,
      error: "Connecting to saved preferences…",
    };
    const snapshot = () => structuredClone(state);
    const owner = (status) =>
      status.enabled
        ? status.authenticated
          ? "user:" + status.user.username
          : null
        : "local";
    async function initialize() {
      const version = ++epoch;
      state = {
        preferences: Model.withDefaults(),
        ready: false,
        profile: null,
        profileId: null,
        storage: null,
        error: "Connecting to saved preferences…",
      };
      try {
        const status = await request("/api/team/status");
        if (!owner(status))
          throw new Error(
            "Sign in through Team & CI to load and save your preferences.",
          );
        let payload = await request("/api/preferences");
        if (payload.profileId !== owner(status))
          throw new Error(
            "Your account changed. Reload preferences to continue.",
          );
        if (!payload.preferences) {
          const initial = Model.withDefaults(
            payload.profileId === "local" ? legacy() : {},
          );
          payload = await request("/api/preferences", {
            method: "PUT",
            headers: {
              "X-CSRF-Token": status.csrf || "",
              "If-None-Match": "*",
            },
            body: JSON.stringify(initial),
          });
        }
        if (version === epoch)
          state = {
            ...payload,
            preferences: Model.withDefaults(payload.preferences),
            ready: true,
            error: "",
          };
      } catch (error) {
        if (version === epoch) state.error = error.message;
      }
      return snapshot();
    }
    function save(patch) {
      const valid = Model.validatePatch(patch);
      const version = epoch;
      const expectedOwner = state.profileId;
      const task = queue
        .catch(() => {})
        .then(async () => {
          if (!state.ready || version !== epoch)
            throw new Error("Reload your preferences before saving.");
          const status = await request("/api/team/status");
          if (version !== epoch || owner(status) !== expectedOwner)
            throw new Error(
              "Your account changed. Reload preferences before saving.",
            );
          const payload = await request("/api/preferences", {
            method: "PUT",
            headers: { "X-CSRF-Token": status.csrf || "" },
            body: JSON.stringify(valid),
          });
          if (version !== epoch || payload.profileId !== expectedOwner)
            throw new Error(
              "Your account changed. Reload preferences before continuing.",
            );
          state = {
            ...payload,
            preferences: Model.withDefaults(payload.preferences),
            ready: true,
            error: "",
          };
          return snapshot();
        });
      queue = task;
      return task;
    }
    return { initialize, save, getState: snapshot };
  }
  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PreferenceClient = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
