import { ThemeSelector } from "./components/ThemeSelector";
import {
  OrganizationList,
  OrganizationCreateForm,
} from "./components/Organizations";
import { ViewBoundary } from "./components/ViewBoundary";
import {
  HistoryTools,
  HistoryEdit,
  TrashList,
  PDFCanvasFrame,
  LegalDocument,
  Avatar,
  SelectOptions,
  AccessDenied,
  CopyReportLink,
} from "./components/UtilityViews";
import { Icon } from "./components/Icon";
import { SharingPage } from "./pages/SharingPage";
import {
  ComparisonForm,
  ComparisonOutput,
  FailureGroups,
  TestTimeline,
  FailureTrends,
  FailureTrendResults,
} from "./components/InvestigationViews";
import { TestDetail, PDFOptions, PDFPreview } from "./components/ReportDialogs";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { FlakyPage } from "./pages/FlakyPage";
import { Message } from "./components/ReportPrimitives";
import { ReportSettingsPage } from "./pages/ReportSettingsPage";
import {
  GroupDashboard,
  GroupWidgetEditor,
  GroupSettingsModal,
  GroupSettingsLauncher,
} from "./components/GroupWidgets";
import {
  SettingsTabs,
  AppearanceSettings,
  GeneralSettings,
  OrganizationSettings,
  ImagePreview,
} from "./pages/WorkspaceSettings";
import { ProjectsPage } from "./pages/ProjectsPage";
import { UsersPage } from "./pages/UsersPage";
import { ProfilePage } from "./pages/ProfilePage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { RoleAccessPage } from "./pages/RoleAccessPage";
import { ProjectAccessPicker } from "./components/ProjectAccessPicker";
import { ProjectEditor } from "./components/ProjectEditor";
import { ResultHeaders, ResultRows } from "./components/ResultRows";
import { TagPicker, ReportTagEditor } from "./components/ReportTags";
import { HistoryBrowser } from "./components/HistoryBrowser";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  RunSummary,
  RunMetrics,
  DashboardWidgets,
  ReportWarnings,
} from "./components/RunDashboard";
const roots = new WeakMap();
function render(selector, component) {
  const host =
    typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!host) throw new Error(`Missing React feature host: ${selector}`);
  let root = roots.get(host);
  if (!root) {
    root = createRoot(host);
    roots.set(host, root);
  }
  flushSync(() => root.render(<ViewBoundary>{component}</ViewBoundary>));
}
let projectEditorKey = 0;
const pageRoots = new Map();
export const applicationBridge = {
  renderOrganizations(host, props) {
    render(host, <OrganizationList {...props} />);
  },
  renderOrganizationCreate(host, props) {
    this.renderPage(host, <OrganizationCreateForm {...props} />);
  },
  clearPage() {
    for (const root of [...pageRoots.values()].reverse()) root.unmount();
    pageRoots.clear();
  },
  renderPage(host, component) {
    for (const [target, root] of [...pageRoots].reverse())
      if (target === host || host.contains(target)) {
        root.unmount();
        pageRoots.delete(target);
      }
    const container = document.createElement("div");
    host.replaceChildren(container);
    const root = createRoot(container);
    pageRoots.set(host, root);
    flushSync(() => root.render(<ViewBoundary>{component}</ViewBoundary>));
  },
  renderSettingsTabs(host, props) {
    this.renderPage(host, <SettingsTabs {...props} />);
  },
  renderTopbarTheme(props) {
    render(
      "#topbar-theme",
      <ThemeSelector key={props.profileId + ":" + props.mode} {...props} />,
    );
  },
  renderAppearance(host, props) {
    this.renderPage(host, <AppearanceSettings {...props} />);
  },
  renderGeneral(host, props) {
    this.renderPage(host, <GeneralSettings {...props} />);
  },
  renderOrganization(host, props) {
    this.renderPage(host, <OrganizationSettings {...props} />);
  },
  renderImage(host, props) {
    this.renderPage(host, <ImagePreview {...props} />);
  },
  renderReportSettings(host, props) {
    this.renderPage(host, <ReportSettingsPage {...props} />);
  },
  renderGroups(host, props) {
    render(
      "#custom-dashboard-content",
      <GroupDashboard
        key={props.profileId + JSON.stringify(props.groups)}
        {...props}
      />,
    );
  },
  renderGroupSettingsLauncher(host, props) {
    this.renderPage(host, <GroupSettingsLauncher {...props} />);
  },
  openGroupSettings(props) {
    if (document.getElementById("custom-widget-settings-dialog")) return;
    const trigger = document.activeElement;
    const host = document.createElement("div");
    document.body.append(host);
    render(
      host,
      <GroupSettingsModal
        {...props}
        onClose={() => {
          roots.get(host)?.unmount();
          roots.delete(host);
          host.remove();
          if (trigger?.isConnected) trigger.focus();
        }}
      />,
    );
  },
  renderGroupEditor(host, props) {
    this.renderPage(host, <GroupWidgetEditor {...props} />);
  },
  renderAnalytics(host, props) {
    this.renderPage(host, <AnalyticsPage {...props} />);
  },
  renderFlaky(host, props) {
    this.renderPage(host, <FlakyPage {...props} />);
  },
  renderMessage(host, props) {
    this.renderPage(host, <Message {...props} />);
  },
  renderTestDetail(host, props) {
    this.renderPage(host, <TestDetail {...props} />);
  },
  renderPDFOptions(host, props) {
    this.renderPage(host, <PDFOptions {...props} />);
  },
  renderPDFPreview(host, props) {
    this.renderPage(host, <PDFPreview {...props} />);
  },
  renderComparisonForm(host, props) {
    this.renderPage(host, <ComparisonForm {...props} />);
  },
  renderComparisonOutput(host, props) {
    this.renderPage(host, <ComparisonOutput {...props} />);
  },
  renderFailureGroups(host, props) {
    this.renderPage(host, <FailureGroups {...props} />);
  },
  renderTestTimeline(host, props) {
    this.renderPage(host, <TestTimeline {...props} />);
  },
  renderFailureTrends(host) {
    this.renderPage(host, <FailureTrends />);
  },
  renderFailureTrendResults(host, props) {
    this.renderPage(host, <FailureTrendResults {...props} />);
  },
  renderSharing(host, props) {
    this.renderPage(host, <SharingPage {...props} />);
  },

  renderHistoryTools(host) {
    this.renderPage(host, <HistoryTools />);
  },
  renderTagPicker(host, props) {
    render(host, <TagPicker key={props.pickerKey} {...props} />);
  },
  renderReportTagEditor(host, props) {
    this.renderPage(host, <ReportTagEditor {...props} />);
  },
  renderHistoryEdit(host, props) {
    this.renderPage(host, <HistoryEdit {...props} />);
  },
  renderTrash(host, props) {
    this.renderPage(host, <TrashList {...props} />);
  },
  renderPDFCanvas(host) {
    this.renderPage(host, <PDFCanvasFrame />);
  },
  renderLegal(host, props) {
    this.renderPage(host, <LegalDocument {...props} />);
  },
  renderAvatar(host, props) {
    render(host, <Avatar {...props} />);
  },
  renderOptions(host, props) {
    render(host, <SelectOptions {...props} />);
  },
  renderIcon(host, name) {
    render(host, <Icon name={name} />);
  },
  renderAccessDenied(host) {
    this.renderPage(host, <AccessDenied />);
  },
  renderCopyLink(host, props) {
    this.renderPage(host, <CopyReportLink {...props} />);
  },
  renderRoleAccess(host, props) {
    this.renderPage(host, <RoleAccessPage {...props} />);
  },
  renderProjects(host, props) {
    this.renderPage(host, <ProjectsPage {...props} />);
  },
  renderUsers(host, props) {
    this.renderPage(host, <UsersPage {...props} />);
  },
  renderProfile(host, props) {
    this.renderPage(host, <ProfilePage {...props} />);
  },
  renderIntegrations(host, props) {
    this.renderPage(host, <IntegrationsPage {...props} />);
  },
  clearReportContent() {
    for (const selector of [
      "#custom-dashboard-content",
      "#run-summary",
      "#metrics",
      "#dashboard-widgets",
      "#data-warnings",
      "#results-head",
      "#results-body",
      "#history-list",
    ])
      render(selector, null);
  },
  renderProjectAccess(props) {
    render("#user-project-access", <ProjectAccessPicker {...props} />);
  },
  openProjectEditor(props) {
    const dialog = document.getElementById("project-editor-dialog");
    render(
      "#project-editor-content",
      <ProjectEditor
        key={++projectEditorKey}
        {...props}
        onClose={() => dialog.close()}
      />,
    );
    if (!dialog.open) dialog.showModal();
  },
  renderResults(props) {
    render("#results-head", <ResultHeaders isTests={props.isTests} />);
    render("#results-body", <ResultRows {...props} />);
  },
  renderHistory(props) {
    render("#history-list", <HistoryBrowser {...props} />);
  },
  renderRunSummary(props) {
    render("#run-summary", <RunSummary {...props} />);
    render("#metrics", <RunMetrics report={props.report} />);
    render(
      "#data-warnings",
      <ReportWarnings warnings={props.report.warnings} />,
    );
  },
  renderDashboard(props) {
    render("#dashboard-widgets", <DashboardWidgets {...props} />);
  },
};
