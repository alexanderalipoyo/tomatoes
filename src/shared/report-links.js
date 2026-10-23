(function (root) {
  const validId = (id) => typeof id === "string" && /^[a-f0-9]{64}$/.test(id);
  function read(value) {
    const url = new URL(value, "http://localhost");
    const importId = url.searchParams.get("import");
    const serverId = url.searchParams.get("server");
    if (
      ["import", "server"].some(
        (key) => url.searchParams.getAll(key).length > 1,
      ) ||
      (importId !== null && !validId(importId)) ||
      (serverId !== null && !validId(serverId))
    )
      throw new Error("This report link has an invalid report identifier.");
    return { importId, serverId, key: `${importId || ""}:${serverId || ""}` };
  }
  function build(value, { importId, serverId, view } = {}) {
    const url = new URL(value, "http://localhost");
    url.searchParams.delete("import");
    url.searchParams.delete("server");
    if (importId) {
      if (!validId(importId)) throw new Error("Invalid import identifier.");
      url.searchParams.set("import", importId);
    }
    if (serverId) {
      if (!validId(serverId))
        throw new Error("Invalid server report identifier.");
      url.searchParams.set("server", serverId);
    }
    if (view) {
      url.hash = view;
      if (!["results", "failures"].includes(view))
        url.searchParams.delete("spec");
    }
    return url.href;
  }
  async function resolve(route, { getLocal, getServer, verifyServer }) {
    if (route.importId) {
      let local;
      try {
        local = await getLocal(route.importId);
      } catch {
        /* Try the authorized server copy when one is linked. */
      }
      if (local?.entry.deletedAt)
        throw new Error(
          "This report is in trash. Restore it from Import history before opening its link.",
        );
      if (local) return { local };
    }
    if (route.serverId) {
      const server = await getServer(route.serverId);
      if (route.importId && !(await verifyServer(server, route.importId)))
        throw new Error(
          "The server copy does not match the report in this link.",
        );
      return { server };
    }
    throw new Error(
      "This report is not available in this browser. Import it again, or use a link that includes an available server copy.",
    );
  }
  const api = { validId, read, build, resolve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ReportLinks = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
