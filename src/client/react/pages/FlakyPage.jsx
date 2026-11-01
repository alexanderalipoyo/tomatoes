import Data from "../../../shared/report-data";
import { Metric } from "../components/ReportPrimitives";
import { Icon } from "../components/Icon";
export function FlakyPage({
  report,
  entries,
  stability,
  duration,
  onAnalyze,
  onTest,
}) {
  const retry = Data.retryStats(report);
  return (
    <>
      <article
        className="insight-card"
        data-feature="flaky-tests.review-explicit-retry-recovery-evidence"
      >
        <div className="widget-heading">
          <div>
            <h2>Retry-based flakiness</h2>
            <p>{retry.withEvidence} tests include explicit attempt records.</p>
          </div>
        </div>
        <div className="test-history-metrics">
          <div>
            <strong>{retry.retried}</strong>
            <span>Tests retried</span>
          </div>
          <div>
            <strong>{retry.confirmed.length}</strong>
            <span>Recovered after failure</span>
          </div>
        </div>
        {retry.confirmed.map((test) => (
          <button
            key={test.id}
            className="analysis-row"
            data-retry-test={test.id}
            onClick={() => onTest(test.id)}
          >
            <span>
              {test.title}
              <small>{test.file}</small>
            </span>
            <strong>{test.attempts.length} attempts →</strong>
          </button>
        ))}
        {!retry.confirmed.length && (
          <p>
            {retry.withEvidence
              ? "No passed tests have a preceding failed attempt in the supplied evidence."
              : "This report has no attempt records. Include attempts in the JSON to establish retry-based flakiness."}
          </p>
        )}
      </article>
      <article className="stability-banner">
        <div className="stability-symbol">
          <Icon name="flake" />
        </div>
        <div>
          <h2>Investigate test stability</h2>
          <p>
            Find matching tests that passed in one saved run and failed in
            another. Comparisons use the spec path and full test title.
          </p>
          <p className="widget-footnote">
            Cross-run comparisons use final outcomes; explicit retry evidence is
            summarized above when available. Changes across runs are
            investigation signals; code, data, and environment differences can
            also change results.
          </p>
        </div>
      </article>
      <div className="stability-toolbar">
        <div>
          <h2>Cross-run analysis</h2>
          <p>Compare up to 10 saved reports, including the selected run.</p>
        </div>
        <button
          className="button primary"
          id="analyze-stability"
          disabled={entries.length < 2}
          onClick={onAnalyze}
        >
          {stability ? "Refresh analysis" : "Analyze saved runs"}
        </button>
      </div>
      {entries.length < 2 && (
        <article className="insight-card">
          <h2>One more report needed</h2>
          <p>
            Import another run with the same test names and spec paths to
            compare outcomes.
          </p>
          <a className="button" href="#import-history">
            View import history
          </a>
        </article>
      )}
      <div id="stability-results" aria-live="polite">
        {stability ? (
          <>
            <div className="insight-metrics">
              <Metric
                label="Runs compared"
                value={stability.runs}
                note="Distinct saved reports"
              />
              <Metric
                label="Comparable tests"
                value={stability.comparable}
                note="Executed in at least two reports"
              />
              <Metric
                label="Changed outcomes"
                value={stability.changed.length}
                note="Passed and failed across compared runs"
              />
              <Metric
                label="Always failed"
                value={stability.alwaysFailed}
                note="Failed in every observed execution"
              />
            </div>
            <article
              className="insight-card"
              data-feature="flaky-tests.investigate-cross-run-pass-fail-changes"
            >
              <div className="widget-heading">
                <div>
                  <h2>Tests with changing outcomes</h2>
                  <p>
                    Oldest → newest observed execution ·{" "}
                    {stability.alwaysPassed} tests always passed
                  </p>
                </div>
                <span className="widget-count">
                  {stability.changed.length} signals
                </span>
              </div>
              {stability.changed.slice(0, 100).map((test, index) => (
                <div
                  key={`${test.file}:${test.title}`}
                  className="stability-test"
                >
                  <div>
                    <strong>{test.title}</strong>
                    <small>{test.file}</small>
                  </div>
                  <div className="observation-strip">
                    {test.observations.map((observation, i) => (
                      <span
                        key={i}
                        className={`observation ${observation.status}`}
                        title={`${observation.label}: ${observation.status}`}
                        aria-label={`${observation.label}: ${observation.status}`}
                      >
                        {observation.status === "passed" ? "P" : "F"}
                      </span>
                    ))}
                  </div>
                  <span>
                    {test.failures}/{test.observations.length} failed
                  </span>
                  {test.currentId !== null ? (
                    <button
                      className="button"
                      data-stability-test={index}
                      onClick={() => onTest(test.currentId)}
                    >
                      Inspect selected run
                    </button>
                  ) : (
                    <small>Absent from selected run</small>
                  )}
                </div>
              ))}
              {!stability.changed.length && (
                <div className="widget-empty">
                  No pass/fail changes were found among comparable tests.
                </div>
              )}
              <p className="widget-footnote">
                P = passed, F = failed. Only executed outcomes are compared.{" "}
                {stability.ambiguous} duplicate test identities were excluded.{" "}
                {stability.changed.length > 100
                  ? "Showing the first 100 signals."
                  : ""}
              </p>
            </article>
          </>
        ) : (
          <div className="history-empty">
            <h3>Ready to compare your reports</h3>
            <p>
              Analyze saved runs to see outcome changes and repeatedly failing
              tests.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
