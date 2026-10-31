import { useMemo, useState } from "react";
import Data from "../../../shared/report-data";
import Workspace from "../../../shared/workspace-model";
import { Badge, Metric } from "../components/ReportPrimitives";
import { Modal } from "../components/Modal";
export function AnalyticsPage({
  report,
  sourceName,
  entries,
  activeId,
  formatDate,
  duration,
  onTest,
  onArea,
  onHistory,
}) {
  const [pattern, setPattern] = useState(null),
    [filters, setFilters] = useState({
      project: report.metadata?.project || "",
      environment: report.metadata?.environment || "",
      branch: "",
    });
  const data = useMemo(() => Data.insightStats(report), [report]);
  const trends = Workspace.filterEntries(entries, filters)
    .sort(
      (a, b) =>
        (Date.parse(a.start) || a.lastImportedAt) -
        (Date.parse(b.start) || b.lastImportedAt),
    )
    .slice(-8);
  return (
    <>
      <div className="insight-source">
        <span>
          <Badge status={report.status} /> {sourceName}
        </span>
        <span>
          {formatDate(report.start)} · {report.specs.length} specs
        </span>
      </div>
      <div className="insight-metrics">
        <Metric
          label="Executed pass rate"
          value={`${data.executedPassRate.toFixed(1)}%`}
          note={`${report.counts.passed} passed / ${data.executed} executed`}
        />
        <Metric
          label="95th percentile test"
          value={duration(data.p95)}
          note="95% of executed tests finished within this time"
          feature="analytics.review-performance-percentiles"
        />
        <Metric
          label="Time in failed tests"
          value={duration(data.failureTime)}
          note="Sum of recorded failed-test durations"
        />
        <Metric
          label="Specs with failures"
          value={`${report.failedSpecs} / ${report.specs.length}`}
          note="Specs containing at least one failure"
        />
      </div>
      <div className="analytics-grid">
        <article
          className="insight-card"
          data-feature="analytics.analyze-failure-patterns"
        >
          <div className="widget-heading">
            <div>
              <h2>Failure patterns</h2>
              <p>Grouped by the recorded error message</p>
            </div>
            <span className="widget-count">
              {report.counts.failed} failures
            </span>
          </div>
          {data.categories.map((category, index) => (
            <button
              key={category.label}
              className="pattern-row"
              data-pattern={index}
              onClick={() => setPattern(category)}
            >
              <span>
                <strong>{category.label}</strong>
                <i className="pattern-track">
                  <i
                    style={{
                      width: `${(category.tests.length / Math.max(1, report.counts.failed)) * 100}%`,
                    }}
                  />
                </i>
              </span>
              <b>{category.tests.length}</b>
            </button>
          ))}
          {!data.categories.length && (
            <p className="widget-empty">No failures in this report.</p>
          )}
          <p className="widget-footnote">
            Review the failure details to confirm the cause.
          </p>
        </article>
        <article
          className="insight-card"
          data-feature="analytics.view-duration-distributions"
        >
          <div className="widget-heading">
            <div>
              <h2>Test duration distribution</h2>
              <p>Executed tests grouped by recorded duration</p>
            </div>
          </div>
          <div className="duration-distribution">
            {data.bins.map((bin) => (
              <div key={bin.label}>
                <span>{bin.label}</span>
                <i>
                  <i
                    style={{
                      width: `${(bin.count / Math.max(1, ...data.bins.map((item) => item.count))) * 100}%`,
                    }}
                  />
                </i>
                <strong>{bin.count.toLocaleString("en-US")}</strong>
              </div>
            ))}
          </div>
          <p className="widget-footnote">
            Pending and skipped tests are excluded.
          </p>
        </article>
        <article
          className="insight-card"
          data-feature="analytics.identify-affected-directories"
        >
          <div className="widget-heading">
            <div>
              <h2>Areas to review</h2>
              <p>Spec directories ranked by failures</p>
            </div>
          </div>
          {data.folders.slice(0, 6).map((area, index) => (
            <button
              key={area.folder}
              className="analysis-row"
              data-area={index}
              onClick={() => onArea(area.folder)}
            >
              <span>
                {area.folder}
                <small>
                  {area.total} tests · {duration(area.duration)} cumulative time
                </small>
              </span>
              <strong className={area.failed ? "fail-text" : ""}>
                {area.failed} failed
              </strong>
            </button>
          ))}
          {!data.folders.length && <p>No spec data available.</p>}
        </article>
        <article
          className="insight-card"
          data-feature="analytics.view-saved-run-trends"
        >
          <div className="widget-heading">
            <div>
              <h2>Saved-run trends</h2>
              <p>Registered-test pass rate, ordered by run start</p>
            </div>
            <a className="widget-link" href="#history">
              History →
            </a>
          </div>
          <div className="trend-filters">
            {["project", "environment", "branch"].map((key) => (
              <label key={key}>
                {key[0].toUpperCase() + key.slice(1)}
                <select
                  data-trend-filter={key}
                  value={filters[key]}
                  onChange={(event) =>
                    setFilters((previous) => ({
                      ...previous,
                      [key]: event.target.value,
                    }))
                  }
                >
                  <option value="">All</option>
                  <option value="__unlabelled__">Unlabelled</option>
                  {[
                    ...new Set(
                      entries
                        .map((entry) => entry.metadata?.[key])
                        .filter(Boolean),
                    ),
                  ]
                    .sort()
                    .map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                </select>
              </label>
            ))}
          </div>
          {trends.map((entry) => (
            <button
              key={entry.id}
              className={`trend-row ${entry.id === activeId ? "selected-trend" : ""}`}
              data-trend={entry.id}
              onClick={() => onHistory(entry.id)}
            >
              <span>
                {entry.label || entry.name}
                <small>{formatDate(entry.start)}</small>
              </span>
              <span className="trend-track">
                <i style={{ width: `${entry.passRate}%` }} />
              </span>
              <strong>
                {entry.passRate.toFixed(1)}%
                <small>{entry.counts.failed} failed</small>
              </strong>
            </button>
          ))}
          {!trends.length && (
            <p className="widget-empty">Import reports to build a trend.</p>
          )}
          <p className="widget-footnote">
            Saved reports can contain different test sets and environments.
            Filters apply to saved-run trends; the other analytics describe the
            selected report.
          </p>
        </article>
      </div>
      {pattern && (
        <Modal labelledBy="pattern-title" onClose={() => setPattern(null)}>
          <div className="dialog-heading">
            <h2 id="pattern-title">{pattern.label}</h2>
            <p>{pattern.tests.length} failures with this message pattern</p>
          </div>
          {pattern.tests.map((test) => (
            <button
              key={test.id}
              className="analysis-row"
              data-pattern-test={test.id}
              onClick={() => onTest(test.id)}
            >
              <span>
                {test.title}
                <small>{test.file}</small>
              </span>
              <strong>Inspect →</strong>
            </button>
          ))}
          <button className="button" onClick={() => setPattern(null)}>
            Close
          </button>
        </Modal>
      )}
    </>
  );
}
