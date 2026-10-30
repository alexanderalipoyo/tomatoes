import { useEffect, useRef, useState } from "react";
export function ProjectEditor({ project, onSave, onClose }) {
  const [name, setName] = useState(project?.name || ""),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [another, setAnother] = useState(false);
  const busy = useRef(false),
    input = useRef(null);
  useEffect(() => {
    if (!pending) input.current?.focus();
  }, [pending]);
  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    if (!name.trim()) {
      setError("Enter a project name.");
      return;
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const saved = await onSave(name.trim());
      if (!project && another) setName("");
      else onClose();
      globalThis.showToast?.(
        project
          ? "Project renamed. Existing runs remain linked."
          : `Project “${saved.name}” created.`,
        "success",
      );
    } catch (reason) {
      setError(reason.message || "Project could not be saved.");
      globalThis.showToast?.(
        reason.message || "Project could not be saved.",
        "error",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <form className="project-editor-form" onSubmit={submit} aria-busy={pending}>
      <span className="eyebrow">ORGANIZATION PROJECTS</span>
      <h2 id="project-editor-title">
        {project ? "Rename project" : "Create a new project"}
      </h2>
      <p>
        {project
          ? "Give this project a new name. Existing reports, links, branches, and access stay connected."
          : "Keep related runs together in a dedicated project for your team."}
      </p>
      <fieldset disabled={pending}>
        <legend className="visually-hidden">Project details</legend>
        <label htmlFor="project-editor-name">Project name</label>
        <input
          ref={input}
          id="project-editor-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
          autoFocus
          placeholder="e.g. Customer portal"
          autoComplete="off"
          aria-describedby="project-editor-help"
        />
        <p id="project-editor-help">
          Choose a clear, unique name. You can rename it later.
        </p>
        {!project && (
          <label className="project-create-another">
            <input
              type="checkbox"
              checked={another}
              onChange={(event) => setAnother(event.target.checked)}
            />
            Create another after saving
          </label>
        )}
      </fieldset>
      {error && (
        <p className="notice data-warning" role="alert">
          {error}
        </p>
      )}
      <div className="project-editor-actions">
        <button
          className="button"
          type="button"
          onClick={onClose}
          disabled={pending}
        >
          Cancel
        </button>
        <button
          className="button primary"
          type="submit"
          disabled={pending || !name.trim() || project?.name === name.trim()}
        >
          {pending ? "Saving…" : project ? "Save name" : "Create project"}
        </button>
      </div>
    </form>
  );
}
export function ProjectEditorDialog() {
  return (
    <dialog
      id="project-editor-dialog"
      className="project-editor-dialog"
      aria-labelledby="project-editor-title"
      onCancel={(event) => {
        if (event.currentTarget.querySelector('[aria-busy="true"]'))
          event.preventDefault();
      }}
    >
      <div id="project-editor-content" />
    </dialog>
  );
}
