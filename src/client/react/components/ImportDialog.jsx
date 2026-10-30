export function ImportDialog() {
  return (
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
        <label htmlFor="import-project">Project</label>
        <select id="import-project" aria-describedby="import-project-hint">
          <option value="__report__">Use project from report</option>
        </select>
        <p id="import-project-hint">Choose a project for this import.</p>
      </div>
      <div className="import-branch-fields">
        <label htmlFor="import-branch">{"Branch"}</label>
        <select id="import-branch" aria-describedby="import-branch-hint">
          <option value="__report__">{"Use branch from report"}</option>
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
  );
}
