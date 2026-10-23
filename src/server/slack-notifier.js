const ReportData = require("../shared/report-data");
const clean = (value, limit = 500) =>
  String(value ?? "")
    .slice(0, limit)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
function duration(ms) {
  if (ms == null) return "Unavailable";
  const seconds = Math.floor(ms / 1000);
  return [
    seconds >= 3600 ? `${Math.floor(seconds / 3600)}h` : "",
    seconds >= 60 ? `${Math.floor(seconds / 60) % 60}m` : "",
    `${seconds % 60}s`,
  ]
    .filter(Boolean)
    .join(" ");
}
function reportURL(baseURL, id, view = "runs", specId = null) {
  const url = new URL(baseURL);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Configure a valid report base URL without credentials.");
  url.search = "";
  url.searchParams.set("server", id);
  if (specId !== null) url.searchParams.set("spec", String(specId));
  url.hash = view;
  return url.href.replace(/\|/g, "%7C");
}
function buildSlackMessage({ record, report, baseURL }) {
  const url = reportURL(baseURL, record.id);
  const retry = ReportData.retryStats(report);
  const flakySpecs = new Map();
  retry.confirmed.forEach((test) =>
    flakySpecs.set(test.specId, (flakySpecs.get(test.specId) || 0) + 1),
  );
  const status =
    report.status === "failed"
      ? "Failed"
      : report.status === "passed"
        ? "Passed"
        : report.status === "unknown"
          ? "Unknown"
          : "Incomplete";
  const c = report.counts;
  const outcome = `${status === "Passed" ? ":white_check_mark:" : status === "Failed" ? ":red_circle:" : ":warning:"} *${status} run*`;
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "\u{1F345} Tomatoes | Report imported",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${clean(url, 2500)}|${clean(record.label || record.name, 180)}>*\n${outcome}`,
      },
    },
  ];
  const fields = [];
  const metadata = record.metadata || {};
  for (const [key, label] of [
    ["project", "Project"],
    ["environment", "Environment"],
    ["branch", "Branch"],
    ["commit", "Commit"],
  ]) {
    if (metadata[key])
      fields.push({
        type: "plain_text",
        text: `${label}\n${String(metadata[key]).slice(0, 160)}`,
        emoji: false,
      });
  }
  if (fields.length) blocks.push({ type: "section", fields });
  if (metadata.buildUrl)
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${clean(metadata.buildUrl.replace(/\|/g, "%7C"), 2100)}|Open CI build>`,
      },
    });
  blocks.push(
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Test Results: ${status}*\n\n*<${clean(reportURL(baseURL, record.id, "failures"), 2500)}|Failed>:* ${c.failed.toLocaleString("en-US")}\n*Passed:* ${c.passed.toLocaleString("en-US")}\n*Pending:* ${c.pending.toLocaleString("en-US")}\n*${retry.withEvidence ? "Confirmed flaky (retry evidence)" : "Flaky"}:* ${retry.withEvidence ? retry.confirmed.length : "Unavailable — no retry evidence"}\n*Skipped:* ${c.skipped.toLocaleString("en-US")}${c.unknown ? `\n*Unknown:* ${c.unknown.toLocaleString("en-US")}` : ""}`,
      },
    },
  );
  blocks.push({
    type: "section",
    fields: [
      {
        type: "plain_text",
        text: `Total tests\n${c.total.toLocaleString("en-US")}`,
      },
      {
        type: "plain_text",
        text: `Specs\n${report.specs.length.toLocaleString("en-US")}`,
      },
      {
        type: "plain_text",
        text: `Pass rate (all registered tests)\n${c.total ? report.passRate.toFixed(1) + "%" : "Unavailable"}`,
      },
      {
        type: "plain_text",
        text: `Reported run duration\n${duration(report.duration)}`,
      },
    ],
  });
  const review = report.specs
    .filter((spec) => spec.counts.failed || flakySpecs.has(spec.id))
    .sort(
      (a, b) =>
        b.counts.failed - a.counts.failed || a.file.localeCompare(b.file),
    );
  blocks.push(
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: "*Specs for Review*" } },
  );
  if (!review.length)
    blocks.push({
      type: "section",
      text: {
        type: "plain_text",
        text: "No failed specs or confirmed retry-based flaky tests recorded.",
      },
    });
  for (const spec of review.slice(0, 5)) {
    const parts = [
      `${spec.counts.failed} failed test${spec.counts.failed === 1 ? "" : "s"}`,
    ];
    if (flakySpecs.has(spec.id))
      parts.push(`${flakySpecs.get(spec.id)} confirmed flaky`);
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${clean(reportURL(baseURL, record.id, "results", spec.id), 2500)}|${clean(spec.file, 500)}>\n${parts.join(" · ")}`,
      },
    });
  }
  const context = [`Tomatoes report ${record.id.slice(0, 12)}`];
  if (report.start)
    context.push(
      `Run started ${new Date(report.start).toISOString().replace("T", " ").replace(".000Z", " UTC")}`,
    );
  if (review.length > 5)
    context.push(`Showing 5 of ${review.length} specs for review`);
  if (retry.withEvidence)
    context.push(`Retry evidence: ${retry.withEvidence} of ${c.total} tests`);
  else context.push("Flakiness is not inferred from failures or history");
  blocks.push({
    type: "context",
    elements: [{ type: "plain_text", text: context.join(" · ") }],
  });
  if (["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
    blocks.push({
      type: "context",
      elements: [
        {
          type: "plain_text",
          text: "Report links use localhost and open on the machine running Tomatoes.",
        },
      ],
    });
  return {
    text: `Tomatoes: ${clean(record.label || record.name, 180)} — ${status}; ${c.failed} failed, ${c.passed} passed, ${c.pending} pending, ${c.skipped} skipped (${c.total} tests).`,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
}
function createSlackNotifier({
  webhookURL = "",
  enabled = true,
  baseURL = "",
  fetchImpl = fetch,
} = {}) {
  const active = Boolean(webhookURL && enabled);
  const deliveries = new Map();
  function notify({ eventId, record, report, origin, owner }) {
    if (!active) return Promise.resolve({ status: "disabled" });
    const key = owner + ":" + eventId;
    if (deliveries.has(key)) {
      const previous = deliveries.get(key);
      if (previous.runId !== record.id)
        throw Object.assign(
          new Error("This import event was already used for another report."),
          { status: 409 },
        );
      return previous.promise.then((result) => ({
        ...result,
        duplicate: true,
      }));
    }
    const task = (async () => {
      let endpoint;
      try {
        endpoint = new URL(webhookURL);
      } catch {
        throw new Error("The Slack webhook configuration is invalid.");
      }
      if (
        endpoint.protocol !== "https:" ||
        endpoint.hostname !== "hooks.slack.com" ||
        endpoint.port ||
        endpoint.username ||
        endpoint.password ||
        !/^\/services\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+$/.test(
          endpoint.pathname,
        ) ||
        endpoint.search ||
        endpoint.hash
      )
        throw new Error("The Slack webhook configuration is invalid.");
      const payload = buildSlackMessage({
        record,
        report,
        baseURL: baseURL || origin,
      });
      let response;
      try {
        response = await fetchImpl(endpoint.href, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw new Error(
          "Slack delivery could not be confirmed. The report is saved; no automatic retry was sent.",
        );
      }
      let text;
      try {
        text = await response.text();
      } catch {
        throw new Error(
          "Slack delivery could not be confirmed. The report is saved; no automatic retry was sent.",
        );
      }
      if (!response.ok || text.trim() !== "ok")
        throw new Error(
          `Slack did not accept the notification (HTTP ${response.status}). The report is still saved.`,
        );
      return { status: "sent" };
    })();
    deliveries.set(key, { runId: record.id, promise: task });
    if (deliveries.size > 1000)
      deliveries.delete(deliveries.keys().next().value);
    return task;
  }
  return { enabled: active, notify };
}
module.exports = { buildSlackMessage, createSlackNotifier, reportURL };
