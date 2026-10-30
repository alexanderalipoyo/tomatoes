const fail = () => {
  throw Object.assign(
    new Error("Invalid report page. Reload the report list and try again."),
    { status: 400 },
  );
};
function read(url, organizationId) {
  const raw = url.searchParams.get("limit");
  const limit = raw === null ? 50 : Number(raw);
  if (
    (raw !== null && !/^[1-9][0-9]*$/.test(raw)) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    fail();
  const project = url.searchParams.get("project") || null;
  const includeArchived = url.searchParams.get("includeArchived") === "1";
  let cursor = null;
  const token = url.searchParams.get("cursor");
  if (token !== null) {
    if (token.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(token)) fail();
    try {
      cursor = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    } catch {
      fail();
    }
    if (
      !cursor ||
      !Number.isSafeInteger(cursor.receivedAt) ||
      cursor.receivedAt < 0 ||
      !/^[a-f0-9]{64}$/.test(cursor.id) ||
      cursor.organizationId !== organizationId ||
      cursor.project !== project ||
      cursor.includeArchived !== includeArchived
    )
      fail();
  }
  return { project, includeArchived, limit, cursor };
}
function next(record, page, organizationId) {
  return Buffer.from(
    JSON.stringify({
      id: record.id,
      receivedAt: record.receivedAt || 0,
      project: page.project,
      includeArchived: page.includeArchived,
      organizationId,
    }),
  ).toString("base64url");
}
module.exports = { read, next };
