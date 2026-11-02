import { useEffect, useRef, useState } from "react";
import { ReportTags } from "../components/ReportTags";
import { Badge } from "../components/ReportPrimitives";
export function SharingPage({
  request,
  onStatus,
  branding,
  selectedProject,
  hasReport,
  historyCount,
  onPublish,
  onSaveHistory,
  onOpen,
  onToast,
  formatDate = (value) => new Date(value).toLocaleString(),
}) {
  const [status, setStatus] = useState(null),
    [runs, setRuns] = useState([]),
    [project, setProject] = useState(""),
    [publishProject, setPublishProject] = useState(selectedProject || ""),
    [cursor, setCursor] = useState(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [reload, setReload] = useState(0),
    busy = useRef(false);
  useEffect(() => {
    let active = true;
    setError("");
    async function load() {
      try {
        const value = await request("/api/team/status");
        if (!active) return;
        onStatus(value);
        setStatus(value);
        if (value.enabled && !value.authenticated) return;
        const page = await request(
          "/api/runs" +
            (project ? "?project=" + encodeURIComponent(project) : ""),
        );
        if (!active) return;
        setRuns(page.runs);
        setCursor(page.nextCursor || null);
        if (!publishProject)
          setPublishProject(value.accessibleProjects?.[0]?.id || "");
      } catch (reason) {
        if (active) setError(reason.message);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [request, project, reload]);
  async function action(callback, refresh = true) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const message = await callback();
      if (typeof message === "string" && message) {
        setFeedback(message);
        onToast(message, "success");
      }
      if (refresh) setReload((value) => value + 1);
    } catch (reason) {
      setError(reason.message);
      onToast(reason.message, "error");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function more() {
    if (!cursor) return;
    await action(async () => {
      const page = await request(
        "/api/runs?" +
          (project ? "project=" + encodeURIComponent(project) + "&" : "") +
          "cursor=" +
          encodeURIComponent(cursor),
      );
      setRuns((previous) => {
        const ids = new Set(previous.map((run) => run.id));
        return [...previous, ...page.runs.filter((run) => !ids.has(run.id))];
      });
      setCursor(page.nextCursor || null);
    }, false);
  }
  if (!status)
    return (
      <article className="settings-card">
        <p role={error ? "alert" : "status"}>
          {error || "Connecting to the local team store."}
        </p>
        {error && (
          <button
            className="button"
            id="retry-team"
            onClick={() => setReload((value) => value + 1)}
          >
            Reconnect
          </button>
        )}
      </article>
    );
  if (status.enabled && !status.authenticated)
    return (
      <article className="settings-card">
        <h2>Sign in to access shared reports</h2>
        <a className="button primary" href="#login">
          Sign in
        </a>
      </article>
    );
  return (
    <>
      <div className="insight-source">
        <span>
          {status.enabled
            ? `Signed in as ${status.user.fullName || status.user.username} · ${status.user.role}`
            : "Local mode · sign-in is optional"}
        </span>
        <span>
          {status.storage === "postgres"
            ? "PostgreSQL connected · local database"
            : "File storage on this machine"}
        </span>
      </div>
      {error && (
        <p className="notice data-warning" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p className="notice" role="status">
          {feedback}
        </p>
      )}
      <div className="team-layout">
        <article className="settings-card">
          <h2>Shared reports</h2>
          <p>Filter by project and open a report as a browser copy.</p>
          <label className="team-project-label">
            Project
            <select
              id="team-project"
              value={project}
              onChange={(event) => setProject(event.target.value)}
            >
              <option value="">All accessible projects</option>
              {(status.accessibleProjects || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || branding(item.id).name}
                </option>
              ))}
            </select>
          </label>
          <p className="widget-footnote">
            Opening a report saves a copy in this browser's import history,
            including after sign-out.
          </p>
          <div id="team-runs">
            {runs.map((run) => (
              <article className="shared-run" key={run.id}>
                <div>
                  <Badge status={run.status} />
                  <strong>{run.label || run.name}</strong>
                  {run.notes && <p>{run.notes}</p>}
                  <p>
                    {branding(run.metadata.project).name}
                    {run.metadata.environment
                      ? ` / ${run.metadata.environment}`
                      : ""}{" "}
                    · {run.counts.total.toLocaleString("en-US")} tests ·{" "}
                    {run.counts.failed} failed
                  </p>
                  <small>
                    {run.start
                      ? formatDate(run.start)
                      : "Run date not provided"}
                  </small>
                  {run.metadata.branch && (
                    <small>
                      Branch {run.metadata.branch}
                      {run.metadata.commit ? ` · ${run.metadata.commit}` : ""}
                    </small>
                  )}
                </div>
                <button
                  className="button"
                  data-open-shared={run.id}
                  disabled={pending}
                  onClick={() => action(() => onOpen(run.id))}
                >
                  Open browser copy
                </button>
              </article>
            ))}
            {!runs.length && (
              <p className="widget-empty">
                No shared reports in this project yet.
              </p>
            )}
          </div>
          <div className="report-page-controls">
            <p id="team-page-status" role="status">
              {runs.length} shared reports loaded.
              {cursor ? " Older reports are available." : ""}
            </p>
            <button
              type="button"
              className="button"
              id="team-load-more"
              hidden={!cursor}
              disabled={pending}
              onClick={more}
            >
              {pending ? "Loading..." : "Load older reports"}
            </button>
          </div>
        </article>
        <div>
          <form
            className="settings-card preference-form"
            id="publish-current"
            onSubmit={(event) => {
              event.preventDefault();
              action(() => onPublish(publishProject));
            }}
          >
            <h2>Publish selected run</h2>
            <p>Copy the currently viewed report into the server store.</p>
            <label>
              Project
              <select
                id="publish-project"
                value={publishProject}
                onChange={(event) => setPublishProject(event.target.value)}
                required
              >
                <option value="">Select a project</option>
                {(status.accessibleProjects || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.id}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" disabled={!hasReport || pending}>
              Publish report
            </button>
            <p id="team-feedback" role="status">
              {!hasReport
                ? "Open a run from Projects or Shared reports to enable publishing."
                : ""}
            </p>
          </form>
          <article className="settings-card">
            <h2>Save browser history</h2>
            <p>
              Copy saved browser imports, names, notes, and attachments into{" "}
              {status.storage === "postgres"
                ? "PostgreSQL"
                : "the server store"}
              . Browser copies remain available. Trash is excluded.
            </p>
            <button
              type="button"
              className="button"
              id="save-browser-history"
              disabled={pending || !historyCount}
              onClick={() => action(onSaveHistory)}
            >
              Save browser imports
            </button>
            <p id="browser-save-feedback" role="status" />
          </article>
          <article className="settings-card">
            <h2>Optional local sign-in</h2>
            <p>
              Create users with viewer, editor, or admin roles, then start the
              server with TOMATOES_TEAM_MODE=1. Each user has an explicit
              project scope.
            </p>
            <p className="widget-footnote">
              Server reports are stored privately. Existing browser imports can
              be copied using Save browser imports. New file imports are copied
              automatically when PostgreSQL access is available.
            </p>
          </article>
        </div>
      </div>
    </>
  );
}
export function RunIdentity({ metadata, branding, showTags = true }) {
  if (!Object.values(metadata).some(Boolean)) return null;
  return (
    <div className="run-identity">
      {["project", "environment", "branch", "commit"]
        .filter((key) => metadata[key])
        .map((key) => (
          <span key={key}>
            <small>{key}</small>
            {key === "project" ? branding(metadata[key]).name : metadata[key]}
          </span>
        ))}
      {showTags && !!metadata.tags?.length && (
        <ReportTags tags={metadata.tags} />
      )}
      {metadata.buildUrl && (
        <a
          className="button"
          href={metadata.buildUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open build →
        </a>
      )}
    </div>
  );
}
