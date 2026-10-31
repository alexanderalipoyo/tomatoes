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
  host.innerHTML = `<div class="profile-page">
    <form id="profile-form" class="profile-details">
      <h2>Details</h2>
      <fieldset ${state.ready ? "" : "disabled"}>
        <legend class="visually-hidden">Profile details</legend>
        <div class="profile-detail-row"><div><label for="profile-first-name">Full name</label><p id="profile-name-description">Your name appears throughout Tomatoes.</p></div>
          <div class="profile-name-fields"><input id="profile-first-name" name="firstName" aria-label="First name" aria-describedby="profile-name-description" autocomplete="given-name" maxlength="80" value="${esc(profile.firstName)}" required/><input id="profile-last-name" name="lastName" aria-label="Last name" autocomplete="family-name" maxlength="80" value="${esc(profile.lastName)}"/></div></div>
        <div class="profile-detail-row"><div><label for="profile-email">Email</label><p id="profile-email-description">A contact email for your profile. Email notifications are not enabled.</p></div><input type="email" id="profile-email" name="email" aria-describedby="profile-email-description" autocomplete="email" maxlength="254" placeholder="Add your email address" value="${esc(profile.email)}"/></div>
      </fieldset>
      <div class="profile-form-actions"><p id="profile-feedback" role="status">${hasUnsavedProfile() ? "Unsaved changes" : state.ready ? "" : esc(state.error)}</p><button class="button" type="button" id="profile-reset">Reset</button><button class="button primary" type="submit" ${state.ready ? "" : "disabled"}>Save changes</button></div>
    </form>
    ${authStatus?.enabled && authStatus.authenticated ? `<form class="settings-card account-password" id="change-password-form"><h2>Change password</h2><p>Use a unique password of 12-256 characters, different from your email and username. Updating it signs you out on every device.</p>${authStatus.passwordChangeRecommended ? '<p class="notice data-warning">Your current password matches your account identifier. Choose a unique password.</p>' : ""}<label for="account-current-password">Current password</label><input id="account-current-password" name="currentPassword" type="password" autocomplete="current-password" maxlength="256" required/><label for="account-new-password">New password</label><input id="account-new-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="256" required/><label for="account-confirm-password">Confirm new password</label><input id="account-confirm-password" name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="256" required/><div class="profile-form-actions"><button class="button primary" type="submit">Update password</button></div></form>` : ""}
    <section class="settings-card account-project-access"><h2>Organization and project access</h2><p><strong>${esc(authStatus?.organization?.name || "Current organization")}</strong></p><p>Role: ${esc(state.user?.role || "Local administrator")}</p><p>Your account can access ${authStatus?.user?.projects?.includes("*") ? "all projects in this organization" : "the projects listed below"}.</p><ul>${workspaceProjects.map((project) => `<li>${esc(project.name)} <small>(${esc(project.id)})</small></li>`).join("") || "<li>No assigned projects.</li>"}</ul></section>
    ${preferenceStatusMarkup()}
  </div>`;
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
