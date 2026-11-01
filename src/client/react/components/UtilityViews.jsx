export function HistoryTools() {
  return (
    <>
      <div className="history-utility">
        <div>
          <strong>Keep your reports safe</strong>
          <p id="storage-usage">Checking browser storage.</p>
        </div>
        <div className="history-actions">
          <button className="button" id="backup-history">
            Download backup
          </button>
          <button className="button" id="restore-history">
            Restore backup
          </button>
          <button className="button" id="show-trash">
            View trash
          </button>
        </div>
        <input
          hidden
          type="file"
          id="backup-file"
          accept="application/json,.json"
        />
      </div>
      <p className="widget-footnote">
        Backups include reports, labels, notes, metadata, attachments, and
        trash. Restores merge missing records and preserve existing local edits.
        Maximum backup size: 100 MB.
      </p>
      <div id="trash-list" />
    </>
  );
}
export function HistoryEdit({ entry }) {
  return (
    <>
      <div className="dialog-heading">
        <h2 id="detail-title">Edit saved report</h2>
        <p>{entry.name}</p>
      </div>
      <form id="history-edit" className="preference-form">
        <label>
          Display name
          <input
            id="history-label"
            maxLength="180"
            defaultValue={entry.label || entry.name}
            required
          />
        </label>
        <label>
          Notes
          <textarea
            id="history-notes"
            maxLength="2000"
            rows="5"
            defaultValue={entry.notes || ""}
          />
        </label>
        <p className="widget-footnote">
          The original JSON and import timestamp are preserved.
        </p>
        <button className="button primary">Save changes</button>
        <p id="history-edit-status" role="status" />
      </form>
    </>
  );
}
export function TrashList({ entries, formatDate }) {
  return (
    <article className="insight-card">
      <h3>Trash</h3>
      <p>Reports stay recoverable here and continue to use browser storage.</p>
      {entries.map((entry) => (
        <div className="trash-row" key={entry.id}>
          <span>
            {entry.label || entry.name}
            <small>
              Removed {formatDate(new Date(entry.deletedAt).toISOString())}
            </small>
          </span>
          <button className="button" data-restore-trash={entry.id}>
            Restore
          </button>
        </div>
      ))}
      {!entries.length && <p>Trash is empty.</p>}
    </article>
  );
}
export function PDFCanvasFrame() {
  return (
    <>
      <div className="pdf-page-toolbar">
        <button className="button" id="pdf-previous-page" disabled>
          Previous page
        </button>
        <span id="pdf-page-number" role="status" />
        <button className="button" id="pdf-next-page">
          Next page
        </button>
      </div>
      <div className="pdf-page-canvas">
        <canvas aria-label="PDF report page preview" role="img" />
      </div>
    </>
  );
}
export function LegalDocument({ title, blocks, url, error, loading }) {
  return (
    <article className="legal-document" aria-busy={loading}>
      {!blocks ? (
        <>
          <h2 id="detail-title">{title}</h2>
          <p role={error ? "alert" : "status"}>
            {error || "Loading sample document..."}
          </p>
        </>
      ) : (
        <>
          {blocks.map((block, index) =>
            index === 0 ? (
              <h2 key={index} id="detail-title">
                {block.replace(/^# /, "")}
              </h2>
            ) : block.startsWith("## ") ? (
              <h3 key={index}>{block.slice(3)}</h3>
            ) : (
              <p
                key={index}
                className={index === 1 ? "legal-sample-notice" : undefined}
              >
                {block}
              </p>
            ),
          )}
          <a className="legal-download" href={url} download>
            Download sample document (.md)
          </a>
        </>
      )}
    </article>
  );
}
export function Avatar({ logo, initials, name = "" }) {
  return logo ? (
    <img
      className="workspace-logo"
      src={logo}
      alt={name ? `${name} logo` : ""}
    />
  ) : (
    <>{initials}</>
  );
}
export function SelectOptions({ options, empty }) {
  return options.length ? (
    options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))
  ) : empty ? (
    <option value="">{empty}</option>
  ) : null;
}
export function AccessDenied() {
  return (
    <article className="settings-card">
      <h2>Access denied</h2>
      <p>
        Your role cannot open this page. Contact your organization
        administrator.
      </p>
      <a className="button" href="#latest-run">
        Latest run
      </a>{" "}
      <a className="button" href="#my-profile">
        My profile
      </a>
    </article>
  );
}

export function CopyReportLink({ url }) {
  return (
    <>
      <h2 id="detail-title">Report link</h2>
      <p>Copy this link to reopen the specific report.</p>
      <label htmlFor="copy-report-link">Report URL</label>
      <input
        id="copy-report-link"
        readOnly
        style={{ width: "100%" }}
        value={url}
      />
    </>
  );
}
