/* Account details share the existing per-user preference store. */
let userProfileDraft = null;
function confirmedUserProfile(state) {
  const saved = state.preferences.profile;
  const fallback = (
    state.user?.fullName ||
    state.user?.displayName ||
    "Alex Ali"
  ).split(/\s+/);
  return saved.firstName
    ? saved
    : {
        firstName: fallback[0],
        lastName: fallback.slice(1).join(" "),
        email: saved.email,
      };
}
function hasUnsavedProfile() {
  const state = userPreferences.getState();
  return Boolean(
    userProfileDraft &&
    userProfileDraft.profileId === state.profileId &&
    UserPreferenceModel.profileChanged(
      confirmedUserProfile(state),
      userProfileDraft.profile,
    ),
  );
}
function renderUserProfile(host) {
  const state = userPreferences.getState();
  const confirmed = confirmedUserProfile(state);
  const profile =
    userProfileDraft?.profileId === state.profileId
      ? userProfileDraft.profile
      : confirmed;
  globalThis.TomatoesReact.renderProfile(host, {
    state,
    profile,
    auth: authStatus,
    projects: workspaceProjects,
    dirty: hasUnsavedProfile(),
  });
  setupPasswordChange(host);
  const form = document.querySelector("#profile-form");
  const button = form.querySelector('button[type="submit"]');
  function updateState() {
    const dirty = hasUnsavedProfile();
    const saving = Boolean(
      userProfileDraft?.saving &&
      userProfileDraft.profileId === state.profileId,
    );
    button.disabled = !state.ready || !dirty || saving;
    button.textContent = saving ? "Saving..." : "Save changes";
    document.querySelector("#profile-reset").disabled = !dirty || saving;
    document.querySelector("#reload-user-preferences").disabled = saving;
    document.querySelector("#profile-feedback").textContent = !state.ready
      ? state.error
      : dirty
        ? "Unsaved changes"
        : "";
    form.inert = saving;
    form.setAttribute("aria-busy", String(saving));
  }
  updateState();
  document.querySelector("#profile-reset").onclick = () => {
    userProfileDraft = null;
    renderUserProfile(host);
  };
  document.querySelector("#reload-user-preferences").onclick = async () => {
    const button = document.querySelector("#reload-user-preferences");
    button.disabled = true;
    const reloaded = await reloadUserPreferences();
    if (view === "profile") renderUserProfile(host);
    showToast(
      reloaded.ready ? "Preferences reloaded." : reloaded.error,
      reloaded.ready ? "success" : "error",
    );
  };
  form.oninput = () => {
    userProfileDraft = {
      profileId: state.profileId,
      profile: Object.fromEntries(new FormData(form)),
    };
    updateState();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!state.ready || !hasUnsavedProfile() || userProfileDraft?.saving)
      return;
    const draft = userProfileDraft;
    const fields = new FormData(form);
    const profile = Object.fromEntries(
      ["firstName", "lastName", "email"].map((key) => [
        key,
        fields.get(key).trim(),
      ]),
    );
    draft.saving = true;
    updateState();
    try {
      await userPreferences.save({ profile });
      if (userProfileDraft === draft) userProfileDraft = null;
      renderWorkspaceIdentity();
      showToast("Profile updated successfully.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      draft.saving = false;
      if (view === "profile" && host.isConnected) renderUserProfile(host);
    }
  };
}

function setupPasswordChange(host) {
  const form = host.querySelector("#change-password-form");
  if (!form) return;
  const save = form.querySelector('[type="submit"]');
  const expectedUsername = authStatus.user.username;
  let pending = false;
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(form);
    if (fields.get("password") !== fields.get("confirm")) {
      showToast("Passwords do not match.", "error");
      form.elements.confirm.focus();
      return;
    }
    pending = true;
    save.disabled = true;
    form.inert = true;
    try {
      teamState = await teamRequest("/api/team/status");
      if (
        !teamState.authenticated ||
        teamState.user?.username !== expectedUsername
      )
        throw new Error(
          "Your account changed. Reload your profile before changing its password.",
        );
      await authRequest("/api/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: fields.get("currentPassword"),
          password: fields.get("password"),
        }),
      });
      teamState = null;
      await initializeAuth();
      await reloadUserPreferences();
      location.hash = "login";
      renderAuthScreen("Password updated. Sign in with your new password.");
      showToast(
        "Password updated. All existing sessions have ended.",
        "success",
      );
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      fields.delete("password");
      fields.delete("confirm");
      fields.delete("currentPassword");
      form.reset();
      pending = false;
      save.disabled = false;
      form.inert = false;
    }
  };
}
