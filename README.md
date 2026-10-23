# Tomatoes test results dashboard

A local dashboard for exploring Mochawesome JSON reports. The bundled `results.json` is the supplied sample latest run, originally named `index.json`.

## Run

Run `npm start`, then open http://localhost:3000/#runs. No API keys are required. The dashboard fetches its bundled report through the local server.

## Explore results

- Latest run: a widget dashboard with outcome distribution, failure hotspots, clickable spec health, slowest tests, execution coverage, and timing. All widgets update when a report is imported.
- Test results: detailed spec and test browsing, accessible from the sidebar or dashboard widgets.
- Switch between spec summaries and individual tests. Search by spec, test title, or failure message; filter by spec and outcome.
- Click a spec to inspect its tests. Inspect a test for its failure message, stack trace, recorded code, and context. Report text is displayed as text and never executed.
- Failed tests lists all failures; analytics ranks specs by failure count and tests by duration.
- Branch, commit, author, browser, operating system, flakiness, and historical trends are unavailable when absent from the report.

Click **Import report** to inspect another Mochawesome JSON report in the current browser session. Reload rereads that selected file. Refreshing the browser restores the bundled report. To update the default run, replace `results.json`, then click Reload.

Pass rate is passed tests divided by all test records, including pending and skipped tests. Spec time is the sum of its test durations. Run time uses the report's `stats.duration`, which can differ from the sum of individual test times. Summary discrepancies are displayed when reported statistics disagree with the individual records.

## Development

Run `npm install` to install the pinned Prettier development dependency.

- `npm run format` formats project source files.
- `npm run format:check` verifies formatting.
- `npm run check` checks JavaScript syntax.
- `npm test` verifies report aggregation against the sample and nested/empty/inconsistent reports.

The HTTP server binds to 127.0.0.1 and serves a fixed list of project assets. Reports can contain test source, error details, and environment data; keep bundled reports appropriate for local project use.
