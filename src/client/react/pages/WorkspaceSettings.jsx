import { PreferenceStatus } from "./ProfilePage";
export function SettingsTabs({ sections, section, onSelect }) {
  return (
    <div className="workspace-settings-page">
      <div
        className="workspace-settings-tabs"
        role="tablist"
        aria-label="Settings sections"
      >
        {sections.map(([id, label], index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            data-settings-section={id}
            aria-controls="workspace-settings-panel"
            aria-selected={section === id}
            tabIndex={section === id ? 0 : -1}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? sections.length - 1
                    : (index +
                        (event.key === "ArrowRight"
                          ? 1
                          : sections.length - 1)) %
                      sections.length;
              onSelect(sections[next][0], true);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id="workspace-settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${section}`}
      />
    </div>
  );
}
export function AppearanceSettings({ state, selected }) {
  return (
    <div className="workspace-settings">
      <article className="settings-card appearance-card">
        <span className="eyebrow">APPEARANCE</span>
        <h2>Color Mode</h2>
        <p id="color-mode-description">
          Choose whether Tomatoes should be light or dark, or follow your
          computer's settings.
        </p>
        <form id="appearance-form" aria-describedby="color-mode-description">
          <fieldset disabled={!state.ready}>
            <legend className="visually-hidden">Color mode</legend>
            <div className="color-mode-options">
              {[
                ["light", "Light", "A bright workspace for your reports."],
                ["dark", "Dark", "A softer appearance for low-light rooms."],
                ["system", "System", "Follow your computer's appearance."],
              ].map(([value, label, description]) => (
                <label
                  className={`color-mode-option ${value === selected ? "is-selected" : ""}`}
                  key={value}
                >
                  <input
                    type="radio"
                    name="colorMode"
                    value={value}
                    defaultChecked={selected === value}
                  />
                  <span
                    className={`mode-preview mode-preview-${value}`}
                    aria-hidden="true"
                  >
                    <i />
                    <b />
                    <em />
                  </span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="settings-buttons">
            <button
              className="button primary"
              type="submit"
              disabled={!state.ready}
            >
              Save appearance
            </button>
            <button
              className="button"
              type="button"
              id="discard-appearance"
              hidden
            >
              Discard changes
            </button>
          </div>
          <p
            id="appearance-feedback"
            className="appearance-feedback"
            role="status"
            aria-live="polite"
          />
          <p className="appearance-save-note">
            {state.ready
              ? "Your color mode is saved to your user preferences and applied throughout Tomatoes."
              : state.error}
          </p>
        </form>
      </article>
      <PreferenceStatus state={state} />
    </div>
  );
}
export function GeneralSettings({ state, draft, brand, registered }) {
  return (
    <>
      <div id="organization-settings-root" />
      <form
        className="profile-details workspace-general"
        id="workspace-general-form"
      >
        <h2>Project branding</h2>
        <fieldset disabled={!state.ready || draft.saving}>
          <legend className="visually-hidden">Workspace branding</legend>
          <div className="profile-detail-row">
            <div>
              <label htmlFor="workspace-brand-name">Project name</label>
              <p>
                {registered ? (
                  <>
                    The shared project name. Rename it from{" "}
                    <a href="#projects">Projects</a>.
                  </>
                ) : (
                  "The name displayed throughout Tomatoes. Report project identifiers stay the same."
                )}
              </p>
            </div>
            <input
              id="workspace-brand-name"
              name="name"
              readOnly={registered}
              maxLength="80"
              required
              defaultValue={brand.name}
            />
          </div>
          <div className="profile-detail-row">
            <div>
              <label htmlFor="workspace-brand-website">Project website</label>
              <p>An optional link for your company or team.</p>
            </div>
            <input
              id="workspace-brand-website"
              name="website"
              type="url"
              maxLength="500"
              placeholder="https://example.com"
              defaultValue={brand.website}
            />
          </div>
          <div className="profile-detail-row">
            <div>
              <label htmlFor="workspace-brand-logo">Project logo</label>
              <p>
                PNG, JPEG, or WebP, up to 2 MB. Used for reports when your
                organization has no logo.
              </p>
            </div>
            <div>
              <div
                className="workspace-logo-preview"
                id="workspace-logo-preview"
              >
                <ImagePreview
                  logo={brand.logo}
                  alt="Workspace logo preview"
                  empty="No logo uploaded"
                />
              </div>
              <input
                id="workspace-brand-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
              />
              <button
                type="button"
                className="button"
                id="workspace-remove-logo"
              >
                Remove logo
              </button>
              <p id="workspace-logo-status" role="status" />
            </div>
          </div>
          <div className="profile-detail-row">
            <div>
              <span>Report project</span>
              <p>
                Branding is saved for this project in your database preferences.
              </p>
            </div>
            <code>{brand.project}</code>
          </div>
        </fieldset>
        <div className="profile-form-actions">
          <span id="workspace-brand-status" role="status" />
          <button type="button" className="button" id="workspace-brand-reset">
            Reset
          </button>
          <button className="button primary" type="submit">
            Save changes
          </button>
        </div>
      </form>
    </>
  );
}
export function OrganizationSettings({ organization, draft, canManage }) {
  return (
    <form
      id="organization-settings-form"
      className="profile-details organization-general"
    >
      <h2>Organization</h2>
      <div className="profile-detail-row">
        <div>
          <label htmlFor="organization-name">Organization name</label>
          <p>Your organization contains projects and user memberships.</p>
        </div>
        <input
          id="organization-name"
          name="name"
          maxLength="80"
          required
          readOnly={!canManage}
          defaultValue={draft.name}
        />
      </div>
      <div className="profile-detail-row">
        <div>
          <label htmlFor="organization-logo">Organization logo</label>
          <p>
            PNG, JPEG, or WebP, up to 2 MB. Shared across navigation, project
            cards, run summaries, and PDF reports.
          </p>
        </div>
        <div>
          <div
            className="workspace-logo-preview"
            id="organization-logo-preview"
          />
          {canManage ? (
            <>
              <input
                id="organization-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
              />
              <button
                type="button"
                className="button"
                id="organization-remove-logo"
              >
                Remove organization logo
              </button>
            </>
          ) : (
            <p>Ask an organization admin to update the logo.</p>
          )}
          <p id="organization-logo-status" role="status" />
        </div>
      </div>
      <div className="profile-detail-row">
        <div>
          Organization ID<p>Projects and users belong to this organization.</p>
        </div>
        <code>{organization.id}</code>
      </div>
      {canManage && (
        <div className="profile-form-actions">
          <button className="button primary" type="submit">
            Update organization
          </button>
        </div>
      )}
    </form>
  );
}
export function ImagePreview({
  logo,
  alt = "Organization logo preview",
  empty = "No organization logo uploaded",
}) {
  return logo ? <img src={logo} alt={alt} /> : <span>{empty}</span>;
}
