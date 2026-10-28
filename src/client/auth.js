/* Full-page sign-in and local password recovery. Passwords are never cached. */
let authStatus = null;
let authRenderVersion = 0;
async function authRequest(route, options) {
  try {
    return await teamRequest(route, {
      ...options,
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (["TimeoutError", "AbortError"].includes(error.name))
      throw new Error(
        "The request timed out. Try again. If you were resetting your password, try signing in before requesting another link.",
      );
    throw error;
  }
}
let authReturnHash = "runs";
function authRoute() {
  return location.hash.slice(1).split("?")[0];
}
function isAuthRoute() {
  return ["login", "forgot-password", "reset-password"].includes(authRoute());
}
function authRequiresLogin() {
  return Boolean(authStatus?.enabled && !authStatus.authenticated);
}
async function initializeAuth() {
  try {
    authStatus = await teamRequest("/api/team/status", {
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    authStatus = {
      enabled: true,
      authenticated: false,
      error: "Could not connect to Tomatoes. Check the server and try again.",
    };
  }
  syncLogoutControl();
  document.body.classList.remove("auth-checking");
  return authStatus;
}
function authSessionExpired() {
  if (!authStatus?.enabled || authRequiresLogin()) return;
  authStatus = { ...authStatus, authenticated: false };
  syncLogoutControl();
  renderAuthScreen("Your session has ended. Please sign in again.");
}
function syncLogoutControl() {
  const button = document.querySelector("#topbar-logout");
  if (button)
    button.hidden = !(authStatus?.enabled && authStatus.authenticated);
}
function hideAuthScreen() {
  document.body.classList.remove("auth-mode");
  const screen = document.querySelector("#auth-screen");
  if (screen) screen.hidden = true;
}
function renderAuthScreen(message = "") {
  const version = ++authRenderVersion;
  if (!isAuthRoute()) authReturnHash = location.hash.slice(1) || "runs";
  document.body.classList.add("auth-mode");
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  const popover = document.querySelector("#workspace-menu");
  if (popover?.matches(":popover-open")) popover.hidePopover();
  let screen = document.querySelector("#auth-screen");
  if (!screen) {
    screen = document.createElement("main");
    screen.id = "auth-screen";
    document.body.append(screen);
  }
  screen.hidden = false;
  const route = isAuthRoute() ? authRoute() : "login";
  const reset = route === "reset-password",
    forgot = route === "forgot-password";
  const title = reset
    ? "Set a new password"
    : forgot
      ? "Forgot your password?"
      : "Welcome to Tomatoes";
  screen.innerHTML = `<section class="auth-card" aria-labelledby="auth-title"><a class="auth-brand" href="#login"><img src="/assets/tomatoes-logo.svg" alt="" width="40" height="40"/><span>tomatoes<small>TEST REPORTING</small></span></a><h1 id="auth-title">${title}</h1><p>${reset ? "Choose a strong password to secure your account." : forgot ? (authStatus?.recoveryDelivery === "local" ? "Enter your account email to request a reset link in the local recovery inbox." : "Enter your account email to request a password-reset email.") : "Sign in to your workspace to explore your test results."}</p><form id="auth-form">${reset ? '<label>New password<input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="256" required aria-describedby="auth-password-help"/></label><p class="auth-help" id="auth-password-help">Use 12–256 characters.</p><label>Confirm password<input type="password" name="confirm" autocomplete="new-password" minlength="12" maxlength="256" required/></label>' : `<label>${forgot ? "Account email" : "Email or username"}<input type="${forgot ? "email" : "text"}" name="email" autocomplete="username" maxlength="254" required placeholder="you@example.com"/></label>${forgot ? "" : '<label>Password<input type="password" name="password" autocomplete="current-password" maxlength="256" required/></label>'}`}<p id="auth-error" role="alert">${esc(message || authStatus?.error || "")}</p><p id="auth-feedback" role="status"></p><button class="button primary" type="submit">${reset ? "Reset password" : forgot ? "Request reset link" : "Sign in"}</button></form>${forgot || reset ? '<a class="auth-link" href="#login">Back to sign in</a>' : '<a class="auth-link" href="#forgot-password">Forgot password?</a>'}${reset ? '<a class="auth-link" href="#forgot-password">Request a new reset link</a>' : ""}<p class="auth-footer">Your reports. Your workspace.</p></section>`;
  const form = screen.querySelector("form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (form.inert) return;
    const fields = new FormData(form),
      button = form.querySelector('button[type="submit"]'),
      original = button.textContent;
    const error = screen.querySelector("#auth-error"),
      feedback = screen.querySelector("#auth-feedback");
    error.textContent = "";
    feedback.textContent = "";
    if (reset && fields.get("password") !== fields.get("confirm")) {
      error.textContent = "Passwords do not match.";
      form.querySelector('[name="confirm"]').focus();
      return;
    }
    form.inert = true;
    button.disabled = true;
    button.textContent = forgot
      ? "Preparing link…"
      : reset
        ? "Updating password…"
        : "Signing in…";
    form.setAttribute("aria-busy", "true");
    try {
      if (forgot) {
        const result = await authRequest("/api/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: fields.get("email").trim() }),
        });
        if (version !== authRenderVersion) return;
        feedback.textContent = result.message;
        if (result.delivery === "local")
          feedback.insertAdjacentHTML(
            "beforeend",
            '<div class="auth-recovery-help"><strong>Open the private recovery inbox</strong><p>On this computer, run the following from the Tomatoes folder, replacing YOUR_EMAIL with your account email. Open the link it displays.</p><code>node scripts/password-recovery.js YOUR_EMAIL</code><p>No email is sent. Only someone with access to this computer can retrieve the link.</p></div>',
          );
      } else if (reset) {
        const token = new URLSearchParams(
          location.hash.split("?")[1] || "",
        ).get("token");
        await authRequest("/api/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password: fields.get("password") }),
        });
        if (version !== authRenderVersion) return;
        form.reset();
        authStatus = { ...authStatus, authenticated: false };
        history.replaceState(null, "", location.pathname + "#login");
        renderAuthScreen("Password updated. Sign in with your new password.");
        showToast("Password updated successfully.", "success");
      } else {
        await authRequest("/api/login", {
          method: "POST",
          body: JSON.stringify({
            username: fields.get("email").trim(),
            password: fields.get("password"),
          }),
        });
        if (version !== authRenderVersion) return;
        form.reset();
        await initializeAuth();
        if (!authStatus.authenticated)
          throw new Error("Could not confirm your session. Please try again.");
        if (version !== authRenderVersion) return;
        teamState = authStatus;
        await reloadUserPreferences();
        try {
          await refreshHistory();
        } catch (reason) {
          historyNotice(
            `Could not load import history: ${reason.message}`,
            "error",
          );
        }
        if (version !== authRenderVersion) return;
        hideAuthScreen();
        const url = new URL(location.href);
        url.hash = authReturnHash;
        history.replaceState(null, "", url);
        await navigateReportLocation();
        showToast("Signed in successfully.", "success");
      }
    } catch (reason) {
      if (version === authRenderVersion) error.textContent = reason.message;
    } finally {
      form.inert = false;
      button.disabled = false;
      button.textContent = original;
      form.setAttribute("aria-busy", "false");
    }
  };
}
