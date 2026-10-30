(function (root) {
  function allowed(entry, status) {
    if (!status) return false;
    if (status.enabled === false) return true;
    if (!status.authenticated || !status.user) return false;
    if (
      (status.user.organizationId || "default") !==
      (status.organization?.id || "default")
    )
      return false;
    const projects = status.user.projects || [];
    return (
      projects.includes("*") ||
      projects.includes(entry?.metadata?.project || "tomatoes")
    );
  }
  const api = { allowed };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ProjectAccess = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
