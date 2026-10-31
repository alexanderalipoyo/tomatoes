# Role access

Organization admins with all-project access manage permissions from **Manage profile > Role access** (`#role-access`). The source matrix is [access-matrix.tsv](access-matrix.tsv); `1` allows and `0` denies. Every feature has a stable identifier in `src/shared/access-policy.js`.

Policies belong to an organization and persist in PostgreSQL (migration 010) or the local file store. Editor and Viewer switches can narrow or grant ordinary feature capabilities. Admin access, organization/user/project administration, authentication protections, mandatory import validation and organization/project boundaries remain protected. Local mode is trusted operator mode and therefore has Admin capabilities.

## Dependency rule

Sharing & access requires **Browse shared reports**. If browsing is denied, every permission in that section is effectively denied, including filtering and loading older reports. The two conflicting Editor entries from the supplied matrix remain visible as configured defaults, but do not grant effective access until browsing is permitted. Projects requires **View projects within the current organization** to open its page.

Importing remains separate from manually publishing shared reports: browser imports use `/api/imports`; saving browser history uses `/api/history-imports`; CI and manual publishing use `/api/runs`.

## Enforcement and limits

The API resolves current organization permissions on each session-authenticated request. Existing sessions pick up saved changes immediately on their next request. Navigation and controls use the server's resolved permissions; a direct URL to a disallowed page displays Access denied. Editors have a read-only user directory. Viewer history PDF exports remain available independently from Report settings. Organization membership and project scopes are always checked independently of feature permissions. Policy administration rejects non-admins, scoped admins, and CI tokens, and uses CSRF checks and revision checks to reject stale concurrent saves.

Report viewing delivers report data to the browser. Export controls govern application actions; they cannot prevent users from copying data they are allowed to view. Downloaded files and browser copies cannot be recalled. Browser-owned local storage is not a server security boundary.

## Installation

Run `npm run db:migrate` for local PostgreSQL, or `npm run db:migrate:production` with your private production configuration before deploying this version. Migration 010 adds policy columns without altering reports, users, assignments or organization identity. New columns default to the supplied role matrix through the application. No real users are seeded or modified by this migration.

Run `npm run build:production` and `npm run test:postgres` to verify the application and isolated database tests.
