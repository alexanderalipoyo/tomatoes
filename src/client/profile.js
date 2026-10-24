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
    ${preferenceStatusMarkup()}
  </div>`;
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
