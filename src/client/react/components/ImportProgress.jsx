export function ImportProgress() {
  return (
    <dialog
      id="import-progress"
      className="import-progress"
      aria-labelledby="progress-title"
      aria-describedby="progress-stage"
      tabIndex="-1"
    >
      <div className="loading-spinner" aria-hidden="true"></div>
      <h2 id="progress-title">{"Preparing your report"}</h2>
      <p id="progress-stage" role="status" aria-live="polite">
        {" Reading report file "}
      </p>
      <progress
        id="render-progress"
        max="100"
        value="0"
        aria-label="Report processing progress"
      ></progress>
      <div className="progress-caption">
        <span id="progress-percent">{"0%"}</span>
        <span>{"Please wait until rendering finishes"}</span>
      </div>
    </dialog>
  );
}
