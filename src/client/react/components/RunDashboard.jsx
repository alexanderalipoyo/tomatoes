import { Icon } from "./Icon";
const outcomes = ["passed", "failed", "pending", "skipped", "unknown"];
const colors = {
  passed: "#53af8d",
  failed: "#dc7884",
  pending: "#dfba6a",
  skipped: "#8e9eaf",
  unknown: "#a497bd",
};
const number = (value) => value.toLocaleString("en-US");
const title = (status) => status[0].toUpperCase() + status.slice(1);
export function RunSummary({
  report,
  sourceName,
  previous,
  brand,
  formatDate,
  duration,
}) {
  return (
    <>
      <div>
        <span className="eyebrow">
          {previous ? "PREVIOUS IMPORT" : "LATEST IMPORTED RUN"}
        </span>
        <h2>
          <span className={`status-badge ${report.status}`}>
            {title(report.status)}
          </span>{" "}
          {sourceName}
        </h2>
        <p className="report-workspace-brand">
          <img
            className="workspace-logo"
            src={brand.logo || "/assets/tomatoes-logo.svg"}
            alt=""
          />
          <span>{brand.name}</span>
        </p>
        <p>
          Started {formatDate(report.start)}
          <br />
          Finished {formatDate(report.end)}
        </p>
      </div>
      <div className="run-summary-stats" data-feature="latest-run.run-duration">
        <strong>{duration(report.duration)}</strong>
        <span>Reported run duration</span>
        <span>
          {report.specs.length} specs · {report.failedSpecs} with failures
        </span>
      </div>
    </>
  );
}
function MetricCard({ label, children, note, glyph }) {
  return (
    <article
      className="metric"
      data-feature={
        label === "Pass rate"
          ? "latest-run.pass-rate"
          : "latest-run.test-outcome-totals"
      }
    >
      <div className="metric-label">
        <Icon name={glyph} />
        {label}
      </div>
      <div className="metric-value">{children}</div>
      <div className="metric-bottom">{note}</div>
    </article>
  );
}
export function RunMetrics({ report }) {
  const c = report.counts;
  return (
    <>
      <MetricCard
        glyph="runs"
        label="Registered tests"
        note={`${report.specs.length} spec files`}
      >
        {number(c.total)}
      </MetricCard>
      <MetricCard
        glyph="check"
        label="Pass rate"
        note={`${number(c.passed)} passed / ${number(c.total)} registered`}
      >
        {report.passRate.toFixed(1)}
        <small>%</small>
      </MetricCard>
      <MetricCard
        glyph="failure"
        label="Failed tests"
        note={`${report.failedSpecs} affected specs`}
      >
        {number(c.failed)}
      </MetricCard>
      <MetricCard
        glyph="check"
        label="Passed tests"
        note="Completed successfully"
      >
        {number(c.passed)}
      </MetricCard>
      <MetricCard
        glyph="clock"
        label="Pending tests"
        note="Marked pending in the report"
      >
        {number(c.pending)}
      </MetricCard>
      <MetricCard
        glyph="flake"
        label="Skipped tests"
        note="Marked skipped in the report"
      >
        {number(c.skipped)}
      </MetricCard>
    </>
  );
}
function Widget({
  title: heading,
  description,
  children,
  action,
  className = "",
}) {
  return (
    <article
      className={`dashboard-widget ${className}`}
      data-feature={
        {
          "Test outcomes": "latest-run.test-outcome-totals",
          "Failure hotspots": "latest-run.failure-hotspots",
          "Spec health": "latest-run.failed-spec-summary",
          "Slowest tests": "latest-run.slow-test-widgets",
          "Execution coverage": "latest-run.test-outcome-totals",
          "Run timing": "latest-run.run-duration",
        }[heading]
      }
    >
      <div className="widget-heading">
        <div>
          <h2>{heading}</h2>
          <p>{description}</p>
        </div>
        {action}
      </div>
      {children}
    </article>
  );
}
export function DashboardWidgets({
  report,
  stats,
  openTests,
  showTest,
  duration,
}) {
  const c = report.counts;
  let position = 0;
  const stops = outcomes
    .filter((status) => c[status])
    .map((status) => {
      const start = position;
      position += c.total ? (c[status] / c.total) * 100 : 0;
      return `${colors[status]} ${start}% ${position}%`;
    });
  const maxFailures = stats.failureSpecs[0]?.counts.failed || 1;
  const topFailures = stats.failureSpecs.reduce(
    (sum, spec) => sum + spec.counts.failed,
    0,
  );
  const labels = {
    failed: "With failures",
    passed: "No failures",
    pending: "Not executed",
    skipped: "Skipped only",
    unknown: "Unknown",
    empty: "Empty",
  };
  return (
    <>
      <Widget
        title="Test outcomes"
        description="All registered tests"
        className="outcomes-widget"
        action={
          <span id="spec-summary">{report.specs.length} specs · 1 run</span>
        }
      >
        <div className="outcome-layout">
          <div id="outcome-chart">
            <div
              className="outcome-donut"
              role="img"
              aria-label={outcomes
                .map((status) => `${c[status]} ${status}`)
                .join(", ")}
              style={{
                background: stops.length
                  ? `conic-gradient(${stops.join(",")})`
                  : "#edf0f4",
              }}
            >
              <div>
                <strong>
                  {report.passRate.toFixed(1)}
                  <small>%</small>
                </strong>
                <span>tests passed</span>
              </div>
            </div>
          </div>
          <div id="outcome-legend" className="outcome-legend">
            {outcomes
              .filter((status) => status !== "unknown" || c.unknown)
              .map((status) => (
                <button
                  key={status}
                  className="outcome-button"
                  data-outcome={status}
                  onClick={() => openTests("all", status)}
                >
                  <i className={status} />
                  {title(status)} <strong>{number(c[status])}</strong>
                  <span>
                    {(c.total ? (c[status] / c.total) * 100 : 0).toFixed(1)}%
                  </span>
                </button>
              ))}
          </div>
        </div>
        <p className="widget-footnote">
          Pass rate includes pending and skipped tests.
        </p>
      </Widget>
      <Widget
        title="Failure hotspots"
        description="Specs ranked by failed tests"
        action={
          <a className="widget-link" href="#failures">
            All failures →
          </a>
        }
      >
        <div id="failure-hotspots">
          {stats.failureSpecs.map((spec) => (
            <button
              key={spec.id}
              className="hotspot-row"
              data-dashboard-spec={spec.id}
              data-status="failed"
              title={spec.file}
              onClick={() => openTests(String(spec.id), "failed")}
            >
              <span className="hotspot-label">
                <span>
                  <strong>{spec.name}</strong>
                  <small>
                    {spec.file.split("/").slice(-3, -1).join(" / ")}
                  </small>
                </span>
                <b>
                  {spec.counts.failed}
                  <small>failed</small>
                </b>
              </span>
              <span className="hotspot-track">
                <i
                  style={{
                    width: `${(spec.counts.failed / maxFailures) * 100}%`,
                  }}
                />
              </span>
            </button>
          ))}
          {stats.failureSpecs.length ? (
            <p className="widget-footnote">
              Top {stats.failureSpecs.length} specs account for {topFailures} of{" "}
              {c.failed} failures (
              {(c.failed ? (topFailures / c.failed) * 100 : 0).toFixed(1)}%).
            </p>
          ) : (
            <p className="widget-empty">No failed tests in this run.</p>
          )}
        </div>
      </Widget>
      <Widget
        title="Spec health"
        description="Select a spec to explore its tests"
        action={
          <span className="widget-count" id="spec-health-count">
            {report.specs.length} specs
          </span>
        }
      >
        <div className="spec-health-grid" id="spec-health">
          {report.specs.map((spec) => (
            <button
              key={spec.id}
              className={`spec-tile ${spec.status}`}
              data-dashboard-spec={spec.id}
              data-status="all"
              aria-label={`${spec.file}: ${spec.counts.failed} failed, ${spec.counts.passed} passed, ${spec.counts.pending} pending, ${spec.counts.skipped} skipped`}
              title={`${spec.file} - ${spec.counts.failed} failed / ${spec.counts.total} tests`}
              onClick={() => openTests(String(spec.id), "all")}
            />
          ))}
          {!report.specs.length && (
            <p className="widget-empty">No specs recorded.</p>
          )}
        </div>
        <div className="spec-health-legend" id="spec-health-legend">
          {Object.entries(stats.specGroups)
            .filter(([, count]) => count)
            .map(([status, count]) => (
              <span key={status}>
                <i className={status} />
                {labels[status]} <strong>{count}</strong>
              </span>
            ))}
        </div>
        <p className="widget-footnote">
          Green specs have passing tests and no failures; some may also have
          pending or skipped tests.
        </p>
      </Widget>
      <Widget
        title="Slowest tests"
        description="Longest individual test durations"
      >
        <div id="slow-tests">
          {stats.slowestTests.map((test) => (
            <button
              key={test.id}
              className="slow-test-row"
              data-dashboard-test={test.id}
              title={test.fullTitle}
              onClick={() => showTest(Number(test.id))}
            >
              <span>
                <strong>{test.title}</strong>
                <small>{test.file.split("/").slice(-2).join(" / ")}</small>
              </span>
              <b>{duration(test.duration)}</b>
            </button>
          ))}
          {!stats.slowestTests.length && (
            <p className="widget-empty">No test durations recorded.</p>
          )}
        </div>
      </Widget>
      <Widget
        title="Execution coverage"
        description="Passed and failed tests out of all registered tests"
        className="execution-widget"
        action={
          <button
            className="widget-link"
            id="view-not-executed"
            onClick={() => openTests("all", "pending")}
          >
            Review pending →
          </button>
        }
      >
        <div id="execution-coverage">
          <div className="coverage-value">
            <strong>
              {stats.executionRate.toFixed(1)}
              <small>%</small>
            </strong>
            <span>
              {number(stats.executed)} of {number(c.total)} tests executed
            </span>
          </div>
          <div
            className="coverage-track"
            role="img"
            aria-label={`${stats.executionRate.toFixed(1)}% executed`}
          >
            <i style={{ width: `${stats.executionRate}%` }} />
          </div>
          <div className="coverage-details">
            {["pending", "skipped", ...(c.unknown ? ["unknown"] : [])].map(
              (status) => (
                <button
                  key={status}
                  data-coverage-status={status}
                  onClick={() => openTests("all", status)}
                >
                  <strong>{number(c[status])}</strong>
                  <span>{title(status)}</span>
                </button>
              ),
            )}
          </div>
        </div>
      </Widget>
      <Widget
        title="Run timing"
        description="Duration measurements from this report"
        className="timing-widget"
      >
        <div id="run-timing">
          <dl className="timing-list">
            {[
              ["Reported run duration", report.duration],
              ["Cumulative test time", stats.totalTestTime],
              ["Median executed test", stats.medianDuration],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{duration(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="widget-footnote">
            Test time sums recorded durations and can differ from reported run
            duration.
          </p>
        </div>
      </Widget>
    </>
  );
}
export function ReportWarnings({ warnings }) {
  return warnings.map((warning, index) => (
    <p key={index} className="notice data-warning">
      {warning}
    </p>
  ));
}
