# Tomatoes

**A test report dashboard for Cypress-generated cloud test results.**

Tomatoes turns JSON reports from Cypress test runs into a dashboard for reviewing outcomes, investigating failures, and comparing previous runs. Reports can come from tests executed in a cloud CI environment or on a local machine.

Tomatoes is an independent application with its own branding. It is not the Cypress Cloud product. Cypress is the tool that executes the tests; Tomatoes reads the resulting **Mochawesome-compatible JSON report** and presents the results.

The application runs locally. Imports and evidence are saved in your browser; **Team & CI** adds an optional server-backed report store on this machine. It does not require a Cypress Cloud account, recording key, or API connection.

## See Tomatoes in action

[![Watch the Tomatoes animated promo](media/tomatoes-promo-poster.png)](media/tomatoes-promo.mp4)

[Watch or download the 28-second animated promo](media/tomatoes-promo.mp4), featuring the dashboard, insights, and responsive layouts with an original soundtrack.

**Created by Alex Ali.**

## Get started

With Node.js and npm installed, run:

```sh
npm install
npm start
```

Open [Tomatoes](http://localhost:3000/#runs).

The project includes a sample run in `results.json`, originally supplied as `index.json`. You can explore it immediately or choose **Import report** to open your own JSON file.

## Bring in a Cypress report

1. Execute your Cypress tests locally or through your cloud CI pipeline.
2. Generate a Mochawesome-compatible JSON report from the run. For a run with several report files, use a merged report to review the complete run together.
3. Download the report artifact from your pipeline, if applicable.
4. Select **Import report** in Tomatoes and choose the `.json` file.
5. Review the dashboard, browse tests, or open Analytics to investigate the run.

Tomatoes imports exported reports. Running tests and collecting artifacts remain part of your Cypress setup and CI workflow.

### Supported format and validation

Reports must contain a Mochawesome `stats` object and a `results` array with spec files, nested suites, and test records. A `.json` extension alone is insufficient.

Before displaying a report, Tomatoes checks JSON syntax, required statistics, suite and test structure, outcome values, field types, dates, and durations. Invalid imports show a specific error and preserve the displayed report.

Import limits:

- Maximum file size: **50 MB**.
- Maximum combined suite and test records: **100,000**.
- Maximum suite nesting depth: **100**.

A blocking loading overlay shows progress through reading, parsing, validation, aggregation, and rendering. Parsing and validation run in a background worker.

## Explore your results

| View                | What you can do                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Latest run**      | Review outcome totals, pass rate, failure hotspots, spec health, slow tests, execution coverage, and timing.                                              |
| **Test results**    | Switch between specs and individual tests; search titles, paths, and errors; filter by spec and outcome.                                                  |
| **Compare runs**    | Select baseline and target reports to review regressions, fixes, added/missing tests, other outcome changes, and slower tests; export a Markdown summary. |
| **Failed tests**    | Review groups of matching failure messages and inspect their affected tests, original errors, stack traces, code, and context.                            |
| **Import history**  | Reopen a saved report and its complete dashboard and test details.                                                                                        |
| **Analytics**       | Explore failure message patterns, affected directories, duration distributions, performance percentiles, and saved-run trends.                            |
| **Flaky tests**     | Review explicit retry recovery and compare matching tests across up to 10 saved reports to investigate pass/fail changes.                                 |
| **Team & CI**       | Publish reports to the local server, open saved reports by project, and configure optional account access or CI uploads.                                  |
| **Report settings** | Save display preferences and run metadata, export JSON or a Markdown summary, revalidate a report, and review data quality.                               |

On tablets and phones, navigation moves into a labelled drawer. Phone results use cards, widgets stack, and test details open in a scrollable bottom sheet.

### Understanding the numbers

- **Dashboard pass rate** is passed tests divided by all registered test records, including pending and skipped tests.
- **Executed pass rate** in Analytics includes passed and failed tests only.
- **Spec time** is the sum of its recorded test durations. **Run time** uses `stats.duration`; these measurements can differ.
- Summary discrepancies are displayed when reported statistics disagree with individual test records.
- Cross-run pass/fail changes are investigation signals. Code, test data, and environment changes can affect outcomes; retry evidence is needed to confirm flakiness. Pending/skipped outcomes and ambiguous duplicate test identities are excluded from comparisons.
- Project, environment, branch, commit, and build URL can be supplied in report metadata or edited in Report settings. Retry evidence appears only when explicit attempt records are present. The supplied reports do not contain attempt records; missing evidence is never inferred from duration or final outcome.

### Filter trends and investigate recurring failures

In **Analytics**, filter **Saved-run trends** by project, environment, and branch. The other analytics continue to describe the selected report. Filters include an explicit **Unlabelled** choice; trend rows show the latest eight matching reports ordered by run start.

In **Failed tests**, choose **Analyze comparable runs** under **Failure history**. It examines up to 20 saved reports with exactly matching project, environment, and branch labels (blank labels match other blank labels). Each message pattern shows first seen, last seen, and its frequency across distinct reports. Reports with matching run times and normalized test results count once, even when JSON formatting differs. Frequency measures reports containing a failure pattern, rather than a test failure rate; a missing pattern alone does not establish a fix. The top 30 recurring patterns are displayed.

## Investigate changes

Choose **Compare runs**, select a baseline and target, then click **Compare reports**. A regression means passed → failed, and a fix means failed → passed. Added and missing tests are separate categories; a failed test becoming pending or skipped is an outcome change. Duration comparisons apply to tests executed in both runs. Ambiguous duplicate test identities are excluded.

In **Failed tests**, expand a failure group to see its representative error and all affected tests. Grouping normalizes variable UUIDs, timestamps, and timeout values while retaining assertion values and selectors. Matching messages are evidence to investigate a shared cause.

Open any test and choose **View test history** to follow its outcomes and recorded durations across up to 20 saved reports. Missing tests and duplicate matches are shown separately. **Inspect run** opens the exact saved report and test.

## History and local storage

Each saved import supports **Edit name & notes**. Display names and notes stay separate from the original JSON. **Move to trash** hides a report from history and trends, with **Undo** immediately available. **View trash** lets you restore it later, including its attachments. Trash remains in browser storage; it is not permanently deleted.

**Download backup** saves a versioned JSON archive of browser reports, import dates, metadata, display names, notes, attachments, and trash. **Restore backup** validates all reports and attachment signatures before applying changes in one transaction. Restore merges missing entries and attachments, preserves existing local edits, and rejects conflicting report contents. It does not switch the currently viewed report. Backups support up to 100 MB, 1,000 reports, and 5,000 attachments. They contain browser data only; the local server store, user accounts, and CI tokens are separate. The storage estimate shows total usage for this browser origin, including trash.

Successfully rendered reports are saved in **IndexedDB** in the current browser. The last viewed report is restored after a page reload. Identical file contents within the same project share one history entry; importing the same file again moves that entry to the top. Opening a saved report or clicking **Reload** does not create another import.

History belongs to this browser and origin, including the localhost port. Clearing site data removes saved reports. Imports made before history was introduced need to be imported again. If storage is unavailable or full, valid reports remain usable for the current session and Tomatoes explains that they could not be saved.

To change the bundled report, replace `results.json`, then select **Open bundled report** in Import history.

## Run identity, evidence, and summaries

In **Report settings**, save the project, environment, branch, commit, and build URL for the selected import. These details are stored separately from the original JSON, which remains available unchanged. Run summaries and explicit comparisons include the available identity fields.

Open a test to attach a screenshot or recording. Tomatoes validates the file type, signature, and size before saving it in this browser's IndexedDB. Supported formats are PNG, JPEG, WebP, MP4, and WebM, up to **25 MB per file**. Previews load on demand. Evidence attachments stay in this browser and are not included in JSON downloads or server publishing.

**Export PDF** on a saved import, or **Download PDF report** in Report settings, opens export options. Choose a brief summary or a detailed report, optionally filter failure details by title/path/error text or an exact spec path, then choose **Preview PDF**. Use Previous page / Next page to inspect the locally rendered preview, then download it or open it in a separate browser tab. Changing export options preserves your current choices. Overview totals always cover the full run; failure filters affect the patterns and details only. It includes outcome totals, run metadata, the top 20 specs, the top 10 failure patterns, and up to 200 failed tests with error excerpts of up to 2,000 characters each. Included counts and any shortened excerpts are labelled. PDF dates follow your display time zone. Downloads use the saved import time in `YYYY-MM-DD_HH-mm-ss-report.pdf` format (for example, `2026-10-23_16-10-14-report.pdf`), matching the import time shown in history. Re-exporting uses that same import time. The PDF separates the overview, aligned spec table, failure patterns, and failure details into clear sections. Generation stays in the browser, shows a blocking progress overlay, and does not upload your report. Screenshot and video attachments remain separate.

**Download run summary** exports a Markdown report with totals, run identity, and the leading failure groups. Compare runs has a separate comparison summary.

### Optional JSON extensions

Standard Mochawesome reports remain supported. Your report generator can add a top-level `tomatoes` object:

```json
{
  "tomatoes": {
    "project": "tomatoes",
    "environment": "staging",
    "branch": "main",
    "commit": "abc123",
    "buildUrl": "https://example.com/build/123"
  }
}
```

This object supplements the required `stats` and `results` fields; it is not a complete report. Project identifiers use letters, numbers, dots, underscores, and hyphens, with a maximum of 80 characters. Build URLs must use HTTP or HTTPS without embedded credentials.

To provide retry evidence, add an `attempts` array to an individual test, for example `[{"state":"failed","duration":120},{"state":"passed","duration":90}]`. Each attempt requires a state (`passed`, `failed`, `pending`, or `skipped`); duration is optional and nonnegative. Up to 100 attempts are accepted per test. A retry recovery requires a passed final test outcome, a passed last attempt, and an earlier failed attempt. Ordinary exports without this extension show retry evidence as unavailable. Cross-run changes remain a separate investigation signal.

## Local team store and CI

Start normally with `npm start`, then open **Team & CI**. **Publish report** saves the selected run in `.tomatoes-data`; **Open browser copy** imports a server report into this browser. Server files survive browser storage clearing. Browser copies remain available after sign-out. The server binds to `127.0.0.1`, so this setup stays on this machine.

### Optional accounts

Stop the running server before starting it with a different mode. From a PowerShell terminal:

```powershell
node tools/team-admin.js add-user alex --projects tomatoes --role editor
# Enter a password of at least 12 characters at the hidden prompt.
$env:TOMATOES_TEAM_MODE = "1"
npm start
```

Open **Team & CI** to sign in. Viewers can read allowed projects; editors and admins can also publish to allowed projects. Assign multiple projects with `--projects tomatoes,another-project`; `--projects "*"` grants all projects. Admins default to all projects if the option is omitted. Account provisioning is performed through the local command, rather than a web administration page. Passwords use salted scrypt hashes, sessions expire after eight hours, and restarting the server signs everyone out.

### CI ingestion on this machine

Create a project-scoped upload token:

```powershell
node tools/team-admin.js create-ci-token tomatoes
```

Save the returned token privately; only its hash is stored on disk. Provide it to your local CI runner as `TOMATOES_CI_TOKEN`, then run:

```powershell
$env:TOMATOES_SERVER_URL = "http://127.0.0.1:3000"
node tools/publish-report.js --file report.json --project tomatoes --environment staging --branch main --commit abc123
```

The publisher validates the report before upload. Add `--dry-run` to validate without a token or upload. `--build-url` records a link to the build. Uploads are scoped to the token's project and appear in **Team & CI**. Repeating the same report in the same project updates its existing server entry.

A runner on another machine cannot reach this loopback-only server. External hosting, network access, and deployment are not configured by this local setup.

### Storage and source layout

`.tomatoes-data` contains server reports, the run index, account hashes, and token hashes, and is excluded from Git. Keep this directory private and back it up if needed. Set `TOMATOES_DATA_DIR` consistently for the server and administration tools to use another directory. To disable optional sign-in for your own local setup, remove `TOMATOES_TEAM_MODE` and restart the server.

The browser UI is separated into report loading (`app.js`), insights (`insights.js`), investigations (`investigations.js`), evidence and metadata (`report-features.js`), and local team access (`team.js`). Styles are split into base, insights, investigations, responsive, and team files. Keyboard focus indicators, a skip link, and reduced-motion support complement the tablet and phone layouts.

## Development

```sh
npm run format        # Apply Prettier
npm run format:check  # Verify formatting
npm run check         # Check JavaScript syntax
npm test              # Run report, history, and analytics tests
```

The HTTP server binds to `127.0.0.1:3000` and serves a fixed list of project assets. Report content is displayed as text and is never executed. Imported reports can include test source and environment details, so keep sample reports appropriate for the people who can access the project.

## Branding

The Tomatoes logo combines a red tomato, green leaves, and a cream checkmark. The scalable asset, `assets/tomatoes-logo.svg`, appears in the sidebar, workspace icon, and browser favicon.
