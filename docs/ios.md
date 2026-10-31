# iOS builds

The iOS project uses Capacitor 8.6.0 and Swift Package Manager. JavaScript dependencies are installed and locked in package-lock.json. The existing esbuild build is used; Vite is not required. The Android Gradle project remains independent; always specify `ios` when using Capacitor.

## On this Windows machine

```sh
npm ci
npm run ios:sync
npm run ios:sync:local
```

These build public web assets and sync the native project. They do not compile an iOS binary. Apple Xcode and Simulator require macOS; they cannot be installed or run on Windows. No IPA has been built or device-tested here.

## On a Mac

Install Node 24, Xcode 26 or later, its command-line tools, and an iOS Simulator runtime. Complete Xcode's first-launch setup. Clone the repository and run `npm ci`. Swift Package Manager resolves the pinned Capacitor Swift runtime when Xcode builds; CocoaPods is not required.

```sh
npm run ios:open
npm run ios:build:prod
npm run ios:run:prod
npm run ios:launch:prod
```

`build` produces a Release **simulator** app in `artifacts/ios/production/Build/Products/Release-iphonesimulator/App.app`. It is not an installable iPhone IPA. `run` syncs, builds, boots the selected simulator, installs and launches. `launch` installs/launches the last built app without syncing or rebuilding. Rebuild after changing the origin or app configuration.

The default is a booted available iPhone, otherwise the first available iPhone. Device shortcuts are provided for the names you requested:

```sh
npm run ios:run:prod:iphone18pro
npm run ios:run:prod:iphone18promax
npm run ios:run:prod:iphoneduo
npm run ios:launch:prod:iphone18pro
npm run ios:launch:prod:iphone18promax
npm run ios:launch:prod:iphoneduo
```

These names are requests, not a claim that Apple supplies all these models. A shortcut fails clearly if the exact device is absent, listing installed devices. Create supported simulators in Xcode. To select any installed name or UUID:

```sh
npm run ios:run:prod -- "iPhone 17 Pro"
xcrun simctl list devices available
```

## Local API

Start Tomatoes on the **Mac** at port 3004, then:

```sh
npm run ios:run:local
npm run ios:launch:local
```

The local simulator opens `http://localhost:3004/#runs`. Its loopback refers to the Mac, not this Windows computer. Local commands check the API before building. Local and production apps have separate bundle IDs (`com.tomatoes.reports.local` / `com.tomatoes.reports`) and build directories. Local networking is allowed by ATS; arbitrary insecure remote HTTP is not enabled. This setup targets the iOS Simulator for local development, not a physical iPhone connected to a different computer.

Optional process environment variables:

```sh
export TOMATOES_IOS_LOCAL_ORIGIN=http://localhost:3000
export TOMATOES_IOS_PRODUCTION_ORIGIN=https://your-tomatoes.example.com
```

Production accepts only a clean HTTPS origin. Do not put credentials or tokens in it. The default production site is `https://tomatoes-reports.vercel.app`.

## Signed production archive and IPA

On the Mac, configure your Apple Developer account, signing certificate, provisioning, unique bundle identifier and version in Xcode. Change both capacitor.config.js and the bundle identifier in scripts/ios-production.mjs if your identifier differs. Increment Xcode's build number for each distributed update. Then:

```sh
export TOMATOES_IOS_TEAM_ID=YOURTEAMID
npm run ios:archive:prod
export TOMATOES_IOS_EXPORT_OPTIONS=/absolute/path/to/ExportOptions.plist
npm run ios:export:prod
```

The archive is `artifacts/ios/production/Tomatoes.xcarchive`; exported IPA files go under `artifacts/ios/production/ipa`. ExportOptions.plist must match your distribution method and signing setup; use options exported by Xcode. These commands do not upload to App Store Connect. Never commit private signing material. No Apple signing account or certificates were provided in this task.

## Runtime scope and release checks

This initial iOS shell opens the hosted responsive web app in Capacitor's WKWebView to preserve the app's existing same-origin API cookies and CSRF flow. It requires the server and internet connection. The bundled public assets contain no backend or database secrets. Capacitor documents `server.url` primarily for live reload; this hosted-site shell is a starting point for device testing, not a claim of App Store approval. Store distribution needs review of Apple requirements and appropriate native functionality.

Unlike Android's browser-backed launcher, WKWebView does not share Safari sessions. Password login must be tested on a Mac/device. Google OAuth must not be completed inside an embedded WebView; a native/system-browser OAuth callback flow is still needed before offering Google sign-in in this shell. Test imports, PDF download/share, password recovery, safe areas, rotation and accessibility on real devices before distribution. No native file-sharing or Google-auth plugin is included yet. Production web console forwarding is disabled. Navigation is not broadly allowlisted.

References: [Capacitor iOS setup](https://capacitorjs.com/docs/ios), [environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup), [configuration](https://capacitorjs.com/docs/config).

Dependency audit at setup reported four moderate findings in the development-only Capacitor CLI chain (rimraf/glob/minimatch). No compatible upstream fix was offered; the runtime dependency audit is checked separately. The CLI is not included in the deployed server or iOS runtime. Avoid forcing npm's proposed downgrade to Capacitor 4.
