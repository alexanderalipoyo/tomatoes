export function MobileNavigation() {
  return (
    <dialog
      id="mobile-navigation"
      className="mobile-navigation"
      aria-labelledby="navigation-title"
    >
      <div className="mobile-navigation-heading">
        <a href="#runs" className="mobile-drawer-brand">
          <img src="/assets/tomatoes-logo.svg" width="38" height="38" alt="" />
          <strong id="navigation-title">{"tomatoes"}</strong>
        </a>
        <button
          className="icon-button"
          id="close-navigation"
          aria-label="Close navigation"
        >
          {" × "}
        </button>
      </div>
      <button
        className="mobile-workspace-identity"
        type="button"
        data-workspace-trigger
        popoverTarget="workspace-menu"
        aria-haspopup="dialog"
        aria-controls="workspace-menu"
        aria-expanded="false"
      >
        <span data-organization-initials></span>
        <span data-organization-name>{"Organization"}</span>
        <small data-workspace-user>{"Alex Ali"}</small>
      </button>
      <label className="side-label" htmlFor="mobile-project-picker">
        Project
      </label>
      <select
        id="mobile-project-picker"
        className="project-picker"
        data-project-picker
        aria-label="Current project on mobile"
      >
        <option value="">Select a project</option>
      </select>
      <nav aria-label="Mobile project navigation">
        <a href="#runs" data-view="runs">
          <span data-icon="runs"></span>
          {"Latest run"}
        </a>
        <a href="#results" data-view="results">
          <span data-icon="folder"></span>
          {"Test results"}
        </a>
        <a href="#failures" data-view="failures">
          <span data-icon="failure"></span>
          {"Failed tests"}
        </a>
        <a href="#history" data-view="history">
          <span data-icon="clock"></span>
          {"Import history"}
        </a>
        <div className="side-label">{"INSIGHTS"}</div>
        <a href="#compare" data-view="compare">
          <span data-icon="branch"></span>
          {"Compare runs"}
        </a>
        <a href="#analytics" data-view="analytics">
          <span data-icon="chart"></span>
          {"Analytics"}
        </a>
        <a href="#flaky" data-view="flaky">
          <span data-icon="flake"></span>
          {"Flaky tests"}
        </a>
      </nav>
      <nav data-workspace-navigation aria-label="Workspace navigation" hidden>
        <a href="#projects" data-view="projects">
          <span data-icon="folder"></span>
          {"Projects"}
        </a>
        <a href="#profile" data-view="profile">
          <span data-icon="profile"></span>
          {"My profile"}
        </a>
        <a href="#users" data-view="users">
          <span data-icon="users"></span>
          {"Users"}
        </a>
        <a href="#workspace-settings" data-view="workspace-settings">
          <span data-icon="settings"></span>
          {"Settings"}
        </a>
        <a href="#settings" data-view="settings">
          <span data-icon="chart"></span>
          {"Report settings"}
        </a>
        <a href="#integrations" data-view="integrations">
          <span data-icon="integration"></span>
          {"Integration"}
        </a>
      </nav>
      <p className="mobile-navigation-note">
        {" Your test results, wherever you work. "}
      </p>
    </dialog>
  );
}
