const number = (value) => value.toLocaleString("en-US");
export function HistoryCards({
  entries,
  activeId,
  formatDate,
  duration,
  href,
  edit,
  trash,
  exportPDF,
  copyLink,
  openLink,
}) {
  if (!entries.length)
    return (
      <div className="history-empty">
        <h3>No saved imports yet</h3>
        <p>Import a valid Mochawesome JSON report to start your history.</p>
      </div>
    );
  return entries.map((entry, index) => (
    <article
      key={entry.id}
      className={`history-card ${entry.id === activeId ? "is-current" : ""}`}
    >
      <div className="history-card-title">
        <div>
          <span className={`status-badge ${entry.status}`}>
            {entry.status[0].toUpperCase() + entry.status.slice(1)}
          </span>
          {index === 0 && <span className="history-tag">Latest import</span>}
          {entry.id === activeId && (
            <span className="history-tag current-tag">Viewing</span>
          )}
          <h3>{entry.label || entry.name}</h3>
          {entry.label && <p>Source: {entry.name}</p>}
          {entry.notes && <p className="history-note">{entry.notes}</p>}
          <p>
            {entry.source === "bundled" ? "Bundled report saved" : "Imported"}{" "}
            {formatDate(new Date(entry.lastImportedAt).toISOString())}
          </p>
          <p>Run started {formatDate(entry.start)}</p>
        </div>
        <div className="history-actions">
          <button
            className="button"
            data-manage-history={entry.id}
            onClick={() => edit(entry.id)}
          >
            Edit name &amp; notes
          </button>
          <button
            className="button"
            data-trash-history={entry.id}
            onClick={() => trash(entry.id)}
          >
            Move to trash
          </button>
          <button
            className="button"
            data-export-pdf={entry.id}
            aria-label={`Export PDF for ${entry.name}`}
            onClick={() => exportPDF(entry.id)}
          >
            Export PDF
          </button>
          <button
            className="button"
            data-copy-report-link={entry.id}
            aria-label={`Copy link for ${entry.label || entry.name}`}
            onClick={(event) => copyLink(entry.id, event.currentTarget)}
          >
            Copy link
          </button>
          <a
            className={`button ${entry.id === activeId ? "" : "primary"}`}
            href={href(entry.id)}
            data-open-history={entry.id}
            onClick={openLink}
          >
            Open dashboard
          </a>
        </div>
      </div>
      <dl className="history-stats">
        {[
          ["Tests", number(entry.counts.total)],
          ["Passed", number(entry.counts.passed)],
          ["Failed", number(entry.counts.failed)],
          [
            "Pending / skipped",
            `${number(entry.counts.pending)} / ${number(entry.counts.skipped)}`,
          ],
          ["Pass rate", `${entry.passRate.toFixed(1)}%`],
          ["Duration", duration(entry.duration)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={label === "Failed" ? "fail-text" : undefined}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  ));
}
