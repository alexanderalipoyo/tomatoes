/* User directory and account controls use server-enforced permissions. */
let usersRenderVersion = 0;
const usersFilters = {
  query: "",
  roles: new Set(),
  status: "active",
  sort: "name",
  ascending: true,
};
async function renderUsers(host) {
  const version = ++usersRenderVersion;
  host.innerHTML =
    '<article class="settings-card"><p role="status">Loading workspace users…</p></article>';
  try {
    const status = await teamRequest("/api/team/status");
    if (view !== "users" || version !== usersRenderVersion) return;
    teamState = status;
    const data = await teamRequest("/api/users");
    if (view !== "users" || version !== usersRenderVersion) return;
    host.innerHTML = `<section class="users-page" aria-label="Workspace users"><div class="users-tab-heading">Users <span id="users-total">${data.users.length}</span></div><p class="users-organization-context">Organization: <strong>${esc(data.organization?.name || "Current organization")}</strong></p>${data.localMode ? '<p class="users-mode-note">Local mode: accounts are stored on this server. Roles and project restrictions apply when sign-in is enabled in Settings → Sharing &amp; access.</p>' : ""}
      <div class="users-toolbar"><label class="users-search">${icon("search")}<input type="search" id="users-search" placeholder="Search users" aria-label="Search users" value="${esc(usersFilters.query)}"/></label><details class="users-role-filter"><summary>Roles <span id="users-role-count"></span></summary><div>${data.roles.map((role) => `<label><input type="checkbox" aria-label="${esc(role.name)}" value="${role.id}" ${usersFilters.roles.has(role.id) ? "checked" : ""}/>${esc(role.name)}</label>`).join("")}</div></details><select id="users-status" aria-label="Account status"><option value="active">Active accounts</option><option value="inactive">Deactivated accounts</option><option value="all">All accounts</option></select><button class="button primary" id="users-add">${icon("plus")}Add user</button></div>
      <div class="users-table-wrap"><table class="users-table"><thead><tr><th scope="col" id="users-name-heading"><button data-users-sort="name">User <span aria-hidden="true">↕</span></button></th><th scope="col">Provider</th><th scope="col" id="users-role-heading"><button data-users-sort="role">Role <span aria-hidden="true">↕</span></button></th><th scope="col">Project access</th><th scope="col">Actions</th></tr></thead><tbody id="users-rows"></tbody></table></div><p id="users-results" class="users-results" role="status"></p>
      <details class="users-permissions"><summary>Roles and permissions</summary><div>${data.roles.map((role) => `<article><h3>${esc(role.name)}</h3><p>${esc(role.description)}</p></article>`).join("")}</div><p>Deactivated accounts cannot sign in. Access changes apply to existing sessions immediately. Browser copies previously saved on a device remain on that device.</p></details></section>`;
    const draw = () => {
      const rows = data.users
        .filter(
          (user) =>
            `${user.fullName} ${user.email} ${user.username}`
              .toLowerCase()
              .includes(usersFilters.query.toLowerCase()) &&
            (!usersFilters.roles.size || usersFilters.roles.has(user.role)) &&
            (usersFilters.status === "all" ||
              user.disabled === (usersFilters.status === "inactive")),
        )
        .sort(
          (a, b) =>
            ((usersFilters.sort === "role"
              ? a.role.localeCompare(b.role)
              : a.fullName.localeCompare(b.fullName)) ||
              a.username.localeCompare(b.username)) *
            (usersFilters.ascending ? 1 : -1),
        );
      host.querySelector("#users-rows").innerHTML =
        rows
          .map(
            (user) =>
              `<tr><th scope="row"><div class="users-identity"><span class="users-avatar" aria-hidden="true">${esc(
                user.fullName
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => Array.from(part)[0])
                  .join("")
                  .toUpperCase(),
              )}</span><span><strong>${esc(user.fullName)}${user.username === data.currentUsername ? " <small>(you)</small>" : ""}</strong><small>${esc(user.email || user.username)}</small>${user.disabled ? '<span class="users-inactive">Deactivated</span>' : ""}</span></div></th><td>Local account</td><td><span class="users-role-badge">${esc(data.roles.find((role) => role.id === user.role)?.name || user.role)}</span></td><td>${user.projects.includes("*") ? "All projects" : user.projects.map((id) => `<span class="users-project-tag" title="${esc(id)}">${esc(data.projects.find((project) => project.id === id)?.name || id)}</span>`).join(" ")}</td><td><div class="users-row-actions"><button class="button" data-user-edit="${esc(user.username)}">Edit<span class="visually-hidden"> ${esc(user.fullName)}</span></button><button class="button ${user.disabled ? "" : "users-danger"}" data-user-status="${esc(user.username)}" ${user.username === data.currentUsername ? 'disabled title="You cannot deactivate your own account"' : ""}>${user.disabled ? "Restore" : "Deactivate"}<span class="visually-hidden"> ${esc(user.fullName)}</span></button></div></td></tr>`,
          )
          .join("") ||
        `<tr><td colspan="5" class="users-empty">${data.users.length ? "No users match these filters." : "No accounts yet. Add your first user to get started."}</td></tr>`;
      host.querySelector("#users-results").textContent =
        `${rows.length} of ${data.users.length} users shown`;
      host.querySelector("#users-role-count").textContent = usersFilters.roles
        .size
        ? `(${usersFilters.roles.size})`
        : "";
      for (const key of ["name", "role"])
        host
          .querySelector(`#users-${key}-heading`)
          .setAttribute(
            "aria-sort",
            usersFilters.sort === key
              ? usersFilters.ascending
                ? "ascending"
                : "descending"
              : "none",
          );
      host.querySelectorAll("[data-user-edit]").forEach((button) => {
        button.onclick = () =>
          openUserEditor(
            data,
            data.users.find(
              (user) => user.username === button.dataset.userEdit,
            ),
            host,
            button,
          );
      });
      host.querySelectorAll("[data-user-status]").forEach((button) => {
        button.onclick = () =>
          openUserStatus(
            data.users.find(
              (user) => user.username === button.dataset.userStatus,
            ),
            host,
            button,
          );
      });
    };
    host.querySelector("#users-status").value = usersFilters.status;
    host.querySelector("#users-search").oninput = (event) => {
      usersFilters.query = event.target.value;
      draw();
    };
    host.querySelector("#users-status").onchange = (event) => {
      usersFilters.status = event.target.value;
      draw();
    };
    host.querySelectorAll(".users-role-filter input").forEach((input) => {
      input.onchange = () => {
        input.checked
          ? usersFilters.roles.add(input.value)
          : usersFilters.roles.delete(input.value);
        draw();
      };
    });
    host.querySelectorAll("[data-users-sort]").forEach((button) => {
      button.onclick = () => {
        usersFilters.ascending =
          usersFilters.sort === button.dataset.usersSort
            ? !usersFilters.ascending
            : true;
        usersFilters.sort = button.dataset.usersSort;
        draw();
      };
    });
    host.querySelector("#users-add").onclick = (event) =>
      openUserEditor(data, null, host, event.currentTarget);
    draw();
  } catch (error) {
    if (view !== "users" || version !== usersRenderVersion) return;
    host.innerHTML = `<article class="settings-card"><h2>User management unavailable</h2><p role="alert">${esc(error.message)}</p><p>Sign in with an Admin account that has all-project access to manage users.</p><a class="button" href="#workspace-settings" data-users-login>Sharing &amp; access</a><button class="button" id="users-retry">Retry</button></article>`;
    host.querySelector("[data-users-login]").onclick = (event) => {
      event.preventDefault();
      const url = new URL(location.href);
      url.hash = "workspace-settings";
      url.searchParams.set("settingsTab", "sharing");
      history.pushState(null, "", url);
      navigate();
    };
    host.querySelector("#users-retry").onclick = () => renderUsers(host);
  }
}
let userDialog = null;
function showUserDialog(title, body, trigger) {
  if (!userDialog) {
    userDialog = document.createElement("dialog");
    userDialog.id = "user-editor";
    userDialog.setAttribute("aria-labelledby", "user-editor-title");
    document.body.append(userDialog);
    userDialog.addEventListener("cancel", (event) => {
      if (userDialog.getAttribute("aria-busy") === "true")
        event.preventDefault();
    });
    userDialog.addEventListener("click", (event) => {
      if (
        event.target !== userDialog ||
        userDialog.getAttribute("aria-busy") === "true"
      )
        return;
      const r = userDialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        userDialog.close();
    });
  }
  userDialog.innerHTML = `<header class="users-dialog-header"><h2 id="user-editor-title">${esc(title)}</h2><button class="icon-button" type="button" aria-label="Close user dialog">${icon("close")}</button></header>${body}`;
  userDialog.setAttribute("aria-busy", "false");
  userDialog.querySelector('[aria-label="Close user dialog"]').onclick = () =>
    userDialog.close();
  userDialog.onclose = () => {
    if (trigger?.isConnected) trigger.focus();
  };
  userDialog.showModal();
  return userDialog;
}
function openUserEditor(data, user, host, trigger) {
  requireAccess(user ? "users.edit-users" : "users.add-users");
  const self = user?.username === data.currentUsername;
  const dialog = showUserDialog(
    user ? "Edit user" : "Add user",
    `<form class="users-editor-form"><label>Full name<input name="fullName" value="${esc(user?.fullName || "")}" maxlength="160" required autocomplete="name"/></label><label>Email <small>Optional; no invitation email is sent.</small><input name="email" type="email" value="${esc(user?.email || "")}" maxlength="254" autocomplete="off"/></label><label>Username<input name="username" value="${esc(user?.username || "")}" ${user ? "readonly" : 'pattern="[a-z0-9][a-z0-9_.-]{0,63}"'} maxlength="64" required autocomplete="off"/></label>${user ? "" : '<label>Initial password <small>12–256 characters. Share securely with the user.</small><input name="password" type="password" minlength="12" maxlength="256" required autocomplete="new-password"/></label>'}<label>Role<select name="role" ${self ? "disabled" : ""}>${data.roles.map((role) => `<option value="${role.id}" ${(user?.role || "viewer") === role.id ? "selected" : ""}>${esc(role.name)}</option>`).join("")}</select></label><div class="users-organization-field"><span>Organization</span><strong>${esc(data.organization?.name || "Current organization")}</strong><small>This account belongs to the current organization.</small></div><div id="user-project-access"></div>${self ? '<p class="users-mode-note">Another administrator must change your role or project access.</p>' : ""}<p class="users-form-error" role="alert"></p><footer><button class="button" type="button" data-user-cancel>Cancel</button><button class="button primary" type="submit">${user ? "Save changes" : "Create user"}</button></footer></form>`,
    trigger,
  );
  globalThis.TomatoesReact.renderProjectAccess({
    projects: data.projects || [],
    selected:
      user?.projects ||
      ((data.projects || []).some((item) => item.id === currentWorkspaceProject)
        ? [currentWorkspaceProject]
        : []),
    readOnly: self,
  });
  const form = dialog.querySelector("form");
  form.querySelector("[data-user-cancel]").onclick = () => dialog.close();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const fields = new FormData(form);
    const body = {
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
      form.querySelector('[role="alert"]').textContent =
        "Select at least one project, or choose All projects.";
      return;
    }
    await runUserMutation(dialog, form, async () => {
      await teamRequest(
        user ? `/api/users/${encodeURIComponent(user.username)}` : "/api/users",
        { method: user ? "PUT" : "POST", body: JSON.stringify(body) },
      );
      form.reset();
      dialog.close();
      showToast(
        user ? "User updated." : "User created. No invitation email was sent.",
        "success",
      );
      if (view === "users" && host.isConnected) await renderUsers(host);
    });
  };
}
function openUserStatus(user, host, trigger) {
  requireAccess(
    user.disabled ? "users.restore-users" : "users.deactivate-users",
  );
  const dialog = showUserDialog(
    user.disabled ? "Restore user" : "Deactivate user",
    `<form class="users-editor-form"><p>${user.disabled ? "Restore sign-in and the saved permissions for" : "Revoke sign-in and end active sessions for"} <strong>${esc(user.fullName)}</strong>?</p><p>${user.disabled ? "You can edit the account’s role and project access before restoring it." : "Reports and account details are retained. You can restore this account later."}</p><p class="users-form-error" role="alert"></p><footer><button class="button" type="button" data-user-cancel>Cancel</button><button class="button primary" type="submit">${user.disabled ? "Restore user" : "Deactivate user"}</button></footer></form>`,
    trigger,
  );
  const form = dialog.querySelector("form");
  form.querySelector("[data-user-cancel]").onclick = () => dialog.close();
  form.onsubmit = async (event) => {
    event.preventDefault();
    await runUserMutation(dialog, form, async () => {
      await teamRequest(`/api/users/${encodeURIComponent(user.username)}`, {
        method: user.disabled ? "PUT" : "DELETE",
        ...(user.disabled
          ? { body: JSON.stringify({ ...user, disabled: false }) }
          : {}),
      });
      dialog.close();
      showToast(
        user.disabled ? "User restored." : "User deactivated.",
        "success",
      );
      if (view === "users" && host.isConnected) await renderUsers(host);
    });
  };
}
async function runUserMutation(dialog, form, action) {
  if (dialog.getAttribute("aria-busy") === "true") return;
  dialog.setAttribute("aria-busy", "true");
  form.inert = true;
  const close = dialog.querySelector('[aria-label="Close user dialog"]');
  close.disabled = true;
  const submit = form.querySelector('[type="submit"]');
  const text = submit.textContent;
  submit.textContent = "Saving…";
  try {
    await action();
  } catch (error) {
    form.querySelector('[role="alert"]').textContent = error.message;
    showToast(error.message, "error");
  } finally {
    dialog.setAttribute("aria-busy", "false");
    form.inert = false;
    close.disabled = false;
    submit.textContent = text;
  }
}
window.addEventListener("hashchange", () => {
  if (userDialog?.open && userDialog.getAttribute("aria-busy") !== "true")
    userDialog.close();
});
