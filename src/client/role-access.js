/* Route adapter: the page owns its React state and lifecycle. */
function renderRoleAccess(host) {
  globalThis.TomatoesReact.renderRoleAccess(host, {
    request: teamRequest,
    onRefresh: initializeAuth,
    onToast: showToast,
  });
}
