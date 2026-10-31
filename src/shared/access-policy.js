(function (root) {
  const features = [
    {
      id: "latest-run.test-outcome-totals",
      tab: "Latest run",
      name: "Test outcome totals",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "latest-run.pass-rate",
      tab: "Latest run",
      name: "Pass rate",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "latest-run.run-duration",
      tab: "Latest run",
      name: "Run duration",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "latest-run.failed-spec-summary",
      tab: "Latest run",
      name: "Failed spec summary",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "latest-run.slow-test-widgets",
      tab: "Latest run",
      name: "Slow test widgets",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "latest-run.failure-hotspots",
      tab: "Latest run",
      name: "Failure hotspots",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "latest-run.custom-widgets-grouped-by-spec-paths",
      tab: "Latest run",
      name: "Custom widgets grouped by spec paths",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "test-results.switch-between-spec-and-test-views",
      tab: "Test results",
      name: "Switch between spec and test views",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "test-results.search-tests-paths-and-errors",
      tab: "Test results",
      name: "Search tests, paths, and errors",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "test-results.filter-by-outcome",
      tab: "Test results",
      name: "Filter by outcome",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "test-results.filter-by-spec",
      tab: "Test results",
      name: "Filter by spec",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "test-results.paginate-results",
      tab: "Test results",
      name: "Paginate results",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "test-results.view-test-details",
      tab: "Test results",
      name: "View test details",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "test-results.inspect-errors-and-stack-traces",
      tab: "Test results",
      name: "Inspect errors and stack traces",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "test-results.view-recorded-test-code",
      tab: "Test results",
      name: "View recorded test code",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "test-results.attach-screenshots-and-recordings",
      tab: "Test results",
      name: "Attach screenshots and recordings",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "failed-tests.group-matching-failure-messages",
      tab: "Failed tests",
      name: "Group matching failure messages",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "failed-tests.view-affected-tests",
      tab: "Failed tests",
      name: "View affected tests",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "failed-tests.inspect-detailed-errors",
      tab: "Failed tests",
      name: "Inspect detailed errors",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "failed-tests.analyze-recurring-failures-across-comparable-imports",
      tab: "Failed tests",
      name: "Analyze recurring failures across comparable imports",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "import-history.reopen-saved-imports",
      tab: "Import history",
      name: "Reopen saved imports",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "import-history.open-a-unique-report-url",
      tab: "Import history",
      name: "Open a unique report URL",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "import-history.copy-report-links",
      tab: "Import history",
      name: "Copy report links",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "import-history.edit-report-names",
      tab: "Import history",
      name: "Edit report names",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-history.edit-report-notes",
      tab: "Import history",
      name: "Edit report notes",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-history.export-pdf-reports",
      tab: "Import history",
      name: "Export PDF reports",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "import-history.move-imports-to-trash",
      tab: "Import history",
      name: "Move imports to trash",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-history.restore-trashed-imports",
      tab: "Import history",
      name: "Restore trashed imports",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-history.download-browser-backups",
      tab: "Import history",
      name: "Download browser backups",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-history.restore-browser-backups",
      tab: "Import history",
      name: "Restore browser backups",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "compare-runs.select-baseline-and-target-reports",
      tab: "Compare runs",
      name: "Select baseline and target reports",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "compare-runs.identify-regressions",
      tab: "Compare runs",
      name: "Identify regressions",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "compare-runs.identify-fixes",
      tab: "Compare runs",
      name: "Identify fixes",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "compare-runs.identify-added-and-missing-tests",
      tab: "Compare runs",
      name: "Identify added and missing tests",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "compare-runs.compare-outcome-changes",
      tab: "Compare runs",
      name: "Compare outcome changes",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "compare-runs.compare-test-durations",
      tab: "Compare runs",
      name: "Compare test durations",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "compare-runs.export-comparison-summaries",
      tab: "Compare runs",
      name: "Export comparison summaries",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "analytics.analyze-failure-patterns",
      tab: "Analytics",
      name: "Analyze failure patterns",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "analytics.identify-affected-directories",
      tab: "Analytics",
      name: "Identify affected directories",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "analytics.view-duration-distributions",
      tab: "Analytics",
      name: "View duration distributions",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "analytics.review-performance-percentiles",
      tab: "Analytics",
      name: "Review performance percentiles",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "analytics.view-saved-run-trends",
      tab: "Analytics",
      name: "View saved-run trends",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "analytics.filter-trends-by-project",
      tab: "Analytics",
      name: "Filter trends by project",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "analytics.filter-trends-by-environment",
      tab: "Analytics",
      name: "Filter trends by environment",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "analytics.filter-trends-by-branch",
      tab: "Analytics",
      name: "Filter trends by branch",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "flaky-tests.review-explicit-retry-recovery-evidence",
      tab: "Flaky tests",
      name: "Review explicit retry-recovery evidence",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "flaky-tests.investigate-cross-run-pass-fail-changes",
      tab: "Flaky tests",
      name: "Investigate cross-run pass/fail changes",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "projects.view-projects-within-the-current-organization",
      tab: "Projects",
      name: "View projects within the current organization",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "projects.search-projects",
      tab: "Projects",
      name: "Search projects",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "projects.create-projects",
      tab: "Projects",
      name: "Create projects",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "projects.rename-projects",
      tab: "Projects",
      name: "Rename projects",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "projects.view-branch-summaries",
      tab: "Projects",
      name: "View branch summaries",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "projects.open-latest-results",
      tab: "Projects",
      name: "Open latest results",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "projects.view-active-runs",
      tab: "Projects",
      name: "View active runs",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "projects.view-archived-runs",
      tab: "Projects",
      name: "View archived runs",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "projects.archive-runs-with-confirmation",
      tab: "Projects",
      name: "Archive runs with confirmation",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "projects.restore-runs-with-confirmation",
      tab: "Projects",
      name: "Restore runs with confirmation",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "projects.load-older-shared-reports",
      tab: "Projects",
      name: "Load older shared reports",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "my-profile.edit-personal-details",
      tab: "My profile",
      name: "Edit personal details",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "my-profile.view-organization-membership",
      tab: "My profile",
      name: "View organization membership",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "my-profile.view-assigned-projects",
      tab: "My profile",
      name: "View assigned projects",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "my-profile.change-password",
      tab: "My profile",
      name: "Change password",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "my-profile.revoke-existing-sessions-after-a-password-change",
      tab: "My profile",
      name: "Revoke existing sessions after a password change",
      defaults: { admin: true, editor: true, viewer: true },
      locked: true,
    },
    {
      id: "users.add-users",
      tab: "Users",
      name: "Add users",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "users.edit-users",
      tab: "Users",
      name: "Edit users",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "users.assign-roles",
      tab: "Users",
      name: "Assign roles",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "users.assign-multiple-projects",
      tab: "Users",
      name: "Assign multiple projects",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "users.search-users",
      tab: "Users",
      name: "Search users",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "users.filter-users",
      tab: "Users",
      name: "Filter users",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "users.sort-users",
      tab: "Users",
      name: "Sort users",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "users.deactivate-users",
      tab: "Users",
      name: "Deactivate users",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "users.restore-users",
      tab: "Users",
      name: "Restore users",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "users.enforce-organization-membership-and-project-access",
      tab: "Users",
      name: "Enforce organization membership and project access",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-general.update-organization-name",
      tab: "Settings \u2014 General",
      name: "Update organization name",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-general.upload-organization-logo",
      tab: "Settings \u2014 General",
      name: "Upload organization logo",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-general.preview-organization-logo",
      tab: "Settings \u2014 General",
      name: "Preview organization logo",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-general.remove-organization-logo",
      tab: "Settings \u2014 General",
      name: "Remove organization logo",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-general.save-shared-organization-branding",
      tab: "Settings \u2014 General",
      name: "Save shared organization branding",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-general.configure-project-website",
      tab: "Settings \u2014 General",
      name: "Configure project website",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-general.configure-fallback-project-logo",
      tab: "Settings \u2014 General",
      name: "Configure fallback project logo",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-appearance.select-light-mode",
      tab: "Settings \u2014 Appearance",
      name: "Select Light mode",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "settings-appearance.select-dark-mode",
      tab: "Settings \u2014 Appearance",
      name: "Select Dark mode",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "settings-appearance.follow-system-appearance",
      tab: "Settings \u2014 Appearance",
      name: "Follow system appearance",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "settings-appearance.save-appearance-preferences",
      tab: "Settings \u2014 Appearance",
      name: "Save appearance preferences",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "settings-sharing-access.browse-shared-reports",
      tab: "Settings \u2014 Sharing & access",
      name: "Browse shared reports",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-sharing-access.filter-reports-by-project",
      tab: "Settings \u2014 Sharing & access",
      name: "Filter reports by project",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "settings-sharing-access.open-server-reports",
      tab: "Settings \u2014 Sharing & access",
      name: "Open server reports",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-sharing-access.publish-reports",
      tab: "Settings \u2014 Sharing & access",
      name: "Publish reports",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-sharing-access.save-browser-imports-to-the-server",
      tab: "Settings \u2014 Sharing & access",
      name: "Save browser imports to the server",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-sharing-access.view-connection-status",
      tab: "Settings \u2014 Sharing & access",
      name: "View connection status",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "settings-sharing-access.load-older-reports",
      tab: "Settings \u2014 Sharing & access",
      name: "Load older reports",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "report-settings.configure-time-zone",
      tab: "Report settings",
      name: "Configure time zone",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "report-settings.configure-results-per-page",
      tab: "Report settings",
      name: "Configure results per page",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "report-settings.create-custom-spec-group-widgets",
      tab: "Report settings",
      name: "Create custom spec-group widgets",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "report-settings.edit-custom-widgets",
      tab: "Report settings",
      name: "Edit custom widgets",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "report-settings.remove-custom-widgets",
      tab: "Report settings",
      name: "Remove custom widgets",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "report-settings.view-report-information",
      tab: "Report settings",
      name: "View report information",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "report-settings.review-validation-and-data-quality-warnings",
      tab: "Report settings",
      name: "Review validation and data-quality warnings",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "report-settings.export-original-json",
      tab: "Report settings",
      name: "Export original JSON",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "report-settings.export-markdown-summaries",
      tab: "Report settings",
      name: "Export Markdown summaries",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "report-settings.export-pdf-reports",
      tab: "Report settings",
      name: "Export PDF reports",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "integration.open-setup-configuration-dialogs",
      tab: "Integration",
      name: "Open setup/configuration dialogs",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "integration.configure-ci-report-uploads",
      tab: "Integration",
      name: "Configure CI report uploads",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "integration.view-project-scoped-api-setup",
      tab: "Integration",
      name: "View project-scoped API setup",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "integration.configure-slack-import-notifications",
      tab: "Integration",
      name: "Configure Slack import notifications",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "integration.view-github-actions-setup-instructions",
      tab: "Integration",
      name: "View GitHub Actions setup instructions",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "integration.view-gitlab-ci-setup-instructions",
      tab: "Integration",
      name: "View GitLab CI setup instructions",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "integration.view-bitbucket-runner-setup-instructions",
      tab: "Integration",
      name: "View Bitbucket runner setup instructions",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "login.sign-in-using-email-or-username",
      tab: "Login",
      name: "Sign in using email or username",
      defaults: { admin: true, editor: true, viewer: true },
      locked: true,
    },
    {
      id: "login.show-or-hide-the-password-field",
      tab: "Login",
      name: "Show or hide the password field",
      defaults: { admin: true, editor: true, viewer: true },
      locked: true,
    },
    {
      id: "login.limit-repeated-sign-in-attempts",
      tab: "Login",
      name: "Limit repeated sign-in attempts",
      defaults: { admin: true, editor: true, viewer: true },
      locked: true,
    },
    {
      id: "login.establish-secure-cookie-sessions",
      tab: "Login",
      name: "Establish secure cookie sessions",
      defaults: { admin: true, editor: true, viewer: true },
      locked: true,
    },
    {
      id: "login.recommend-changing-passwords-matching-account-identifiers",
      tab: "Login",
      name: "Recommend changing passwords matching account identifiers",
      defaults: { admin: true, editor: true, viewer: true },
      locked: true,
    },
    {
      id: "forgot-reset-password.request-password-recovery",
      tab: "Forgot / Reset password",
      name: "Request password recovery",
      defaults: { admin: true, editor: true, viewer: true },
      locked: true,
    },
    {
      id: "forgot-reset-password.use-expiring-single-use-reset-links",
      tab: "Forgot / Reset password",
      name: "Use expiring, single-use reset links",
      defaults: { admin: true, editor: true, viewer: true },
      locked: true,
    },
    {
      id: "forgot-reset-password.confirm-the-new-password",
      tab: "Forgot / Reset password",
      name: "Confirm the new password",
      defaults: { admin: true, editor: true, viewer: true },
      locked: true,
    },
    {
      id: "forgot-reset-password.invalidate-existing-sessions-after-reset",
      tab: "Forgot / Reset password",
      name: "Invalidate existing sessions after reset",
      defaults: { admin: true, editor: true, viewer: true },
      locked: true,
    },
    {
      id: "import-report-modal.browse-for-a-json-file",
      tab: "Import report modal",
      name: "Browse for a JSON file",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-report-modal.drag-and-drop-a-json-file",
      tab: "Import report modal",
      name: "Drag and drop a JSON file",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-report-modal.require-a-project-selection",
      tab: "Import report modal",
      name: "Require a project selection",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-report-modal.require-a-branch-selection",
      tab: "Import report modal",
      name: "Require a branch selection",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-report-modal.select-an-existing-branch",
      tab: "Import report modal",
      name: "Select an existing branch",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-report-modal.create-a-new-branch",
      tab: "Import report modal",
      name: "Create a new branch",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-report-modal.restore-a-valid-remembered-branch-default",
      tab: "Import report modal",
      name: "Restore a valid remembered branch default",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-report-modal.validate-report-format",
      tab: "Import report modal",
      name: "Validate report format",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "import-report-modal.display-blocking-import-progress",
      tab: "Import report modal",
      name: "Display blocking import progress",
      defaults: { admin: true, editor: true, viewer: false },
      locked: false,
    },
    {
      id: "organization-project-navigation.display-dynamic-organization-identity",
      tab: "Organization / project navigation",
      name: "Display dynamic organization identity",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "organization-project-navigation.display-organization-logo",
      tab: "Organization / project navigation",
      name: "Display organization logo",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "organization-project-navigation.display-current-user-name",
      tab: "Organization / project navigation",
      name: "Display current user name",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "organization-project-navigation.select-permitted-projects",
      tab: "Organization / project navigation",
      name: "Select permitted projects",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "organization-project-navigation.use-responsive-mobile-navigation",
      tab: "Organization / project navigation",
      name: "Use responsive mobile navigation",
      defaults: { admin: true, editor: false, viewer: false },
      locked: false,
    },
    {
      id: "pdf-export-dialog.choose-summary-or-detailed-format",
      tab: "PDF export dialog",
      name: "Choose summary or detailed format",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "pdf-export-dialog.filter-failure-details",
      tab: "PDF export dialog",
      name: "Filter failure details",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "pdf-export-dialog.preview-the-pdf",
      tab: "PDF export dialog",
      name: "Preview the PDF",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "pdf-export-dialog.apply-organization-branding",
      tab: "PDF export dialog",
      name: "Apply organization branding",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
    {
      id: "pdf-export-dialog.generate-filenames-using-import-time",
      tab: "PDF export dialog",
      name: "Generate filenames using import time",
      defaults: { admin: true, editor: true, viewer: true },
      locked: false,
    },
  ];
  // Organization administration stays restricted to organization admins. Other feature
  // switches may narrow a role without elevating its tenant or account authority.
  for (const feature of features)
    if (
      /^import-report-modal\.(require-a-project-selection|require-a-branch-selection|validate-report-format|display-blocking-import-progress)$/.test(
        feature.id,
      )
    )
      feature.locked = true;
  for (const feature of features)
    feature.adminOnly =
      /^(users\.(add-users|edit-users|assign-roles|assign-multiple-projects|deactivate-users|restore-users|enforce-organization)|settings-general\.|integration\.|projects\.(create-projects|rename-projects))/.test(
        feature.id,
      );
  const byId = new Map(features.map((feature) => [feature.id, feature]));
  function configured(overrides = {}, role = "viewer") {
    const result = {};
    for (const feature of features)
      result[feature.id] =
        role === "admin"
          ? true
          : feature.locked
            ? feature.defaults[role] === true
            : (overrides?.[role]?.[feature.id] ??
              feature.defaults[role] === true);
    return result;
  }
  function resolve(overrides = {}, role = "viewer") {
    const result = configured(overrides, role);
    // Shared-report filtering/paging depends on the right to browse that panel.
    const browse = "settings-sharing-access.browse-shared-reports";
    if (!result[browse])
      for (const feature of features)
        if (feature.id.startsWith("settings-sharing-access."))
          result[feature.id] = false;
    return result;
  }
  function validate(value) {
    const fail = () => {
      throw Object.assign(
        new Error(
          "Submit the complete Editor and Viewer access matrix with boolean values.",
        ),
        { status: 400 },
      );
    };
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((role) => !["editor", "viewer"].includes(role))
    )
      fail();
    const result = {};
    for (const role of ["editor", "viewer"]) {
      const row = value[role];
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        Object.keys(row).length !== features.length ||
        Object.keys(row).some((id) => !byId.has(id))
      )
        fail();
      result[role] = {};
      for (const feature of features) {
        if (
          typeof row[feature.id] !== "boolean" ||
          ((feature.locked || feature.adminOnly) &&
            row[feature.id] !== feature.defaults[role])
        )
          fail();
        result[role][feature.id] = row[feature.id];
      }
    }
    return result;
  }
  function can(permissions, id) {
    return permissions?.[id] === true;
  }
  function tab(permissions, name) {
    return features.some(
      (feature) => feature.tab === name && can(permissions, feature.id),
    );
  }
  const pages = {
    runs: "Latest run",
    results: "Test results",
    failures: "Failed tests",
    history: "Import history",
    compare: "Compare runs",
    analytics: "Analytics",
    flaky: "Flaky tests",
    projects: "Projects",
    profile: "My profile",
    users: "Users",
    settings: "Report settings",
    integrations: "Integration",
  };
  function page(permissions, view) {
    if (view === "workspace-settings" || view === "team")
      return features.some(
        (feature) =>
          /^settings-(general|appearance|sharing-access)\./.test(feature.id) &&
          can(permissions, feature.id),
      );
    if (view === "projects")
      return can(
        permissions,
        "projects.view-projects-within-the-current-organization",
      );
    return pages[view] ? tab(permissions, pages[view]) : false;
  }
  const api = { features, configured, resolve, validate, can, tab, page };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AccessPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
