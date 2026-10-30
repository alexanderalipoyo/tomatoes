function StatusBadge({ status }) {
  return (
    <span className={`status-badge ${status}`}>
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
export function ResultHeaders({ isTests }) {
  return (
    <tr>
      {(isTests
        ? ["Test / spec", "Status", "Duration", "Details"]
        : ["Spec file", "Outcomes", "Test time", "Details"]
      ).map((label) => (
        <th key={label}>{label}</th>
      ))}
    </tr>
  );
}
export function ResultRows({ items, isTests, duration, showTest, openSpec }) {
  if (!items.length)
    return (
      <tr>
        <td colSpan={4} className="empty">
          No results match these filters.
        </td>
      </tr>
    );
  return items.map((item) =>
    isTests ? (
      <tr key={item.id}>
        <td data-label="Test">
          <button
            className="result-link"
            data-test={item.id}
            onClick={() => showTest(Number(item.id))}
          >
            {item.title}
          </button>
          <small>{item.file}</small>
          {item.error && (
            <p className="error-preview">{item.error.slice(0, 180)}</p>
          )}
        </td>
        <td data-label="Status">
          <StatusBadge status={item.status} />
        </td>
        <td className="duration-cell" data-label="Duration">
          {duration(item.duration)}
        </td>
        <td data-label="Details">
          <button
            className="button"
            data-test={item.id}
            onClick={() => showTest(Number(item.id))}
          >
            Inspect
          </button>
        </td>
      </tr>
    ) : (
      <tr key={item.id}>
        <td data-label="Spec">
          <button
            className="result-link"
            data-spec={item.id}
            onClick={() => openSpec(String(item.id))}
          >
            {item.name}
          </button>
          <small>{item.file}</small>
          <small>{item.counts.total.toLocaleString("en-US")} tests</small>
        </td>
        <td data-label="Outcomes">
          <div className="spec-outcomes">
            {["passed", "failed", "pending", "skipped"]
              .filter((status) => item.counts[status])
              .map((status) => (
                <span
                  key={status}
                  className={`status-badge ${status}`}
                  title={status}
                >
                  {item.counts[status]} {status}
                </span>
              ))}
            {Boolean(item.counts.unknown) && <StatusBadge status="unknown" />}
            {!item.counts.total && <StatusBadge status="empty" />}
          </div>
        </td>
        <td className="duration-cell" data-label="Duration">
          {duration(item.duration)}
        </td>
        <td data-label="Details">
          <button
            className="button"
            data-spec={item.id}
            onClick={() => openSpec(String(item.id))}
          >
            View tests
          </button>
        </td>
      </tr>
    ),
  );
}
