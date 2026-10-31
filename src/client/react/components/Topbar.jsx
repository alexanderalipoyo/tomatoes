export function Topbar() {
  return (
    <header className="topbar">
      <button
        className="mobile-menu-button icon-button"
        id="open-navigation"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-controls="mobile-navigation"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16"></path>
        </svg>
      </button>
      <a className="mobile-wordmark" href="#runs" aria-label="Tomatoes home">
        <img src="/assets/tomatoes-logo.svg" width="28" height="28" alt="" />
        <strong data-workspace-name>{"Select a project"}</strong>
      </a>
      <div className="breadcrumbs">
        <span data-icon="folder"></span>
        <span data-organization-name>{"Organization"}</span>
        <span>{"/"}</span>
        <strong data-workspace-name>{"Select a project"}</strong>
        <span className="private">{"Local"}</span>
      </div>
      <select
        id="role-mobile-navigation"
        className="role-mobile-navigation"
        aria-label="Navigate pages"
      >
        <option value="runs">Latest run</option>
      </select>
      <div className="topbar-actions">
        <span className="source-label" id="source-label">
          {"Loading report…"}
        </span>
        <button
          className="button topbar-logout"
          id="topbar-logout"
          type="button"
          data-sign-out
          hidden
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h12"></path>
          </svg>
          <span>{"Logout"}</span>
        </button>
      </div>
    </header>
  );
}
