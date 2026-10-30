export function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="brand" href="#runs" aria-label="Tomatoes home">
        <img
          className="brand-mark"
          src="/assets/tomatoes-logo.svg"
          width="40"
          height="40"
          alt=""
        />
        <strong>
          {"tomatoes"}
          <span>{"TEST REPORTING"}</span>
        </strong>
      </a>
      <button
        className="workspace"
        type="button"
        data-workspace-trigger
        popoverTarget="workspace-menu"
        aria-haspopup="dialog"
        aria-controls="workspace-menu"
        aria-expanded="false"
      >
        <span className="org-avatar" data-organization-initials>
          <img src="/assets/tomatoes-logo.svg" width="24" height="24" alt="" />
        </span>
        <span className="workspace-identity-text">
          <span data-organization-name>{"Organization"}</span>
          <small data-workspace-user>{"Alex Ali"}</small>
        </span>
      </button>
      <div className="side-label">{"PROJECT"}</div>
      <label className="visually-hidden" htmlFor="workspace-project-picker">
        Current project
      </label>
      <select
        className="project-picker"
        id="workspace-project-picker"
        data-project-picker
        aria-label="Current project"
      >
        <option value="">Select a project</option>
      </select>
      <nav aria-label="Project navigation">
        <a href="#runs" data-view="runs" className="active">
          <span data-icon="runs"></span>
          {"Latest run"}
          <span className="nav-count">{"1"}</span>
        </a>
        <a href="#results" data-view="results">
          <span data-icon="folder"></span>
          {"Test results"}
        </a>
        <a href="#failures" data-view="failures">
          <span data-icon="failure"></span>
          {"Failed tests"}
          <span className="nav-count" id="failure-count">
            {"—"}
          </span>
        </a>
        <a href="#history" data-view="history">
          <span data-icon="clock"></span>
          {"Import history"}
          <span className="nav-count" id="history-count">
            {"0"}
          </span>
        </a>
        <div className="side-label analytics-label">{"INSIGHTS"}</div>
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
      <div className="sidebar-bottom">
        <p className="report-sidebar-note">
          {" One report, every result."}
          <br />
          {"Import a Mochawesome JSON file to explore another run. "}
        </p>
      </div>
    </aside>
  );
}
