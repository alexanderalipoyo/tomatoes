/* Organization-owned policy, with optimistic concurrency to avoid lost changes. */
async function renderRoleAccess(host) {
  host.innerHTML =
    '<article class="settings-card"><p role="status">Loading role permissions...</p></article>';
  try {
    const data = await teamRequest("/api/role-access");
    if (view !== "role-access") return;
    let draft = structuredClone(data.permissions),
      dirty = false;
    const pages = [...new Set(data.features.map((feature) => feature.tab))];
    host.innerHTML = `<section class="settings-card role-access-page"><h2>Role access</h2><p>Set access for <strong>${esc(data.organization.name)}</strong>. Checked means allowed (1); unchecked means denied (0). Changes apply to every user with that role in this organization.</p><details class="role-access-help"><summary>How permissions work</summary><p class="notice">Admin access is protected against lockout. Organization ownership, assigned-project scope, and account security remain enforced. Filtering and paging in Sharing &amp; access require permission to browse shared reports; the parent restriction takes priority.</p><p class="widget-footnote">Report viewers receive report data in their browser. Hiding an export action cannot prevent copying data they are authorized to view. Browser backups already downloaded cannot be recalled.</p></details><form id="role-access-form"><div class="role-access-filters"><label for="role-access-page">Page<select id="role-access-page"><option value="">All pages</option>${pages.map((page) => `<option value="${esc(page)}">${esc(page)}</option>`).join("")}</select></label><label for="role-access-search">Find a feature<input type="search" id="role-access-search" placeholder="Search pages or features"/></label><label for="role-access-kind">Show<select id="role-access-kind"><option value="all">All features</option><option value="editable">Editable features</option><option value="protected">Protected features</option><option value="changed">Unsaved changes</option></select></label><button class="button" type="button" id="role-access-clear">Clear filters</button></div><div class="role-access-results"><p id="role-access-count" role="status" aria-live="polite"></p><span id="role-access-changes"></span></div><div class="settings-buttons role-access-actions"><button class="button primary" type="submit" id="role-access-save" disabled>Save permissions</button><button class="button" type="button" id="role-access-defaults">Restore matrix defaults</button><button class="button" type="button" id="role-access-reload">Reload saved</button></div><p id="role-access-feedback" role="status" aria-live="polite"></p><div class="users-table-wrap"><table class="users-table role-access-table"><thead><tr><th scope="col">Page / Feature</th><th scope="col">Admin</th><th scope="col">Editor</th><th scope="col">Viewer</th></tr></thead><tbody id="role-access-rows"></tbody></table></div></form></section>`;
    const rows = host.querySelector("#role-access-rows"),
      feedback = host.querySelector("#role-access-feedback"),
      save = host.querySelector("#role-access-save");
    const changed = (feature) =>
      ["editor", "viewer"].some(
        (role) =>
          draft[role][feature.id] !== data.permissions[role][feature.id],
      );
    function updateChanges() {
      const count = data.features.filter(changed).length;
      dirty = count > 0;
      save.disabled = !dirty;
      host.querySelector("#role-access-changes").textContent = count
        ? `${count} unsaved ${count === 1 ? "change" : "changes"}`
        : "All changes saved";
    }
    function draw() {
      const terms = host
        .querySelector("#role-access-search")
        .value.toLowerCase()
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const page = host.querySelector("#role-access-page").value;
      const kind = host.querySelector("#role-access-kind").value;
      const filtered = data.features.filter((feature) => {
        const protectedFeature = feature.locked || feature.adminOnly;
        return (
          (!page || feature.tab === page) &&
          terms.every((term) =>
            (feature.tab + " " + feature.name).toLowerCase().includes(term),
          ) &&
          (kind === "all" ||
            (kind === "editable" && !protectedFeature) ||
            (kind === "protected" && protectedFeature) ||
            (kind === "changed" && changed(feature)))
        );
      });
      let group = "";
      rows.innerHTML =
        filtered
          .map((feature) => {
            let heading = "";
            if (group !== feature.tab) {
              group = feature.tab;
              heading = `<tr class="role-access-group"><th colspan="4" scope="colgroup">${esc(group)} <span>${filtered.filter((item) => item.tab === group).length} features</span></th></tr>`;
            }
            return (
              heading +
              `<tr class="${changed(feature) ? "role-access-changed" : ""}"><th scope="row">${esc(feature.name)}${feature.adminOnly ? ' <small class="role-access-badge">Admin only</small>' : feature.locked ? ' <small class="role-access-badge">Protected</small>' : ""}</th>${["admin", "editor", "viewer"].map((role) => `<td><input type="checkbox" data-role="${role}" data-permission="${feature.id}" aria-label="${esc(role + ": " + feature.tab + " - " + feature.name)}" ${role === "admin" || draft[role][feature.id] ? "checked" : ""} ${role === "admin" || feature.locked || feature.adminOnly ? "disabled" : ""}/></td>`).join("")}</tr>`
            );
          })
          .join("") ||
        '<tr><td colspan="4" class="role-access-empty"><strong>No matching features</strong><p>Try a different page, search term, or feature filter.</p></td></tr>';
      host.querySelector("#role-access-count").textContent =
        `${filtered.length} of ${data.features.length} features shown`;
      updateChanges();
    }
    rows.onchange = (event) => {
      const { role, permission } = event.target.dataset;
      if (!draft[role] || !permission) return;
      draft[role][permission] = event.target.checked;
      updateChanges();
      event.target
        .closest("tr")
        .classList.toggle(
          "role-access-changed",
          changed(data.features.find((feature) => feature.id === permission)),
        );
      feedback.textContent = dirty
        ? "Unsaved permission changes."
        : "All changes match your saved permissions.";
      if (host.querySelector("#role-access-kind").value === "changed") draw();
    };
    host.querySelector("#role-access-search").oninput = draw;
    host.querySelector("#role-access-search").onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        draw();
      }
    };
    host.querySelector("#role-access-page").onchange = draw;
    host.querySelector("#role-access-kind").onchange = draw;
    host.querySelector("#role-access-clear").onclick = () => {
      host.querySelector("#role-access-search").value = "";
      host.querySelector("#role-access-page").value = "";
      host.querySelector("#role-access-kind").value = "all";
      draw();
    };
    host.querySelector("#role-access-defaults").onclick = () => {
      draft = {
        editor: AccessPolicy.configured({}, "editor"),
        viewer: AccessPolicy.configured({}, "viewer"),
      };
      dirty = true;
      save.disabled = false;
      draw();
      feedback.textContent =
        "Matrix defaults restored in this form. Save to apply.";
    };
    host.querySelector("#role-access-reload").onclick = () => {
      if (!dirty || confirm("Discard unsaved permission changes and reload?"))
        renderRoleAccess(host);
    };
    host.querySelector("#role-access-form").onsubmit = async (event) => {
      event.preventDefault();
      save.disabled = true;
      event.currentTarget?.setAttribute("aria-busy", "true");
      const form = host.querySelector("#role-access-form");
      form.inert = true;
      try {
        const saved = await teamRequest("/api/role-access", {
          method: "PUT",
          body: JSON.stringify({ permissions: draft, revision: data.revision }),
        });
        data.revision = saved.revision;
        data.permissions = structuredClone(draft);
        draw();
        feedback.textContent = "Permissions saved.";
        await initializeAuth();
        applyFeatureAccess();
        showToast("Role permissions saved successfully.", "success");
      } catch (error) {
        feedback.textContent = error.message;
        showToast(error.message, "error");
        save.disabled = false;
      } finally {
        form.inert = false;
        form.removeAttribute("aria-busy");
      }
    };
    draw();
  } catch (error) {
    host.innerHTML = `<article class="settings-card"><h2>Role access unavailable</h2><p role="alert">${esc(error.message)}</p></article>`;
  }
}
