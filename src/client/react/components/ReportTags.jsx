import { useState } from "react";
import Data from "../../../shared/report-data";
export function TagPicker({
  inputId,
  initialTags = [],
  suggestions = [],
  required = false,
  disabled = false,
  onChange,
}) {
  const [tags, setTags] = useState(initialTags),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [active, setActive] = useState(-1);
  const matches = suggestions
    .filter(
      (tag) =>
        !tags.some((value) => value.toLowerCase() === tag.toLowerCase()) &&
        tag.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .slice(0, 20);
  function add(value) {
    try {
      const canonical =
        suggestions.find(
          (tag) => tag.toLowerCase() === value.trim().toLowerCase(),
        ) || value;
      const next = Data.normalizeTags([...tags, canonical]);
      setTags(next);
      onChange?.(next);
      setQuery("");
      setError("");
      setActive(-1);
    } catch (reason) {
      setError(reason.message);
    }
  }
  return (
    <div className="report-tag-picker">
      <label htmlFor={inputId + "-search"}>
        Tags{required ? " (required)" : ""}
      </label>
      <input type="hidden" id={inputId} value={JSON.stringify(tags)} />
      <div className="report-tag-selected" aria-label="Selected tags">
        {tags.map((tag) => (
          <span className="report-tag" key={tag}>
            <span>{tag}</span>
            <button
              type="button"
              disabled={disabled}
              aria-label={"Remove tag " + tag}
              onClick={() => {
                const next = tags.filter((value) => value !== tag);
                setTags(next);
                onChange?.(next);
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="report-tag-entry">
        <input
          id={inputId + "-search"}
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-controls={inputId + "-options"}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 && matches[active]
              ? inputId + "-option-" + active
              : undefined
          }
          aria-required={required}
          aria-describedby={inputId + "-hint"}
          placeholder="Search existing tags or enter a new tag"
          maxLength={50}
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && matches.length) {
              event.preventDefault();
              setActive((index) => (index + 1) % matches.length);
            }
            if (event.key === "ArrowUp" && matches.length) {
              event.preventDefault();
              setActive(
                (index) => (index - 1 + matches.length) % matches.length,
              );
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (active >= 0 && matches[active]) add(matches[active]);
              else if (query.trim()) add(query);
            }
          }}
        />
        <button
          className="button"
          type="button"
          disabled={disabled || !query.trim()}
          onClick={() => add(query)}
        >
          Add tag
        </button>
      </div>
      <div
        role="listbox"
        aria-label="Existing tags"
        id={inputId + "-options"}
        className="report-tag-options"
      >
        {matches.map((tag, index) => (
          <button
            type="button"
            role="option"
            aria-selected={active === index}
            disabled={disabled}
            id={inputId + "-option-" + index}
            key={tag}
            onClick={() => add(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
      <p id={inputId + "-hint"} className="widget-footnote">
        Choose an existing tag or type a new one and select Add tag. Up to 10
        tags, 50 characters each.
      </p>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </div>
  );
}
export function ReportTags({ tags = [] }) {
  return (
    <div className="report-tags" aria-label="Report tags">
      {tags.length ? (
        tags.map((tag) => (
          <span className="report-tag" key={tag}>
            {tag}
          </span>
        ))
      ) : (
        <span className="widget-footnote">No tags</span>
      )}
    </div>
  );
}
export function ReportTagEditor({
  entry,
  suggestions,
  save,
  onSaved,
  onCancel,
  onError,
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="report-tag-editor">
      <div className="dialog-heading">
        <span className="eyebrow">REPORT ORGANIZATION</span>
        <h2 id="detail-title">Edit report tags</h2>
        <p className="report-tag-source">{entry.label || entry.name}</p>
      </div>
      <form
        aria-busy={pending}
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending) return;
          setPending(true);
          setError("");
          try {
            const tags = Data.normalizeTags(
              JSON.parse(
                event.currentTarget.querySelector('[type="hidden"]').value,
              ),
              true,
            );
            try {
              await save(tags);
            } catch (reason) {
              onError?.(reason.message);
              throw reason;
            }
            onSaved();
          } catch (reason) {
            setError(reason.message);
          } finally {
            setPending(false);
          }
        }}
      >
        <TagPicker
          inputId="edit-report-tags"
          initialTags={entry.metadata?.tags || []}
          suggestions={suggestions}
          required
          disabled={pending}
          onChange={() => setError("")}
        />
        <div className="report-tag-actions">
          <span className="widget-footnote">Changes apply to this report.</span>
          <div>
            <button
              type="button"
              className="button"
              disabled={pending}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button className="button primary" disabled={pending}>
              {pending ? "Saving..." : "Save tags"}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
