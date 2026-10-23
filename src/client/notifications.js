/* Transaction notifications stay visible above dialogs without moving keyboard focus. */
(function () {
  const host = document.getElementById("toast");
  const message = document.getElementById("toast-message");
  const glyph = document.getElementById("toast-icon");
  let timer;
  let pending = null;
  let previousFocus;
  let lifetime = 6000;
  function hideToast() {
    clearTimeout(timer);
    host.classList.remove("visible");
    if (host.matches(":popover-open")) host.hidePopover();
    if (host.contains(document.activeElement) && previousFocus?.isConnected)
      previousFocus.focus();
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(hideToast, lifetime);
  }
  function showToast(text, type = "success") {
    if (!text) return;
    if (document.getElementById("import-progress").open) {
      const priority = { success: 0, info: 1, warning: 2, error: 3 };
      if (!pending || priority[type] >= priority[pending[1]])
        pending = [text, type];
      return;
    }
    hideToast();
    previousFocus = document.activeElement;
    host.dataset.type = ["success", "error", "warning", "info"].includes(type)
      ? type
      : "info";
    glyph.textContent = { success: "✓", error: "!", warning: "!", info: "i" }[
      host.dataset.type
    ];
    message.textContent = text;
    // Keep notification controls inside the active modal's interactive subtree.
    const target = document.querySelector("dialog:modal") || document.body;
    if (host.parentElement !== target) target.append(host);
    host.showPopover();
    host.classList.add("visible");
    lifetime = type === "error" || type === "warning" ? 10000 : 6000;
    schedule();
  }
  document.getElementById("dismiss-toast").onclick = hideToast;
  host.addEventListener("mouseenter", () => clearTimeout(timer));
  host.addEventListener("mouseleave", schedule);
  host.addEventListener("focusin", () => clearTimeout(timer));
  host.addEventListener("focusout", schedule);
  document.getElementById("import-progress").addEventListener("close", () => {
    if (!pending) return;
    const next = pending;
    pending = null;
    showToast(...next);
  });
  document.querySelectorAll("dialog").forEach((dialog) =>
    dialog.addEventListener("close", () => {
      if (host.parentElement !== dialog) return;
      const visible = host.classList.contains("visible");
      if (host.matches(":popover-open")) host.hidePopover();
      document.body.append(host);
      if (visible) {
        host.showPopover();
        schedule();
      }
    }),
  );
  globalThis.showToast = showToast;
})();
