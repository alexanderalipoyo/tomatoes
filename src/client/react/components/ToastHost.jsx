export function ToastHost() {
  return (
    <div
      id="toast"
      popover="manual"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span id="toast-icon" aria-hidden="true"></span>
      <span id="toast-message"></span>
      <button
        id="dismiss-toast"
        type="button"
        aria-label="Dismiss notification"
      >
        {" × "}
      </button>
    </div>
  );
}
