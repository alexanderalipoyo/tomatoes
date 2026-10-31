import { useEffect, useMemo, useRef, useState } from "react";
import Policy from "../../../shared/access-policy";
export function RoleAccessPage({
  request,
  onRefresh,
  onToast,
  confirmDiscard = (message) => confirm(message),
}) {
  const [data, setData] = useState(null),
    [draft, setDraft] = useState(null),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [pending, setPending] = useState(false),
    [page, setPage] = useState(""),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("all"),
    [reload, setReload] = useState(0);
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    request("/api/role-access")
      .then((value) => {
        if (active) {
          setData(value);
          setDraft(structuredClone(value.permissions));
          setFeedback("");
        }
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [request, reload]);
  const changed = (feature) =>
    ["editor", "viewer"].some(
      (role) =>
        draft?.[role][feature.id] !== data?.permissions[role][feature.id],
    );
  const changes = data?.features.filter(changed).length || 0;
  const pages = useMemo(
    () => [...new Set(data?.features.map((feature) => feature.tab) || [])],
    [data],
  );
  const filtered = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (data?.features || []).filter(
      (feature) =>
        (!page || feature.tab === page) &&
        terms.every((term) =>
          (feature.tab + " " + feature.name).toLowerCase().includes(term),
        ) &&
        (kind === "all" ||
          (kind === "editable" && !feature.locked && !feature.adminOnly) ||
          (kind === "protected" && (feature.locked || feature.adminOnly)) ||
          (kind === "changed" && changed(feature))),
    );
  }, [data, draft, page, query, kind]);
  async function save(event) {
    event.preventDefault();
    if (saving.current || !changes) return;
    saving.current = true;
    setPending(true);
    setError("");
    try {
      const snapshot = structuredClone(draft);
      const result = await request("/api/role-access", {
        method: "PUT",
        body: JSON.stringify({
          permissions: snapshot,
          revision: data.revision,
        }),
      });
      setData((previous) => ({
        ...previous,
        permissions: snapshot,
        revision: result.revision,
      }));
      setFeedback("Permissions saved.");
      await onRefresh();
      onToast("Role permissions saved successfully.", "success");
    } catch (reason) {
      setError(reason.message);
      onToast(reason.message, "error");
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  if (!data)
    return (
      <article className="settings-card">
        <h2>Role access</h2>
        <p role={error ? "alert" : "status"}>
          {error || "Loading role permissions..."}
        </p>
        {error && (
          <button
            className="button"
            onClick={() => setReload((value) => value + 1)}
          >
            Retry
          </button>
        )}
      </article>
    );
  return (
    <section className="settings-card role-access-page">
      <h2>Role access</h2>
      <p>
        Set access for <strong>{data.organization.name}</strong>. Checked means
        allowed (1); unchecked means denied (0). Changes apply to every user
        with that role in this organization.
      </p>
      <details className="role-access-help">
        <summary>How permissions work</summary>
        <p className="notice">
          Admin access is protected against lockout. Organization ownership,
          assigned-project scope, and account security remain enforced.
          Filtering and paging in Sharing &amp; access require permission to
          browse shared reports; the parent restriction takes priority.
        </p>
        <p className="widget-footnote">
          Report viewers receive report data in their browser. Hiding an export
          action cannot prevent copying data they are authorized to view.
          Browser backups already downloaded cannot be recalled.
        </p>
      </details>
      <form
        id="role-access-form"
        onSubmit={save}
        aria-busy={pending}
        inert={pending}
      >
        <div className="role-access-filters">
          <label>
            Page
            <select
              id="role-access-page"
              value={page}
              onChange={(event) => setPage(event.target.value)}
            >
              <option value="">All pages</option>
              {pages.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            Find a feature
            <input
              id="role-access-search"
              type="search"
              placeholder="Search pages or features"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            />
          </label>
          <label>
            Show
            <select
              id="role-access-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="all">All features</option>
              <option value="editable">Editable features</option>
              <option value="protected">Protected features</option>
              <option value="changed">Unsaved changes</option>
            </select>
          </label>
          <button
            className="button"
            type="button"
            id="role-access-clear"
            onClick={() => {
              setPage("");
              setQuery("");
              setKind("all");
            }}
          >
            Clear filters
          </button>
        </div>
        <div className="role-access-results">
          <p id="role-access-count" role="status" aria-live="polite">
            {filtered.length} of {data.features.length} features shown
          </p>
          <span id="role-access-changes">
            {changes
              ? `${changes} unsaved ${changes === 1 ? "change" : "changes"}`
              : "All changes saved"}
          </span>
        </div>
        <div className="settings-buttons role-access-actions">
          <button
            className="button primary"
            id="role-access-save"
            disabled={pending || !changes}
          >
            {pending ? "Saving..." : "Save permissions"}
          </button>
          <button
            className="button"
            type="button"
            id="role-access-defaults"
            onClick={() => {
              setDraft({
                editor: Policy.configured({}, "editor"),
                viewer: Policy.configured({}, "viewer"),
              });
              setFeedback(
                "Matrix defaults restored in this form. Save to apply.",
              );
            }}
          >
            Restore matrix defaults
          </button>
          <button
            className="button"
            type="button"
            id="role-access-reload"
            onClick={() => {
              if (
                !changes ||
                confirmDiscard("Discard unsaved permission changes and reload?")
              )
                setReload((value) => value + 1);
            }}
          >
            Reload saved
          </button>
        </div>
        <p id="role-access-feedback" role={error ? "alert" : "status"}>
          {error || feedback}
        </p>
        <div className="users-table-wrap">
          <table className="users-table role-access-table">
            <thead>
              <tr>
                <th scope="col">Page / Feature</th>
                {["Admin", "Editor", "Viewer"].map((role) => (
                  <th scope="col" key={role}>
                    {role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody id="role-access-rows">
              {pages.map((name) => {
                const features = filtered.filter(
                  (feature) => feature.tab === name,
                );
                return features.length ? (
                  <RoleGroup
                    key={name}
                    name={name}
                    features={features}
                    draft={draft}
                    changed={changed}
                    onChange={(role, id, checked) => {
                      setDraft((previous) => ({
                        ...previous,
                        [role]: { ...previous[role], [id]: checked },
                      }));
                      setFeedback("Unsaved permission changes.");
                    }}
                  />
                ) : null;
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan="4" className="role-access-empty">
                    <strong>No matching features</strong>
                    <p>Try a different page, search term, or feature filter.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </form>
    </section>
  );
}
function RoleGroup({ name, features, draft, changed, onChange }) {
  return (
    <>
      <tr className="role-access-group">
        <th colSpan="4" scope="colgroup">
          {name} <span>{features.length} features</span>
        </th>
      </tr>
      {features.map((feature) => (
        <tr
          key={feature.id}
          className={changed(feature) ? "role-access-changed" : ""}
        >
          <th scope="row">
            {feature.name}
            {(feature.adminOnly || feature.locked) && (
              <small className="role-access-badge">
                {feature.adminOnly ? "Admin only" : "Protected"}
              </small>
            )}
          </th>
          {["admin", "editor", "viewer"].map((role) => (
            <td key={role}>
              <input
                type="checkbox"
                data-role={role}
                data-permission={feature.id}
                aria-label={`${role}: ${feature.tab} - ${feature.name}`}
                checked={role === "admin" || draft[role][feature.id]}
                disabled={
                  role === "admin" || feature.locked || feature.adminOnly
                }
                onChange={(event) =>
                  onChange(role, feature.id, event.target.checked)
                }
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
