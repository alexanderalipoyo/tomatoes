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
        id: "google-auth",
        name: "Google sign-in",
        mark: "G",
        kind: "google",
        description:
          "Let members sign in and request access with a verified Gmail account.",
        group: status.google?.enabled ? "Enabled" : "Available",
        state: status.google?.enabled ? "Configured" : "Not configured",
        action: status.google?.enabled ? "Configure" : "Set up",
        setup: "google",
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
function renderIntegrations(host) {
  globalThis.TomatoesReact.renderIntegrations(host, {
    request: teamRequest,
    catalog: IntegrationCatalog.catalog,
    project: report?.metadata?.project || currentWorkspaceProject || "tomatoes",
  });
}
