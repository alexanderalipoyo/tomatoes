# React frontend

Tomatoes uses React 19 and JSX for all page and dialog markup. No client view builds UI with `innerHTML`, `insertAdjacentHTML`, or `dangerouslySetInnerHTML`.

## Structure

- `src/client/react/main.jsx`: application entry point, startup error boundary, authentication mounting.
- `src/client/react/ApplicationShell.jsx`: navigation, report outlets, and shared dialog hosts.
- `src/client/react/pages/`: Projects, Users, Profile, Role access, Integrations, workspace and report Settings, Analytics, Flaky tests, and Sharing.
- `src/client/react/components/`: dashboards, result tables, comparison and failure views, group widgets, reusable dialogs, PDF controls, evidence previews, and history utilities.
- `src/client/react/report-bridge.jsx`: mounts React components into stable shell outlets and unmounts child roots before their parents during navigation.
- `src/client/*.js`: workflow adapters for report workers, persistence, authentication requests, permissions, browser APIs, exports, and route coordination. Some adapters retain native event integration for existing forms, progress dialogs, and canvas rendering; their UI markup lives in React components.
- `src/shared/`: plain JavaScript domain models shared with Node.js, workers, and tests.
- `src/server/`: Node.js APIs, authentication, PostgreSQL/file storage, and migrations.

React is a JavaScript UI library. Server code and domain models stay JavaScript; they do not need JSX.

## Build and run

Run `npm start` to build the frontend and start the existing server. `npm run build:production` checks syntax, runs application tests, and builds the Vercel-ready assets. `npm run test:postgres` checks database behavior with isolated test schemas.

The React entry point includes its workflow services in one esbuild bundle. `runtime-modules.json` lists the build inputs. The esbuild plugin in `scripts/lib/client-runtime.js` isolates compatibility module scope during compilation; startup does not inject or fetch ordered controller scripts. Report workers and PDF resources remain separately served assets.

## Behavior and security

API routes, organization membership, assigned-project checks, CSRF protection, password handling, and database storage retain their existing contracts. React receives permission capabilities from the authenticated server status. Server authorization remains authoritative.

React escapes imported report text when displaying errors, code, names, paths, and legal documents. Attachment previews use image/video elements with object URLs and revoke those URLs during cleanup. Native dialog components close when their React owners unmount.

Tests cover draft filtering and revision checks in Role access; project and sharing pagination; blocked browser storage; project and role selection; authentication; and data-driven report views. A structural test prevents HTML-string renderers from returning to the client.
