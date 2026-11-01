import { useMemo, useState } from "react";
import Groups from "../../../shared/dashboard-groups";
import { Badge } from "./ReportPrimitives";
import { Modal } from "./Modal";
export function GroupMetrics({ stats, metrics, duration }) {
  const counts = stats.counts;
  const values = [
    ...(metrics.includes("passRate")
      ? [
          [
            "Pass rate",
            stats.passRate == null ? "-" : stats.passRate.toFixed(1) + "%",
          ],
        ]
      : []),
    ["Total tests", counts.total.toLocaleString("en-US")],
    ...(metrics.includes("outcomes")
      ? [
          "passed",
          "failed",
          "pending",
          "skipped",
          ...(counts.unknown ? ["unknown"] : []),
        ].map((status) => [
          status[0].toUpperCase() + status.slice(1),
          counts[status].toLocaleString("en-US"),
          `group-${status}`,
        ])
      : []),
    ...(metrics.includes("duration")
      ? [["Cumulative test time", duration(stats.duration)]]
      : []),
  ];
  return (
    <dl className="custom-group-metrics">
      {values.map(([label, value, className]) => (
        <div key={label} className={className}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function GroupDashboard({
  groups,
  error,
  report,
  sourceName,
  duration,
  onSpec,
  canManage = false,
}) {
  const [selected, setSelected] = useState(null);
  return (
    <>
      {error ? (
        <p className="notice" role="status">
          {error}
        </p>
      ) : !groups.length ? (
        <div className="custom-widget-empty">
          <h3>Your groups, your dashboard</h3>
          <p>
            Group specs by folder or file path and choose the metrics you want
            to see.
          </p>
          {canManage && (
            <a className="button" href="#report-settings">
              Set up your widgets
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="custom-widget-grid">
            {groups.map((group) => {
              const stats = Groups.groupStats(report, group);
              return (
                <article
                  key={group.id}
                  className="dashboard-widget custom-group-widget"
                >
                  <div className="widget-heading">
                    <div>
                      <h3>{group.name}</h3>
                      <p>
                        {stats.specs.length} matching specs ·{" "}
                        {group.paths.length} paths
                      </p>
                    </div>
                    {!!stats.counts.total && (
                      <Badge
                        status={
                          stats.counts.failed
                            ? "failed"
                            : stats.counts.unknown
                              ? "unknown"
                              : stats.counts.passed
                                ? "passed"
                                : "incomplete"
                        }
                      />
                    )}
                  </div>
                  <GroupMetrics
                    stats={stats}
                    metrics={group.metrics}
                    duration={duration}
                  />
                  {!stats.specs.length && (
                    <p className="widget-empty">
                      No specs match this group in the selected report.
                    </p>
                  )}
                  {!!stats.unmatchedPaths.length && !!stats.specs.length && (
                    <p className="widget-footnote">
                      {stats.unmatchedPaths.length} configured path(s) have no
                      matches in this report.
                    </p>
                  )}
                  <details className="custom-widget-paths">
                    <summary>Grouped paths</summary>
                    <ul>
                      {group.paths.map((path) => (
                        <li key={path}>{path}</li>
                      ))}
                    </ul>
                  </details>
                  <button
                    className="button"
                    data-open-custom-group={group.id}
                    disabled={!stats.specs.length}
                    onClick={() => setSelected(group)}
                  >
                    View group results
                  </button>
                </article>
              );
            })}
          </div>
          <p className="widget-footnote">
            Pass rate uses all registered tests, including pending and skipped.
            Cumulative time sums recorded test durations.
          </p>
        </>
      )}
      {selected && (
        <Modal
          labelledBy="custom-group-title"
          onClose={() => setSelected(null)}
        >
          <div className="dialog-heading">
            <h2 id="custom-group-title">{selected.name}</h2>
            <p>
              {sourceName} · {Groups.groupStats(report, selected).specs.length}{" "}
              matching specs
            </p>
          </div>
          <GroupMetrics
            stats={Groups.groupStats(report, selected)}
            metrics={selected.metrics}
            duration={duration}
          />
          <div className="custom-group-specs">
            {Groups.groupStats(report, selected).specs.map((spec) => (
              <button
                key={spec.id}
                className="analysis-row"
                data-custom-spec={spec.id}
                onClick={() => {
                  setSelected(null);
                  onSpec(spec.id);
                }}
              >
                <span>
                  {spec.file}
                  <small>
                    {spec.counts.total} tests · {spec.counts.failed} failed
                  </small>
                </span>
                <Badge status={spec.status} />
              </button>
            ))}
          </div>
          <button className="button" onClick={() => setSelected(null)}>
            Close
          </button>
        </Modal>
      )}
    </>
  );
}
export function GroupWidgetEditor({
  initialGroups,
  ready = true,
  preferenceError = "",
  report,
  sourceName,
  duration,
  save,
  onSaved,
  onToast,
  can,
}) {
  const [groups, setGroups] = useState(initialGroups),
    [editing, setEditing] = useState(null),
    [name, setName] = useState(""),
    [paths, setPaths] = useState(""),
    [choice, setChoice] = useState(""),
    [metrics, setMetrics] = useState(["outcomes", "passRate", "duration"]),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const choices = useMemo(() => Groups.pathOptions(report), [report]);
  const preview = useMemo(() => {
    try {
      const [group] = Groups.validateGroups([
        {
          id: "preview",
          name: name || "Preview",
          paths: paths.split(/\r?\n/).filter(Boolean),
          metrics,
        },
      ]);
      return { stats: Groups.groupStats(report, group) };
    } catch (reason) {
      return { error: reason.message };
    }
  }, [name, paths, metrics, report]);
  function reset() {
    setEditing(null);
    setName("");
    setPaths("");
    setChoice("");
    setMetrics(["outcomes", "passRate", "duration"]);
    setError("");
  }
  async function submit(event) {
    event.preventDefault();
    if (pending || !ready) return;
    setPending(true);
    setError("");
    try {
      const group = {
        id: editing || crypto.randomUUID(),
        name,
        paths: paths.split(/\r?\n/).filter(Boolean),
        metrics,
      };
      const validated = Groups.validateGroups(
        editing
          ? groups.map((item) => (item.id === editing ? group : item))
          : [...groups, group],
      );
      const saved = await save(validated);
      setGroups(saved);
      reset();
      onSaved();
      onToast(
        editing ? "Group widget updated." : "Group widget added.",
        "success",
      );
    } catch (reason) {
      setError(reason.message);
      onToast(reason.message, "error");
    } finally {
      setPending(false);
    }
  }
  async function remove(group) {
    if (pending || !ready) return;
    setPending(true);
    try {
      setGroups(await save(groups.filter((item) => item.id !== group.id)));
      if (editing === group.id) reset();
      onSaved();
      onToast(`"${group.name}" widget removed.`, "success");
    } catch (reason) {
      setError(reason.message);
      onToast(reason.message, "error");
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="settings-card custom-widget-settings"
      aria-labelledby="custom-widget-settings-title"
    >
      <div className="widget-heading">
        <div>
          <h2 id="custom-widget-settings-title">
            Customized dashboard widgets
          </h2>
          <p>Create named spec groups for your Latest run dashboard.</p>
        </div>
        <a className="widget-link" href="#latest-run">
          View dashboard →
        </a>
      </div>
      <p>
        Your widget names, paths, metrics, and order are saved to your own user
        preferences. Other users keep their own setup. Results use the report
        you are viewing.
      </p>
      {preferenceError && (
        <p className="notice" role="status">
          {preferenceError}
        </p>
      )}
      <div className="custom-widget-editor" inert={!ready}>
        <form id="custom-widget-form" onSubmit={submit} inert={pending}>
          <h3 id="custom-widget-editor-title">
            {editing ? "Edit group widget" : "New group widget"}
          </h3>
          <label htmlFor="custom-widget-name">Group name</label>
          <input
            id="custom-widget-name"
            maxLength="80"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label htmlFor="custom-widget-path-choice">
            Choose a path from {sourceName}
          </label>
          <div className="custom-path-picker">
            <select
              id="custom-widget-path-choice"
              value={choice}
              onChange={(event) => setChoice(event.target.value)}
            >
              <option value="">Select a folder or spec file</option>
              <optgroup label="Folders">
                {choices.folders.map(([path, count]) => (
                  <option key={path} value={path}>
                    {path}/ ({count} specs)
                  </option>
                ))}
              </optgroup>
              <optgroup label="Spec files">
                {choices.files.map((path) => (
                  <option key={path}>{path}</option>
                ))}
              </optgroup>
            </select>
            <button
              className="button"
              type="button"
              onClick={() => {
                if (choice)
                  setPaths((previous) =>
                    [
                      ...new Set([
                        ...previous.split(/\r?\n/).filter(Boolean),
                        choice,
                      ]),
                    ].join("\n"),
                  );
              }}
            >
              Add path
            </button>
          </div>
          <label htmlFor="custom-widget-paths">Group paths</label>
          <textarea
            id="custom-widget-paths"
            rows="4"
            required
            value={paths}
            onChange={(event) => setPaths(event.target.value)}
          />
          <p className="widget-footnote">
            One folder or exact spec path per line. Folders include nested
            specs. Paths are case-sensitive; wildcards are not supported.
          </p>
          <fieldset className="custom-widget-options">
            <legend>Widget metrics</legend>
            {[
              ["outcomes", "Test outcomes"],
              ["passRate", "Pass rate"],
              ["duration", "Cumulative test time"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  name="custom-metric"
                  value={value}
                  checked={metrics.includes(value)}
                  onChange={(event) =>
                    setMetrics((previous) =>
                      event.target.checked
                        ? [...previous, value]
                        : previous.filter((item) => item !== value),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="settings-buttons">
            <button
              className="button primary"
              id="save-custom-widget"
              disabled={
                pending ||
                !can(
                  editing
                    ? "report-settings.edit-custom-widgets"
                    : "report-settings.create-custom-spec-group-widgets",
                )
              }
            >
              {pending ? "Saving..." : editing ? "Save changes" : "Add widget"}
            </button>
            {editing && (
              <button className="button" type="button" onClick={reset}>
                Cancel editing
              </button>
            )}
          </div>
          <p id="custom-widget-feedback" role="alert">
            {error}
          </p>
        </form>
        <aside className="custom-widget-live-preview">
          <h3>Live group preview</h3>
          <p className="widget-footnote">
            Based on {sourceName}. Choose a path to see matching results.
          </p>
          {preview.stats ? (
            <>
              <GroupMetrics
                stats={preview.stats}
                metrics={metrics}
                duration={duration}
              />
              <p>{preview.stats.specs.length} matching specs</p>
              <ul>
                {preview.stats.specs.slice(0, 20).map((spec) => (
                  <li key={spec.id}>{spec.file}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="widget-footnote">{preview.error}</p>
          )}
        </aside>
      </div>
      <div className="custom-widget-saved">
        <h3>Saved group widgets</h3>
        {groups.map((group) => (
          <div key={group.id} className="custom-widget-saved-row">
            <div>
              <strong>{group.name}</strong>
              <p>
                {group.paths.length} path(s) ·{" "}
                {Groups.groupStats(report, group).specs.length} matching specs
                in this report
              </p>
              <ul>
                {group.paths.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </div>
            <div className="settings-buttons">
              {can("report-settings.edit-custom-widgets") && (
                <button
                  className="button"
                  type="button"
                  data-edit-widget={group.id}
                  onClick={() => {
                    setEditing(group.id);
                    setName(group.name);
                    setPaths(group.paths.join("\n"));
                    setMetrics(group.metrics);
                    setError("");
                  }}
                >
                  Edit
                </button>
              )}
              {can("report-settings.remove-custom-widgets") && (
                <button
                  className="button"
                  type="button"
                  data-remove-widget={group.id}
                  disabled={pending}
                  onClick={() => remove(group)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
        {!groups.length && (
          <p className="widget-footnote">
            No group widgets yet. Add your first group above.
          </p>
        )}
      </div>
    </section>
  );
}
