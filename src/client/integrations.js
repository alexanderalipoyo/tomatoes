/* Integration states come from server capabilities; provider setup does not imply a connected app. */
(function (root) {
  function catalog(status) {
    return [
      {
        id: "ci",
        name: "CI report collection",
        mark: ">_",
        kind: "cli",
        description:
          "Publish Cypress-generated reports from your CI runner using the Tomatoes CLI.",
        group: status.ciConfigured ? "Enabled" : "New",
        state: status.ciConfigured ? "Configured" : "Not configured",
        action: status.ciConfigured ? "Configure" : "Set up",
        setup: "ci",
      },
      {
        id: "api",
        name: "Report API",
        mark: "{}",
        kind: "api",
        description:
          "Access saved runs and collect test reports with project-scoped API credentials.",
        group: "Available",
        state: "Available",
        action: "View setup",
        setup: "api",
      },
      {
        id: "slack",
        name: "Slack",
        mark: "#",
        kind: "slack",
        description:
          "Post a summary of your test results when a report import finishes.",
        group: status.slackConfigured ? "Enabled" : "Available",
        state: status.slackConfigured ? "Configured" : "Not configured",
        action: status.slackConfigured ? "Configure" : "Set up",
        setup: "slack",
      },
      ...[
        ["github", "GitHub Actions", "GH"],
        ["gitlab", "GitLab CI", "GL"],
        ["bitbucket", "Bitbucket Pipelines", "BB"],
        ["github-enterprise", "GitHub Enterprise", "GH"],
        ["gitlab-enterprise", "GitLab Self-managed", "GL"],
      ].map(([id, name, mark]) => ({
        id,
        name,
        mark,
        kind: id.split("-")[0],
        description:
          "Upload your run results through the Tomatoes CLI from a runner that can reach this server.",
        group: "Available",
        state: "Via CI",
        action: "View setup",
        setup: "ci",
      })),
      ...[
        [
          "teams",
          "Microsoft Teams",
          "T",
          "Post run summaries using Microsoft Teams webhooks.",
        ],
        ["jira", "Jira", "J", "Create issues from failed test results."],
        [
          "sso",
          "Single Sign-On (SSO)",
          "SSO",
          "Connect an organization identity provider.",
        ],
        [
          "mcp",
          "MCP connector",
          "MCP",
          "Give agents access to test reports through a dedicated connector.",
        ],
      ].map(([id, name, mark, description]) => ({
        id,
        name,
        mark,
        description,
        kind: id,
        group: "Available",
        state: "Not available yet",
        action: "Coming soon",
        setup: null,
      })),
    ];
  }
  const api = { catalog };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.IntegrationCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
let integrationRenderVersion = 0;
async function renderIntegrations(host) {
  const version = ++integrationRenderVersion;
  host.innerHTML =
    '<article class="insight-card"><p role="status">Checking integrations...</p></article>';
  let status;
  try {
    status = await teamRequest("/api/team/status", {
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (view !== "integrations" || version !== integrationRenderVersion) return;
    host.innerHTML = `<article class="settings-card"><h2>Integrations unavailable</h2><p>${esc(error.message)}</p><button class="button" id="integration-retry">Retry</button></article>`;
    document.querySelector("#integration-retry").onclick = () =>
      renderIntegrations(host);
    return;
  }
  if (view !== "integrations" || version !== integrationRenderVersion) return;
  const entries = IntegrationCatalog.catalog(status);
  host.innerHTML = `<div class="integrations-page">
    ${status.enabled && !status.authenticated ? '<p class="notice">Sign in through <a href="#team">Settings: Sharing &amp; access</a> to access your workspace reports.</p>' : ""}
    ${["New", "Enabled", "Available"]
      .map((group) => {
        const items = entries.filter((entry) => entry.group === group);
        return items.length
          ? `<section class="integration-section" aria-label="${group} integrations"><h2>${group}</h2><div class="integration-list">${items.map((entry) => `<article class="integration-row"><span class="integration-logo integration-logo-${entry.kind}" aria-hidden="true">${esc(entry.mark)}</span><div class="integration-copy"><div class="integration-title"><h3>${esc(entry.name)}</h3><span class="integration-state ${entry.group === "Enabled" ? "is-enabled" : ""}">${esc(entry.state)}</span></div><p>${esc(entry.description)} ${entry.setup ? `<button class="integration-learn" data-integration="${entry.id}">Learn more</button>` : ""}</p></div><button type="button" class="button ${entry.group === "New" ? "primary" : ""} integration-action" data-integration="${entry.id}" ${entry.setup ? "" : "disabled"}>${icon(entry.group === "Enabled" ? "settings" : "plus")}${esc(entry.action)}</button></article>`).join("")}</div></section>`
          : "";
      })
      .join("")}
    <p class="integrations-note">CI provider entries use the report uploader. Connection status reflects the local server configuration; direct provider apps, issue creation, and SSO are not configured by this page.</p>
  </div>`;
  host.querySelectorAll("[data-integration]").forEach((button) => {
    button.onclick = () => {
      const entry = entries.find(
        (item) => item.id === button.dataset.integration,
      );
      if (!entry?.setup) return;
      const workspace = document.querySelector(
        "[data-workspace-name]",
      ).textContent;
      const project =
        report?.metadata?.project ||
        (/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(workspace)
          ? workspace
          : "tomatoes");
      const setup = document.querySelector("#integration-setup");
      const ci = `<p>${status.ciConfigured ? "A project-scoped CI token is configured on this server." : "Create a project-scoped CI token on the server to enable automated report uploads."}</p><h3>1. Create a project token</h3><pre>node scripts/team-admin.js create-ci-token ${esc(project)}</pre><p>Store the returned token in your CI secret named TOMATOES_CI_TOKEN. Keep the token out of your repository.</p><h3>2. Set the server address</h3><p>Set TOMATOES_SERVER_URL to an address the runner can reach. A runner on this machine can use http://localhost:3000.</p><h3>3. Publish a report</h3><pre>node scripts/publish-report.js --file report.json --project ${esc(project)} --environment staging --branch main</pre><p>The publisher reads TOMATOES_SERVER_URL and TOMATOES_CI_TOKEN from its environment.</p>`;
      const api = `<p>The report API respects account roles and project scope.</p><pre>GET /api/runs
GET /api/runs/:id
POST /api/runs</pre><p>Automated clients use a project-scoped CI token in the Authorization: Bearer header. Browser requests use the signed-in session and CSRF protection.</p>${ci}`;
      const slack = `<p>${status.slackConfigured ? "Slack notifications are configured on this server." : "Add a Slack incoming webhook to the server configuration to enable notifications."}</p><p>Configure these values in the server's private .env file, then restart Tomatoes:</p><pre>TOMATOES_SLACK_WEBHOOK_URL=&lt;your incoming webhook&gt;
TOMATOES_SLACK_ENABLED=true</pre><p>Successful file imports post real test totals, the run result, and links to saved results. Reopening a report does not send a notification. The webhook is kept on the server.</p><p>For links accessible to your team, set TOMATOES_REPORT_BASE_URL to the address where they can open Tomatoes.</p>`;
      setup.innerHTML = `<div class="integration-setup-heading"><h2 id="integration-setup-title">${esc(entry.name)} setup</h2><button type="button" class="button" id="integration-setup-close" aria-label="Close integration setup" autofocus>Close</button></div><div class="integration-setup-body">${entry.setup === "slack" ? slack : entry.setup === "api" ? api : ci}</div>`;
      setup.onclose = () => {
        if (button.isConnected) button.focus();
      };
      setup.onclick = (event) => {
        if (event.target !== setup) return;
        const bounds = setup.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          setup.close();
      };
      setup.showModal();
      setup.scrollTop = 0;
      document.querySelector("#integration-setup-close").onclick = () => {
        setup.close();
      };
    };
  });
}

if (typeof document !== "undefined") {
  window.addEventListener("hashchange", () => {
    const dialog = document.querySelector("#integration-setup");
    if (dialog.open) dialog.close();
  });
}
