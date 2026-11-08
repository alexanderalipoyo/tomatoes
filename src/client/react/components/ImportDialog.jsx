import { Icon } from "./Icon";

export function ImportDialog() {
  return (
    <>
      <dialog
        id="import-dialog"
        aria-labelledby="import-title"
        aria-describedby="import-description"
      >
        <button
          className="icon-button import-dialog-close"
          id="close-import"
          aria-label="Close import dialog"
        >
          {" × "}
        </button>
        <span className="eyebrow">{"BRING YOUR RESULTS"}</span>
        <h2 id="import-title">{"Import report"}</h2>
        <p id="import-description">
          {" Add your latest Mochawesome JSON report to Tomatoes. "}
        </p>
        <input
          type="file"
          accept=".json,application/json"
          id="report-file"
          hidden
        />
        <div className="import-branch-fields import-project-fields">
          <label htmlFor="import-project">Project (required)</label>
          <select
            id="import-project"
            required
            aria-describedby="import-project-hint"
          >
            <option value="">Select a project</option>
          </select>
          <p id="import-project-hint">Choose a project for this import.</p>
        </div>
        <div className="import-branch-fields">
          <label htmlFor="import-branch">{"Branch (required)"}</label>
          <select
            id="import-branch"
            required
            aria-describedby="import-branch-hint"
          >
            <option value="">{"Select a branch"}</option>
            <option value="__new__">{"Create a new branch..."}</option>
          </select>
          <div id="import-new-branch-field" hidden>
            <label htmlFor="import-new-branch">{"New branch name"}</label>
            <input
              id="import-new-branch"
              type="text"
              maxLength="160"
              placeholder="e.g. feature/login-tests"
              autoComplete="off"
            />
          </div>
          <p id="import-branch-hint" role="status">
            {
              " Choose a previous branch or add a new one before selecting your file. "
            }
          </p>
        </div>
        <div id="import-tags-host" />
        <div className="report-drop-zone" id="report-drop-zone">
          <svg
            className="import-upload-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"></path>
          </svg>
          <h3>{"Drag & drop your report here"}</h3>
          <p>{"or choose a file from your device"}</p>
          <button className="button primary" id="browse-report" autoFocus>
            {" Browse files "}
          </button>
          <small>{"One .json report at a time · Up to 50 MB"}</small>
        </div>
        <div id="import-selected-file" className="import-selection" hidden>
          <p>
            Selected file: <strong id="import-selected-name" />
          </p>
          <button className="button primary" id="review-import">
            Review import
          </button>
        </div>
        <p
          className="notice data-warning"
          id="import-selection-error"
          role="alert"
          hidden
        ></p>
        <p className="import-hint">
          {
            " We check the format before saving. Your previous report stays available if the file is invalid. "
          }
        </p>
      </dialog>
      <dialog
        id="import-confirm-dialog"
        aria-labelledby="import-confirm-title"
        aria-describedby="import-confirm-description"
      >
        <header className="import-confirm-heading">
          <span className="import-confirm-icon">
            <Icon name="check" />
          </span>
          <div>
            <span className="import-confirm-eyebrow">ONE LAST CHECK</span>
            <h2 id="import-confirm-title">Ready to import?</h2>
            <p id="import-confirm-description">
              Make sure this report is going to the right place.
            </p>
          </div>
        </header>
        <dl className="import-confirm-details">
          <div className="import-confirm-file-card">
            <dt>
              <Icon name="runs" /> JSON report
            </dt>
            <dd id="import-confirm-file" />
          </div>
          <div>
            <dt>
              <Icon name="folder" /> Project
            </dt>
            <dd id="import-confirm-project" />
          </div>
          <div>
            <dt>
              <Icon name="branch" /> Branch
            </dt>
            <dd id="import-confirm-branch" />
          </div>
          <div className="import-confirm-tags-row">
            <dt>Tags</dt>
            <dd id="import-confirm-tags" />
          </div>
        </dl>
        <footer className="import-confirm-footer">
          <p>
            Need to change something? Cancel keeps your file and selections.
          </p>
          <div className="import-confirm-actions">
            <button className="button" id="cancel-import-confirm" autoFocus>
              Cancel &amp; edit
            </button>
            <button className="button primary" id="proceed-import">
              Proceed with import
            </button>
          </div>
        </footer>
      </dialog>
    </>
  );
}
