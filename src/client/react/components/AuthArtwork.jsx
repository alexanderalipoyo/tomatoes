export function AuthArtwork() {
  return (
    <aside className="auth-story" aria-label="About Tomatoes">
      <a
        className="auth-brand auth-story-brand"
        href="#login"
        aria-label="Tomatoes sign in"
      >
        <img src="/assets/tomatoes-logo.svg" width="42" height="42" alt="" />
        <span>
          tomatoes<small>TEST REPORTING</small>
        </span>
      </a>
      <div className="auth-story-copy">
        <span className="auth-kicker">
          <i /> A FRESH LOOK AT YOUR TESTS
        </span>
        <h2>
          Every run.
          <br />A clearer <em>picture.</em>
        </h2>
        <p>
          Turn your Cypress reports into answers. Find the failures, follow the
          patterns, and see what needs your attention.
        </p>
      </div>
      <div className="auth-illustration" aria-hidden="true">
        <div className="auth-orbit auth-orbit-one" />
        <div className="auth-orbit auth-orbit-two" />
        <div className="auth-report-sheet auth-report-sheet-back" />
        <div className="auth-report-sheet">
          <div className="auth-sheet-heading">
            <span className="auth-sheet-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M5 3h10l4 4v14H5zM15 3v5h4M9 12h6M9 16h4" />
              </svg>
            </span>
            <span>
              One report.<small>The whole picture.</small>
            </span>
            <span className="auth-sheet-dots">···</span>
          </div>
          <div className="auth-sheet-chart">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="auth-sheet-row">
            <i className="auth-dot-green" />
            <span>Understand the outcome</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m5 12 4 4L19 6" />
            </svg>
          </div>
          <div className="auth-sheet-row">
            <i className="auth-dot-coral" />
            <span>Find what needs a closer look</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 12h14m-5-5 5 5-5 5" />
            </svg>
          </div>
        </div>
        <div className="auth-fresh-badge">
          <img src="/assets/tomatoes-logo.svg" width="28" height="28" alt="" />
          <span>
            Fresh insights.
            <br />
            <strong>Less guesswork.</strong>
          </span>
        </div>
      </div>
      <div className="auth-story-footer">
        <span>
          <b>01</b> Import
        </span>
        <i />
        <span>
          <b>02</b> Explore
        </span>
        <i />
        <span>
          <b>03</b> Share
        </span>
      </div>
    </aside>
  );
}
