# Tomatoes

**A test report dashboard for Cypress-generated cloud test results.**

Tomatoes turns JSON reports from Cypress test runs into a dashboard for reviewing outcomes, investigating failures, and comparing previous runs. Reports can come from tests executed in a cloud CI environment or on a local machine.

Tomatoes is an independent application with its own branding. It is not the Cypress Cloud product. Cypress is the tool that executes the tests; Tomatoes reads the resulting **Mochawesome-compatible JSON report** and presents the results.

The current application runs locally and stores imported reports in your browser. It does not require a Cypress Cloud account, recording key, or API connection.

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

| View                | What you can do                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Latest run**      | Review outcome totals, pass rate, failure hotspots, spec health, slow tests, execution coverage, and timing.                   |
| **Test results**    | Switch between specs and individual tests; search titles, paths, and errors; filter by spec and outcome.                       |
| **Failed tests**    | Inspect recorded failure messages, stack traces, test code, and context.                                                       |
| **Import history**  | Reopen a saved report and its complete dashboard and test details.                                                             |
| **Analytics**       | Explore failure message patterns, affected directories, duration distributions, performance percentiles, and saved-run trends. |
| **Flaky tests**     | Compare matching tests across up to 10 saved reports to investigate pass/fail changes.                                         |
| **Report settings** | Save time-zone and page-size preferences, download the original JSON, revalidate a report, and review data quality.            |

On tablets and phones, navigation moves into a labelled drawer. Phone results use cards, widgets stack, and test details open in a scrollable bottom sheet.

### Understanding the numbers

- **Dashboard pass rate** is passed tests divided by all registered test records, including pending and skipped tests.
- **Executed pass rate** in Analytics includes passed and failed tests only.
- **Spec time** is the sum of its recorded test durations. **Run time** uses `stats.duration`; these measurements can differ.
- Summary discrepancies are displayed when reported statistics disagree with individual test records.
- Cross-run pass/fail changes are investigation signals. Code, test data, and environment changes can affect outcomes; retry evidence is needed to confirm flakiness. Pending/skipped outcomes and ambiguous duplicate test identities are excluded from comparisons.
- Branch, commit, author, browser, operating system, and retry evidence are shown only when supported by the application and available in the report. The supplied reports do not provide these details.

## History and local storage

Successfully rendered reports are saved in **IndexedDB** in the current browser. The last viewed report is restored after a page reload. Identical file contents share one history entry; importing the same file again moves that entry to the top. Opening a saved report or clicking **Reload** does not create another import.

History belongs to this browser and origin, including the localhost port. Clearing site data removes saved reports. Imports made before history was introduced need to be imported again. If storage is unavailable or full, valid reports remain usable for the current session and Tomatoes explains that they could not be saved.

To change the bundled report, replace `results.json`, then select **Open bundled report** in Import history.

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
