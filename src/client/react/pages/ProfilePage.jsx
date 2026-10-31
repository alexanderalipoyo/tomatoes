export function PreferenceStatus({ state }) {
  return (
    <article className="settings-card preference-sync-status">
      <h2>User preferences</h2>
      <p role="status">
        {state.ready
          ? `Saved to ${state.storage === "postgres" ? "PostgreSQL" : "the local server"} for ${state.profile}. ${state.profileId === "local" ? "Local mode uses one shared profile on this server." : "These settings belong to your signed-in account."}`
          : state.error}
      </p>
      <p>
        Profile details, color mode, dashboard groups, time zone, and results
        per page load from the server. Report files and browser import history
        are managed separately.
      </p>
      <button className="button" id="reload-user-preferences">
        Reload preferences
      </button>
      {!state.ready && (
        <a className="button" href="#team">
          Settings: Sharing &amp; access
        </a>
      )}
    </article>
  );
}
export function ProfilePage({ state, profile, auth, projects, dirty }) {
  return (
    <div className="profile-page">
      <form id="profile-form" className="profile-details">
        <h2>Details</h2>
        <fieldset disabled={!state.ready}>
          <legend className="visually-hidden">Profile details</legend>
          <div className="profile-detail-row">
            <div>
              <label htmlFor="profile-first-name">Full name</label>
              <p id="profile-name-description">
                Your name appears throughout Tomatoes.
              </p>
            </div>
            <div className="profile-name-fields">
              <input
                id="profile-first-name"
                name="firstName"
                aria-label="First name"
                aria-describedby="profile-name-description"
                autoComplete="given-name"
                maxLength="80"
                defaultValue={profile.firstName}
                required
              />
              <input
                id="profile-last-name"
                name="lastName"
                aria-label="Last name"
                autoComplete="family-name"
                maxLength="80"
                defaultValue={profile.lastName}
              />
            </div>
          </div>
          <div className="profile-detail-row">
            <div>
              <label htmlFor="profile-email">Email</label>
              <p id="profile-email-description">
                A contact email for your profile. Email notifications are not
                enabled.
              </p>
            </div>
            <input
              type="email"
              id="profile-email"
              name="email"
              aria-describedby="profile-email-description"
              autoComplete="email"
              maxLength="254"
              placeholder="Add your email address"
              defaultValue={profile.email}
            />
          </div>
        </fieldset>
        <div className="profile-form-actions">
          <p id="profile-feedback" role="status">
            {dirty ? "Unsaved changes" : state.ready ? "" : state.error}
          </p>
          <button className="button" type="button" id="profile-reset">
            Reset
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={!state.ready}
          >
            Save changes
          </button>
        </div>
      </form>
      {auth?.enabled && auth.authenticated && (
        <PasswordForm recommended={auth.passwordChangeRecommended} />
      )}
      <section className="settings-card account-project-access">
        <h2>Organization and project access</h2>
        <p data-feature="my-profile.view-organization-membership">
          <strong>{auth?.organization?.name || "Current organization"}</strong>
        </p>
        <p>Role: {state.user?.role || "Local administrator"}</p>
        <p>
          Your account can access{" "}
          {auth?.user?.projects?.includes("*")
            ? "all projects in this organization"
            : "the projects listed below"}
          .
        </p>
        <ul data-feature="my-profile.view-assigned-projects">
          {projects.length ? (
            projects.map((project) => (
              <li key={project.id}>
                {project.name} <small>({project.id})</small>
              </li>
            ))
          ) : (
            <li>No assigned projects.</li>
          )}
        </ul>
      </section>
      <PreferenceStatus state={state} />
    </div>
  );
}
function PasswordForm({ recommended }) {
  return (
    <form className="settings-card account-password" id="change-password-form">
      <h2>Change password</h2>
      <p>
        Use a unique password of 12-256 characters, different from your email
        and username. Updating it signs you out on every device.
      </p>
      {recommended && (
        <p className="notice data-warning">
          Your current password matches your account identifier. Choose a unique
          password.
        </p>
      )}
      <label htmlFor="account-current-password">Current password</label>
      <input
        id="account-current-password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        maxLength="256"
        required
      />
      <label htmlFor="account-new-password">New password</label>
      <input
        id="account-new-password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength="12"
        maxLength="256"
        required
      />
      <label htmlFor="account-confirm-password">Confirm new password</label>
      <input
        id="account-confirm-password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength="12"
        maxLength="256"
        required
      />
      <div className="profile-form-actions">
        <button className="button primary" type="submit">
          Update password
        </button>
      </div>
    </form>
  );
}
