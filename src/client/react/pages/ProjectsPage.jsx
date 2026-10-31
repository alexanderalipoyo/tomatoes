import { useEffect, useMemo, useRef, useState } from "react";
import Catalog from "../../../shared/project-catalog";
import Management from "../../../shared/project-management";
import { Icon } from "../components/Icon";
import { ProjectEditor } from "../components/ProjectEditor";
import { Modal } from "../components/Modal";
function Badge({ status = "unknown" }) {
  return (
    <span className={`status-badge ${status}`}>
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
export function ProjectsPage({
  request,
  historyStore,
  historyFallback,
  can,
  branding,
  currentProject,
  reportLink,
  openReport,
  onImport,
  onDirectory,
  onHistory,
  onToast,
  formatDate,
}) {
  const [serverRuns, setServerRuns] = useState([]),
    [browserRuns, setBrowserRuns] = useState([]),
    [directory, setDirectory] = useState([]),
    [error, setError] = useState(""),
    [pending, setPending] = useState(true),
    [nextCursor, setNextCursor] = useState(null),
    [loadingMore, setLoadingMore] = useState(false),
    [canManage, setCanManage] = useState(false),
    [query, setQuery] = useState(""),
    [reload, setReload] = useState(0),
    [editor, setEditor] = useState(null),
    [runView, setRunView] = useState(null),
    [confirmation, setConfirmation] = useState(null),
    [saving, setSaving] = useState(false),
    [actionError, setActionError] = useState("");
  const moreBusy = useRef(false),
    actionBusy = useRef(false),
    trigger = useRef(null);
  useEffect(() => {
    let active = true;
    setPending(true);
    setError("");
    Promise.allSettled([
      request("/api/runs?includeArchived=1", {
        signal: AbortSignal.timeout(15000),
      }),
      historyStore.list(false, true),
      request("/api/projects", { signal: AbortSignal.timeout(15000) }),
    ]).then((results) => {
      if (!active) return;
      const issues = [];
      if (results[0].status === "fulfilled") {
        setServerRuns(results[0].value.runs);
        setNextCursor(results[0].value.nextCursor || null);
      } else issues.push(results[0].reason.message);
      if (results[1].status === "fulfilled") setBrowserRuns(results[1].value);
      else {
        setBrowserRuns(historyFallback);
        issues.push("Browser archives could not be loaded.");
      }
      if (results[2].status === "fulfilled") {
        setDirectory(results[2].value.projects);
        setCanManage(results[2].value.canManage);
        onDirectory(results[2].value.projects);
      } else
        issues.push(
          "The project directory could not be loaded. " +
            results[2].reason.message,
        );
      setError(issues.join(" "));
      setPending(false);
    });
    return () => {
      active = false;
    };
  }, [request, historyStore, reload]);
  const projects = useMemo(
    () => Catalog.summarize(serverRuns, browserRuns, directory),
    [serverRuns, browserRuns, directory],
  );
  const filtered = projects.filter(
    (project) =>
      `${project.name} ${project.displayName || ""} ${branding(project.name).name}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) ||
      project.branches.some((branch) =>
        branch.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
  );
  const name = (id) =>
    directory.find((item) => item.id === id)?.name || branding(id).name;
  const counts = (project) =>
    [
      project.serverCount
        ? `${project.serverCount} ${nextCursor ? "loaded " : ""}server ${project.serverCount === 1 ? "run" : "runs"}`
        : "",
      project.browserCount
        ? `${project.browserCount} browser ${project.browserCount === 1 ? "import" : "imports"}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ") || "No active runs";
  async function loadMore() {
    if (!nextCursor || moreBusy.current) return;
    moreBusy.current = true;
    setLoadingMore(true);
    try {
      const value = await request(
        "/api/runs?includeArchived=1&cursor=" + encodeURIComponent(nextCursor),
        { signal: AbortSignal.timeout(15000) },
      );
      setServerRuns((previous) => {
        const ids = new Set(previous.map((run) => run.id));
        return [...previous, ...value.runs.filter((run) => !ids.has(run.id))];
      });
      setNextCursor(value.nextCursor || null);
    } catch (reason) {
      onToast("Could not load older reports: " + reason.message, "error");
    } finally {
      moreBusy.current = false;
      setLoadingMore(false);
    }
  }
  async function saveProject(value) {
    await request("/api/team/status");
    const existing =
      editor.project &&
      directory.find((item) => item.id === editor.project.name);
    const result = await request(
      existing
        ? "/api/projects/" + encodeURIComponent(existing.id)
        : "/api/projects",
      {
        method: existing ? "PATCH" : "POST",
        body: JSON.stringify({
          name: value,
          ...(!existing && editor.project ? { id: editor.project.name } : {}),
        }),
      },
    );
    const next = [
      ...directory.filter((item) => item.id !== result.project.id),
      result.project,
    ];
    setDirectory(next);
    onDirectory(next);
    return result.project;
  }
  async function archive() {
    if (actionBusy.current) return;
    const { run, archived } = confirmation;
    actionBusy.current = true;
    setSaving(true);
    setActionError("");
    try {
      if (run.source === "server") {
        await request("/api/team/status");
        const value = await request(`/api/runs/${run.id}/archive`, {
          method: "POST",
          body: JSON.stringify({ archived }),
          signal: AbortSignal.timeout(30000),
        });
        setServerRuns((previous) =>
          previous.map((item) => (item.id === run.id ? value.run : item)),
        );
      } else {
        const updated = await historyStore.updateDetails(run.id, {
          archivedAt: archived ? Date.now() : null,
        });
        if (!updated)
          throw new Error(
            "This browser import is no longer available. Reload Projects.",
          );
        setBrowserRuns((previous) =>
          previous.map((item) => (item.id === run.id ? updated : item)),
        );
        if (archived && (await historyStore.lastActive()) === run.id)
          await historyStore.markActive(
            browserRuns.find((item) => item.id !== run.id && !item.archivedAt)
              ?.id || null,
          );
        await onHistory();
      }
      setConfirmation(null);
      onToast(
        archived
          ? "Run archived. Recover it from Archived runs in this project."
          : "Run restored to active runs.",
        "success",
      );
    } catch (reason) {
      setActionError(reason.message);
      onToast(reason.message, "error");
    } finally {
      actionBusy.current = false;
      setSaving(false);
    }
  }
  const active = runView
      ? Catalog.runsForProject(serverRuns, browserRuns, runView.project, false)
      : [],
    archives = runView
      ? Catalog.runsForProject(serverRuns, browserRuns, runView.project, true)
      : [];
  const moreButton = (
    <button
      className="button"
      type="button"
      id={runView ? "project-runs-more" : "projects-load-more"}
      hidden={!nextCursor || !can("projects.load-older-shared-reports")}
      disabled={loadingMore}
      onClick={loadMore}
    >
      {loadingMore ? "Loading older reports..." : "Load older shared reports"}
    </button>
  );
  if (pending)
    return (
      <article className="insight-card">
        <p role="status">Loading projects.</p>
      </article>
    );
  return (
    <section className="projects-page" aria-label="Workspace projects">
      <div className="projects-toolbar">
        <div className="projects-search">
          <Icon name="search" />
          <input
            type="search"
            id="project-search"
            placeholder="Search projects"
            aria-label="Search projects"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span id="project-count" role="status">
            {filtered.length}
            {query ? ` of ${projects.length}` : ""}{" "}
            {projects.length === 1 ? "project" : "projects"}
          </span>
        </div>
        {canManage && can("projects.create-projects") && (
          <button
            type="button"
            className="button primary"
            id="create-project"
            onClick={() => setEditor({ project: null })}
          >
            <Icon name="plus" />
            New project
          </button>
        )}
      </div>
      {error && (
        <div className="notice data-warning" role="status">
          {error}
          <button
            className="button"
            id="projects-retry"
            onClick={() => setReload((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      <div className="project-grid" id="project-grid">
        {filtered.map((project) => {
          const archived =
            project.archivedServerCount + project.archivedBrowserCount;
          const brand = branding(project.name);
          return (
            <article
              key={project.name}
              className={`project-card${project.name === currentProject ? " is-current-workspace" : ""}`}
              aria-current={
                project.name === currentProject ? "true" : undefined
              }
            >
              <header>
                <div className="project-card-heading">
                  {project.latest ? (
                    <a
                      className="project-card-title"
                      href={reportLink(project.latest)}
                      data-project-report
                      onClick={openReport}
                    >
                      <img
                        className="workspace-logo"
                        src={brand.logo || "/assets/tomatoes-logo.svg"}
                        alt=""
                      />
                      {project.displayName || brand.name}
                    </a>
                  ) : (
                    <span className="project-card-title">
                      <img
                        className="workspace-logo"
                        src={brand.logo || "/assets/tomatoes-logo.svg"}
                        alt=""
                      />
                      {project.displayName || brand.name}
                    </span>
                  )}
                  {project.name === currentProject && (
                    <span className="project-current-label">
                      <span aria-hidden="true">✓</span> Current workspace
                    </span>
                  )}
                  {canManage &&
                    can("projects.rename-projects") &&
                    Management.validId(project.name) && (
                      <button
                        className="button project-rename-button"
                        type="button"
                        data-rename-project={project.name}
                        aria-label={`Rename ${project.displayName || project.name}`}
                        onClick={() => setEditor({ project })}
                      >
                        Rename
                      </button>
                    )}
                </div>
                <p>{counts(project)}</p>
                <small>
                  {project.latest
                    ? `Latest run ${project.latest.start ? formatDate(project.latest.start) : "date not provided"}`
                    : archived
                      ? nextCursor
                        ? "Loaded runs are archived. Older reports may be available below."
                        : "All runs are archived. Restore a run to make it active again."
                      : nextCursor
                        ? "Older reports may be available. Load older shared reports below."
                        : "No reports yet. Import your first report to get started."}
                </small>
              </header>
              <div className="project-branch-list">
                {project.branches.slice(0, 5).map((branch) => (
                  <a
                    key={branch.name}
                    className="project-branch"
                    href={reportLink(branch.latest)}
                    data-project-report
                    onClick={openReport}
                  >
                    <Icon name="branch" />
                    <span>
                      <strong>{branch.name || "Branch not provided"}</strong>
                      <small>{counts(branch)}</small>
                    </span>
                    <Badge status={branch.latest.status} />
                  </a>
                ))}
              </div>
              <footer className="project-archive-footer">
                {Management.validId(project.name) && (
                  <button
                    className="button primary"
                    type="button"
                    data-import-project={project.name}
                    onClick={() => onImport(project.name)}
                  >
                    Import report
                  </button>
                )}
                <button
                  className="button"
                  type="button"
                  data-project-runs={project.name}
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    setRunView({ project: project.name, archived: false });
                  }}
                >
                  Active runs
                </button>
                <button
                  className="button"
                  type="button"
                  data-project-archives={project.name}
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    setRunView({ project: project.name, archived: true });
                  }}
                >
                  Archived runs{" "}
                  <span className="project-archive-count">{archived}</span>
                </button>
                {project.latest && (
                  <a
                    className="project-open"
                    href={reportLink(project.latest)}
                    data-project-report
                    onClick={openReport}
                  >
                    Open latest run →
                  </a>
                )}
              </footer>
            </article>
          );
        })}
        {!filtered.length && (
          <div className="history-empty">
            <h3>
              {projects.length ? "No matching projects" : "No projects yet"}
            </h3>
            <p>
              {projects.length
                ? "Try another project or branch name."
                : canManage
                  ? "Create your first project, then import a report to start exploring."
                  : "Your administrator can create projects for your organization."}
            </p>
          </div>
        )}
      </div>
      <div className="report-page-controls">
        <p id="projects-page-status" role="status">
          {serverRuns.length} shared reports loaded.
          {nextCursor
            ? " Counts cover loaded reports; older reports are available."
            : ""}
        </p>
        {!runView && moreButton}
      </div>
      <p className="projects-source-note">
        Server runs and browser imports are separate copies. Archiving hides a
        copy from active lists and keeps its report available for recovery in
        this project.
      </p>
      {editor && (
        <Modal
          id="react-project-editor"
          labelledBy="project-editor-title"
          onClose={() => setEditor(null)}
        >
          <ProjectEditor
            project={
              editor.project
                ? {
                    id: editor.project.name,
                    name:
                      editor.project.displayName || name(editor.project.name),
                  }
                : null
            }
            onSave={saveProject}
            onClose={() => setEditor(null)}
          />
        </Modal>
      )}
      {runView && (
        <Modal
          id="project-runs-dialog"
          labelledBy="project-runs-title"
          onClose={() => {
            setRunView(null);
            trigger.current?.focus();
          }}
        >
          <button
            className="icon-button project-dialog-close"
            type="button"
            aria-label="Close project runs"
            onClick={() => setRunView(null)}
          >
            <Icon name="close" />
          </button>
          <h2 id="project-runs-title">Runs in {name(runView.project)}</h2>
          <p className="projects-source-note">
            Server and browser copies are listed separately. Archived reports
            remain recoverable.
          </p>
          {moreButton}
          <div
            className="workspace-settings-tabs"
            role="tablist"
            aria-label="Project run status"
          >
            {[
              [false, active],
              [true, archives],
            ].map(([archived, items]) => (
              <button
                key={String(archived)}
                role="tab"
                id={archived ? "project-archived-tab" : "project-active-tab"}
                aria-controls="project-run-panel"
                aria-selected={runView.archived === archived}
                onClick={() =>
                  setRunView((previous) => ({ ...previous, archived }))
                }
              >
                {archived ? "Archived" : "Active"} runs ({items.length})
              </button>
            ))}
          </div>
          <div
            id="project-run-panel"
            role="tabpanel"
            aria-labelledby={
              runView.archived ? "project-archived-tab" : "project-active-tab"
            }
          >
            <div className="project-runs-list">
              {(runView.archived ? archives : active).map((run) => (
                <article className="shared-run" key={`${run.source}:${run.id}`}>
                  <div>
                    <Badge status={run.status} />
                    <strong>{run.label || run.name}</strong>
                    <p>
                      <span className="project-run-source">
                        {run.source === "server"
                          ? "Server run"
                          : "Browser import"}
                      </span>{" "}
                      · {run.metadata?.branch || "Branch not provided"}
                    </p>
                    <small>
                      {run.start
                        ? formatDate(run.start)
                        : "Run date not provided"}
                      {run.archivedAt && (
                        <>
                          <br />
                          Archived{" "}
                          {formatDate(new Date(run.archivedAt).toISOString())}
                        </>
                      )}
                    </small>
                  </div>
                  <div className="project-run-actions">
                    <a
                      className="button"
                      data-open-project-run
                      href={reportLink(run)}
                      onClick={(event) => {
                        setRunView(null);
                        openReport(event);
                      }}
                    >
                      Open results
                    </a>
                    {can(
                      runView.archived
                        ? "projects.restore-runs-with-confirmation"
                        : "projects.archive-runs-with-confirmation",
                    ) && (
                      <button
                        className={`button ${runView.archived ? "primary" : ""}`}
                        type="button"
                        data-archive-run={run.id}
                        onClick={() => {
                          setActionError("");
                          setConfirmation({ run, archived: !runView.archived });
                        }}
                      >
                        {runView.archived ? "Restore run" : "Archive run"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!(runView.archived ? archives : active).length && (
                <div className="project-runs-empty">
                  <h3>
                    {runView.archived ? "No archived runs" : "No active runs"}
                  </h3>
                  <p>
                    {runView.archived
                      ? "Runs archived in this project will appear here for recovery."
                      : "Check Archived runs to restore a previous report."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal
          id="project-run-confirm"
          labelledBy="project-run-confirm-title"
          busy={saving}
          onClose={() => setConfirmation(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              archive();
            }}
            inert={saving}
          >
            <h2 id="project-run-confirm-title">
              {confirmation.archived ? "Archive" : "Restore"} this run?
            </h2>
            <p>
              <strong>{confirmation.run.label || confirmation.run.name}</strong>
              <br />
              {confirmation.run.metadata?.project ||
                "Unassigned project"} ·{" "}
              {confirmation.run.metadata?.branch || "Branch not provided"}
            </p>
            <p>
              {confirmation.run.source === "server"
                ? "This changes the shared server copy for everyone with project access."
                : "This changes only the import saved in this browser."}
            </p>
            <p>
              {confirmation.archived
                ? "The report will leave active lists. Its results, notes, and attachments are kept. You can recover it from this project's Archived runs."
                : "The report will return to active lists in this project."}
            </p>
            <p role="alert" className="project-action-error">
              {actionError}
            </p>
            <footer>
              <button
                className="button"
                type="button"
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : `${confirmation.archived ? "Archive" : "Restore"} run`}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}
