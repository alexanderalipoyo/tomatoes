import { PreferenceStatus } from "./ProfilePage";
import { Badge } from "../components/ReportPrimitives";
export function ReportSettingsPage({
  report,
  sourceName,
  zones,
  preferences,
  pageSize,
  savedEntry,
  historyCount,
  state,
  formatDate,
  duration,
}) {
  return (
    <>
      <PreferenceStatus state={state} />
      <div className="settings-layout">
        <div>
          <form className="settings-card preference-form" id="display-settings">
            <div className="widget-heading">
              <div>
                <h2>Display preferences</h2>
                <p>Saved in your server profile across reports and reloads</p>
              </div>
            </div>
            <label>
              Time zone
              <select id="setting-zone" defaultValue={preferences.timeZone}>
                {zones.map((zone) => (
                  <option key={zone}>{zone}</option>
                ))}
              </select>
              <small>Applies to run dates and import history.</small>
            </label>
            <label>
              Results per page
              <select id="setting-rows" defaultValue={pageSize}>
                {[15, 30, 50, 100].map((rows) => (
                  <option key={rows} value={rows}>
                    {rows} results
                  </option>
                ))}
              </select>
              <small>Applies to spec and individual test lists.</small>
            </label>
            <div className="settings-buttons">
              <button className="button primary" type="submit">
                Save preferences
              </button>
              <button className="button" type="button" id="reset-display">
                Use defaults
              </button>
            </div>
            <p id="settings-feedback" role="status" />
          </form>
          <article className="settings-card">
            <h2>Report actions</h2>
            <p>Download the original report or run validation again.</p>
            <div className="settings-buttons">
              <button className="button" id="export-report">
                Download JSON
              </button>
              <button className="button" id="revalidate-report">
                Revalidate report
              </button>
              <a className="button" href="#import-history">
                Import history →
              </a>
              <button className="button" type="button" id="export-run-summary">
                Download run summary
              </button>
              <button className="button" type="button" id="export-pdf">
                Download PDF report
              </button>
            </div>
            <p id="export-feedback" role="status" />
          </article>
        </div>
        <div>
          <article
            className="settings-card"
            data-feature="report-settings.view-report-information"
          >
            <div className="widget-heading">
              <div>
                <h2>Selected report</h2>
                <p>
                  <Badge status={report.status} /> {sourceName}
                </p>
              </div>
            </div>
            <dl className="source-details">
              {[
                ["Format", "Mochawesome JSON"],
                ["Run started", formatDate(report.start)],
                ["Run finished", formatDate(report.end)],
                ["Report duration", duration(report.duration)],
                [
                  "Coverage",
                  `${report.counts.total.toLocaleString("en-US")} tests / ${report.specs.length} specs`,
                ],
                [
                  "History",
                  savedEntry ? "Saved in this browser" : "Current session only",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </article>
          <article
            className="settings-card"
            data-feature="report-settings.review-validation-and-data-quality-warnings"
          >
            <h2>Data quality</h2>
            <p className="validation-summary">
              {report.warnings.length
                ? "Valid format · summary discrepancies detected"
                : "Valid format · test totals reconcile"}
            </p>
            {report.warnings.map((warning, index) => (
              <p key={index} className="notice data-warning">
                {warning}
              </p>
            ))}
            <p className="widget-footnote">
              Browser and operating-system data are not provided by this report.
            </p>
            <div className="storage-summary">
              <strong>{historyCount}</strong>
              <span>
                reports saved locally
                <br />
                Clearing this site's browser data removes history.
              </span>
            </div>
          </article>
        </div>
      </div>
      <div id="custom-widget-settings-host" />
    </>
  );
}
