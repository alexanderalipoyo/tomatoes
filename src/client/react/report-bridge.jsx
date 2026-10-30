import { ProjectAccessPicker } from "./components/ProjectAccessPicker";
import { ProjectEditor } from "./components/ProjectEditor";
import { ResultHeaders, ResultRows } from "./components/ResultRows";
import { HistoryCards } from "./components/HistoryCards";
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
  const host = document.querySelector(selector);
  if (!host) throw new Error(`Missing React feature host: ${selector}`);
  let root = roots.get(host);
  if (!root) {
    root = createRoot(host);
    roots.set(host, root);
  }
  flushSync(() => root.render(component));
}
let projectEditorKey = 0;
export const dashboardBridge = {
  clearReportContent() {
    for (const selector of [
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
    render("#history-list", <HistoryCards {...props} />);
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
