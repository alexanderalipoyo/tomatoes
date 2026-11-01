export function RunOverview() {
  return (
    <section id="overview" aria-label="Run summary">
      <div id="previous-run-notice" className="notice" hidden>
        You are viewing a previous run.{" "}
        <a href="#latest-run" data-view="runs">
          Open latest run
        </a>
        .
      </div>
      <div className="run-summary" id="run-summary"></div>
      <div className="metrics" id="metrics"></div>
      <div className="dashboard-grid" id="dashboard-widgets"></div>
      <div className="dashboard-actions">
        <span>{"Explore the complete run, spec by spec."}</span>
        <a className="button" href="#test-results">
          {"Browse all results →"}
        </a>
      </div>
      <div id="data-warnings" role="status"></div>
    </section>
  );
}
