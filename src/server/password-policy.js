function matchesIdentity(password, user = {}) {
  if (typeof password !== "string") return false;
  const value = password.trim().toLowerCase();
  return [user.username, user.email].some(
    (identifier) =>
      typeof identifier === "string" &&
      identifier.trim() &&
      value === identifier.trim().toLowerCase(),
  );
}
function validatePassword(password, user = {}) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256 ||
    password.trim().length < 12
  )
    throw Object.assign(new Error("Use a password of 12-256 characters."), {
      status: 400,
    });
  if (
    matchesIdentity(password, user) ||
    ["password1234", "password123!", "123456789012", "qwerty123456"].includes(
      password.toLowerCase(),
    )
  )
    throw Object.assign(
      new Error(
        "Choose a unique password that differs from your email, username, and common passwords.",
      ),
      { status: 400 },
    );
  return password;
}
module.exports = { validatePassword, matchesIdentity };
