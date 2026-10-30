export function ResultsTable() {
  return (
    <section id="results-section">
      <div className="section-heading runs-heading">
        <h2 id="list-title">{"Spec results"}</h2>
        <div className="view-switch" aria-label="Result grouping">
          <button className="selected" id="specs-view" aria-pressed="true">
            {" Specs"}
          </button>
          <button id="tests-view" aria-pressed="false">
            {"Tests"}
          </button>
        </div>
      </div>
      <div className="filters">
        <label className="search">
          <span data-icon="search"></span>
          <input
            id="search"
            placeholder="Search specs, tests, or errors"
            aria-label="Search results"
          />
          <kbd>{"/"}</kbd>
        </label>
        <select id="spec-filter" aria-label="Filter spec">
          <option value="all">{"All specs"}</option>
        </select>
        <select id="status" aria-label="Filter status">
          <option value="all">{"All statuses"}</option>
          <option value="failed">{"Failed"}</option>
          <option value="passed">{"Passed"}</option>
          <option value="pending">{"Pending"}</option>
          <option value="skipped">{"Skipped"}</option>
          <option value="unknown">{"Unknown"}</option>
        </select>
        <button className="button clear" id="clear">
          {"Clear filters"}
        </button>
      </div>
      <div className="results-scroll">
        <table className="results-table">
          <thead id="results-head"></thead>
          <tbody id="results-body"></tbody>
        </table>
      </div>
      <div className="pagination">
        <span id="showing" role="status"></span>
        <div>
          <button id="prev" className="button" aria-label="Previous page">
            {" ←"}
          </button>
          <span id="page-label"></span>
          <button id="next" className="button" aria-label="Next page">
            {" → "}
          </button>
        </div>
      </div>
    </section>
  );
}
