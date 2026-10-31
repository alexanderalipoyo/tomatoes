# Gmail signup and Google sign-in

Tomatoes uses Google Identity Services and Google's official Node authentication library. Users authenticate on Google's screen; Tomatoes never asks for their Gmail password. This implementation accepts verified `@gmail.com` identities. It does not request Gmail messages, Google Drive access, offline access, or refresh tokens.

## Google Cloud setup

1. Open Google Cloud / Google Auth Platform and configure your app's branding, audience and contact details. Use your real application homepage and reviewed Terms of Use and Privacy Policy URLs; the bundled sample legal documents are placeholders.
2. Create an OAuth client with application type **Web application**.
3. Add **Authorized JavaScript origins** for every origin you use, including the exact scheme and port. Examples: `http://localhost:3004` for this local preview and `https://tomatoes-reports.vercel.app` for production. Use your actual deployed address. Origins contain no path, hash, query, or trailing slash. Avoid disposable preview domains unless you explicitly register them.
4. If the consent app is in Testing, add your test Gmail accounts to its audience. Complete Google's publishing requirements before making sign-in available beyond the configured test audience.
5. Copy the client ID, ending in `.apps.googleusercontent.com`.

This popup ID-token flow uses Authorized JavaScript origins. It does not require a redirect URI or a client secret. Follow the [official Google setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

## Tomatoes setup

Apply migration **012** before starting or deploying the updated API:

```sh
npm run db:migrate
# For the production database, using your private production configuration:
npm run db:migrate:production
```

Set these values in `.env.local` locally, `.env.production` for production execution, and Vercel Environment Variables for hosted deployment:

```dotenv
TOMATOES_TEAM_MODE=1
TOMATOES_GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

Blank placeholders are provided in the environment files. Google sign-in stays disabled while the client ID is empty. Restart the server or redeploy after updating it. Vercel does not use your private local environment files automatically. The client ID is public configuration; no client secret is needed. Existing password login continues to work.

Admins can view configuration status and these instructions under **Integration / Google sign-in / Set up**. Visit **Sign up with Gmail** from the login screen to register, or **Continue with Google** to sign in to an existing account.

## Accounts and membership

- Google signup creates an account without organization membership, project access or admin privileges. The signed-in user sees an access-waiting page with their Gmail address.
- An organization admin uses **Users / Add user / Add an existing account**, enters that Gmail address or username, and chooses the role and projects. No second password is created. The user selects **Check access** or signs in again.
- An existing account with a unique matching Gmail address is linked only after Google verifies ownership. Its username, role, projects, organization memberships, and existing password remain unchanged. Subsequent Google sign-in identifies the account by Google's stable subject identifier.
- Google-only accounts have a random unavailable password and do not use the password-recovery flow. They sign in through Google. Existing password accounts retain their recovery process.
- Disabled accounts and inactive memberships remain blocked. Only organization admins can add organizations, including after Gmail signup and membership approval.

## Validation and operations

The backend verifies Google's signature, issuer, intended audience, authorized party, expiry, issue time, verified Gmail address, stable subject and nonce. A same-origin POST creates a random, ten-minute challenge bound to an HttpOnly, SameSite cookie. Database-backed atomic challenge consumption prevents replay across requests and serverless instances. Google authentication endpoints are rate limited. Credentials are not stored in browser storage or logged; session cookies remain HttpOnly and use Secure in hosted deployments.

CSP permits only Google's Identity Services script, frame, style and connection endpoints. No wildcard script origin or unsafe script execution is enabled. The Google button loads its SDK only when configured. The UI handles expired challenges, rejected credentials, SDK/network failures, and retries.

Tests use injected Google claims and isolated databases; a live Google popup requires your configured Google Cloud client and a permitted Gmail test account. See Google's [ID-token verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
