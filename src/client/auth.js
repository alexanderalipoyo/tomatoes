function canAccessBrowserImport(entry) {
  return ProjectAccess.allowed(entry, authStatus);
}
/* Full-page sign-in and local password recovery. Passwords are never cached. */
let authStatus = null;
let authRenderVersion = 0;
async function authRequest(route, options) {
  if (
    location.protocol === "http:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
  )
    throw new Error("Open Tomatoes over HTTPS before signing in.");
  try {
    return await teamRequest(route, {
      ...options,
      cache: "no-store",
      referrerPolicy: "no-referrer",
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
  if (
    typeof workspaceProjects !== "undefined" &&
    Array.isArray(authStatus.accessibleProjects)
  )
    workspaceProjects = authStatus.accessibleProjects;
  if (typeof invalidateOutOfScopeReports === "function")
    invalidateOutOfScopeReports();
  if (typeof applyFeatureAccess === "function") applyFeatureAccess();
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
  globalThis.TomatoesReact.renderAuth(screen, {
    route,
    message: message || authStatus?.error || "",
    delivery: authStatus?.recoveryDelivery,
    onSubmit: (fields) => submitAuth(fields, route, version),
  });
}
async function submitAuth(fields, route, version) {
  if (route === "forgot-password") {
    const result = await authRequest("/api/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: fields.get("email").trim() }),
    });
    if (version !== authRenderVersion) return;
    return result;
  }
  if (route === "reset-password") {
    const token = new URLSearchParams(location.hash.split("?")[1] || "").get(
      "token",
    );
    await authRequest("/api/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password: fields.get("password") }),
    });
    if (version !== authRenderVersion) return;
    authStatus = { ...authStatus, authenticated: false };
    history.replaceState(null, "", location.pathname + "#login");
    renderAuthScreen("Password updated. Sign in with your new password.");
    showToast("Password updated successfully.", "success");
    return;
  }
  const login = await authRequest("/api/login", {
    method: "POST",
    body: JSON.stringify({
      username: fields.get("email").trim(),
      password: fields.get("password"),
    }),
  });
  if (version !== authRenderVersion) return;
  await initializeAuth();
  if (!authStatus.authenticated)
    throw new Error("Could not confirm your session. Please try again.");
  if (version !== authRenderVersion) return;
  teamState = authStatus;
  await reloadUserPreferences();
  try {
    await refreshHistory();
  } catch (reason) {
    historyNotice(`Could not load import history: ${reason.message}`, "error");
  }
  if (version !== authRenderVersion) return;
  hideAuthScreen();
  const url = new URL(location.href);
  url.hash = login.passwordChangeRecommended ? "profile" : authReturnHash;
  history.replaceState(null, "", url);
  await navigateReportLocation();
  showToast(
    login.passwordChangeRecommended
      ? "Your password matches your account identifier. Change it from My profile."
      : "Signed in successfully.",
    login.passwordChangeRecommended ? "warning" : "success",
  );
}
