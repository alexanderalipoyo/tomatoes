import { useEffect, useRef, useState } from "react";
import { Badge } from "./ReportPrimitives";
export function TestDetail({
  test,
  duration,
  can,
  runId,
  listEvidence,
  onUpload,
  onHistory,
}) {
  const recovered =
    test.status === "passed" &&
    test.attempts?.at(-1)?.state === "passed" &&
    test.attempts?.slice(0, -1).some((attempt) => attempt.state === "failed");
  return (
    <>
      <div className="dialog-heading">
        <Badge status={test.status} />
        <h2 id="detail-title">{test.title}</h2>
        <p>{test.fullTitle}</p>
      </div>
      <div className="detail-grid">
        {[
          ["Spec", test.file],
          ["Duration", duration(test.duration)],
          ["Suite", test.suite || "Root suite"],
          ["Status", test.status],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            {value}
          </div>
        ))}
      </div>
      {test.error && can("test-results.inspect-errors-and-stack-traces") ? (
        <>
          <h2>Failure message</h2>
          <pre className="failure-message">{test.error}</pre>
        </>
      ) : (
        <p className="notice">No failure message recorded for this test.</p>
      )}
      {test.stack && can("test-results.inspect-errors-and-stack-traces") && (
        <details>
          <summary>Stack trace</summary>
          <pre>{test.stack}</pre>
        </details>
      )}
      {test.code && can("test-results.view-recorded-test-code") && (
        <details>
          <summary>Test code</summary>
          <pre>{test.code}</pre>
        </details>
      )}
      {test.context && (
        <details>
          <summary>Reported context</summary>
          <pre>{test.context}</pre>
        </details>
      )}
      <div className="test-history-action">
        <button
          className="button primary"
          id="view-test-history"
          onClick={onHistory}
        >
          View test history
        </button>
        <p className="widget-footnote">
          Follow this exact test across saved reports.
        </p>
      </div>
      {!!test.attempts?.length && (
        <section className="retry-evidence">
          <h2>Retry evidence</h2>
          <p>
            {recovered
              ? "Recovered after a failed attempt."
              : "Recorded attempt outcomes."}
          </p>
          {test.attempts.map((attempt, index) => (
            <div className="retry-attempt" key={index}>
              <strong>Attempt {index + 1}</strong>
              <Badge status={attempt.state} />
              <span>{duration(attempt.duration)}</span>
              {attempt.error && <pre>{attempt.error}</pre>}
            </div>
          ))}
        </section>
      )}
      <EvidenceSection
        runId={runId}
        canAttach={can("test-results.attach-screenshots-and-recordings")}
        listEvidence={listEvidence}
        onUpload={onUpload}
      />
    </>
  );
}
function EvidenceSection({ runId, canAttach, listEvidence, onUpload }) {
  const [records, setRecords] = useState([]),
    [status, setStatus] = useState(
      runId ? "" : "Save this report in history before attaching evidence.",
    ),
    [pending, setPending] = useState(false),
    [version, setVersion] = useState(0),
    input = useRef(null);
  useEffect(() => {
    let active = true;
    if (runId)
      listEvidence()
        .then((value) => {
          if (active) setRecords(value);
        })
        .catch(() => {
          if (active) setStatus("Evidence storage is unavailable.");
        });
    return () => {
      active = false;
    };
  }, [runId, listEvidence, version]);
  async function upload(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file || pending) return;
    setPending(true);
    try {
      const result = await onUpload(file);
      setStatus(result?.message || "Evidence saved.");
      setVersion((value) => value + 1);
    } catch (reason) {
      setStatus(reason.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <section id="test-evidence" className="test-evidence">
      <h2>Screenshots &amp; recordings</h2>
      <p className="widget-footnote">
        Attach local test evidence to this saved report. PNG, JPEG, WebP, MP4,
        or WebM; up to 25 MB each.
      </p>
      {canAttach && (
        <button
          className="button"
          id="attach-evidence"
          disabled={!runId || pending}
          onClick={() => input.current.click()}
        >
          {pending ? "Saving..." : "Attach evidence"}
        </button>
      )}
      <input
        ref={input}
        id="evidence-file"
        type="file"
        accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
        hidden
        onChange={upload}
      />
      <p id="evidence-status" role="status">
        {status}
      </p>
      <div id="evidence-list">
        {records.map((record) => (
          <EvidenceItem key={record.id} record={record} />
        ))}
        {!records.length && (
          <p className="widget-footnote">No evidence attached yet.</p>
        )}
      </div>
      <p className="widget-footnote">
        Attachments are stored in this browser and remain separate from the
        original JSON. With PostgreSQL enabled, they are also copied to the
        server when access is available.
      </p>
    </section>
  );
}
function EvidenceItem({ record }) {
  const [show, setShow] = useState(false),
    [url, setUrl] = useState(null);
  useEffect(() => {
    if (!show) return;
    const objectURL = URL.createObjectURL(record.blob);
    setUrl(objectURL);
    const release = () => URL.revokeObjectURL(objectURL),
      dialog = document.querySelector("#detail");
    dialog?.addEventListener("close", release, { once: true });
    return () => {
      release();
      dialog?.removeEventListener("close", release);
    };
  }, [show, record.blob]);
  return (
    <article className="evidence-item">
      <strong>{record.name}</strong>
      <button className="button" disabled={show} onClick={() => setShow(true)}>
        Preview {record.type.startsWith("video/") ? "recording" : "image"}
      </button>
      <div className="evidence-preview">
        {url &&
          (record.type.startsWith("video/") ? (
            <video src={url} controls preload="metadata" />
          ) : (
            <img src={url} alt={record.name} />
          ))}
      </div>
    </article>
  );
}
export function PDFOptions({ name, report, initialOptions }) {
  return (
    <>
      <div className="dialog-heading">
        <h2 id="detail-title">Export PDF report</h2>
        <p>{name}</p>
      </div>
      <form className="pdf-options preference-form" id="pdf-options">
        <label>
          Report detail
          <select
            id="pdf-mode"
            defaultValue={initialOptions.mode || "detailed"}
          >
            <option value="summary">Brief summary</option>
            <option value="detailed">Detailed report with failed tests</option>
          </select>
        </label>
        <label>
          Failure search
          <input
            id="pdf-failure-search"
            type="search"
            maxLength="180"
            placeholder="Test title, path, or error message"
            defaultValue={initialOptions.failureSearch || ""}
          />
        </label>
        <label>
          Failure spec path
          <input
            id="pdf-failure-spec"
            list="pdf-spec-options"
            placeholder="All specs (or enter an exact spec path)"
            defaultValue={initialOptions.failureSpec || ""}
          />
          <datalist id="pdf-spec-options">
            {report?.specs
              .filter((spec) => spec.counts.failed)
              .map((spec) => (
                <option key={spec.id} value={spec.file} />
              ))}
          </datalist>
        </label>
        <p className="widget-footnote">
          Overview totals always cover the full run. Filters apply to failure
          patterns and failed-test details. The summary includes top specs and
          patterns; detailed reports add up to 200 matching failed tests.
        </p>
        <button className="button primary" type="submit">
          Preview PDF
        </button>
      </form>
    </>
  );
}
export function PDFPreview({ outputName, pageCount, size, url }) {
  return (
    <>
      <div className="dialog-heading">
        <h2 id="detail-title">PDF preview</h2>
        <p>
          {outputName} · {pageCount} pages · {size.toFixed(0)} KB
        </p>
      </div>
      <div className="pdf-preview-actions">
        <button className="button primary" id="download-preview-pdf">
          Download PDF
        </button>
        <a className="button" href={url} target="_blank" rel="noopener">
          Open full preview
        </a>
        <button className="button" id="change-pdf-options">
          Change options
        </button>
      </div>
      <p className="widget-footnote">
        If your browser cannot show the embedded preview, use Open full preview
        or Download PDF.
      </p>
      <div id="pdf-page-preview" aria-label="PDF page preview">
        <p role="status">Loading PDF preview.</p>
      </div>
    </>
  );
}
