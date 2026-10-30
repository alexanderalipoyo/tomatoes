export function ImportHistory() {
  return (
    <section id="history-section" aria-label="Import history" hidden>
      <div className="history-heading">
        <div>
          <h2>{"Saved reports"}</h2>
          <p>
            {
              " Open any previous import to revisit its dashboard and test details. "
            }
          </p>
        </div>
        <div className="history-heading-actions">
          <span id="history-total"></span>
          <button className="button" id="load-bundled">
            {" Open bundled report "}
          </button>
        </div>
      </div>
      <div id="history-list"></div>
      <p className="notice history-storage-note">
        {
          " Saved locally in this browser. Clearing site data removes saved imports. Reports imported before history was added need to be imported again. "
        }
      </p>
    </section>
  );
}
