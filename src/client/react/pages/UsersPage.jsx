import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { ProjectAccessPicker } from "../components/ProjectAccessPicker";
export function UsersPage({ request, can, onToast, currentProject, onStatus }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [query, setQuery] = useState(""),
    [roles, setRoles] = useState([]),
    [status, setStatus] = useState("active"),
    [sort, setSort] = useState({ key: "name", ascending: true }),
    [editing, setEditing] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const trigger = useRef(null);
  useEffect(() => {
    let active = true;
    setError("");
    request("/api/team/status")
      .then((value) => {
        if (!active) return null;
        onStatus(value);
        setCanManage(!value.enabled || value.canManageRoleAccess === true);
        return request("/api/users");
      })
      .then((value) => {
        if (active && value) setData(value);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, [request, reload, onStatus]);
  const rows = useMemo(
    () =>
      data?.users
        .filter(
          (user) =>
            `${user.fullName} ${user.email} ${user.username}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (!roles.length || roles.includes(user.role)) &&
            (status === "all" || user.disabled === (status === "inactive")),
        )
        .sort(
          (a, b) =>
            ((sort.key === "role"
              ? a.role.localeCompare(b.role)
              : a.fullName.localeCompare(b.fullName)) ||
              a.username.localeCompare(b.username)) * (sort.ascending ? 1 : -1),
        ) || [],
    [data, query, roles, status, sort],
  );
  function open(kind, user, event) {
    trigger.current = event.currentTarget;
    setEditing({ kind, user });
  }
  function close() {
    setEditing(null);
    trigger.current?.focus();
  }
  if (error)
    return (
      <article className="settings-card">
        <h2>User management unavailable</h2>
        <p role="alert">{error}</p>
        <button
          className="button"
          onClick={() => setReload((value) => value + 1)}
        >
          Retry
        </button>
      </article>
    );
  if (!data)
    return (
      <article className="settings-card">
        <p role="status">Loading workspace users.</p>
      </article>
    );
  return (
    <section className="users-page" aria-label="Workspace users">
      <div className="users-tab-heading">
        Users <span id="users-total">{data.users.length}</span>
      </div>
      <p className="users-organization-context">
        Organization:{" "}
        <strong>{data.organization?.name || "Current organization"}</strong>
      </p>
      {data.localMode && (
        <p className="users-mode-note">
          Local mode: accounts are stored on this server. Roles and project
          restrictions apply when sign-in is enabled in Settings / Sharing &amp;
          access.
        </p>
      )}
      <div className="users-toolbar">
        <label className="users-search">
          <Icon name="search" />
          <input
            type="search"
            id="users-search"
            placeholder="Search users"
            aria-label="Search users"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <details className="users-role-filter">
          <summary>
            Roles{" "}
            <span id="users-role-count">
              {roles.length ? `(${roles.length})` : ""}
            </span>
          </summary>
          <div>
            {data.roles.map((role) => (
              <label key={role.id}>
                <input
                  type="checkbox"
                  aria-label={role.name}
                  checked={roles.includes(role.id)}
                  onChange={(event) =>
                    setRoles((previous) =>
                      event.target.checked
                        ? [...previous, role.id]
                        : previous.filter((id) => id !== role.id),
                    )
                  }
                />
                {role.name}
              </label>
            ))}
          </div>
        </details>
        <select
          id="users-status"
          aria-label="Account status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="active">Active accounts</option>
          <option value="inactive">Deactivated accounts</option>
          <option value="all">All accounts</option>
        </select>
        {canManage && can("users.add-users") && (
          <button
            className="button primary"
            id="users-add"
            onClick={(event) => open("edit", null, event)}
          >
            <Icon name="plus" />
            Add user
          </button>
        )}
      </div>
      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              {["User", "Provider", "Role", "Project access", "Actions"].map(
                (label, index) => {
                  const key =
                    index === 0 ? "name" : index === 2 ? "role" : null;
                  return (
                    <th
                      key={label}
                      scope="col"
                      aria-sort={
                        key
                          ? sort.key === key
                            ? sort.ascending
                              ? "ascending"
                              : "descending"
                            : "none"
                          : undefined
                      }
                    >
                      {key ? (
                        <button
                          data-users-sort={key}
                          onClick={() =>
                            setSort((previous) => ({
                              key,
                              ascending:
                                previous.key === key
                                  ? !previous.ascending
                                  : true,
                            }))
                          }
                        >
                          {label} <span aria-hidden="true">↕</span>
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  );
                },
              )}
            </tr>
          </thead>
          <tbody id="users-rows">
            {rows.map((user) => (
              <tr key={user.username}>
                <th scope="row">
                  <div className="users-identity">
                    <span className="users-avatar" aria-hidden="true">
                      {user.fullName
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => Array.from(part)[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span>
                      <strong>
                        {user.fullName}
                        {user.username === data.currentUsername && (
                          <small> (you)</small>
                        )}
                      </strong>
                      <small>{user.email || user.username}</small>
                      {user.disabled && (
                        <span className="users-inactive">Deactivated</span>
                      )}
                    </span>
                  </div>
                </th>
                <td>Local account</td>
                <td>
                  <span className="users-role-badge">
                    {data.roles.find((role) => role.id === user.role)?.name ||
                      user.role}
                  </span>
                </td>
                <td>
                  {user.projects.includes("*")
                    ? "All projects"
                    : user.projects.map((id) => (
                        <span key={id} className="users-project-tag" title={id}>
                          {data.projects.find((project) => project.id === id)
                            ?.name || id}
                        </span>
                      ))}
                </td>
                <td>
                  <div className="users-row-actions">
                    {canManage && can("users.edit-users") && (
                      <button
                        className="button"
                        data-user-edit={user.username}
                        onClick={(event) => open("edit", user, event)}
                      >
                        Edit
                        <span className="visually-hidden">
                          {" "}
                          {user.fullName}
                        </span>
                      </button>
                    )}
                    {canManage &&
                      can(
                        user.disabled
                          ? "users.restore-users"
                          : "users.deactivate-users",
                      ) && (
                        <button
                          className={`button ${user.disabled ? "" : "users-danger"}`}
                          data-user-status={user.username}
                          disabled={user.username === data.currentUsername}
                          title={
                            user.username === data.currentUsername
                              ? "You cannot deactivate your own account"
                              : undefined
                          }
                          onClick={(event) => open("status", user, event)}
                        >
                          {user.disabled ? "Restore" : "Deactivate"}
                          <span className="visually-hidden">
                            {" "}
                            {user.fullName}
                          </span>
                        </button>
                      )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan="5" className="users-empty">
                  {data.users.length
                    ? "No users match these filters."
                    : "No accounts yet. Add your first user to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p id="users-results" className="users-results" role="status">
        {rows.length} of {data.users.length} users shown
      </p>
      <details className="users-permissions">
        <summary>Roles and permissions</summary>
        <div>
          {data.roles.map((role) => (
            <article key={role.id}>
              <h3>{role.name}</h3>
              <p>{role.description}</p>
            </article>
          ))}
        </div>
        <p>
          Deactivated accounts cannot sign in. Access changes apply to existing
          sessions immediately. Browser copies previously saved on a device
          remain on that device.
        </p>
      </details>
      {editing && (
        <UserDialog
          key={`${editing.kind}:${editing.user?.username || "new"}`}
          {...editing}
          data={data}
          currentProject={currentProject}
          request={request}
          onToast={onToast}
          onClose={close}
          onSaved={() => {
            close();
            setReload((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}
function UserDialog({
  kind,
  user,
  data,
  currentProject,
  request,
  onToast,
  onClose,
  onSaved,
}) {
  const ref = useRef(null),
    busy = useRef(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const self = user?.username === data.currentUsername,
    title =
      kind === "status"
        ? user.disabled
          ? "Restore user"
          : "Deactivate user"
        : user
          ? "Edit user"
          : "Add user";
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget,
      fields = new FormData(form);
    let route = "/api/users",
      method = "POST",
      body;
    if (kind === "status") {
      route += "/" + encodeURIComponent(user.username);
      method = user.disabled ? "PUT" : "DELETE";
      if (user.disabled) body = { ...user, disabled: false };
    } else {
      body = {
        username: fields.get("username"),
        fullName: fields.get("fullName"),
        email: fields.get("email").trim(),
        role: self ? user.role : fields.get("role"),
        organizationId: data.organization.id,
        projects: self ? user.projects : fields.getAll("projects"),
        disabled: user?.disabled || false,
        ...(!user ? { password: fields.get("password") } : {}),
      };
      if (!body.projects.length) {
        setError("Select at least one project, or choose All projects.");
        return;
      }
      if (user) {
        route += "/" + encodeURIComponent(user.username);
        method = "PUT";
      }
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await request(route, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      form.reset();
      onToast(
        kind === "status"
          ? user.disabled
            ? "User restored."
            : "User deactivated."
          : user
            ? "User updated."
            : "User created. No invitation email was sent.",
        "success",
      );
      onSaved();
    } catch (reason) {
      setError(reason.message);
      onToast(reason.message, "error");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <dialog
      id="user-editor"
      ref={ref}
      aria-labelledby="user-editor-title"
      aria-busy={pending}
      onCancel={(event) => {
        if (pending) event.preventDefault();
        else onClose();
      }}
    >
      <header className="users-dialog-header">
        <h2 id="user-editor-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close user dialog"
          disabled={pending}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <form className="users-editor-form" onSubmit={submit} inert={pending}>
        {kind === "status" ? (
          <>
            <p>
              {user.disabled
                ? "Restore sign-in and the saved permissions for"
                : "Revoke sign-in and end active sessions for"}{" "}
              <strong>{user.fullName}</strong>?
            </p>
            <p>
              {user.disabled
                ? "You can edit the account's role and project access before restoring it."
                : "Reports and account details are retained. You can restore this account later."}
            </p>
          </>
        ) : (
          <>
            <label>
              Full name
              <input
                name="fullName"
                defaultValue={user?.fullName || ""}
                maxLength="160"
                required
                autoComplete="name"
              />
            </label>
            <label>
              Email <small>Optional; no invitation email is sent.</small>
              <input
                name="email"
                type="email"
                defaultValue={user?.email || ""}
                maxLength="254"
                autoComplete="off"
              />
            </label>
            <label>
              Username
              <input
                name="username"
                defaultValue={user?.username || ""}
                readOnly={!!user}
                pattern="[a-z0-9][a-z0-9_.-]{0,63}"
                maxLength="64"
                required
                autoComplete="off"
              />
            </label>
            {!user && (
              <label>
                Initial password{" "}
                <small>12-256 characters. Share securely with the user.</small>
                <input
                  name="password"
                  type="password"
                  minLength="12"
                  maxLength="256"
                  required
                  autoComplete="new-password"
                />
              </label>
            )}
            <label>
              Role
              <select
                name="role"
                disabled={self}
                defaultValue={user?.role || "viewer"}
              >
                {data.roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="users-organization-field">
              <span>Organization</span>
              <strong>
                {data.organization?.name || "Current organization"}
              </strong>
              <small>This account belongs to the current organization.</small>
            </div>
            <ProjectAccessPicker
              projects={data.projects || []}
              selected={
                user?.projects ||
                (data.projects.some((item) => item.id === currentProject)
                  ? [currentProject]
                  : [])
              }
              readOnly={self}
            />
            {self && (
              <p className="users-mode-note">
                Another administrator must change your role or project access.
              </p>
            )}
          </>
        )}
        <p className="users-form-error" role="alert">
          {error}
        </p>
        <footer>
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={pending}>
            {pending
              ? "Saving..."
              : kind === "status"
                ? title
                : user
                  ? "Save changes"
                  : "Create user"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
