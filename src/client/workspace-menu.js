/* Floating workspace switcher; account mutations still use the authenticated API. */
(function () {
  const menu = document.querySelector("#workspace-menu");
  let trigger = null;
  function close() {
    if (menu.matches(":popover-open")) menu.hidePopover();
  }
  document.querySelectorAll("[data-workspace-trigger]").forEach((button) => {
    button.addEventListener("click", () => {
      trigger = button;
      const host = button.closest("dialog") || document.body;
      if (menu.parentElement !== host) host.append(menu);
    });
  });
  menu.addEventListener("beforetoggle", (event) => {
    if (event.newState !== "open") return;
    renderWorkspaceIdentity();
    const anchor =
      trigger ||
      document.querySelector(
        "[data-workspace-trigger]:not(.mobile-workspace-identity)",
      );
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(304, document.documentElement.clientWidth - 16);
    const height = Math.min(450, innerHeight - 16);
    menu.style.left =
      Math.max(
        8,
        Math.min(
          rect.left - 8,
          document.documentElement.clientWidth - width - 8,
        ),
      ) + "px";
    menu.style.top =
      Math.max(8, Math.min(rect.top, innerHeight - height - 8)) + "px";
  });
  menu.addEventListener("toggle", () => {
    const open = menu.matches(":popover-open");
    document
      .querySelectorAll("[data-workspace-trigger]")
      .forEach((button) => button.setAttribute("aria-expanded", String(open)));
  });
  window.addEventListener("resize", close);
  window.addEventListener("hashchange", close);
  document.querySelector("#workspace-menu-current").onclick = close;
  menu.querySelectorAll("[data-workspace-menu-link]").forEach((link) => {
    link.onclick = () => {
      close();
      showToast(
        "Manage project workspaces through Settings > Sharing & access. Organization creation is not available yet.",
        "info",
      );
    };
  });
  document.querySelector("#workspace-menu-profile").onclick = () => {
    close();
    location.hash = "profile";
  };
  document.querySelector("#workspace-menu-sign-out").onclick = async (
    event,
  ) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const status = await teamRequest("/api/team/status");
      if (!status.enabled || !status.authenticated) {
        close();
        showToast(
          status.enabled
            ? "You are already signed out."
            : "This local workspace does not require sign-in.",
          "info",
        );
        return;
      }
      teamState = status;
      await teamRequest("/api/logout", { method: "POST", body: "{}" });
      teamState = null;
      close();
      await initializeAuth();
      await reloadUserPreferences();
      location.hash = "login";
      navigate();
      showToast("Signed out.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  };
  let policyRequest = null;
  const detail = document.querySelector("#detail");
  detail.addEventListener("close", () => policyRequest?.abort());
  menu.querySelectorAll("[data-workspace-policy]").forEach((button) => {
    button.onclick = async () => {
      close();
      policyRequest?.abort();
      const request = new AbortController();
      policyRequest = request;
      const terms = button.dataset.workspacePolicy === "terms";
      const title = terms ? "Terms of Use" : "Privacy Policy";
      const url = `/legal/${terms ? "terms-of-use" : "privacy-policy"}.sample.md`;
      const content = document.querySelector("#detail-content");
      content.innerHTML = `<article class="legal-document" aria-busy="true"><h2 id="detail-title">${title}</h2><p role="status">Loading sample document…</p></article>`;
      detail.showModal();
      try {
        const response = await fetch(url, {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
        });
        if (!response.ok) throw new Error("Document unavailable");
        const markdown = await response.text();
        if (request.signal.aborted || !detail.open) return;
        const blocks = markdown.trim().split(/\r?\n\s*\r?\n/);
        content.innerHTML = `<article class="legal-document">${blocks
          .map((block, index) => {
            if (index === 0)
              return `<h2 id="detail-title">${esc(block.replace(/^# /, ""))}</h2>`;
            if (block.startsWith("## "))
              return `<h3>${esc(block.slice(3))}</h3>`;
            return `<p${index === 1 ? ' class="legal-sample-notice"' : ""}>${esc(block)}</p>`;
          })
          .join(
            "",
          )}<a class="legal-download" href="${url}" download>Download sample document (.md)</a></article>`;
      } catch (error) {
        if (request.signal.aborted || !detail.open) return;
        content.innerHTML = `<article class="legal-document"><h2 id="detail-title">${title}</h2><p role="alert">We couldn’t load this sample document. Close this window and try again.</p></article>`;
      }
    };
  });
})();
