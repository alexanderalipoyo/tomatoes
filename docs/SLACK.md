# Slack import notifications

Tomatoes sends an incoming-webhook message after a valid browser import has finished rendering and its server copy has been saved. Reloads, opening history, opening server copies, evidence changes and bulk history saves do not trigger import notifications. Invalid imports never send a notification.

## Configuration

Keep the webhook in the ignored `.env` or `.env.local` file:

```dotenv
TOMATOES_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR_WORKSPACE/YOUR_CHANNEL/YOUR_SECRET
TOMATOES_SLACK_ENABLED=true
# Optional reachable Tomatoes origin for links:
# TOMATOES_REPORT_BASE_URL=https://reports.example.com
```

Restart `npm start` after changing environment settings. An empty webhook or `TOMATOES_SLACK_ENABLED=false` disables delivery. The server loads `.env.local` and `.env`; existing database configuration stays in `.env.local`. The actual webhook is never returned to the browser, written to report JSON, or included in message payloads.

With PostgreSQL, imports already save a server copy automatically. If the server uses file storage, configuring Slack also enables a server copy for imports so notifications can refer to saved reports. Optional team mode requires a signed-in account with write access to that report's project. Viewers, signed-out users and CI upload tokens cannot invoke the browser import-notification endpoint.

## Message contents

Messages contain a Tomatoes heading, report name and unique server report link, recorded run status, outcome totals, registered-test pass rate, spec count, reported duration, run start time when supplied, and up to five specs with failures or confirmed flaky tests. Spec links open the matching report and filter to that spec. Project, environment, branch, commit and CI build links appear only when available in the saved metadata. Run numbers and authors are not invented.

Flakiness requires an explicit failed attempt followed by a final passing attempt. Reports without retry records show **Flaky: Unavailable — no retry evidence**. When retry records cover only some tests, the message states that coverage; confirmed counts do not establish that all other tests are stable.

Links default to the Tomatoes request origin. In a local setup, `localhost` links work on the machine running Tomatoes; set `TOMATOES_REPORT_BASE_URL` to a reachable deployment origin when the app is hosted for teammates. Existing authentication and project access still apply to linked reports.

## Delivery and failures

Only the server contacts Slack, using [Slack's incoming-webhook message format](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks). Browser requests reference a saved run and an import event ID; totals are recalculated from the stored report rather than accepted from the client. Requests enforce origin, session CSRF, project scope and write permissions.

Delivery has a ten-second timeout. A successful response shows **Report imported and Slack notified** in a toast. A failed or unconfirmed response shows a warning while preserving the report. There are no automatic retries after an uncertain delivery. Repeated event IDs are suppressed within the running server process; restarting the server clears that in-memory delivery cache. Importing the same file again is a new user import event and can send a new notification.

The webhook's configured Slack app controls the message sender and channel. Message links and previews do not change that configuration.
