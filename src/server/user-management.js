const ORGANIZATION_ID = "default";
function memberships(user) {
  if (!user) return [];
  const home = {
    organizationId: user.organizationId || ORGANIZATION_ID,
    role: user.role,
    projects: user.projects || [],
    disabled: Boolean(user.disabled),
  };
  const rows = new Map([[home.organizationId, home]]);
  for (const member of user.memberships || [])
    rows.set(member.organizationId, member);
  return [...rows.values()];
}
function forOrganization(user, organizationId = ORGANIZATION_ID) {
  const member = memberships(user).find(
    (row) => row.organizationId === organizationId,
  );
  return member
    ? {
        ...user,
        ...member,
        disabled: Boolean(user.disabled || member.disabled),
      }
    : null;
}
const belongsToOrganization = (user, organizationId = ORGANIZATION_ID) =>
  Boolean(forOrganization(user, organizationId));
function updateMembership(user, value) {
  if (
    !(user.memberships || []).length &&
    (user.organizationId || ORGANIZATION_ID) === value.organizationId
  )
    return { ...user, ...value };
  const member = {
    organizationId: value.organizationId,
    role: value.role,
    projects: value.projects,
    disabled: Boolean(value.disabled),
  };
  return {
    ...user,
    fullName: value.fullName,
    email: value.email,
    memberships: [
      ...(user.memberships || []).filter(
        (row) => row.organizationId !== member.organizationId,
      ),
      member,
    ],
  };
}
function addOrganizationMembership(user, id, currentOrganizationId) {
  if (!isGlobalAdmin(user, currentOrganizationId))
    throw Object.assign(
      new Error("Only organization admins can add organizations."),
      { status: 403 },
    );
  if (memberships(user).length >= 100)
    throw Object.assign(
      new Error("This account has reached the organization limit."),
      { status: 400 },
    );
  return updateMembership(user, {
    ...user,
    organizationId: id,
    role: "admin",
    projects: ["*"],
    disabled: false,
  });
}
const roles = [
  {
    id: "viewer",
    name: "Viewer",
    description:
      "View reports and export history PDFs in assigned projects. Manage personal details and account security.",
  },
  {
    id: "editor",
    name: "Editor",
    description:
      "View reports, import results, edit browser report details, attach evidence, and choose appearance in assigned projects. Browse users without changing accounts.",
  },
  {
    id: "admin",
    name: "Admin",
    description:
      "Manage reports and workspace settings. Admins with all-project access can manage organization users, projects, and role access.",
  },
];
function validateUser(
  value,
  creating = false,
  organizationId = ORGANIZATION_ID,
) {
  const fail = (message) => {
    throw Object.assign(new Error(message), { status: 400 });
  };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "username",
          "fullName",
          "email",
          "role",
          "projects",
          "disabled",
          "organizationId",
          ...(creating ? ["password"] : []),
        ].includes(key),
    )
  )
    fail("Use only the supported user fields.");
  if (
    value.organizationId !== undefined &&
    value.organizationId !== organizationId
  )
    fail("Users must belong to the current organization.");
  if (
    creating &&
    (typeof value.username !== "string" ||
      !/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(value.username))
  )
    fail(
      "Use a lowercase username with letters, numbers, dots, underscores, or hyphens.",
    );
  if (
    typeof value.fullName !== "string" ||
    !value.fullName.trim() ||
    value.fullName.length > 160 ||
    /[\x00-\x1f\x7f]/.test(value.fullName)
  )
    fail("Enter a full name up to 160 characters.");
  if (
    typeof value.email !== "string" ||
    value.email.length > 254 ||
    (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))
  )
    fail("Enter a valid email address or leave it blank.");
  if (
    !roles.some((role) => role.id === value.role) ||
    typeof value.disabled !== "boolean"
  )
    fail("Choose a valid role and account status.");
  if (
    !Array.isArray(value.projects) ||
    !value.projects.length ||
    value.projects.length > 100 ||
    new Set(value.projects).size !== value.projects.length ||
    value.projects.some(
      (project) =>
        typeof project !== "string" ||
        (project !== "*" && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(project)),
    ) ||
    (value.projects.includes("*") && value.projects.length !== 1)
  )
    fail("Choose all projects (*) or a list of valid project identifiers.");
  if (
    creating &&
    (typeof value.password !== "string" ||
      value.password.length < 12 ||
      value.password.length > 256)
  )
    fail("Passwords must be 12–256 characters.");
  return {
    organizationId,
    username: value.username,
    fullName: value.fullName.trim(),
    email: value.email.trim(),
    role: value.role,
    projects: value.projects,
    disabled: value.disabled,
  };
}
const isGlobalAdmin = (user, organizationId = ORGANIZATION_ID) => {
  const member = forOrganization(user, organizationId);
  return Boolean(
    member &&
    member.role === "admin" &&
    member.projects.includes("*") &&
    !member.disabled,
  );
};
const publicUser = (user) => ({
  organizationId: user.organizationId || ORGANIZATION_ID,
  username: user.username,
  fullName: user.fullName || user.username,
  email: user.email || "",
  role: user.role,
  projects: user.projects,
  disabled: Boolean(user.disabled),
});
module.exports = {
  roles,
  memberships,
  forOrganization,
  updateMembership,
  addOrganizationMembership,
  validateUser,
  isGlobalAdmin,
  publicUser,
  ORGANIZATION_ID,
  belongsToOrganization,
};
