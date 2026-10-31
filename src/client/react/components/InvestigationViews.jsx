import { Badge, Metric } from "./ReportPrimitives";
export function ComparisonForm({ entries, selection, formatDate }) {
  const options = entries.map((entry) => (
    <option key={entry.id} value={entry.id}>
      {entry.metadata?.project || entry.name}
      {entry.metadata?.environment
        ? ` / ${entry.metadata.environment}`
        : ""} · {formatDate(entry.start)} · {entry.counts.total} tests
    </option>
  ));
  return (
    <>
      <article className="insight-card">
        <form id="comparison-form">
          <div className="comparison-selectors">
            <label>
              Baseline report
              <select
                id="comparison-baseline"
                required
                disabled={entries.length < 2}
                defaultValue={selection.baseline}
              >
                {options}
              </select>
              <small>The reference run</small>
            </label>
            <button
              type="button"
              className="button swap-comparison"
              id="swap-comparison"
              aria-label="Swap baseline and target"
              disabled={entries.length < 2}
            >
              ↔
            </button>
            <label>
              Target report
              <select
                id="comparison-target"
                required
                disabled={entries.length < 2}
                defaultValue={selection.target}
              >
                {options}
              </select>
              <small>The run to investigate</small>
            </label>
            <button
              className="button primary"
              type="submit"
              disabled={entries.length < 2}
            >
              Compare reports
            </button>
          </div>
          <p id="comparison-error" className="fail-text" role="alert" />
        </form>
        <p className="widget-footnote">
          Tests match by exact spec path and full title. Duplicate identities
          are excluded. Code, data, and environment differences can affect
          results.
        </p>
      </article>
      {entries.length < 2 && (
        <div className="history-empty">
          <h3>Import another report to compare runs</h3>
          <p>Two distinct saved reports are required.</p>
          <a className="button" href="#history">
            Open history
          </a>
        </div>
      )}
      <div id="comparison-output" />
    </>
  );
}
export function ComparisonOutput({
  comparison,
  historyCount,
  labels,
  filter,
  rows = [],
  page = 1,
  pages = 1,
  search,
  duration,
}) {
  if (!comparison)
    return historyCount > 1 ? (
      <div className="history-empty">
        <h3>Choose your baseline and target</h3>
        <p>
          Compare to see regressions, fixes, missing tests, and duration
          changes.
        </p>
      </div>
    ) : null;
  const result = comparison.result;
  return (
    <>
      <div className="insight-metrics">
        <Metric
          label="New regressions"
          value={result.regressions.length}
          note="Passed → failed"
          feature="compare-runs.identify-regressions"
        />
        <Metric
          label="Fixed tests"
          value={result.fixed.length}
          note="Failed → passed"
          feature="compare-runs.identify-fixes"
        />
        <Metric
          label="Added tests"
          value={result.added.length}
          note="Present only in the target"
          feature="compare-runs.identify-added-and-missing-tests"
        />
        <Metric
          label="Missing tests"
          value={result.missing.length}
          note="Present only in the baseline"
          feature="compare-runs.identify-added-and-missing-tests"
        />
      </div>
      <article className="insight-card comparison-context">
        <div>
          <strong>{result.matched} matched tests</strong>
          <p>{result.ambiguous} ambiguous identities excluded</p>
        </div>
        <div>
          <strong>
            {result.passRateDelta > 0 ? "+" : ""}
            {result.passRateDelta.toFixed(1)} pp
          </strong>
          <p>Registered-test pass rate change</p>
        </div>
        <div>
          <strong>{duration(result.durationDelta)}</strong>
          <p>Reported run duration change</p>
        </div>
        <button className="button" id="download-comparison">
          Download summary
        </button>
      </article>
      <div
        className="comparison-tabs"
        role="group"
        aria-label="Comparison category"
      >
        {Object.entries(labels).map(([key, label]) => (
          <button
            key={key}
            className={`button ${key === filter ? "selected-comparison" : ""}`}
            data-comparison-filter={key}
            aria-pressed={key === filter}
          >
            {label} <span>{result[key].length}</span>
          </button>
        ))}
      </div>
      <div className="comparison-search">
        <label htmlFor="comparison-search">Search comparison</label>
        <input
          id="comparison-search"
          type="search"
          defaultValue={search}
          placeholder="Test title or spec path"
        />
      </div>
      <div className="results-scroll">
        <table className="results-table comparison-table">
          <caption className="visually-hidden">
            {labels[filter]} between the baseline and target reports
          </caption>
          <thead>
            <tr>
              <th>Test / spec</th>
              <th>Baseline</th>
              <th>Target</th>
              <th>Test time change</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice((page - 1) * 25, page * 25).map((row) => {
              const test = row.current || row.previous,
                side = row.current ? "target" : "baseline";
              return (
                <tr key={row.identity}>
                  <td data-label="Test">
                    <strong>{test.title}</strong>
                    <small>{test.file}</small>
                  </td>
                  <td data-label="Baseline">
                    {row.previous ? (
                      <Badge status={row.previous.status} />
                    ) : (
                      <span className="muted">Absent</span>
                    )}
                  </td>
                  <td data-label="Target">
                    {row.current ? (
                      <Badge status={row.current.status} />
                    ) : (
                      <span className="muted">Absent</span>
                    )}
                  </td>
                  <td data-label="Time change">
                    {duration(row.durationDelta)}
                  </td>
                  <td data-label="Details">
                    <button
                      className="button"
                      data-comparison-side={side}
                      data-comparison-key={row.identity}
                    >
                      Inspect {side}
                    </button>
                    <button
                      className="button"
                      data-comparison-history={row.identity}
                    >
                      Test history
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan="5" className="empty">
                  No matching tests in this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          {rows.length} {labels[filter]?.toLowerCase()}
        </span>
        <div>
          <button className="button" id="comparison-prev" disabled={page === 1}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            className="button"
            id="comparison-next"
            disabled={page === pages}
          >
            Next
          </button>
        </div>
      </div>
    </>
  );
}
export function FailureGroups({ report, groups, expanded, duration }) {
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Grouped failures</h2>
          <p>
            {report.counts.failed} failed tests across {groups.length} message
            groups
          </p>
        </div>
        <button className="button" id="download-failure-groups">
          Download groups
        </button>
      </div>
      <p className="widget-footnote">
        Groups use matching error messages with variable IDs, timestamps, and
        timeout values normalized. Review the evidence to confirm a shared
        cause.
      </p>
      <div className="failure-group-list">
        {groups.slice(0, expanded ? groups.length : 8).map((group, index) => (
          <details className="failure-group" key={index}>
            <summary>
              <span className="group-number">{group.tests.length}</span>
              <span>
                <strong>{group.fingerprint}</strong>
                <small>
                  {group.specs.length}{" "}
                  {group.specs.length === 1 ? "spec" : "specs"} ·{" "}
                  {duration(group.duration)} recorded test time
                </small>
              </span>
            </summary>
            <div className="failure-group-evidence">
              <h3 data-feature="failed-tests.inspect-detailed-errors">
                Representative error
              </h3>
              <pre data-feature="failed-tests.inspect-detailed-errors">
                {group.message}
              </pre>
              <h3>Affected tests</h3>
              {group.tests.map((test) => (
                <button
                  className="analysis-row"
                  data-group-test={test.id}
                  key={test.id}
                >
                  <span>
                    {test.title}
                    <small>{test.file}</small>
                  </span>
                  <strong>Inspect →</strong>
                </button>
              ))}
            </div>
          </details>
        ))}
        {!groups.length && (
          <p className="widget-empty">No failures to group.</p>
        )}
      </div>
      {groups.length > 8 && (
        <button className="button" id="toggle-failure-groups">
          {expanded ? "Show top 8 groups" : `Show all ${groups.length} groups`}
        </button>
      )}
      <div id="failure-trends-host" />
    </>
  );
}
export function TestTimeline({
  test,
  timeline,
  maxTime,
  formatDate,
  duration,
}) {
  return (
    <>
      <div className="dialog-heading">
        <span className="eyebrow">INDIVIDUAL TEST HISTORY</span>
        <h2 id="detail-title">{test.title}</h2>
        <p>{test.file}</p>
        <p>{test.fullTitle}</p>
      </div>
      <div className="test-history-metrics">
        {[
          ["Executed runs", timeline.executed],
          ["Passed", timeline.counts.passed],
          ["Failed", timeline.counts.failed],
          ["Missing", timeline.counts.missing],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="widget-footnote">
        Oldest → newest, up to 20 saved reports. Missing tests and ambiguous
        duplicate titles remain separate from test outcomes.
      </p>
      <div className="test-timeline">
        {timeline.rows.map((row, index) => (
          <article className="test-timeline-row" key={row.runId || index}>
            <div>
              <strong>{row.name}</strong>
              <small>{formatDate(row.start)}</small>
            </div>
            {["missing", "ambiguous"].includes(row.status) ? (
              <span className="status-badge unknown">
                {row.status === "missing" ? "Missing" : "Duplicate matches"}
              </span>
            ) : (
              <Badge status={row.status} />
            )}
            <div className="test-time-evidence">
              {row.test ? (
                <>
                  <strong>{duration(row.test.duration)}</strong>
                  <span className="timeline-duration">
                    <i
                      style={{
                        width: `${(row.test.duration / maxTime) * 100}%`,
                      }}
                    />
                  </span>
                </>
              ) : (
                <span>Duration unavailable</span>
              )}
            </div>
            {row.test && (
              <button className="button" data-timeline-run={row.runId}>
                Inspect run
              </button>
            )}
          </article>
        ))}
        {!timeline.rows.length && (
          <p className="widget-empty">
            No saved reports are available for this test.
          </p>
        )}
      </div>
    </>
  );
}
export function FailureTrends() {
  return (
    <article className="insight-card failure-trend-card">
      <h2>Failure history</h2>
      <p>
        Find first seen, last seen, and recurrence across reports with the same
        project, environment, and branch as this run. Blank labels match blank
        labels.
      </p>
      <button className="button" id="analyze-failure-history">
        Analyze comparable runs
      </button>
      <div id="failure-history-results" aria-live="polite" />
    </article>
  );
}
export function FailureTrendResults({ trends, formatDate }) {
  return (
    <>
      <p>{trends.runs} comparable saved reports analyzed.</p>
      {trends.patterns.map((item, index) => (
        <details className="failure-recurrence" key={index}>
          <summary>
            <strong>
              {item.pattern.slice(0, 180)}
              {item.pattern.length > 180 ? "." : ""}
            </strong>
            <span>
              {item.runs} / {trends.runs} reports
            </span>
          </summary>
          <p>{item.pattern}</p>
          <dl>
            <div>
              <dt>First seen</dt>
              <dd>{formatDate(new Date(item.first).toISOString())}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>{formatDate(new Date(item.last).toISOString())}</dd>
            </div>
          </dl>
        </details>
      ))}
      {!trends.patterns.length && (
        <p>No failed patterns were recorded in these reports.</p>
      )}
    </>
  );
}
