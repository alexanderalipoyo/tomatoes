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
  return ["login", "signup", "forgot-password", "reset-password"].includes(
    authRoute(),
  );
}
function authRequiresLogin() {
  return Boolean(
    authStatus?.enabled &&
    (!authStatus.authenticated || authStatus.pendingOrganization),
  );
}
async function initializeAuth() {
  try {
    authStatus = await teamRequest("/api/team/status", {
      cache: "no-store",
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
  if (
    authStatus?.authenticated &&
    authStatus.preferenceProfileId &&
    typeof userPreferences !== "undefined" &&
    userPreferences.getState().ready &&
    userPreferences.getState().profileId !== authStatus.preferenceProfileId &&
    typeof reloadUserPreferences === "function"
  )
    await reloadUserPreferences();
  if (typeof applyFeatureAccess === "function") applyFeatureAccess();
  if (typeof renderWorkspaceIdentity === "function") renderWorkspaceIdentity();
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
    route: authStatus?.pendingOrganization ? "pending" : route,
    google: authStatus?.google,
    user: authStatus?.user,
    onGoogleChallenge: (mode) =>
      authRequest("/api/auth/google/challenge", {
        method: "POST",
        body: JSON.stringify({ mode }),
      }),
    onGoogleCredential: async (credential) => {
      if (version !== authRenderVersion) return;
      await authRequest("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({ credential }),
      });
      if (version !== authRenderVersion) return;
      await finishGoogleSignIn();
    },
    onRefreshAccess: () => finishGoogleSignIn({ refreshPending: true }),
    onSignOut: async () => {
      teamState = await teamRequest("/api/team/status", { cache: "no-store" });
      await authRequest("/api/logout", { method: "POST", body: "{}" });
      await initializeAuth();
      history.replaceState(null, "", location.pathname + "#login");
      renderAuthScreen("Signed out.");
    },
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

// Revisit the server policy when returning to a tab without polling on free-tier hosting.
let accessRefresh = null;
let lastAccessRefresh = 0;
function sessionAccessSignature() {
  return JSON.stringify([
    authStatus?.authenticated,
    authStatus?.user,
    authStatus?.organization,
    authStatus?.permissions,
    authStatus?.accessibleProjects,
  ]);
}
async function refreshSessionAccess() {
  if (
    !authStatus?.enabled ||
    authRequiresLogin() ||
    document.hidden ||
    (typeof loading !== "undefined" && loading)
  )
    return;
  if (accessRefresh) return accessRefresh;
  if (Date.now() - lastAccessRefresh < 5000) return;
  lastAccessRefresh = Date.now();
  const before = sessionAccessSignature();
  accessRefresh = (async () => {
    await initializeAuth();
    if (authRequiresLogin()) {
      renderAuthScreen();
      return;
    }
    if (before !== sessionAccessSignature()) {
      const current = location.hash.slice(1) || "runs";
      if (!canAccessView(current) || current === "projects") navigate();
    }
  })().finally(() => {
    accessRefresh = null;
  });
  return accessRefresh;
}
window.addEventListener("focus", () => void refreshSessionAccess());
document.addEventListener(
  "visibilitychange",
  () => void refreshSessionAccess(),
);

async function finishGoogleSignIn({ refreshPending = false } = {}) {
  await initializeAuth();
  teamState = authStatus;
  if (!authStatus.authenticated)
    throw new Error(
      "Could not confirm your Google session. Please sign in again.",
    );
  if (authStatus.pendingOrganization) {
    if (!refreshPending) renderAuthScreen();
    return { pendingOrganization: true };
  }
  await reloadUserPreferences();
  try {
    await refreshHistory();
  } catch (error) {
    historyNotice(
      `Signed in, but browser import history could not be loaded: ${error.message}`,
      "warning",
    );
  }
  hideAuthScreen();
  history.replaceState(null, "", location.pathname + "#projects");
  await navigateReportLocation();
  showToast("Signed in successfully.", "success");
}
