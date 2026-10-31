import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
export function IntegrationsPage({ request, catalog, project }) {
  const [status, setStatus] = useState(null),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [selected, setSelected] = useState(null);
  const dialog = useRef(null),
    trigger = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setStatus(null);
    request("/api/team/status", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then(setStatus)
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [request, reload]);
  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [selected]);
  function close() {
    dialog.current?.close();
    setSelected(null);
    trigger.current?.focus();
  }
  if (!status)
    return (
      <article className="settings-card">
        <h2>Integrations</h2>
        <p role={error ? "alert" : "status"}>
          {error || "Checking integrations..."}
        </p>
        {error && (
          <button
            className="button"
            id="integration-retry"
            onClick={() => setReload((value) => value + 1)}
          >
            Retry
          </button>
        )}
      </article>
    );
  const entries = catalog(status);
  return (
    <div className="integrations-page">
      {status.enabled && !status.authenticated && (
        <p className="notice">
          Sign in through <a href="#team">Settings: Sharing &amp; access</a> to
          access your workspace reports.
        </p>
      )}
      {["New", "Enabled", "Available"].map((group) => {
        const items = entries.filter((entry) => entry.group === group);
        return items.length ? (
          <section
            key={group}
            className="integration-section"
            aria-label={`${group} integrations`}
          >
            <h2>{group}</h2>
            <div className="integration-list">
              {items.map((entry) => (
                <article className="integration-row" key={entry.id}>
                  <span
                    className={`integration-logo integration-logo-${entry.kind}`}
                    aria-hidden="true"
                  >
                    {entry.mark}
                  </span>
                  <div className="integration-copy">
                    <div className="integration-title">
                      <h3>{entry.name}</h3>
                      <span
                        className={`integration-state ${entry.group === "Enabled" ? "is-enabled" : ""}`}
                      >
                        {entry.state}
                      </span>
                    </div>
                    <p>
                      {entry.description}{" "}
                      {entry.setup && (
                        <button
                          className="integration-learn"
                          data-integration={entry.id}
                          onClick={(event) => {
                            trigger.current = event.currentTarget;
                            setSelected(entry);
                          }}
                        >
                          Learn more
                        </button>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`button ${entry.group === "New" ? "primary" : ""} integration-action`}
                    data-integration={entry.id}
                    disabled={!entry.setup}
                    onClick={(event) => {
                      trigger.current = event.currentTarget;
                      setSelected(entry);
                    }}
                  >
                    <Icon
                      name={entry.group === "Enabled" ? "settings" : "plus"}
                    />
                    {entry.action}
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null;
      })}
      <p className="integrations-note">
        CI provider entries use the report uploader. Connection status reflects
        server configuration; direct provider apps, issue creation, and SSO are
        not configured by this page.
      </p>
      <dialog
        ref={dialog}
        className="integration-setup"
        aria-labelledby="react-integration-setup-title"
        onCancel={close}
        onClick={(event) => {
          if (event.target === dialog.current) {
            const bounds = dialog.current.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              close();
          }
        }}
      >
        {selected && (
          <>
            <div className="integration-setup-heading">
              <h2 id="react-integration-setup-title">{selected.name} setup</h2>
              <button
                className="button"
                autoFocus
                aria-label="Close integration setup"
                onClick={close}
              >
                Close
              </button>
            </div>
            <div className="integration-setup-body">
              <Setup entry={selected} status={status} project={project} />
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
function Setup({ entry, status, project }) {
  if (entry.setup === "slack")
    return (
      <>
        <p>
          {status.slackConfigured
            ? "Slack notifications are configured on this server."
            : "Add a Slack incoming webhook to the server configuration to enable notifications."}
        </p>
        <p>
          Configure these values in the server's private .env file, then restart
          Tomatoes:
        </p>
        <pre>
          {
            "TOMATOES_SLACK_WEBHOOK_URL=<your incoming webhook>\nTOMATOES_SLACK_ENABLED=true"
          }
        </pre>
        <p>
          Successful file imports post real test totals, the run result, and
          links to saved results. Reopening a report does not send a
          notification. The webhook is kept on the server.
        </p>
        <p>
          For links accessible to your team, set TOMATOES_REPORT_BASE_URL to the
          address where they can open Tomatoes.
        </p>
      </>
    );
  return (
    <>
      {entry.setup === "api" && (
        <>
          <p>The report API respects account roles and project scope.</p>
          <pre>{"GET /api/runs\nGET /api/runs/:id\nPOST /api/runs"}</pre>
          <p>
            Automated clients use a project-scoped CI token in the
            Authorization: Bearer header. Browser requests use the signed-in
            session and CSRF protection.
          </p>
        </>
      )}
      <p>
        {status.ciConfigured
          ? "A project-scoped CI token is configured on this server."
          : "Create a project-scoped CI token on the server to enable automated report uploads."}
      </p>
      <h3>1. Create a project token</h3>
      <pre>node scripts/team-admin.js create-ci-token {project}</pre>
      <p>
        Store the returned token in your CI secret named TOMATOES_CI_TOKEN. Keep
        the token out of your repository.
      </p>
      <h3>2. Set the server address</h3>
      <p>
        Set TOMATOES_SERVER_URL to an address the runner can reach. A runner on
        this machine can use http://localhost:3000.
      </p>
      <h3>3. Publish a report</h3>
      <pre>
        node scripts/publish-report.js --file report.json --project {project}{" "}
        --environment staging --branch main
      </pre>
      <p>
        The publisher reads TOMATOES_SERVER_URL and TOMATOES_CI_TOKEN from its
        environment.
      </p>
    </>
  );
}
