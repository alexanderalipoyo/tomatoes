const Users = require("./user-management");
const Groups = require("../shared/dashboard-groups");
function sharedWidgetSetups(rows, users, organizationId, excludeOwner) {
  const result = [];
  for (const user of users) {
    const member = Users.forOrganization(user, organizationId);
    if (!member || member.disabled) continue;
    const home = user.organizationId || "default";
    const owner =
      "user:" +
      user.username +
      (organizationId === home ? "" : ":org:" + organizationId);
    if (owner === excludeOwner) continue;
    const preferences = rows.find((row) => row.owner === owner)?.preferences;
    if (preferences?.shareDashboardGroups !== true) continue;
    try {
      const groups = Groups.validateGroups(preferences.dashboardGroups || []);
      if (groups.length) result.push({ owner: user.username, groups });
    } catch {
      /* Invalid stored definitions are never exposed. */
    }
  }
  return result.sort((a, b) => a.owner.localeCompare(b.owner));
}
module.exports = { sharedWidgetSetups };
