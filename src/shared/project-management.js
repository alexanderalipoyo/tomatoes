(function (root) {
  const validId = (value) =>
    typeof value === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(value);
  const fail = (status, message) => {
    throw Object.assign(new Error(message), { status });
  };
  function validateName(body, creating = false) {
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (key) => !["name", ...(creating ? ["id"] : [])].includes(key),
      )
    )
      fail(400, "Use only the supported project fields.");
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 80 ||
      /[\x00-\x1f\x7f]/.test(body.name)
    )
      fail(400, "Enter a project name of 1 to 80 characters.");
    if (body.id !== undefined && !validId(body.id))
      fail(400, "Use a valid project identifier.");
    const normalized = body.name.trim().normalize("NFKC");
    if (normalized.length > 80)
      fail(400, "Enter a project name of 1 to 80 characters.");
    return normalized;
  }
  function merge(registered = [], runs = []) {
    const projects = new Map(
      registered.map((project) => [
        project.id,
        { ...project, registered: true },
      ]),
    );
    for (const run of runs) {
      const id = run.metadata?.project;
      if (validId(id) && !projects.has(id))
        projects.set(id, {
          id,
          name: id,
          createdAt: null,
          updatedAt: null,
          registered: false,
        });
    }
    return [...projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  function change(rows, body, id, clock = Date.now()) {
    const creating = id === null;
    const name = validateName(body, creating);
    if (
      rows.some(
        (item) =>
          item.id !== id && item.name.toLowerCase() === name.toLowerCase(),
      )
    )
      fail(409, "A project with this name already exists.");
    if (creating) {
      let key = body.id;
      if (key && rows.some((item) => item.id === key))
        fail(409, "This project identifier already exists.");
      if (!key) {
        const base =
          name
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 70) || "project";
        key = base;
        let suffix = 2;
        while (rows.some((item) => item.id.toLowerCase() === key.toLowerCase()))
          key = `${base}-${suffix++}`;
      }
      return {
        id: key,
        name,
        createdAt: clock,
        updatedAt: clock,
        registered: true,
      };
    }
    if (!validId(id)) fail(400, "Use a valid project identifier.");
    const previous = rows.find((item) => item.id === id);
    if (!previous) fail(404, "Project not found.");
    return {
      id,
      name,
      createdAt: previous.createdAt ?? clock,
      updatedAt: clock,
      registered: true,
    };
  }
  const api = { validId, validateName, merge, change };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ProjectManagement = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
