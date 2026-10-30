export function WorkspaceMenu() {
  return (
    <section
      id="workspace-menu"
      popover="auto"
      role="dialog"
      aria-labelledby="workspace-menu-title"
    >
      <header className="workspace-menu-header">
        <span
          className="workspace-menu-avatar"
          data-organization-initials
          aria-hidden="true"
        >
          {"TW"}
        </span>
        <div className="workspace-menu-heading">
          <strong id="workspace-menu-title" data-organization-name>
            {"Organization"}
          </strong>
          <span data-workspace-user>{"Alex Ali"}</span>
        </div>
        <button
          type="button"
          className="workspace-menu-close"
          popoverTarget="workspace-menu"
          popoverTargetAction="hide"
          aria-label="Close workspace menu"
          autoFocus
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18"></path>
          </svg>
        </button>
      </header>
      <div className="workspace-menu-organizations">
        <h2>{"YOUR ORGANIZATIONS"}</h2>
        <button
          type="button"
          className="workspace-menu-organization"
          id="workspace-menu-current"
          aria-label="Current organization"
        >
          <span
            className="workspace-menu-avatar small"
            data-organization-initials
            aria-hidden="true"
          >
            {"TW"}
          </span>
          <strong data-organization-name>{"Organization"}</strong>
          <svg
            className="workspace-menu-selected"
            viewBox="0 0 20 20"
            aria-label="Selected"
          >
            <circle cx="10" cy="10" r="7"></circle>
            <path d="m7 10 2 2 4-4"></path>
          </svg>
        </button>
        <a
          className="workspace-menu-create"
          href="?settingsTab=general#workspace-settings"
          data-workspace-menu-link
        >
          <span className="workspace-menu-plus" aria-hidden="true">
            {"+"}
          </span>
          {"Organization settings"}
        </a>
      </div>
      <div className="workspace-menu-account">
        <h2>{"YOUR ACCOUNT"}</h2>
        <div className="workspace-menu-signed-in">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="16" fill="#c8c8c8"></circle>
            <circle cx="16" cy="13" r="7" fill="white"></circle>
            <path d="M5 31a11 11 0 0 1 22 0" fill="white"></path>
          </svg>
          <span id="workspace-menu-account-label">
            {"Signed in as "}
            <span data-workspace-user>{"Alex Ali"}</span>
          </span>
        </div>
        <button type="button" id="workspace-menu-profile">
          {" Manage profile "}
        </button>
        <button type="button" id="workspace-menu-sign-out" data-sign-out>
          {" Sign out "}
        </button>
      </div>
      <footer className="workspace-menu-footer">
        <button type="button" data-workspace-policy="terms">
          {"Terms of Use"}
        </button>
        <button type="button" data-workspace-policy="privacy">
          {" Privacy Policy "}
        </button>
      </footer>
    </section>
  );
}
