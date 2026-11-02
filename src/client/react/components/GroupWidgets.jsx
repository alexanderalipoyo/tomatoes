import { useEffect, useMemo, useState } from "react";
import Groups from "../../../shared/dashboard-groups";
import { Badge } from "./ReportPrimitives";
import { Modal } from "./Modal";
const DISPLAY_STATUSES = [
  "all",
  "failed",
  "passed",
  "no-failures",
  "incomplete",
  "unknown",
  "empty",
];
const DISPLAY_SORTS = [
  "saved",
  "name-asc",
  "name-desc",
  "failed",
  "pass-asc",
  "pass-desc",
  "tests",
  "duration",
];
function readWidgetDisplay(key) {
  try {
    const value = key ? JSON.parse(window.localStorage.getItem(key)) : null;
    return {
      query: typeof value?.query === "string" ? value.query.slice(0, 1000) : "",
      groupName:
        typeof value?.groupName === "string"
          ? value.groupName.slice(0, 1000)
          : "",
      status: DISPLAY_STATUSES.includes(value?.status) ? value.status : "all",
      sort: DISPLAY_SORTS.includes(value?.sort) ? value.sort : "saved",
    };
  } catch {
    return { query: "", groupName: "", status: "all", sort: "saved" };
  }
}
function pathSubgroups(group) {
  return [
    ...new Set(
      group.paths.flatMap((path) => {
        const segments = Groups.normalizePath(path).split("/");
        return segments[0] === "cypress" &&
          ["e2e", "smoke"].includes(segments[1]) &&
          segments[2]
          ? [segments.slice(0, 3).join("/")]
          : [];
      }),
    ),
  ];
}
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
  profileId,
}) {
  const [selected, setSelected] = useState(null);
  const storageKey =
    profileId && profileId !== "unavailable"
      ? "tomatoes-widget-display-v1:" + profileId
      : null;
  const [initialDisplay] = useState(() => readWidgetDisplay(storageKey));
  const [query, setQuery] = useState(initialDisplay.query);
  const [groupName, setGroupName] = useState(initialDisplay.groupName);
  const groupNames = useMemo(
    () =>
      [...new Set(groups.map((group) => group.name))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [groups],
  );
  const subgroups = useMemo(
    () =>
      [...new Set(groups.flatMap(pathSubgroups))].sort().map((path) => {
        const [, type, partner] = path.split("/");
        return {
          value: "subgroup:" + path,
          path,
          label:
            type.toUpperCase() +
            " : " +
            partner.replaceAll("-", " ").toUpperCase(),
        };
      }),
    [groups],
  );
  const activeGroupName =
    groupNames.includes(groupName) ||
    subgroups.some((item) => item.value === groupName)
      ? groupName
      : "";
  const [status, setStatus] = useState(initialDisplay.status);
  const [sort, setSort] = useState(initialDisplay.sort);
  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ query, groupName: activeGroupName, status, sort }),
      );
    } catch {
      /* Filtering remains available when browser storage is unavailable. */
    }
  }, [storageKey, query, activeGroupName, status, sort]);
  const entries = useMemo(
    () =>
      groups.map((group) => {
        const stats = Groups.groupStats(report, group);
        const result = !stats.counts.total
          ? "empty"
          : stats.counts.failed
            ? "failed"
            : stats.counts.unknown
              ? "unknown"
              : stats.counts.passed
                ? stats.counts.pending || stats.counts.skipped
                  ? "no-failures"
                  : "passed"
                : "incomplete";
        return { group, stats, result };
      }),
    [groups, report],
  );
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = entries.filter(
      ({ group, result }) =>
        (!activeGroupName ||
          group.name === activeGroupName ||
          pathSubgroups(group).some(
            (path) => "subgroup:" + path === activeGroupName,
          )) &&
        (status === "all" || status === result) &&
        (!search ||
          [group.name, ...group.paths].some((value) =>
            value.toLowerCase().includes(search),
          )),
    );
    const compare = {
      "name-asc": (a, b) => a.group.name.localeCompare(b.group.name),
      "name-desc": (a, b) => b.group.name.localeCompare(a.group.name),
      failed: (a, b) => b.stats.counts.failed - a.stats.counts.failed,
      "pass-asc": (a, b) =>
        (a.stats.passRate ?? Infinity) - (b.stats.passRate ?? Infinity),
      "pass-desc": (a, b) =>
        (b.stats.passRate ?? -Infinity) - (a.stats.passRate ?? -Infinity),
      tests: (a, b) => b.stats.counts.total - a.stats.counts.total,
      duration: (a, b) => b.stats.duration - a.stats.duration,
    }[sort];
    return compare ? filtered.sort(compare) : filtered;
  }, [entries, query, activeGroupName, status, sort]);
  function resetDisplay() {
    setQuery("");
    setGroupName("");
    setStatus("all");
    setSort("saved");
  }
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
          <div
            className="custom-widget-controls"
            role="group"
            aria-label="Widget display controls"
          >
            <label className="custom-widget-search">
              Search widgets
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Group name or path"
              />
            </label>
            <label>
              Group name
              <select
                value={activeGroupName}
                onChange={(event) => setGroupName(event.target.value)}
              >
                <option value="">All groups</option>
                {!!subgroups.length && (
                  <optgroup label="Subgroups">
                    {subgroups.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Individual groups">
                  {groupNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              Result status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="failed">Failed</option>
                <option value="passed">Passed</option>
                <option value="no-failures">
                  No failures (some tests not run)
                </option>
                <option value="incomplete">Incomplete</option>
                <option value="unknown">Unknown</option>
                <option value="empty">No matching tests</option>
              </select>
            </label>
            <label>
              Sort widgets
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="saved">Saved order</option>
                <option value="name-asc">Name: A to Z</option>
                <option value="name-desc">Name: Z to A</option>
                <option value="failed">Failed tests: most first</option>
                <option value="pass-asc">Pass rate: lowest first</option>
                <option value="pass-desc">Pass rate: highest first</option>
                <option value="tests">Total tests: most first</option>
                <option value="duration">Duration: longest first</option>
              </select>
            </label>
            <button
              className="button"
              onClick={resetDisplay}
              disabled={
                !query &&
                !activeGroupName &&
                status === "all" &&
                sort === "saved"
              }
            >
              Reset display
            </button>
          </div>
          <p className="widget-footnote" role="status">
            Showing {visible.length} of {groups.length} widgets
          </p>
          {!visible.length && (
            <div className="custom-widget-empty">
              <h3>No widgets match</h3>
              <p>Try another name, path, or result status.</p>
              <button className="button" onClick={resetDisplay}>
                Clear filters
              </button>
            </div>
          )}
          <div className="custom-widget-grid">
            {visible.map(({ group, stats, result }) => {
              return (
                <article
                  key={group.id}
                  className="dashboard-widget custom-group-widget"
                >
                  <div className="widget-heading">
                    <div>
                      <h3>{group.name}</h3>
                      {group.sharedBy && (
                        <p>Shared by {group.sharedBy} · View only</p>
                      )}
                      <p>
                        {stats.specs.length} matching specs ·{" "}
                        {group.paths.length} paths
                      </p>
                    </div>
                    {!!stats.counts.total && (
                      <Badge
                        status={result === "no-failures" ? "passed" : result}
                        label={
                          result === "no-failures" ? "No failures" : undefined
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
export function GroupSettingsLauncher({ onOpen }) {
  return (
    <section className="settings-card">
      <h2>Customized dashboard widgets</h2>
      <p>Manage your widgets and organization sharing.</p>
      <button type="button" className="button" onClick={onOpen}>
        Manage widget settings
      </button>
    </section>
  );
}
export function GroupSettingsModal({ onClose, ...props }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      labelledBy="custom-widget-settings-title"
      onClose={onClose}
      busy={busy}
      id="custom-widget-settings-dialog"
      className="custom-widget-settings-dialog"
    >
      <header className="custom-widget-settings-header">
        <div>
          <h2 id="custom-widget-settings-title">
            Customized dashboard widgets
          </h2>
          <p>Manage your groups and organization sharing.</p>
        </div>
        <button
          className="button"
          type="button"
          onClick={onClose}
          disabled={busy}
        >
          Close widget settings
        </button>
      </header>
      <div className="custom-widget-settings-body">
        <GroupWidgetEditor {...props} inModal onPending={setBusy} />
      </div>
    </Modal>
  );
}
export function GroupWidgetEditor({
  initialGroups,
  inModal = false,
  initialSharing = false,
  canShare = false,
  saveSharing,
  onPending,
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
  const [sharing, setSharing] = useState(initialSharing);
  useEffect(() => {
    onPending?.(pending);
  }, [pending, onPending]);
  async function toggleSharing(enabled) {
    if (pending || !ready) return;
    setPending(true);
    try {
      setSharing(await saveSharing(enabled));
      onSaved();
      onToast(
        enabled
          ? "Widgets shared with your organization."
          : "Widget sharing turned off.",
        "success",
      );
    } catch (reason) {
      setError(reason.message);
      onToast(reason.message, "error");
    } finally {
      setPending(false);
    }
  }
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
      {!inModal && (
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
      )}
      <p>
        Your widget names, paths, metrics, and order are saved to your own user
        preferences. Shared widgets are read-only for other organization
        members. Results use the report you are viewing.
      </p>
      {canShare && (
        <div className="custom-widget-sharing">
          <label>
            <input
              type="checkbox"
              role="switch"
              checked={sharing}
              onChange={(event) => toggleSharing(event.target.checked)}
              disabled={
                pending ||
                !ready ||
                !(
                  can("report-settings.create-custom-spec-group-widgets") ||
                  can("report-settings.edit-custom-widgets")
                )
              }
            />{" "}
            Share my widgets with this organization
          </label>
          <p>
            Members of your current organization can view your saved widgets.
            Only you can edit them. Report and project access stays the same.
            Turn this off to stop sharing.
          </p>
        </div>
      )}
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
