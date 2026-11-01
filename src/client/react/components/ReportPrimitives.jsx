export function Badge({ status = "unknown", label }) {
  return (
    <span className={`status-badge ${status}`}>
      {label || status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
export function Metric({ label, value, note, feature }) {
  return (
    <article className="insight-metric" data-feature={feature}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
export function Message({ title, message, error = false }) {
  return (
    <article className="settings-card">
      {title && <h2>{title}</h2>}
      <p role={error ? "alert" : "status"}>{message}</p>
    </article>
  );
}
