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
    if (Array.isArray(status.accessibleProjects))
      return status.accessibleProjects.some(
        (project) =>
          project.id === (entry?.metadata?.project || "tomatoes") &&
          (!project.organizationId ||
            project.organizationId === status.organization?.id),
      );
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
