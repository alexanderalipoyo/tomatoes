import { useState } from "react";
import { HistoryCards } from "./HistoryCards";

export function HistoryBrowser({ entries, ...props }) {
  const [branch, setBranch] = useState("");
  const [tag, setTag] = useState("");
  const branches = [
    ...new Set(entries.map((entry) => entry.metadata?.branch).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const tags = [
    ...new Map(
      entries
        .flatMap((entry) => entry.metadata?.tags || [])
        .map((value) => [value.toLowerCase(), value]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const filtered = entries.filter(
    (entry) =>
      (!branch ||
        (branch === "null"
          ? !entry.metadata?.branch
          : entry.metadata?.branch === JSON.parse(branch))) &&
      (!tag ||
        (tag === "null"
          ? !entry.metadata?.tags?.length
          : entry.metadata?.tags?.some(
              (value) => value.toLowerCase() === JSON.parse(tag),
            ))),
  );
  const reset = () => {
    setBranch("");
    setTag("");
  };
  return (
    <>
      <div
        className="history-filters"
        role="group"
        aria-label="Filter import history"
      >
        <label htmlFor="history-branch-filter">
          Branch
          <select
            id="history-branch-filter"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
          >
            <option value="">All branches</option>
            {entries.some((entry) => !entry.metadata?.branch) && (
              <option value="null">No branch</option>
            )}
            {branches.map((value) => (
              <option key={value} value={JSON.stringify(value)}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="history-tag-filter">
          Tag
          <select
            id="history-tag-filter"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
          >
            <option value="">All tags</option>
            {entries.some((entry) => !entry.metadata?.tags?.length) && (
              <option value="null">No tags</option>
            )}
            {tags.map(([key, value]) => (
              <option key={key} value={JSON.stringify(key)}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button"
          disabled={!branch && !tag}
          onClick={reset}
        >
          Reset filters
        </button>
      </div>
      <p className="history-filter-count" role="status">
        Showing {filtered.length} of {entries.length} saved reports
      </p>
      {entries.length && !filtered.length ? (
        <div className="history-empty">
          <h3>No reports match these filters</h3>
          <p>
            Choose another branch or tag, or reset the filters to see all saved
            reports.
          </p>
          <button type="button" className="button" onClick={reset}>
            Show all reports
          </button>
        </div>
      ) : (
        <HistoryCards {...props} entries={filtered} latestId={entries[0]?.id} />
      )}
    </>
  );
}
