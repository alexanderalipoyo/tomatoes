/* UI capabilities complement server authorization and project scope. */
function accessPermissions() {
  if (typeof authStatus === "undefined" || !authStatus || authRequiresLogin())
    return {};
  return (
    authStatus.permissions ||
    AccessPolicy.resolve(
      {},
      authStatus.enabled ? authStatus.user?.role : "admin",
    )
  );
}
function hasAccess(id) {
  return AccessPolicy.can(accessPermissions(), id);
}
function canAccessView(view) {
  return view === "role-access"
    ? Boolean(
        typeof authStatus !== "undefined" && authStatus?.canManageRoleAccess,
      )
    : AccessPolicy.page(accessPermissions(), view);
}
function requireAccess(id) {
  if (!hasAccess(id))
    throw new Error("Your role does not have access to this feature.");
}
const featureSelectors = {
  "#import-report":
    "import-report-modal.browse-for-a-json-file|import-report-modal.drag-and-drop-a-json-file",
  "#browse-report": "import-report-modal.browse-for-a-json-file",

  "#display-settings":
    "report-settings.configure-time-zone|report-settings.configure-results-per-page",
  "#setting-zone": "report-settings.configure-time-zone",
  "#setting-rows": "report-settings.configure-results-per-page",
  "#revalidate-report, .data-quality-warning":
    "report-settings.review-validation-and-data-quality-warnings",
  "#attach-evidence, #evidence-file":
    "test-results.attach-screenshots-and-recordings",
  "[data-manage-history]":
    "import-history.edit-report-names|import-history.edit-report-notes",
  "[data-trash-history]": "import-history.move-imports-to-trash",
  "[data-restore-trash], #show-trash": "import-history.restore-trashed-imports",
  "[data-export-pdf]": "import-history.export-pdf-reports",
  "[data-copy-report-link]": "import-history.copy-report-links",
  "[data-open-history]": "import-history.reopen-saved-imports",
  "#backup-history": "import-history.download-browser-backups",
  "#restore-history, #backup-file": "import-history.restore-browser-backups",
  "#history-label": "import-history.edit-report-names",
  "#history-notes": "import-history.edit-report-notes",
  "#project-search": "projects.search-projects",
  "#create-project": "projects.create-projects",
  "[data-rename-project]": "projects.rename-projects",
  "#projects-load-more, #project-runs-more":
    "projects.load-older-shared-reports",
  "#project-active-tab": "projects.view-active-runs",
  "#project-archived-tab": "projects.view-archived-runs",
  "#users-add": "users.add-users",
  "[data-user-edit]": "users.edit-users",
  "#users-search": "users.search-users",
  ".users-role-filter, #users-status": "users.filter-users",
  "[data-users-sort]": "users.sort-users",
  "#profile-form": "my-profile.edit-personal-details",
  "#change-password-form": "my-profile.change-password",
  "#organization-name": "settings-general.update-organization-name",
  "#organization-logo": "settings-general.upload-organization-logo",
  "#organization-remove-logo": "settings-general.remove-organization-logo",
  "#organization-settings-form":
    "settings-general.save-shared-organization-branding",
  "#workspace-general-form":
    "settings-general.configure-project-website|settings-general.configure-fallback-project-logo",
  "#appearance-form": "settings-appearance.save-appearance-preferences",
  "#custom-widget-form":
    "report-settings.create-custom-spec-group-widgets|report-settings.edit-custom-widgets",
  "[data-edit-widget]": "report-settings.edit-custom-widgets",
  "[data-remove-widget]": "report-settings.remove-custom-widgets",
  "#export-report": "report-settings.export-original-json",
  "#export-run-summary": "report-settings.export-markdown-summaries",
  "#export-pdf": "report-settings.export-pdf-reports",
  "[data-project-picker]":
    "organization-project-navigation.select-permitted-projects",
  "[data-organization-name]":
    "organization-project-navigation.display-dynamic-organization-identity",
  "[data-organization-initials]":
    "organization-project-navigation.display-organization-logo",
  "[data-workspace-user]":
    "organization-project-navigation.display-current-user-name",
  "#open-navigation":
    "organization-project-navigation.use-responsive-mobile-navigation",
  ".workspace-menu-organizations":
    "organization-project-navigation.display-dynamic-organization-identity",
  "#team-project": "settings-sharing-access.filter-reports-by-project",
  "[data-open-shared]": "settings-sharing-access.open-server-reports",
  "#publish-current": "settings-sharing-access.publish-reports",
  "#save-browser-history":
    "settings-sharing-access.save-browser-imports-to-the-server",
  "#team-load-more": "settings-sharing-access.load-older-reports",
  ".workspace-settings-page .insight-source":
    "settings-sharing-access.view-connection-status",
  '[data-trend-filter="project"]': "analytics.filter-trends-by-project",
  '[data-trend-filter="environment"]': "analytics.filter-trends-by-environment",
  '[data-trend-filter="branch"]': "analytics.filter-trends-by-branch",
  ".project-branch-list": "projects.view-branch-summaries",
  "[data-open-project-run], [data-project-report]":
    "projects.open-latest-results",
  "#failure-groups": "failed-tests.group-matching-failure-messages",
  "[data-group-test]": "failed-tests.view-affected-tests",
  '[data-comparison-filter="regressions"]': "compare-runs.identify-regressions",
  '[data-comparison-filter="fixed"]': "compare-runs.identify-fixes",
  '[data-comparison-filter="added"], [data-comparison-filter="missing"]':
    "compare-runs.identify-added-and-missing-tests",
  '[data-comparison-filter="stateChanges"], [data-comparison-filter="stillFailing"]':
    "compare-runs.compare-outcome-changes",
  '[data-comparison-filter="slower"], .comparison-table [data-label="Time change"]':
    "compare-runs.compare-test-durations",
  '#appearance-form input[value="light"]':
    "settings-appearance.select-light-mode",
  '#appearance-form input[value="dark"]':
    "settings-appearance.select-dark-mode",
  '#appearance-form input[value="system"]':
    "settings-appearance.follow-system-appearance",
  "#comparison-form": "compare-runs.select-baseline-and-target-reports",
  "#download-comparison": "compare-runs.export-comparison-summaries",
  "#analyze-failure-history":
    "failed-tests.analyze-recurring-failures-across-comparable-imports",
  "#analyze-stability": "flaky-tests.investigate-cross-run-pass-fail-changes",
  "#pdf-mode": "pdf-export-dialog.choose-summary-or-detailed-format",
  "#pdf-failure-search, #pdf-failure-spec":
    "pdf-export-dialog.filter-failure-details",

  "#search": "test-results.search-tests-paths-and-errors",
  "#status": "test-results.filter-by-outcome",
  "#spec-filter": "test-results.filter-by-spec",
  "#specs-view, #tests-view": "test-results.switch-between-spec-and-test-views",
  "#prev, #next": "test-results.paginate-results",
  "[data-project-runs]": "projects.view-active-runs",
  "[data-project-archives]": "projects.view-archived-runs",
  "[data-import-project]":
    "import-report-modal.browse-for-a-json-file|import-report-modal.drag-and-drop-a-json-file",
  "#custom-dashboard": "latest-run.custom-widgets-grouped-by-spec-paths",
};
function elementAccess(element) {
  if (element.dataset.accessView)
    return canAccessView(element.dataset.accessView);
  return (element.dataset.feature || "").split("|").some(hasAccess);
}
function applyFeatureAccess() {
  const titles = {
    "Failure patterns": "analytics.analyze-failure-patterns",
    "Areas to review": "analytics.identify-affected-directories",
    "Test duration distribution": "analytics.view-duration-distributions",
    "Saved-run trends": "analytics.view-saved-run-trends",
    "Retry-based flakiness":
      "flaky-tests.review-explicit-retry-recovery-evidence",
    "Tests with changing outcomes":
      "flaky-tests.investigate-cross-run-pass-fail-changes",
    "Selected report": "report-settings.view-report-information",
    "Data quality":
      "report-settings.review-validation-and-data-quality-warnings",
  };
  document.querySelectorAll("#alternate h2").forEach((heading) => {
    const key = titles[heading.textContent];
    if (key) {
      const card = heading.closest("article");
      if (card) card.dataset.feature = key;
    }
  });
  for (const [selector, feature] of Object.entries(featureSelectors))
    document
      .querySelectorAll(selector)
      .forEach((element) => (element.dataset.feature = feature));
  document
    .querySelectorAll("nav a[data-view]")
    .forEach((element) => (element.dataset.accessView = element.dataset.view));
  document
    .querySelectorAll("[data-archive-run]")
    .forEach(
      (element) =>
        (element.dataset.feature = element.textContent
          .trim()
          .startsWith("Restore")
          ? "projects.restore-runs-with-confirmation"
          : "projects.archive-runs-with-confirmation"),
    );
  document
    .querySelectorAll("[data-user-status]")
    .forEach(
      (element) =>
        (element.dataset.feature = element.textContent
          .trim()
          .startsWith("Restore")
          ? "users.restore-users"
          : "users.deactivate-users"),
    );
  document.body.classList.toggle(
    "limited-workspace-identity",
    !hasAccess(
      "organization-project-navigation.display-dynamic-organization-identity",
    ),
  );
  document.body.classList.toggle(
    "limited-mobile-navigation",
    !hasAccess(
      "organization-project-navigation.use-responsive-mobile-navigation",
    ),
  );
  const quickNav = document.querySelector("#role-mobile-navigation");
  if (quickNav) {
    const choices = [
      ["runs", "Latest run"],
      ["results", "Test results"],
      ["failures", "Failed tests"],
      ["history", "Import history"],
      ["compare", "Compare runs"],
      ["analytics", "Analytics"],
      ["flaky", "Flaky tests"],
      ["projects", "Projects"],
      ["profile", "My profile"],
      ["users", "Users"],
      ["workspace-settings", "Settings"],
      ["settings", "Report settings"],
      ["integrations", "Integration"],
      ["role-access", "Role access"],
    ].filter(([id]) => canAccessView(id));
    const signature = JSON.stringify(choices);
    if (quickNav.dataset.accessSignature !== signature) {
      quickNav.replaceChildren(
        ...choices.map(([id, name]) => {
          const option = document.createElement("option");
          option.value = id;
          option.textContent = name;
          return option;
        }),
      );
      quickNav.dataset.accessSignature = signature;
    }
    if (typeof location !== "undefined")
      quickNav.value = location.hash.slice(1) || "runs";
    quickNav.onchange = () => {
      location.hash = quickNav.value;
    };
  }
  document
    .querySelectorAll("[data-feature], [data-access-view]")
    .forEach((element) =>
      element.classList.toggle("access-restricted", !elementAccess(element)),
    );
}
let accessPaintPending = false;
new MutationObserver(() => {
  if (accessPaintPending) return;
  accessPaintPending = true;
  requestAnimationFrame(() => {
    accessPaintPending = false;
    applyFeatureAccess();
  });
}).observe(document.documentElement, { childList: true, subtree: true });
for (const type of ["click", "submit", "change", "drop"])
  document.addEventListener(
    type,
    (event) => {
      const control = event.target.closest?.(
        "[data-feature], [data-access-view]",
      );
      if (control && !elementAccess(control)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showToast("Your role does not have access to this feature.", "warning");
      }
    },
    true,
  );
