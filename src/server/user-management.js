const roles = [
  {
    id: "viewer",
    name: "Viewer",
    description:
      "View reports in assigned projects and manage personal preferences.",
  },
  {
    id: "editor",
    name: "Editor",
    description:
      "Viewer permissions, plus publish reports and update report notes and attachments in assigned projects.",
  },
  {
    id: "admin",
    name: "Admin",
    description:
      "Editor permissions. Admins with all-project access can manage user accounts and permissions.",
  },
];
function validateUser(value, creating = false) {
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
          ...(creating ? ["password"] : []),
        ].includes(key),
    )
  )
    fail("Use only the supported user fields.");
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
    username: value.username,
    fullName: value.fullName.trim(),
    email: value.email.trim(),
    role: value.role,
    projects: value.projects,
    disabled: value.disabled,
  };
}
const isGlobalAdmin = (user) =>
  user.role === "admin" && user.projects.includes("*") && !user.disabled;
const publicUser = (user) => ({
  username: user.username,
  fullName: user.fullName || user.username,
  email: user.email || "",
  role: user.role,
  projects: user.projects,
  disabled: Boolean(user.disabled),
});
module.exports = { roles, validateUser, isGlobalAdmin, publicUser };
