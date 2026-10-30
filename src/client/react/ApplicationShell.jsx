import { ProjectEditorDialog } from "./components/ProjectEditor";
import { Sidebar } from "./components/Sidebar.jsx";
import { Topbar } from "./components/Topbar.jsx";
import { RunOverview } from "./components/RunOverview.jsx";
import { CustomDashboard } from "./components/CustomDashboard.jsx";
import { ResultsTable } from "./components/ResultsTable.jsx";
import { ImportHistory } from "./components/ImportHistory.jsx";
import { WorkspaceMenu } from "./components/WorkspaceMenu.jsx";
import { MobileNavigation } from "./components/MobileNavigation.jsx";
import { ImportDialog } from "./components/ImportDialog.jsx";
import { ImportProgress } from "./components/ImportProgress.jsx";
import { ToastHost } from "./components/ToastHost.jsx";
// Static shell mounts once. Existing controllers own only the empty feature hosts.
export function ApplicationShell() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        {"Skip to content"}
      </a>
      <Sidebar />
      <div className="shell">
        <Topbar />
        <main id="main-content" tabIndex="-1">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{"TOMATOES TEST RESULTS"}</div>
              <h1 id="page-title">{"Latest run"}</h1>
              <p id="page-description">{"Results from your imported run."}</p>
            </div>
            <div className="heading-actions">
              <button className="button" id="refresh">
                <span data-icon="refresh"></span>
                {"Reload"}
              </button>
              <button
                className="button primary"
                id="import-report"
                aria-haspopup="dialog"
                aria-controls="import-dialog"
              >
                <span data-icon="plus"></span>
                {"Import report "}
              </button>
            </div>
          </div>
          <div id="load-state" className="notice" role="alert">
            {" Loading latest run… "}
          </div>
          <div
            id="history-notice"
            className="notice data-warning"
            role="status"
            hidden
          ></div>
          <div id="report-content" hidden>
            <RunOverview />
            <CustomDashboard />
            <section
              id="failure-groups"
              aria-label="Grouped failures"
              hidden
            ></section>
            <ResultsTable />
            <section id="alternate" hidden></section>
          </div>
          <ImportHistory />
          <footer>
            <span>{"Local Mochawesome report"}</span>
            <span>
              Made by{" "}
              <a
                className="creator-link"
                href="https://github.com/alexanderalipoyo"
                target="_blank"
                rel="noopener noreferrer"
              >
                Alex Ali
              </a>
            </span>
            <span id="report-footer">{"Awaiting results"}</span>
          </footer>
        </main>
      </div>
      <WorkspaceMenu />
      <MobileNavigation />
      <ImportDialog />
      <dialog
        id="integration-setup"
        className="integration-setup"
        aria-labelledby="integration-setup-title"
      ></dialog>
      <dialog id="detail" aria-labelledby="detail-title">
        <button className="dialog-close icon-button" aria-label="Close dialog">
          {" × "}
        </button>
        <div id="detail-content"></div>
      </dialog>
      <ProjectEditorDialog />
      <ImportProgress />
      <ToastHost />
    </>
  );
}
