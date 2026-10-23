let teamState = null;
let teamRenderVersion = 0;
let teamProject = "";
async function teamRequest(route, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (teamState?.csrf) headers["X-CSRF-Token"] = teamState.csrf;
  const response = await fetch(route, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}
async function originalReportText() {
  if (activeHistoryId) return (await ImportHistory.get(activeHistoryId)).text;
  if (currentFile) return currentFile.text();
  const response = await fetch("results.json");
  if (!response.ok) throw new Error("Report source unavailable.");
  return response.text();
}
async function renderTeam(alt) {
  const version = ++teamRenderVersion;
  $("#report-content").hidden = false;
  alt.innerHTML =
    '<article class="insight-card"><p role="status">Connecting to the local team store…</p></article>';
  try {
    const status = await teamRequest("/api/team/status");
    if (view !== "team" || version !== teamRenderVersion) return;
    teamState = status;
    if (status.enabled && !status.authenticated) {
      alt.innerHTML = `<form id="team-login" class="settings-card preference-form team-login"><h2>Sign in to the local team store</h2><p>Your account determines which projects you can access. Browser import history is stored separately on this device.</p><label>Username<input id="team-username" autocomplete="username" required maxlength="64"/></label><label>Password<input id="team-password" type="password" autocomplete="current-password" required maxlength="256"/></label><button class="button primary" type="submit">Sign in</button><p id="team-login-error" role="alert"></p></form><article class="settings-card"><h2>Local account setup</h2><p>In a terminal, create an account with a role and project scope:</p><pre>node tools/team-admin.js add-user alex --projects tomatoes --role editor</pre><p class="widget-footnote">Account setup runs on this machine; the password is prompted without echo.</p></article>`;
      $("#team-login").onsubmit = async (event) => {
        event.preventDefault();
        const submit = event.target.querySelector("button");
        submit.disabled = true;
        try {
          await teamRequest("/api/login", {
            method: "POST",
            body: JSON.stringify({
              username: $("#team-username").value,
              password: $("#team-password").value,
            }),
          });
          $("#team-password").value = "";
          await renderTeam(alt);
        } catch (error) {
          $("#team-login-error").textContent = error.message;
          submit.disabled = false;
        }
      };
      return;
    }
    const payload = await teamRequest(
      "/api/runs" +
        (teamProject ? "?project=" + encodeURIComponent(teamProject) : ""),
    );
    if (view !== "team" || version !== teamRenderVersion) return;
    const projects = [
      ...new Set([
        ...(status.user?.projects || []).filter((project) => project !== "*"),
        ...payload.runs.map((run) => run.metadata.project),
        report?.metadata?.project || "tomatoes",
      ]),
    ].sort();
    const editable = !status.user || status.user.role !== "viewer";
    alt.innerHTML = `<div class="insight-source"><span>${status.enabled ? `Signed in as ${esc(status.user.username)} · ${esc(status.user.role)}` : "Local mode · sign-in is optional"}</span><span>${status.storage === "postgres" ? "PostgreSQL connected · local database" : "File storage on this machine"} ${status.enabled ? '<button class="button" id="team-logout">Sign out</button>' : ""}</span></div><div class="team-layout"><article class="settings-card"><h2>Shared reports</h2><p>Filter by project and open a report as a browser copy.</p><label class="team-project-label">Project<select id="team-project"><option value="">All accessible projects</option>${projects.map((project) => `<option value="${esc(project)}" ${project === teamProject ? "selected" : ""}>${esc(project)}</option>`).join("")}</select></label><p class="widget-footnote">Opening a report saves a copy in this browser's import history, including after sign-out.</p><div id="team-runs">${payload.runs.map((run) => `<article class="shared-run"><div>${badge(run.status)}<strong>${esc(run.label || run.name)}</strong>${run.notes ? `<p>${esc(run.notes)}</p>` : ""}<p>${esc(run.metadata.project)}${run.metadata.environment ? " / " + esc(run.metadata.environment) : ""} · ${number(run.counts.total)} tests · ${run.counts.failed} failed</p><small>${esc(date(run.start))}</small>${run.metadata.branch ? `<small>Branch ${esc(run.metadata.branch)}${run.metadata.commit ? " · " + esc(run.metadata.commit) : ""}</small>` : ""}</div><button class="button" data-open-shared="${run.id}">Open browser copy</button></article>`).join("") || '<p class="widget-empty">No shared reports in this project yet.</p>'}</div></article><div><form class="settings-card preference-form" id="publish-current"><h2>Publish selected run</h2><p>Copy the currently viewed report into the local server store.</p><label>Project<input id="publish-project" value="${esc(report?.metadata?.project || projects[0] || "tomatoes")}" required maxlength="80"/></label><button class="button primary" ${!report || !editable ? "disabled" : ""}>Publish report</button><p id="team-feedback" role="status">${editable ? "" : "Your account has read-only access."}</p></form><article class="settings-card"><h2>CI report collection</h2><p>${status.ciConfigured ? "A project-scoped CI token is configured." : "Create a project-scoped token on this machine to enable CI uploads."}</p><pre>node tools/team-admin.js create-ci-token tomatoes</pre><p>Store the returned token in your CI secret named TOMATOES_CI_TOKEN, then publish the report:</p><pre>node tools/publish-report.js --file report.json --project tomatoes --environment staging --branch main</pre><p class="widget-footnote">The publisher reads TOMATOES_SERVER_URL and TOMATOES_CI_TOKEN from the environment. A remote CI runner must be able to reach this local server; a runner on this machine can use localhost.</p></article><article class="settings-card"><h2>Optional local sign-in</h2><p>Create users with viewer, editor, or admin roles, then start the server with TOMATOES_TEAM_MODE=1. Each user has an explicit project scope.</p><p class="widget-footnote">${status.storage === "postgres" ? "Reports, account hashes, CI token hashes, and attachment metadata are stored in PostgreSQL. Attachment files stay in the private local storage folder." : "Server reports are saved under .tomatoes-data and excluded from Git."} Existing browser imports can be copied using Save browser imports. New file imports are copied automatically when PostgreSQL access is available.</p></article></div></div>`;
    $("#team-project").onchange = (event) => {
      teamProject = event.target.value;
      renderTeam(alt);
    };
    if ($("#team-logout"))
      $("#team-logout").onclick = async () => {
        try {
          await teamRequest("/api/logout", { method: "POST", body: "{}" });
          teamState = null;
          renderTeam(alt);
        } catch (error) {
          historyNotice(error.message);
        }
      };
    $("#publish-current").onsubmit = async (event) => {
      event.preventDefault();
      const project = $("#publish-project").value;
      await investigationBusy(
        "Publishing report to the local team store",
        async () => {
          paintProgress(35, "Saving report and attachments");
          await uploadBrowserReport(
            historyEntries.find((entry) => entry.id === activeHistoryId),
            project,
          );
          teamProject = project;
          await renderTeam(alt);
          $("#team-feedback").textContent =
            "Report and attachments saved to the local server store.";
        },
        (error) => {
          if ($("#team-feedback"))
            $("#team-feedback").textContent = error.message;
        },
      );
    };
    document
      .querySelector("#publish-current")
      .insertAdjacentHTML(
        "afterend",
        `<article class="settings-card"><h2>Save browser history</h2><p>Copy saved browser imports, names, notes, and attachments into ${status.storage === "postgres" ? "PostgreSQL" : "the server store"}. Browser copies remain available. Trash is excluded.</p><button type="button" class="button" id="save-browser-history" ${!editable || !historyEntries.length ? "disabled" : ""}>Save browser imports</button><p id="browser-save-feedback" role="status"></p></article>`,
      );
    document.querySelector("#save-browser-history").onclick = async () => {
      await investigationBusy(
        "Saving browser reports",
        async () => {
          const entries = [...historyEntries].sort(
            (a, b) => a.lastImportedAt - b.lastImportedAt,
          );
          const ids = new Set();
          for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            const saved = await uploadBrowserReport(
              entry,
              entry.metadata?.project || "tomatoes",
            );
            ids.add(saved.id);
            paintProgress(
              Math.round(((index + 1) / entries.length) * 95),
              `Saved import ${index + 1} of ${entries.length}`,
            );
            await allowPaint();
          }
          teamProject = "";
          await renderTeam(alt);
          document.querySelector("#browser-save-feedback").textContent =
            `Saved ${entries.length} browser imports as ${ids.size} distinct server reports, including their attachments. Browser history was preserved.`;
        },
        (error) => {
          if (document.querySelector("#browser-save-feedback"))
            document.querySelector("#browser-save-feedback").textContent =
              `Save stopped: ${error.message} Earlier reports may already be saved. Retrying merges duplicates; browser originals are preserved.`;
        },
      );
    };
    alt.querySelectorAll("[data-open-shared]").forEach(
      (button) =>
        (button.onclick = async () => {
          button.disabled = true;
          try {
            const saved = await teamRequest(
              "/api/runs/" + button.dataset.openShared,
            );
            const file = new File(
              [saved.originalText || JSON.stringify(saved.report)],
              saved.run.name.endsWith(".json")
                ? saved.run.name
                : saved.run.name + ".json",
              { type: "application/json" },
            );
            const existingIds = new Set(
              historyEntries.map((entry) => entry.id),
            );
            await loadReport(file, {
              recordImport: true,
              openDashboard: true,
              metadataOverride: saved.run.metadata,
              skipServerSave: true,
            });
            if (currentFile !== file) {
              button.disabled = false;
              return;
            }
            if (activeHistoryId) {
              const localId = activeHistoryId;
              await investigationBusy(
                "Restoring server report details",
                async () => {
                  if (!existingIds.has(localId)) {
                    await ImportHistory.updateDetails(localId, {
                      label: saved.run.label || "",
                      notes: saved.run.notes || "",
                    });
                    if (saved.run.label) sourceName = saved.run.label;
                  }
                  await restoreSharedEvidence(saved, localId);
                  await refreshHistory();
                  renderSummary();
                },
                (error) =>
                  historyNotice(
                    `Report opened, but some saved details could not be restored: ${error.message}`,
                  ),
              );
            }
          } catch (error) {
            historyNotice(error.message);
            button.disabled = false;
          }
        }),
    );
  } catch (error) {
    if (view === "team" && version === teamRenderVersion)
      alt.innerHTML = `<article class="settings-card"><h2>Local team store unavailable</h2><p role="alert">${esc(error.message)}</p><button class="button" id="retry-team">Reconnect</button></article>`;
    if ($("#retry-team")) $("#retry-team").onclick = () => renderTeam(alt);
  }
}
function reportIdentityMarkup() {
  const metadata = report.metadata || {};
  const summary = $("#run-summary");
  summary.querySelector(".run-identity")?.remove();
  if (!Object.values(metadata).some(Boolean)) return;
  summary.insertAdjacentHTML(
    "beforeend",
    `<div class="run-identity">${["project", "environment", "branch", "commit"]
      .filter((key) => metadata[key])
      .map((key) => `<span><small>${key}</small>${esc(metadata[key])}</span>`)
      .join(
        "",
      )}${metadata.buildUrl ? `<a class="button" href="${esc(metadata.buildUrl)}" target="_blank" rel="noopener noreferrer">Open build →</a>` : ""}</div>`,
  );
}
async function uploadBrowserReport(entry, projectOverride = null) {
  const text = entry
    ? (await ImportHistory.get(entry.id)).text
    : await originalReportText();
  const metadata = {
    ...(entry?.metadata || report.metadata),
    project:
      projectOverride ||
      entry?.metadata?.project ||
      report.metadata?.project ||
      "tomatoes",
  };
  const saved = await teamRequest("/api/runs", {
    method: "POST",
    body: JSON.stringify({
      reportText: text,
      name: entry?.name || sourceName,
      label: entry?.label || "",
      notes: entry?.notes || "",
      importedAt: entry?.lastImportedAt || report.importedAt || Date.now(),
      metadata,
    }),
  });
  const attachments = entry ? await ImportHistory.listEvidence(entry.id) : [];
  for (const attachment of attachments) {
    const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    await teamRequest(`/api/runs/${saved.run.id}/evidence`, {
      method: "POST",
      body: JSON.stringify({
        testKey: attachment.testKey,
        name: attachment.name,
        type: attachment.type,
        data: btoa(binary),
      }),
    });
    await allowPaint();
  }
  return saved.run;
}
async function restoreSharedEvidence(saved, localId) {
  const payload = await teamRequest(`/api/runs/${saved.run.id}/evidence`);
  for (const record of payload.evidence) {
    const response = await fetch(
      `/api/runs/${saved.run.id}/evidence/${record.id}`,
      { credentials: "same-origin" },
    );
    if (!response.ok)
      throw new Error("A shared attachment could not be downloaded.");
    const blob = await response.blob();
    await ReportFeatures.validateEvidence(blob);
    await ImportHistory.saveEvidence({
      id: `${localId}:${record.testKey}:${record.contentHash || record.id}`,
      runId: localId,
      testKey: record.testKey,
      name: record.name,
      type: record.type,
      savedAt: record.savedAt,
      blob,
    });
  }
}
async function syncImportedReport(entry) {
  try {
    const status = await teamRequest("/api/team/status");
    if (status.storage !== "postgres") return { saved: false };
    teamState = status;
    if (status.enabled && !status.authenticated)
      return {
        saved: false,
        notice:
          "Saved in this browser. Sign in under Team & CI to save a PostgreSQL copy.",
      };
    if (status.user?.role === "viewer")
      return {
        saved: false,
        notice:
          "Saved in this browser. Your account has read-only database access.",
      };
    await uploadBrowserReport(entry);
    return { saved: true };
  } catch (error) {
    return {
      saved: false,
      notice: `Saved in this browser. The database copy could not be saved: ${error.message}`,
    };
  }
}
