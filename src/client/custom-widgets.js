/* Saved widget definitions are server user preferences; results are derived from the active report. */
function readCustomWidgets() {
  const state = userPreferences.getState();
  return { groups: state.preferences.dashboardGroups, error: state.error };
}
async function saveCustomWidgets(groups) {
  const state = await userPreferences.save({
    dashboardGroups: DashboardGroups.validateGroups(groups),
  });
  return state.preferences.dashboardGroups;
}
function customGroupMetrics(stats, metrics) {
  const c = stats.counts;
  return `<dl class="custom-group-metrics">${metrics.includes("passRate") ? `<div><dt>Pass rate</dt><dd>${stats.passRate == null ? "—" : stats.passRate.toFixed(1) + "%"}</dd></div>` : ""}<div><dt>Total tests</dt><dd>${number(c.total)}</dd></div>${metrics.includes("outcomes") ? ["passed", "failed", "pending", "skipped", ...(c.unknown ? ["unknown"] : [])].map((status) => `<div class="group-${status}"><dt>${status[0].toUpperCase() + status.slice(1)}</dt><dd>${number(c[status])}</dd></div>`).join("") : ""}${metrics.includes("duration") ? `<div><dt>Cumulative test time</dt><dd>${duration(stats.duration)}</dd></div>` : ""}</dl>`;
}
function renderCustomizedDashboard() {
  const host = $("#custom-dashboard-content");
  const { groups, error } = readCustomWidgets();
  $("#custom-dashboard-source").textContent =
    `Based on ${sourceName}. Groups may overlap; each widget counts a matching spec once.`;
  host.innerHTML = error
    ? `<p class="notice" role="status">${esc(error)}</p>`
    : groups.length
      ? `<div class="custom-widget-grid">${groups
          .map((group) => {
            const stats = DashboardGroups.groupStats(report, group);
            return `<article class="dashboard-widget custom-group-widget"><div class="widget-heading"><div><h3>${esc(group.name)}</h3><p>${stats.specs.length} matching specs · ${group.paths.length} path${group.paths.length === 1 ? "" : "s"}</p></div>${stats.counts.failed ? badge("failed") : stats.counts.total ? badge(stats.counts.unknown ? "unknown" : stats.counts.passed ? "passed" : "incomplete") : ""}</div>${customGroupMetrics(stats, group.metrics)}${!stats.specs.length ? '<p class="widget-empty">No specs match this group in the selected report.</p>' : ""}${stats.unmatchedPaths.length && stats.specs.length ? `<p class="widget-footnote">${stats.unmatchedPaths.length} configured path(s) have no matches in this report.</p>` : ""}<details class="custom-widget-paths"><summary>Grouped paths</summary><ul>${group.paths.map((path) => `<li>${esc(path)}</li>`).join("")}</ul></details><button class="button" data-open-custom-group="${esc(group.id)}" ${stats.specs.length ? "" : "disabled"}>View group results</button></article>`;
          })
          .join(
            "",
          )}</div><p class="widget-footnote">Pass rate uses all registered tests, including pending and skipped. Cumulative time sums recorded test durations.</p>`
      : '<div class="custom-widget-empty"><h3>Your groups, your dashboard</h3><p>Group specs by folder or file path and choose the metrics you want to see.</p><a class="button" href="#settings">Create a group widget</a></div>';
  host.querySelectorAll("[data-open-custom-group]").forEach((button) => {
    button.onclick = () => {
      const group = groups.find(
        (item) => item.id === button.dataset.openCustomGroup,
      );
      const stats = DashboardGroups.groupStats(report, group);
      $("#detail-content").innerHTML =
        `<div class="dialog-heading"><h2 id="detail-title">${esc(group.name)}</h2><p>${esc(sourceName)} · ${stats.specs.length} matching specs</p></div>${customGroupMetrics(stats, group.metrics)}<div class="custom-group-specs">${stats.specs.map((spec) => `<button class="analysis-row" data-custom-spec="${spec.id}"><span>${esc(spec.file)}<small>${number(spec.counts.total)} tests · ${number(spec.counts.failed)} failed</small></span>${badge(spec.status)}</button>`).join("")}</div>`;
      $("#detail-content")
        .querySelectorAll("[data-custom-spec]")
        .forEach(
          (item) =>
            (item.onclick = () => {
              $("#detail").close();
              openTests(item.dataset.customSpec, "all");
            }),
        );
      $("#detail").showModal();
    };
  });
}
function renderCustomWidgetSettings(alt) {
  const stored = readCustomWidgets();
  let groups = stored.groups;
  let editingId = null;
  const paths = DashboardGroups.pathOptions(report);
  alt.insertAdjacentHTML(
    "beforeend",
    `<section class="settings-card custom-widget-settings" aria-labelledby="custom-widget-settings-title"><div class="widget-heading"><div><h2 id="custom-widget-settings-title">Customized dashboard widgets</h2><p>Create named spec groups for your Latest run dashboard.</p></div><a class="widget-link" href="#runs">View dashboard →</a></div><p>Settings are saved to your server profile and reused for future imports. Results always use the report you are viewing.</p>${stored.error ? `<p class="notice">${esc(stored.error)}</p>` : ""}<div class="custom-widget-editor"><form id="custom-widget-form"><h3 id="custom-widget-editor-title">New group widget</h3><label for="custom-widget-name">Group name</label><input id="custom-widget-name" maxlength="80" placeholder="e.g. Partner admin" required /><label for="custom-widget-path-choice">Choose a path from ${esc(sourceName)}</label><div class="custom-path-picker"><select id="custom-widget-path-choice"><option value="">Select a folder or spec file</option><optgroup label="Folders">${paths.folders.map(([path, count]) => `<option value="${esc(path)}">${esc(path)}/ (${count} specs)</option>`).join("")}</optgroup><optgroup label="Spec files">${paths.files.map((path) => `<option value="${esc(path)}">${esc(path)}</option>`).join("")}</optgroup></select><button class="button" id="custom-widget-add-path" type="button">Add path</button></div><label for="custom-widget-paths">Group paths</label><textarea id="custom-widget-paths" rows="4" required placeholder="cypress/e2e/hipaa-comp/partner-admin"></textarea><p class="widget-footnote">One folder or exact spec path per line. Folders include all nested specs. Paths are case-sensitive; wildcards are not supported. Multiple paths are combined without counting a spec twice within a group.</p><fieldset class="custom-widget-options"><legend>Widget metrics</legend><label><input type="checkbox" name="custom-metric" value="outcomes" checked /> Test outcomes</label><label><input type="checkbox" name="custom-metric" value="passRate" checked /> Pass rate</label><label><input type="checkbox" name="custom-metric" value="duration" checked /> Cumulative test time</label></fieldset><div class="settings-buttons"><button class="button primary" type="submit" id="save-custom-widget">Add widget</button><button class="button" type="button" id="cancel-custom-widget" hidden>Cancel editing</button></div><p id="custom-widget-feedback" role="status" aria-live="polite"></p></form><aside class="custom-widget-live-preview" aria-labelledby="custom-preview-title"><h3 id="custom-preview-title">Live group preview</h3><p class="widget-footnote">Based on ${esc(sourceName)}. Choose a path to see matching results.</p><div id="custom-widget-preview"></div></aside></div><div class="custom-widget-saved"><h3>Saved group widgets</h3><div id="custom-widget-list"></div></div></section>`,
  );
  const section = alt.querySelector(".custom-widget-settings");
  const form = $("#custom-widget-form");
  const field = $("#custom-widget-paths");
  const feedback = $("#custom-widget-feedback");
  const metricInputs = [...form.querySelectorAll('[name="custom-metric"]')];
  function draft() {
    return {
      id: editingId || "preview",
      name: $("#custom-widget-name").value.trim() || "Group preview",
      paths: field.value
        .split(/\r?\n/)
        .map((path) => path.trim())
        .filter(Boolean),
      metrics: metricInputs
        .filter((input) => input.checked)
        .map((input) => input.value),
    };
  }
  function preview() {
    const host = $("#custom-widget-preview");
    try {
      const [group] = DashboardGroups.validateGroups([draft()]);
      const stats = DashboardGroups.groupStats(report, group);
      host.innerHTML = `<strong>${stats.specs.length} matching specs</strong>${customGroupMetrics(stats, group.metrics)}${stats.unmatchedPaths.length ? `<p class="widget-footnote">No matches for: ${stats.unmatchedPaths.map(esc).join(", ")}</p>` : ""}<details><summary>Matching spec paths</summary><ul class="custom-preview-specs">${stats.specs
        .slice(0, 20)
        .map((spec) => `<li>${esc(spec.file)}</li>`)
        .join(
          "",
        )}</ul>${stats.specs.length > 20 ? `<p>Showing 20 of ${stats.specs.length} specs.</p>` : ""}</details>`;
    } catch (error) {
      host.innerHTML = `<p class="widget-footnote">${esc(error.message)}</p>`;
    }
  }
  function reset() {
    editingId = null;
    form.reset();
    $("#custom-widget-editor-title").textContent = "New group widget";
    $("#save-custom-widget").textContent = "Add widget";
    $("#cancel-custom-widget").hidden = true;
    preview();
  }
  function renderList() {
    $("#custom-widget-list").innerHTML =
      groups
        .map(
          (group) =>
            `<div class="custom-widget-saved-row"><div><strong>${esc(group.name)}</strong><p>${group.paths.length} path(s) · ${DashboardGroups.groupStats(report, group).specs.length} matching specs in this report</p><ul>${group.paths.map((path) => `<li>${esc(path)}</li>`).join("")}</ul></div><div class="settings-buttons"><button class="button" type="button" data-edit-widget="${esc(group.id)}" aria-label="Edit ${esc(group.name)} widget">Edit</button><button class="button" type="button" data-remove-widget="${esc(group.id)}" aria-label="Remove ${esc(group.name)} widget">Remove</button></div></div>`,
        )
        .join("") ||
      '<p class="widget-footnote">No group widgets yet. Add your first group above.</p>';
    $("#custom-widget-list")
      .querySelectorAll("[data-edit-widget]")
      .forEach(
        (button) =>
          (button.onclick = () => {
            const group = groups.find(
              (item) => item.id === button.dataset.editWidget,
            );
            editingId = group.id;
            $("#custom-widget-name").value = group.name;
            field.value = group.paths.join("\n");
            metricInputs.forEach(
              (input) => (input.checked = group.metrics.includes(input.value)),
            );
            $("#custom-widget-editor-title").textContent = "Edit group widget";
            $("#save-custom-widget").textContent = "Save changes";
            $("#cancel-custom-widget").hidden = false;
            feedback.textContent = "";
            preview();
            $("#custom-widget-name").focus();
          }),
      );
    $("#custom-widget-list")
      .querySelectorAll("[data-remove-widget]")
      .forEach(
        (button) =>
          (button.onclick = async () => {
            button.disabled = true;
            try {
              const group = groups.find(
                (item) => item.id === button.dataset.removeWidget,
              );
              groups = await saveCustomWidgets(
                groups.filter((item) => item.id !== group.id),
              );
              showToast(`"${group.name}" widget removed.`, "success");
              renderCustomizedDashboard();
              if (!section.isConnected) return;
              if (editingId === group.id) reset();
              renderList();
              renderCustomizedDashboard();
              feedback.textContent = "";
            } catch (error) {
              feedback.textContent =
                error.message || "Widget could not be removed from the server.";
              showToast(feedback.textContent, "error");
              button.disabled = false;
            }
          }),
      );
  }
  $("#custom-widget-add-path").onclick = () => {
    const choice = $("#custom-widget-path-choice").value;
    if (!choice) {
      feedback.textContent = "Choose a folder or spec file to add.";
      return;
    }
    field.value = [
      ...new Set([...draft().paths.map(DashboardGroups.normalizePath), choice]),
    ].join("\n");
    feedback.textContent = "";
    preview();
  };
  form.addEventListener("input", preview);
  $("#cancel-custom-widget").onclick = () => {
    reset();
    feedback.textContent = "";
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      const next = {
        ...draft(),
        id: editingId || crypto.randomUUID(),
        name: $("#custom-widget-name").value.trim(),
      };
      const validated = DashboardGroups.validateGroups(
        editingId
          ? groups.map((group) => (group.id === editingId ? next : group))
          : [...groups, next],
      );
      try {
        form.inert = true;
        groups = await saveCustomWidgets(validated);
        showToast(
          `"${next.name}" widget ${editingId ? "updated" : "created"} and saved to your profile.`,
          "success",
        );
        renderCustomizedDashboard();
        if (!section.isConnected) return;
      } catch (error) {
        feedback.textContent =
          error.message || "Widget could not be saved to the server.";
        showToast(feedback.textContent, "error");
        form.inert = false;
        return;
      }
      form.inert = false;
      reset();
      renderList();
      renderCustomizedDashboard();
      feedback.textContent = "";
    } catch (error) {
      feedback.textContent = error.message;
      showToast(error.message, "error");
    }
  };
  renderList();
  preview();
  if (!userPreferences.getState().ready)
    section
      .querySelectorAll("input,select,textarea,button")
      .forEach((input) => (input.disabled = true));
}
